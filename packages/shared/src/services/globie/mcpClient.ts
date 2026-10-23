/**
 * Minimal MCP client for the Globie Earth server.
 *
 * Transport: Streamable HTTP (JSON response mode is enabled server-side,
 * so `tools/call` answers with one JSON body rather than an SSE stream).
 * Only `initialize`, `notifications/initialized` and `tools/call` are used.
 */

export const GLOBIE_MCP_ENDPOINT = 'https://mcp.globie.earth/mcp';
const PROTOCOL_VERSION = '2025-11-25';
const DEFAULT_TIMEOUT_MS = 10_000;

interface JsonRpcErrorPayload {
  code: number;
  message: string;
  data?: unknown;
}

interface JsonRpcResponse<T = unknown> {
  jsonrpc?: string;
  id?: number | string | null;
  result?: T;
  error?: JsonRpcErrorPayload;
}

interface ToolCallResult {
  content?: Array<{type?: string; text?: string}>;
  isError?: boolean;
  structuredContent?: unknown;
}

interface FetchResponse {
  ok: boolean;
  status: number;
  headers: {get(name: string): string | null};
  text(): Promise<string>;
}

type FetchLike = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<FetchResponse>;

export interface McpClientOptions {
  /** Resolves the device identity sent as X-Device-Id on every request. */
  getDeviceId: () => Promise<string>;
  /** Called after a 401 so the caller can mint and persist a fresh device id. */
  rotateDeviceId?: () => Promise<string>;
  endpoint?: string;
  timeoutMs?: number;
  clientName?: string;
  clientVersion?: string;
  fetchImpl?: FetchLike;
}

export class McpHttpError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string) {
    super(`MCP HTTP ${status}${body ? `: ${body}` : ''}`);
    this.name = 'McpHttpError';
    this.status = status;
    this.body = body;
  }
}

export class McpProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'McpProtocolError';
  }
}

export class McpRpcError extends Error {
  readonly code: number;

  constructor(payload: JsonRpcErrorPayload) {
    super(`MCP ${payload.code}: ${payload.message}`);
    this.name = 'McpRpcError';
    this.code = payload.code;
  }
}

export class McpToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'McpToolError';
  }
}

/**
 * The slice of the MCP client the screens use. Tests inject a fake with the
 * same two methods, so a screen never needs the network to render.
 */
export interface McpDataClient {
  connect(): Promise<void>;
  callTool<T>(name: string, args?: Record<string, unknown>): Promise<T>;
}

export class GlobieMcpClient {
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly clientName: string;
  private readonly clientVersion: string;
  private readonly getDeviceId: () => Promise<string>;
  private readonly rotateDeviceId?: () => Promise<string>;
  private readonly fetchImpl: FetchLike;

  private sessionId: string | null = null;
  private nextId = 1;
  /** Serialises every MCP call so a shelf refresh cannot starve the player. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(options: McpClientOptions) {
    const fetchImpl = options.fetchImpl ?? (globalThis as {fetch?: FetchLike}).fetch;
    if (!fetchImpl) {
      throw new McpProtocolError('No fetch implementation available');
    }
    this.endpoint = options.endpoint ?? GLOBIE_MCP_ENDPOINT;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.clientName = options.clientName ?? 'globie-earth-vega';
    this.clientVersion = options.clientVersion ?? '1.0.0';
    this.getDeviceId = options.getDeviceId;
    this.rotateDeviceId = options.rotateDeviceId;
    this.fetchImpl = fetchImpl;
  }

  get isConnected(): boolean {
    return this.sessionId !== null;
  }

  /** Opens the MCP session if it is not open yet. */
  connect(): Promise<void> {
    return this.enqueue(async () => {
      if (!this.sessionId) {
        await this.initializeSession();
      }
    });
  }

