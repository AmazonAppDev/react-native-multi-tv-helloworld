/**
 * Species catalogue client for the public Globie Earth PostgREST API.
 *
 * The `/species` page is served from four DNP tables. They do not share a
 * schema, so the select list and the searchable columns are defined per table
 * here - a single `select=*` would pull the large text fields the grid never
 * renders (synonyms, habitat, distribution).
 *
 * Verified against https://api.globie.earth on 2026-10-19:
 * - `Prefer: count=exact` returns `Content-Range: 0-9/2128`.
 * - `or=(thai_name.ilike.*กบ*,scientific_name.ilike.*Fejervarya*)` works.
 * - `dnp_species` has no `gbif_key`, and its `photo_url` is null in every row.
 */

export const SPECIES_API_BASE = 'https://api.globie.earth';

/** The web app itself. The television prints this and the relay draws its QR. */
export const GLOBIE_WEB_BASE = 'https://globie.earth';

export type SpeciesType =
  | 'dnp_plants'
  | 'dnp_fauna'
  | 'dnp_wildlife'
  | 'dnp_species';

/**
 * The path segment the web app uses for each table.
 *
 * The tables are plural here (they are PostgREST relations) but the web app
 * addresses the plant table in the singular - `llms.txt` documents the shape
 * as `/species/<type>/<id>` with `dnp_plant`. The other three already agree.
 */
const WEB_PATH: Record<SpeciesType, string> = {
  dnp_plants: 'dnp_plant',
  dnp_fauna: 'dnp_fauna',
  dnp_wildlife: 'dnp_wildlife',
  dnp_species: 'dnp_species',
};

/**
 * The path segment the web app uses for a table: the relay's QR endpoint
 * takes the same segment, so one function names a species for both.
 */
export const speciesWebPath = (type: SpeciesType): string => WEB_PATH[type];

/**
 * The full web-app address of one species. The id alone is not an address:
 * the four tables have colliding ids, so the table is part of the path.
 */
export const speciesPageUrl = (type: SpeciesType, id: number): string =>
  `${GLOBIE_WEB_BASE}/species/${speciesWebPath(type)}/${id}`;

export type SpeciesTabKey = 'all' | SpeciesType;

export const SPECIES_TABS: ReadonlyArray<{
  key: SpeciesTabKey;
  label: string;
}> = [
  {key: 'all', label: 'All'},
  {key: 'dnp_plants', label: 'Plants'},
  {key: 'dnp_wildlife', label: 'Wildlife'},
  {key: 'dnp_fauna', label: 'Park fauna'},
  {key: 'dnp_species', label: 'Survey'},
];

/** The three tables the "All" tab interleaves. */
const ALL_TYPES: readonly SpeciesType[] = [
  'dnp_plants',
  'dnp_wildlife',
  'dnp_fauna',
];

/** Only the columns the grid card renders. */
const CARD_COLUMNS: Record<SpeciesType, string> = {
  dnp_plants:
    'id,thai_name,scientific_name,english_name,family,iucn_status,native_status,th_record_count,photo_url,photo_license,photo_credit,photo_ref',
  dnp_fauna:
    'id,thai_name,scientific_name,group_type,family,iucn_status,onep_status,protected_area,province,photo_url,photo_license,photo_credit,photo_ref',
  dnp_wildlife:
    'id,thai_name,scientific_name,english_name,family,iucn_status,onep_2565,is_protected,seasonal_status,group_type,photo_url,photo_license,photo_credit,photo_ref',
  dnp_species:
    'id,thai_name,scientific_name,family,group_type,protected_area,forest_type,survey_year_be,photo_url,photo_license,photo_credit,photo_ref',
};

/** `english_name` exists only on plants and wildlife. */
const SEARCH_COLUMNS: Record<SpeciesType, readonly string[]> = {
  dnp_plants: ['thai_name', 'scientific_name', 'english_name'],
  dnp_fauna: ['thai_name', 'scientific_name'],
  dnp_wildlife: ['thai_name', 'scientific_name', 'english_name'],
  dnp_species: ['thai_name', 'scientific_name'],
};

/**
 * One catalogue record. The four tables return different subsets; every
 * optional field is nullable because a row may simply not carry it.
 */
export interface SpeciesRecord {
  id: number;
  /** Set by the client so a card knows which table it came from. */
  type?: SpeciesType;

  thai_name: string;
  scientific_name: string | null;
  english_name?: string | null;
  family?: string | null;
  group_type?: string | null;

  iucn_status?: string | null;
  onep_status?: string | null;
  onep_2548?: string | null;
  onep_2560?: string | null;
  onep_2565?: string | null;
  is_protected?: boolean | null;
  legal_status?: string | null;
  seasonal_status?: string | null;
  native_status?: string | null;

  gbif_key?: number | null;
  map_tile_url?: string | null;
  th_record_count?: number | null;
  th_provinces?: string | null;

  protected_area?: string | null;
  province?: string | null;
  location?: string | null;
  habitat?: string | null;
  distribution?: string | null;
  forest_type?: string | null;
  survey_year_be?: number | null;

