import 'react-native';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import type {SpeciesClient, SpeciesRecord} from '@multitv/shared';
import {MemoryScreen} from '../src/screens/games/MemoryScreen';
import {buildMemoryDeck, toGameSpecies} from '../src/screens/games/rounds';
import type {MemoryCard, Rng} from '../src/screens/games/rounds';
import type {SearchRelayClient} from '../src/screens/SearchScreen';

// Same Kepler shim as App.spec: `react-native` resolves to the Kepler package,
// whose BackHandler is a CommonJS object the RN index cannot dereference.
jest.mock('react-native/Libraries/Utilities/BackHandler', () => ({
  __esModule: true,
  default: {
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    exitApp: jest.fn(),
  },
}));

// The reward burst plays a cue through the shared podcast player, which reaches
// into w3cmedia's native turbo modules at import time.
jest.mock('../src/screens/player/w3cmedia', () => {
  class FakeAudioPlayer {
    public src = '';
    public currentTime = 0;
    public volume = 1;
    public muted = false;
    public paused = true;
    public ended = false;
    public duration = 0;
    public error = null;

    private listeners: Record<string, Array<(event?: unknown) => void>> = {};

    constructor(_audioType?: number, _audioUsage?: number) {}

    async initialize() {}

    async deinitialize() {}

    deinitializeSync() {
      return 0;
    }

    async setMediaControlFocus() {}

    addEventListener(type: string, listener: (event?: unknown) => void) {
      this.listeners[type] = [...(this.listeners[type] ?? []), listener];
    }

    removeEventListener(type: string, listener: (event?: unknown) => void) {
      this.listeners[type] = (this.listeners[type] ?? []).filter(
        item => item !== listener,
      );
    }

    async play() {
      this.paused = false;
    }

    pause() {
      this.paused = true;
    }
  }

  return {
    __esModule: true,
    AudioPlayer: FakeAudioPlayer,
    AudioContentType: {
      CONTENT_TYPE_NONE: 0,
      CONTENT_TYPE_SPEECH: 1,
      CONTENT_TYPE_MUSIC: 2,
      CONTENT_TYPE_MOVIE: 3,
      CONTENT_TYPE_SONIFICATION: 4,
    },
    AudioUsageType: {
      USAGE_NONE: 0,
      USAGE_MEDIA: 1,
      USAGE_COMMUNICATION: 2,
      USAGE_ALARM: 3,
      USAGE_NOTIFICATION: 4,
      USAGE_ACCESSIBILITY: 5,
      USAGE_GAME: 6,
      USAGE_NAVIGATION: 7,
      USAGE_RING: 8,
      USAGE_VOICE_ASSISTANT: 9,
      USAGE_FLASH_BRIEFING: 15,
    },
  };
});

type Screen = ReturnType<typeof render>;
type TestNode = ReturnType<Screen['getByTestId']>;

/** A `<Text>` built from several children is an array in the test tree. */
const textOf = (node: TestNode): string => {
  const parts: string[] = [];
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(walk);
    } else if (value !== null && value !== undefined) {
      parts.push(String(value));
    }
  };
  walk(node.props.children);
  return parts.join('');
};

const flush = () => act(async () => {});

/** The deck builder consumes rng calls in order, so a seed replays a deal. */
const makeRng = (seed: number): {next: Rng; peek: () => number} => {
  let state = seed;
  return {
    next: () => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    },
    peek: () => state,
  };
};

const record = (id: number, thai: string): SpeciesRecord => ({
  id,
  type: 'dnp_wildlife',
  thai_name: thai,
  scientific_name: `Species ${id}`,
  photo_url: null,
});

const records = [
  record(1, 'กบ'),
  record(2, 'นก'),
  record(3, 'เต่า'),
  record(4, 'เสือ'),
  record(5, 'ช้าง'),
  record(6, 'กวาง'),
  record(7, 'ลิง'),
  record(8, 'ปลา'),
];

const pool = toGameSpecies(records);

const speciesClient = {
  list: jest.fn(async () => ({items: records, total: records.length})),
} as unknown as SpeciesClient;

