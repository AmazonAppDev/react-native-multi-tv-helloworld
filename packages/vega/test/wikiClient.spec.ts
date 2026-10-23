/**
 * The Field Card treats a missing Wikipedia article as a normal outcome, so the
 * 404 -> null contract and the X-Device-Id header are the two things worth
 * pinning down.
 */
import {
  GLOBIE_WIKI_ENDPOINT,
  WikiClient,
  WikiHttpError,
} from '@multitv/shared';

interface FakeResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

const okResponse = (body: unknown): FakeResponse => ({
  ok: true,
  status: 200,
  text: async () => '',
  json: async () => body,
});

const errorResponse = (status: number, body: string): FakeResponse => ({
  ok: false,
  status,
  text: async () => body,
  json: async () => ({}),
});

describe('WikiClient', () => {
  it('sends the device id and the encoded species name', async () => {
    const summary = {
      title: 'Bar-headed goose',
      extract: 'The bar-headed goose is a goose.',
      url: 'https://en.wikipedia.org/wiki/Bar-headed_goose',
      license: 'CC BY-SA 4.0',
    };
    const fetchImpl = jest.fn().mockResolvedValue(okResponse(summary));
    const getDeviceId = jest.fn().mockResolvedValue('device-123');
    const client = new WikiClient({fetchImpl, getDeviceId});

    const result = await client.summary(' Anser indicus ');

    expect(result).toEqual(summary);
    expect(getDeviceId).toHaveBeenCalledTimes(1);

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`${GLOBIE_WIKI_ENDPOINT}?name=Anser%20indicus`);
    expect(init.method).toBe('GET');
    expect(init.headers['X-Device-Id']).toBe('device-123');
    expect(init.headers.Accept).toBe('application/json');
  });

  it('returns null for an unknown article instead of throwing', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(errorResponse(404, 'not found'));
    const client = new WikiClient({
      fetchImpl,
      getDeviceId: async () => 'device-123',
    });

    await expect(client.summary('Unknown species')).resolves.toBeNull();
  });

  it('throws a typed error when the proxy fails', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(errorResponse(401, 'missing device id'));
    const client = new WikiClient({
      fetchImpl,
      getDeviceId: async () => 'device-123',
    });

    await expect(client.summary('Anser indicus')).rejects.toBeInstanceOf(
      WikiHttpError,
    );
    await expect(client.summary('Anser indicus')).rejects.toMatchObject({
      status: 401,
      body: 'missing device id',
    });
  });

  it('skips the request for a blank name', async () => {
    const fetchImpl = jest.fn();
    const getDeviceId = jest.fn();
    const client = new WikiClient({fetchImpl, getDeviceId});

    await expect(client.summary('   ')).resolves.toBeNull();

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(getDeviceId).not.toHaveBeenCalled();
  });
});

describe('WikiClient gallery', () => {
  const summary = {
    title: 'Asian elephant',
    extract: 'The Asian elephant is an elephant.',
    url: 'https://en.wikipedia.org/wiki/Asian_elephant',
    license: 'CC BY-SA 4.0',
  };

  it('asks for the extra photos in the same round trip', async () => {
    const images = [
      {
        url: 'https://mcp.globie.earth/media/elephant.jpg',
        license: 'CC BY-SA 4.0',
        credit: 'Somebody',
      },
    ];
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(okResponse({...summary, images}));
    const client = new WikiClient({
      fetchImpl,
      getDeviceId: async () => 'device-123',
    });

    await expect(client.gallery(' Elephas maximus ', 4)).resolves.toEqual(
      images,
    );

    const [url] = fetchImpl.mock.calls[0];
    expect(url).toBe(
      `${GLOBIE_WIKI_ENDPOINT}?name=Elephas%20maximus&images=4`,
    );
  });

  it('returns an empty list when the article has no other photos', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(okResponse(summary));
    const client = new WikiClient({
      fetchImpl,
      getDeviceId: async () => 'device-123',
    });

    await expect(client.gallery('Elephas maximus', 4)).resolves.toEqual([]);
  });

  it('returns an empty list when there is no article', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(errorResponse(404, 'not found'));
    const client = new WikiClient({
      fetchImpl,
      getDeviceId: async () => 'device-123',
    });

    await expect(client.gallery('Unknown species')).resolves.toEqual([]);
  });
});
