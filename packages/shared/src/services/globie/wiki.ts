/**
 * Wikipedia summary proxy for the Field Card.
 *
 * `GET https://mcp.globie.earth/wiki?name=<name>` answers with the distilled
 * article, an already-proxied lead image and its licence. It needs the same
 * `X-Device-Id` header as the MCP endpoint; without it the server replies 401.
 *
 * A 404 is not an error: many DNP names have no English Wikipedia article, and
 * the Field Card then simply falls back to the catalogue description.
 */

export const GLOBIE_WIKI_ENDPOINT = 'https://mcp.globie.earth/wiki';

const DEFAULT_TIMEOUT_MS = 10_000;

export interface WikiImage {
  url: string;
  license?: string | null;
  licenseUrl?: string | null;
  credit?: string | null;
  descriptionUrl?: string | null;
}

export interface WikiSummary {
  title: string;
  extract: string;
  url: string;
  license: string;
  image?: WikiImage | null;
  /** Present only when the lookup asked for `images`; see `gallery()`. */
  images?: WikiImage[];
}

export interface WikiSummaryOptions {
  /**
   * Ask the proxy for up to this many of the article's other freely-licensed
   * photos in the same reply. Each one is a server-side download, so a caller
   * that does not show a strip should leave it unset.
   */
  images?: number;
}

export interface WikiClientOptions {
  /** Resolves the device identity sent as X-Device-Id on every request. */
  getDeviceId: () => Promise<string>;
  endpoint?: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}

interface FetchResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

type FetchLike = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    signal?: AbortSignal;
  },
) => Promise<FetchResponse>;

export class WikiHttpError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string) {
    super(`Wiki HTTP ${status}${body ? `: ${body}` : ''}`);
    this.name = 'WikiHttpError';
    this.status = status;
    this.body = body;
  }
}

export class WikiClient {
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;
  private readonly getDeviceId: () => Promise<string>;

  constructor(options: WikiClientOptions) {
    const fetchImpl = options.fetchImpl ?? (globalThis as {fetch?: FetchLike}).fetch;
    if (!fetchImpl) {
      throw new Error('No fetch implementation available');
    }
    this.endpoint = options.endpoint ?? GLOBIE_WIKI_ENDPOINT;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = fetchImpl;
    this.getDeviceId = options.getDeviceId;
  }

  /** `null` when there is no article; throws only on a real transport error. */
  async summary(
    name: string,
    options: WikiSummaryOptions = {},
  ): Promise<WikiSummary | null> {
    const trimmed = name.trim();
    if (!trimmed) {
      return null;
    }

    let url = `${this.endpoint}?name=${encodeURIComponent(trimmed)}`;
    if (options.images && options.images > 0) {
      url += `&images=${Math.floor(options.images)}`;
    }

    const deviceId = await this.getDeviceId();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(
        url,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'X-Device-Id': deviceId,
          },
          signal: controller.signal,
        },
      );
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new WikiHttpError(response.status, await response.text());
      }
      return (await response.json()) as WikiSummary;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * The article's other freely-licensed photos, or an empty list when there is
   * no article or it has none. The strip is decoration: a failure here must
   * never take the Field Card down, so transport errors propagate to the caller
   * which is expected to swallow them.
   */
  async gallery(name: string, limit = 6): Promise<WikiImage[]> {
    const result = await this.summary(name, {images: limit});
    return result?.images ?? [];
  }
}

export const createWikiClient = (options: WikiClientOptions): WikiClient =>
  new WikiClient(options);