/** One wallet, deduping by key exactly the way the ledger's PK does. */
const makeWallet = (start = 100) => {
  const paid = new Map<string, number>();
  let balance = start;
  const awardTokens = jest.fn(async (key: string, amount: number) => {
    if (paid.has(key)) {
      return {balance, awarded: 0, available: true};
    }
    paid.set(key, amount);
    balance += amount;
    return {balance, awarded: amount, available: true};
  });
  const loadWallet = jest.fn(async () => ({balance, available: true}));
  return {
    awardTokens,
    loadWallet,
    keys: () => [...paid.keys()],
    balance: () => balance,
  };
};

type Wallet = ReturnType<typeof makeWallet>;

const makeRelay = (wallet: Wallet): SearchRelayClient =>
  ({
    loadWallet: wallet.loadWallet,
    awardTokens: wallet.awardTokens,
  } as unknown as SearchRelayClient);

/** The relay when 256_eco_tokens.sql has not been applied yet. */
const offlineRelay = {
  loadWallet: jest.fn(async () => ({balance: null, available: false})),
  awardTokens: jest.fn(async () => ({
    balance: null,
    awarded: 0,
    available: false,
  })),
} as unknown as SearchRelayClient;

/** Both card indices of every pair, in the order the board draws them. */
const pairGroups = (deck: MemoryCard[]): Array<[number, number]> => {
  const groups = new Map<string, number[]>();
  deck.forEach((card, index) => {
    groups.set(card.pair, [...(groups.get(card.pair) ?? []), index]);
  });
  return [...groups.values()].map(([a, b]) => [a, b] as [number, number]);
};

/** Flip `[from, to)` pairs in deal order; every one of them is a match. */
const playPairs = (
  screen: Screen,
  deck: MemoryCard[],
  from: number,
  to: number,
) => {
  const groups = pairGroups(deck);
  groups.slice(from, to).forEach(([a, b]) => {
    fireEvent.press(screen.getByTestId(`memory-card-${a}`));
    fireEvent.press(screen.getByTestId(`memory-card-${b}`));
  });
};

describe('Memory screen wallet', () => {
  it('credits six pairs as six ledger rows worth thirty tokens', async () => {
    const wallet = makeWallet();
    const rng = makeRng(11);
    const screen = render(
      <MemoryScreen
        client={speciesClient}
        relay={makeRelay(wallet)}
        rng={rng.next}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId('memory-grid')).toBeTruthy(),
    );

    const deck = buildMemoryDeck(pool, 6, makeRng(11).next);
    playPairs(screen, deck, 0, 6);

    await waitFor(() =>
      expect(screen.getByTestId('memory-summary')).toBeTruthy(),
    );

    expect(textOf(screen.getByTestId('memory-tokens'))).toBe('+30 ECO TOKENS');
    // Jest reports reduced motion, so the paper is omitted entirely; the
    // moving path (pointerEvents="none", 14 pieces) lives in celebrate.spec.
    expect(screen.queryByTestId('memory-confetti')).toBeNull();
    expect(textOf(screen.getByTestId('memory-summary-moves'))).toBe('6 MOVES');
    expect(wallet.awardTokens).toHaveBeenCalledTimes(6);

    const keys = wallet.awardTokens.mock.calls.map(call => call[0]);
    expect(new Set(keys).size).toBe(6);
    keys.forEach(key => expect(key).toMatch(/^memory:0:/));
    wallet.awardTokens.mock.calls.forEach(call => expect(call[1]).toBe(5));
    expect(wallet.balance()).toBe(130);
    await flush();
  });

  it('answers a replayed pair key with awarded 0 and leaves the balance alone', async () => {
    const wallet = makeWallet();
    const deck = buildMemoryDeck(pool, 6, makeRng(11).next);
    const [a, b] = pairGroups(deck)[0];

    const first = render(
      <MemoryScreen
        client={speciesClient}
        relay={makeRelay(wallet)}
        rng={makeRng(11).next}
      />,
    );
    await waitFor(() => expect(first.getByTestId('memory-grid')).toBeTruthy());
    fireEvent.press(first.getByTestId(`memory-card-${a}`));
    fireEvent.press(first.getByTestId(`memory-card-${b}`));

    await waitFor(() => expect(wallet.awardTokens).toHaveBeenCalledTimes(1));
    expect(wallet.balance()).toBe(105);
    first.unmount();

    // A remount deals the same seed, so it asks for the same pair key: the
    // wallet's receipt is what stops the second credit.
    const replay = render(
      <MemoryScreen
        client={speciesClient}
        relay={makeRelay(wallet)}
        rng={makeRng(11).next}
      />,
    );
    await waitFor(() => expect(replay.getByTestId('memory-grid')).toBeTruthy());
    fireEvent.press(replay.getByTestId(`memory-card-${a}`));
    fireEvent.press(replay.getByTestId(`memory-card-${b}`));

    await waitFor(() => expect(wallet.awardTokens).toHaveBeenCalledTimes(2));

    const [firstCall, replayCall] = wallet.awardTokens.mock.calls;
    expect(replayCall[0]).toBe(firstCall[0]);

    const outcomes = await Promise.all(
      wallet.awardTokens.mock.results.map(result => result.value),
    );
    expect(outcomes[0].awarded).toBe(5);
    expect(outcomes[1].awarded).toBe(0);
    expect(wallet.balance()).toBe(105);
    await waitFor(() =>
      expect(textOf(replay.getByTestId('memory-moves'))).toContain(
        '105 TOKENS',
      ),
    );
  });

  it('deals a new session key and pays again after PLAY AGAIN', async () => {
    const wallet = makeWallet();
    const rng = makeRng(11);
    const probe = makeRng(11);
    const firstDeck = buildMemoryDeck(pool, 6, probe.next);
    const resumed = probe.peek();

    const screen = render(
      <MemoryScreen
        client={speciesClient}
        relay={makeRelay(wallet)}
        rng={rng.next}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('memory-grid')).toBeTruthy(),
    );
    playPairs(screen, firstDeck, 0, 6);

    await waitFor(() =>
      expect(screen.getByTestId('memory-again')).toBeTruthy(),
    );
    fireEvent.press(screen.getByTestId('memory-again'));
    await waitFor(() =>
      expect(screen.getByTestId('memory-grid')).toBeTruthy(),
    );

    // The same rng, resumed after the first deal, is what the screen shuffles.
    const secondDeck = buildMemoryDeck(pool, 6, makeRng(resumed).next);
    playPairs(screen, secondDeck, 0, 1);

    await waitFor(() => expect(wallet.awardTokens).toHaveBeenCalledTimes(7));
    expect(wallet.awardTokens.mock.calls[6][0]).toMatch(/^memory:1:/);
    expect(wallet.balance()).toBe(135);
    await flush();
  });
});