  photo_url: string | null;
  photo_source?: string | null;
  photo_license?: string | null;
  photo_credit?: string | null;
  photo_ref?: string | null;

  source_url?: string | null;
  license?: string | null;
}

export interface SpeciesPage {
  items: SpeciesRecord[];
  total: number;
}

export interface SpeciesListOptions {
  search?: string;
  limit?: number;
  offset?: number;
}

export interface SpeciesClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}

interface FetchResponse {
  ok: boolean;
  status: number;
  headers: {get(name: string): string | null};
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

export class SpeciesHttpError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string) {
    super(`Species HTTP ${status}${body ? `: ${body}` : ''}`);
    this.name = 'SpeciesHttpError';
    this.status = status;
    this.body = body;
  }
}

const DEFAULT_LIMIT = 10;
const DEFAULT_TIMEOUT_MS = 12_000;

/** PostgREST treats `,()*\` as syntax inside `or=()`, so never pass them. */
const sanitizeTerm = (value: string): string =>
  value
    .trim()
    .replace(/[,()*\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 60);

export class SpeciesClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;

  constructor(options: SpeciesClientOptions = {}) {
    const fetchImpl = options.fetchImpl ?? (globalThis as {fetch?: FetchLike}).fetch;
    if (!fetchImpl) {
      throw new Error('No fetch implementation available');
    }
    this.baseUrl = (options.baseUrl ?? SPECIES_API_BASE).replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = fetchImpl;
  }

  /** One table, one page. */
  async listPage(
    type: SpeciesType,
    options: SpeciesListOptions = {},
  ): Promise<SpeciesPage> {
    const limit = options.limit ?? DEFAULT_LIMIT;
    const offset = options.offset ?? 0;
    const params = [
      `select=${encodeURIComponent(CARD_COLUMNS[type])}`,
      `limit=${limit}`,
      `offset=${offset}`,
      'order=id.asc',
    ];

    const term = sanitizeTerm(options.search ?? '');
    if (term) {
      const filter = SEARCH_COLUMNS[type]
        .map(column => `${column}.ilike.*${encodeURIComponent(term)}*`)
        .join(',');
      params.push(`or=(${filter})`);
    }

    const result = await this.request<SpeciesRecord[]>(
      `${type}?${params.join('&')}`,
    );
    return {
      items: result.data.map(row => ({...row, type})),
      total: result.total,
    };
  }

  /**
   * A page for a tab. "All" fetches the same page from the three named tables
   * and interleaves them, so one screen always mixes plants, birds and fauna.
   */
  async list(
    tab: SpeciesTabKey,
    options: SpeciesListOptions = {},
  ): Promise<SpeciesPage> {
    const limit = options.limit ?? DEFAULT_LIMIT;
    if (tab !== 'all') {
      return this.listPage(tab, options);
    }

    // The merged stream is plants[0], wildlife[0], fauna[0], plants[1], ...
    // A global offset therefore maps to a row offset plus a skip inside one
    // round, so page 2 starts exactly where page 1 stopped.
    const start = options.offset ?? 0;
    const rowOffset = Math.floor(start / ALL_TYPES.length);
    const skip = start % ALL_TYPES.length;
    const rowLimit = Math.ceil((skip + limit) / ALL_TYPES.length);

    const pages = await Promise.all(
      ALL_TYPES.map(type =>
        this.listPage(type, {
          search: options.search,
          limit: rowLimit,
          offset: rowOffset,
        }),
      ),
    );
    const merged: SpeciesRecord[] = [];
    const longest = Math.max(...pages.map(page => page.items.length));
    for (let index = 0; index < longest; index += 1) {
      pages.forEach(page => {
        const item = page.items[index];
        if (item) {
          merged.push(item);
        }
      });
    }
    return {
      items: merged.slice(skip, skip + limit),
      total: pages.reduce((sum, page) => sum + page.total, 0),
    };
  }

  /** One record with every column, including the ones the grid omits. */
  async get(type: SpeciesType, id: number): Promise<SpeciesRecord> {
    const result = await this.request<SpeciesRecord[]>(
      `${type}?select=*&id=eq.${id}&limit=1`,
    );
    const row = result.data[0];
    if (!row) {
      throw new SpeciesHttpError(404, `No ${type} record with id ${id}`);
    }
    return {...row, type};
  }

  private async request<T>(
    path: string,
  ): Promise<{data: T; total: number}> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/${path}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          // Without this the server omits Content-Range, so no total.
          Prefer: 'count=exact',
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new SpeciesHttpError(response.status, await response.text());
      }
      const data = (await response.json()) as T;
      const range = response.headers.get('content-range');
      const parsed = range ? Number(range.split('/')[1]) : NaN;
      const total = Number.isFinite(parsed)
        ? parsed
        : Array.isArray(data)
        ? data.length
        : 0;
      return {data, total};
    } finally {
      clearTimeout(timer);
    }
  }
}

export const createSpeciesClient = (
  options?: SpeciesClientOptions,
): SpeciesClient => new SpeciesClient(options);