  /**
   * Calls a tool and unwraps its payload.
   *
   * Unwrap order: `isError` → throw the content text; `structuredContent` →
   * return as-is; otherwise `JSON.parse(content[0].text)`. `content[1]` is the
   * spoken line for voice hosts and is deliberately ignored.
   */
  callTool<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    return this.enqueue(async () => {
      try {
        return await this.callToolOnce<T>(name, args);
      } catch (error) {
        if (error instanceof McpHttpError && error.status === 404) {
          // Unknown / expired session: re-initialize once, then retry.
          this.sessionId = null;
          return this.callToolOnce<T>(name, args);
        }
        if (
          error instanceof McpHttpError &&
          error.status === 401 &&
          this.rotateDeviceId
        ) {
          this.sessionId = null;
          await this.rotateDeviceId();
          return this.callToolOnce<T>(name, args);
        }
        throw error;
      }
    });
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async initializeSession(): Promise<void> {
    this.sessionId = null;
    const {response, json} = await this.send({
      jsonrpc: '2.0',
      id: this.nextId++,
      method: 'initialize',
      params: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: {name: this.clientName, version: this.clientVersion},
      },
    });

    if (json?.error) {
      throw new McpRpcError(json.error);
    }

    const sessionId = response.headers.get('mcp-session-id');
    if (!sessionId) {
      throw new McpProtocolError(
        'MCP initialize response carried no mcp-session-id header',
      );
    }
    this.sessionId = sessionId;

    await this.send({jsonrpc: '2.0', method: 'notifications/initialized'});
  }

  private async callToolOnce<T>(
    name: string,
    args: Record<string, unknown>,
  ): Promise<T> {
    if (!this.sessionId) {
      await this.initializeSession();
    }

    const {json} = await this.send({
      jsonrpc: '2.0',
      id: this.nextId++,
      method: 'tools/call',
      params: {name, arguments: args},
    });

    if (json?.error) {
      throw new McpRpcError(json.error);
    }
    if (!json?.result) {
      throw new McpProtocolError(`MCP tools/call ${name} returned no result`);
    }

    return unwrapToolResult<T>(name, json.result as ToolCallResult);
  }

  private async send(body: {
    jsonrpc: string;
    id?: number;
    method: string;
    params?: Record<string, unknown>;
  }): Promise<{response: FetchResponse; json: JsonRpcResponse | null}> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'X-Device-Id': await this.getDeviceId(),
        'MCP-Protocol-Version': PROTOCOL_VERSION,
      };
      if (this.sessionId) {
        headers['mcp-session-id'] = this.sessionId;
      }

      const response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (response.status === 202 || response.status === 204) {
        return {response, json: null};
      }

      const text = await response.text();
      if (!response.ok) {
        throw new McpHttpError(response.status, text.slice(0, 300).trim());
      }
      if (!text.trim()) {
        return {response, json: null};
      }

      return {
        response,
        json: parseBody(text, response.headers.get('content-type')),
      };
    } catch (error) {
      if (error instanceof McpHttpError) {
        throw error;
      }
      if ((error as Error)?.name === 'AbortError') {
        throw new McpProtocolError(
          `MCP request timed out after ${this.timeoutMs} ms`,
        );
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

function parseBody(text: string, contentType: string | null): JsonRpcResponse {
  const raw = contentType?.includes('text/event-stream')
    ? lastSseData(text)
    : text;
  try {
    return JSON.parse(raw) as JsonRpcResponse;
  } catch {
    throw new McpProtocolError(
      `Malformed MCP response: ${raw.slice(0, 200).trim()}`,
    );
  }
}

function lastSseData(text: string): string {
  const dataLines = text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('data:'));
  return dataLines.length > 0
    ? dataLines[dataLines.length - 1].slice(5).trim()
    : text;
}

function unwrapToolResult<T>(name: string, result: ToolCallResult): T {
  const firstText = result.content?.[0]?.text ?? '';

  if (result.isError) {
    throw new McpToolError(firstText || `MCP tool ${name} failed`);
  }
  if (result.structuredContent !== undefined) {
    return result.structuredContent as T;
  }
  if (!firstText) {
    throw new McpProtocolError(`MCP tool ${name} returned no usable content`);
  }
  try {
    return JSON.parse(firstText) as T;
  } catch {
    throw new McpProtocolError(
      `MCP tool ${name} returned non-JSON content: ${firstText.slice(0, 200)}`,
    );
  }
}

export function createGlobieMcpClient(
  options: McpClientOptions,
): GlobieMcpClient {
  return new GlobieMcpClient(options);
}