describe('Memory screen without a ledger', () => {
  it('finishes and celebrates, printing no running total', async () => {
    const rng = makeRng(11);
    const screen = render(
      <MemoryScreen
        client={speciesClient}
        relay={offlineRelay}
        rng={rng.next}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('memory-grid')).toBeTruthy(),
    );

    const deck = buildMemoryDeck(pool, 6, makeRng(11).next);
    playPairs(screen, deck, 0, 1);

    await waitFor(() =>
      expect(screen.getByTestId('reward-burst')).toBeTruthy(),
    );
    await waitFor(() =>
      expect(textOf(screen.getByTestId('reward-burst-amount'))).toBe(
        '+5 ECO TOKENS',
      ),
    );
    expect(textOf(screen.getByTestId('memory-moves'))).not.toContain('TOKENS');

    playPairs(screen, deck, 1, 6);
    await waitFor(() =>
      expect(screen.getByTestId('memory-summary')).toBeTruthy(),
    );
    expect(textOf(screen.getByTestId('memory-tokens'))).toBe('+30 ECO TOKENS');
    await flush();
  });
});

describe('Memory screen reward burst', () => {
  it('never takes the remote: a pair matches while a burst is on screen', async () => {
    const wallet = makeWallet();
    const rng = makeRng(11);
    const screen = render(
      <MemoryScreen
        client={speciesClient}
        relay={makeRelay(wallet)}
        rng={rng.next}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('memory-grid')).toBeTruthy(),
    );

    const deck = buildMemoryDeck(pool, 6, makeRng(11).next);
    playPairs(screen, deck, 0, 1);

    await waitFor(() =>
      expect(screen.getByTestId('reward-burst')).toBeTruthy(),
    );
    expect(screen.getByTestId('reward-burst').props.pointerEvents).toBe('none');

    playPairs(screen, deck, 1, 2);
    expect(textOf(screen.getByTestId('memory-moves'))).toContain(
      'PAIRS 2 / 6',
    );
    await flush();
  });
});
