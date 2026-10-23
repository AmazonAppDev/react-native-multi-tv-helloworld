/**
 * Locks the two behaviours the species grid depends on but cannot see on
 * device: the PostgREST request shape and the "All" tab offset maths.
 */
import {
  SpeciesClient,
  SpeciesHttpError,
  SPECIES_API_BASE,
} from '@multitv/shared';

interface FakeResponse {
  ok: boolean;
  status: number;
  headers: {get(name: string): string | null};
  text(): Promise<string>;
  json(): Promise<unknown>;
}

const okResponse = (body: unknown, contentRange?: string): FakeResponse => ({
  ok: true,
  status: 200,
  headers: {
    get: (name: string) =>
      name.toLowerCase() === 'content-range' ? contentRange ?? null : null,
  },
  text: async () => '',
  json: async () => body,
});

const errorResponse = (status: number, body: string): FakeResponse => ({
  ok: false,
  status,
  headers: {get: () => null},
  text: async () => body,
  json: async () => ({}),
});

const urls = (fetchImpl: jest.Mock): string[] =>
  fetchImpl.mock.calls.map(call => String(call[0]));

const decodedUrls = (fetchImpl: jest.Mock): string[] =>
  urls(fetchImpl).map(url => decodeURIComponent(url));

describe('SpeciesClient', () => {
  describe('listPage', () => {
    it('asks for one page and reads the exact total from Content-Range', async () => {
      const fetchImpl = jest
        .fn()
        .mockResolvedValue(
          okResponse([{id: 1, thai_name: 'กบ'}], '0-0/2128'),
        );
      const client = new SpeciesClient({fetchImpl});

      const page = await client.listPage('dnp_fauna', {limit: 10, offset: 20});

      expect(page.total).toBe(2128);
      expect(page.items).toEqual([{id: 1, thai_name: 'กบ', type: 'dnp_fauna'}]);

      const [url] = urls(fetchImpl);
      expect(url.startsWith(`${SPECIES_API_BASE}/dnp_fauna?`)).toBe(true);
      expect(url).toContain('limit=10');
      expect(url).toContain('offset=20');
      expect(url).toContain('order=id.asc');
      expect(url).not.toContain('or=(');

      const [, init] = fetchImpl.mock.calls[0];
      expect(init.method).toBe('GET');
      // Without this header PostgREST omits Content-Range.
      expect(init.headers.Prefer).toBe('count=exact');
    });

    it('falls back to the row count when Content-Range is missing', async () => {
      const fetchImpl = jest
        .fn()
        .mockResolvedValue(okResponse([{id: 1}, {id: 2}]));
      const client = new SpeciesClient({fetchImpl});

      const page = await client.listPage('dnp_plants');

      expect(page.total).toBe(2);
    });

    it('searches only the columns that exist on the table', async () => {
      const fetchImpl = jest.fn().mockResolvedValue(okResponse([]));
      const client = new SpeciesClient({fetchImpl});

      await client.listPage('dnp_species', {
        search: ' กบ,*()\\Fejervarya ',
      });

      const [url] = decodedUrls(fetchImpl);
      // PostgREST syntax characters are stripped before interpolation.
      expect(url).toContain('thai_name.ilike.*กบ Fejervarya*');
      expect(url).toContain('scientific_name.ilike.*กบ Fejervarya*');
      expect(url).not.toContain('english_name');
      expect(url).not.toContain(',*()');
    });

    it('throws a typed error for a non-2xx response', async () => {
      const fetchImpl = jest
        .fn()
        .mockResolvedValue(errorResponse(503, 'unavailable'));
      const client = new SpeciesClient({fetchImpl});

      await expect(client.listPage('dnp_wildlife')).rejects.toMatchObject({
        name: 'SpeciesHttpError',
        status: 503,
        body: 'unavailable',
      });
    });
  });

  describe('list("all")', () => {
    const plantPage = [1, 2, 3, 4].map(id => ({id, thai_name: `p${id}`}));
    const wildlifePage = [11, 12, 13, 14].map(id => ({
      id,
      thai_name: `w${id}`,
    }));
    const faunaPage = [21, 22, 23, 24].map(id => ({id, thai_name: `f${id}`}));

    /** Behaves like PostgREST: honours limit/offset, reports the table total. */
    const allFetch = () =>
      jest.fn((input: string) => {
        const readParam = (key: string): number => {
          const part = (input.split('?')[1] ?? '')
            .split('&')
            .find(candidate => candidate.startsWith(`${key}=`));
          return part ? Number(part.slice(key.length + 1)) : 0;
        };
        const offset = readParam('offset');
        const limit = readParam('limit');
        const source = input.includes('/dnp_plants?')
          ? {rows: plantPage, total: 100}
          : input.includes('/dnp_wildlife?')
          ? {rows: wildlifePage, total: 50}
          : {rows: faunaPage, total: 25};
        return Promise.resolve(
          okResponse(
            source.rows.slice(offset, offset + limit),
            `0-0/${source.total}`,
          ),
        );
      });

    it('interleaves plants, wildlife and fauna and sums the totals', async () => {
      const fetchImpl = allFetch();
      const client = new SpeciesClient({fetchImpl});

      const page = await client.list('all', {limit: 10, offset: 0});

      expect(page.total).toBe(175);
      expect(page.items.map(item => item.id)).toEqual([
        1, 11, 21, 2, 12, 22, 3, 13, 23, 4,
      ]);
      expect(page.items.every(item => item.type)).toBe(true);
    });

    it('maps a global offset to a row offset plus a skip', async () => {
      const fetchImpl = allFetch();
      const client = new SpeciesClient({fetchImpl});

      const page = await client.list('all', {limit: 10, offset: 10});

      // offset 10 => row offset 3, skip 1, four rows per table.
      decodedUrls(fetchImpl).forEach(url => {
        expect(url).toContain('limit=4');
        expect(url).toContain('offset=3');
      });
      expect(page.items.map(item => item.id)).toEqual([14, 24]);
      expect(page.total).toBe(175);
    });

    it('sends the same search term to every table', async () => {
      const fetchImpl = allFetch();
      const client = new SpeciesClient({fetchImpl});

      await client.list('all', {limit: 3, search: 'nok'});

      decodedUrls(fetchImpl).forEach(url => {
        expect(url).toContain('or=(');
        expect(url).toContain('.ilike.*nok*');
      });
    });
  });

  describe('get', () => {
    it('returns the full row tagged with its table', async () => {
      const fetchImpl = jest
        .fn()
        .mockResolvedValue(okResponse([{id: 7, habitat: 'ทุ่งหญ้า'}]));
      const client = new SpeciesClient({fetchImpl});

      const record = await client.get('dnp_wildlife', 7);

      expect(record).toEqual({
        id: 7,
        habitat: 'ทุ่งหญ้า',
        type: 'dnp_wildlife',
      });
      expect(decodedUrls(fetchImpl)[0]).toContain(
        '/dnp_wildlife?select=*&id=eq.7&limit=1',
      );
    });

    it('turns an empty result into a 404 SpeciesHttpError', async () => {
      const fetchImpl = jest.fn().mockResolvedValue(okResponse([]));
      const client = new SpeciesClient({fetchImpl});

      await expect(client.get('dnp_plants', 999)).rejects.toBeInstanceOf(
        SpeciesHttpError,
      );
    });
  });
});
