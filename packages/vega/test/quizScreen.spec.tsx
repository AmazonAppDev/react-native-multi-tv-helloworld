import 'react-native';
import {fireEvent, render, waitFor, within} from '@testing-library/react-native';
import type {
  ChallengeAward,
  ChallengeInvitation,
  ChallengePhase,
  ChallengeQuestion,
  ChallengeStanding,
  SpeciesClient,
  SpeciesRecord,
} from '@multitv/shared';
import {QuizScreen} from '../src/screens/games/QuizScreen';
import type {QuizRoomView} from '../src/screens/games/QuizScreen';
import {buildRounds, toGameSpecies} from '../src/screens/games/rounds';
import type {ChoiceRound, Rng} from '../src/screens/games/rounds';
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
    publishDeck: jest.fn(async () => undefined),
  } as unknown as SearchRelayClient);

/** The relay when 256_eco_tokens.sql has not been applied yet. */
const offlineRelay = {
  loadWallet: jest.fn(async () => ({balance: null, available: false})),
  awardTokens: jest.fn(async () => ({
    balance: null,
    awarded: 0,
    available: false,
  })),
  publishDeck: jest.fn(async () => undefined),
} as unknown as SearchRelayClient;

/**
 * The screen swallows a tap that arrives within the guard window of a deal or a
 * summary, so the key-up that triggered the transition cannot fire a second
 * action. Tests press on the same tick, so nudge the clock past the guard.
 */
const pressPastGuard = (press: () => void, aheadMs = 500) => {
  const realNow = Date.now;
  const spy = jest
    .spyOn(Date, 'now')
    .mockImplementation(() => realNow() + aheadMs);
  try {
    press();
  } finally {
    spy.mockRestore();
  }
};

/** Press the right tile on the drawn round, or any wrong one. */
const answer = (
  screen: Screen,
  rounds: ChoiceRound[],
  index: number,
  correct: boolean,
) => {
  const round = rounds[index];
  const target = round.options.findIndex(option =>
    correct ? option.key === round.species.key : option.key !== round.species.key,
  );
  pressPastGuard(() =>
    fireEvent.press(screen.getByTestId(`quiz-option-${target}`)),
  );
};

/** Five answers and five NEXT presses: the run ends on the last one. */
const playRun = (
  screen: Screen,
  rounds: ChoiceRound[],
  correct: boolean,
) => {
  rounds.forEach((_round, index) => {
    answer(screen, rounds, index, correct);
    fireEvent.press(screen.getByTestId('quiz-next'));
  });
};

describe('Quiz screen wallet', () => {
  it('credits a perfect run forty tokens once, keyed by the deck', async () => {
    const wallet = makeWallet();
    const rounds = buildRounds(pool, 5, makeRng(7).next);
    const screen = render(
      <QuizScreen
        client={speciesClient}
        relay={makeRelay(wallet)}
        rng={makeRng(7).next}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId('quiz-option-0')).toBeTruthy(),
    );

    playRun(screen, rounds, true);

    await waitFor(() =>
      expect(screen.getByTestId('quiz-summary')).toBeTruthy(),
    );
    await waitFor(() =>
      expect(wallet.awardTokens).toHaveBeenCalledTimes(1),
    );

    expect(screen.getByText('5 / 5')).toBeTruthy();
    expect(textOf(screen.getByTestId('quiz-tokens'))).toBe('+40 ECO TOKENS');
    await waitFor(() =>
      expect(textOf(screen.getByTestId('quiz-reward-amount'))).toBe(
        '+40 ECO TOKENS',
      ),
    );

    const [key, amount] = wallet.awardTokens.mock.calls[0];
    expect(key).toMatch(/^quiz:quiz-0-/);
    expect(amount).toBe(40);
    expect(wallet.balance()).toBe(140);

    // The celebration is decoration: it may never eat a press or a focus move.
    expect(screen.getByTestId('quiz-reward').props.pointerEvents).toBe('none');
    screen.unmount();
  });

  it('writes no ledger row and shows no burst for a 0/5 run', async () => {
    const wallet = makeWallet();
    const rounds = buildRounds(pool, 5, makeRng(7).next);
    const screen = render(
      <QuizScreen
        client={speciesClient}
        relay={makeRelay(wallet)}
        rng={makeRng(7).next}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId('quiz-option-0')).toBeTruthy(),
    );

    playRun(screen, rounds, false);

    await waitFor(() =>
      expect(screen.getByTestId('quiz-summary')).toBeTruthy(),
    );

    expect(screen.getByText('0 / 5')).toBeTruthy();
    expect(screen.queryByTestId('quiz-tokens')).toBeNull();
    expect(screen.queryByTestId('quiz-reward')).toBeNull();
    expect(wallet.awardTokens).not.toHaveBeenCalled();
    expect(wallet.balance()).toBe(100);
  });

  it(
    'deals a new deck after PLAY AGAIN and pays the second run too',
    async () => {
      const wallet = makeWallet();
    const probe = makeRng(7);
    const firstDeck = buildRounds(pool, 5, probe.next);
    const resumed = probe.peek();

    const screen = render(
      <QuizScreen
        client={speciesClient}
        relay={makeRelay(wallet)}
        rng={makeRng(7).next}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId('quiz-option-0')).toBeTruthy(),
    );
    playRun(screen, firstDeck, true);

    await waitFor(() =>
      expect(screen.getByTestId('quiz-again')).toBeTruthy(),
    );
    expect(wallet.balance()).toBe(140);

    // The SELECT that finished the run also lands on PLAY AGAIN, so the screen
    // ignores presses inside SUMMARY_GRACE_MS of the summary. Let it lapse.
    await new Promise<void>(resolve => setTimeout(resolve, 2_600));
    fireEvent.press(screen.getByTestId('quiz-again'));
    await waitFor(() =>
      expect(screen.getByTestId('quiz-option-0')).toBeTruthy(),
    );

    // The same rng, resumed after the first deal, is what the second shuffle uses.
    const secondDeck = buildRounds(pool, 5, makeRng(resumed).next);
    playRun(screen, secondDeck, true);

    await waitFor(() =>
      expect(wallet.awardTokens).toHaveBeenCalledTimes(2),
    );

    expect(wallet.awardTokens.mock.calls[0][0]).toMatch(/^quiz:quiz-0-/);
    expect(wallet.awardTokens.mock.calls[1][0]).toMatch(/^quiz:quiz-1-/);
    expect(wallet.balance()).toBe(180);
    screen.unmount();
    },
    15_000,
  );
});

describe('Quiz screen without a ledger', () => {
  it('finishes and celebrates, printing no running total', async () => {
    const rounds = buildRounds(pool, 5, makeRng(7).next);
    const screen = render(
      <QuizScreen
        client={speciesClient}
        relay={offlineRelay}
        rng={makeRng(7).next}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId('quiz-option-0')).toBeTruthy(),
    );

    answer(screen, rounds, 0, true);
    fireEvent.press(screen.getByTestId('quiz-next'));
    await waitFor(() =>
      expect(textOf(screen.getByTestId('quiz-progress'))).toContain('SCORE 1'),
    );
    expect(textOf(screen.getByTestId('quiz-progress'))).not.toContain('TOKENS');

    rounds.slice(1).forEach((_round, offset) => {
      answer(screen, rounds, offset + 1, true);
      fireEvent.press(screen.getByTestId('quiz-next'));
    });

    await waitFor(() =>
      expect(screen.getByTestId('quiz-summary')).toBeTruthy(),
    );
    await waitFor(() =>
      expect(textOf(screen.getByTestId('quiz-reward-amount'))).toBe(
        '+40 ECO TOKENS',
      ),
    );
    expect(textOf(screen.getByTestId('quiz-tokens'))).toBe('+40 ECO TOKENS');
    screen.unmount();
  });
});

describe('Quiz screen room photo', () => {
  const question = (image?: string): ChallengeQuestion => ({
    roundId: 'quiz-1',
    options: [
      {key: 'a', primary: 'Gallus gallus', secondary: 'ไก่'},
      {key: 'b', primary: 'White-winged Duck', secondary: 'เป็ด'},
      {key: 'c', primary: 'Hoplobatrachus rugulosus', secondary: 'กบ'},
    ],
    clues: ['The catalogue groups it as: birds.'],
    hasPhoto: Boolean(image),
    ...(image ? {image} : {}),
  });

  const room = (pushed: ChallengeQuestion): QuizRoomView => ({
    roomId: 'room-1',
    code: '123456',
    slot: 1,
    players: [{slot: 1, name: 'MUM', team: 0}],
    question: pushed,
    index: 1,
    total: 5,
    endsAt: Date.now() + 15_000,
  });

  it('draws the pushed species photo instead of the question mark', async () => {
    const image = 'https://cdn.globie.earth/dnp/dnp_wildlife-3.jpg';
    const screen = render(
      <QuizScreen client={speciesClient} room={room(question(image))} />,
    );

    await waitFor(() => expect(screen.getByTestId('challenge-photo')).toBeTruthy());
    expect(screen.getByTestId('challenge-photo').props.source).toEqual({uri: image});
    // The photo is the question, so the clue text is not repeated beside it.
    expect(screen.queryByTestId('challenge-clue')).toBeNull();
    screen.unmount();
  });

  it('keeps the clue and the question mark when the round has no photo', async () => {
    const screen = render(
      <QuizScreen client={speciesClient} room={room(question())} />,
    );

    await waitFor(() => expect(screen.getByTestId('challenge-clue')).toBeTruthy());
    expect(screen.queryByTestId('challenge-photo')).toBeNull();
    screen.unmount();
  });
});

describe('Quiz screen room celebration', () => {
  const pushed: ChallengeQuestion = {
    roundId: 'quiz-1',
    options: [
      {key: 'a', primary: 'Gallus gallus', secondary: 'ไก่'},
      {key: 'b', primary: 'White-winged Duck', secondary: 'เป็ด'},
      {key: 'c', primary: 'Hoplobatrachus rugulosus', secondary: 'กบ'},
    ],
    clues: ['The catalogue groups it as: birds.'],
    hasPhoto: false,
  };

  const view: QuizRoomView = {
    roomId: 'room-1',
    code: '123456',
    slot: 1,
    players: [{slot: 1, name: 'MUM', team: 0}],
    question: pushed,
    index: 1,
    total: 5,
    endsAt: Date.now() + 15_000,
  };

  const standings: ChallengeStanding[] = [
    {slot: 1, name: 'MUM', team: 0, score: 420, correct: 4, streak: 3},
    {slot: 2, name: 'DAD', team: 1, score: 260, correct: 2, streak: 0},
  ];

  const payout: ChallengeAward = {
    tokens: 25,
    awarded: 25,
    balance: 125,
    available: true,
  };

  const invitation = (phase: ChallengePhase): ChallengeInvitation => ({
    roomId: 'room-1',
    code: '123456',
    deckId: 'deck-1',
    deck: {deckId: 'deck-1', rounds: []},
    phase,
    players: [],
    expiresAt: Date.now() + 60_000,
  });

  it('crowns the champion over confetti and counts the payout', async () => {
    // A closed room is how the board learns the last round is over: the relay
    // reports `finished` on the answered-count poll.
    const relay = {
      // The board still reads this television's wallet for its header tally.
      loadWallet: jest.fn(async () => ({balance: 125, available: true})),
      fetchChallenge: jest.fn(async () => invitation('finished')),
      fetchChallengePresence: jest.fn(async () => ({
        roomId: 'room-1',
        code: '123456',
        tiles: [],
      })),
    } as unknown as SearchRelayClient;

    const screen = render(
      <QuizScreen
        client={speciesClient}
        relay={relay}
        room={view}
        standings={standings}
        payout={payout}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId('challenge-summary')).toBeTruthy(),
    );
    expect(screen.getByTestId('challenge-crown')).toBeTruthy();
    expect(textOf(screen.getByTestId('challenge-winner'))).toBe('MUM');
    expect(textOf(screen.getByTestId('challenge-tokens'))).toBe(
      '+25 ECO TOKENS',
    );
    // Jest reports reduced motion, so the paper is omitted entirely; the
    // moving path (pointerEvents="none", 14 pieces) lives in celebrate.spec.
    expect(screen.queryByTestId('challenge-confetti')).toBeNull();
    expect(screen.getByTestId('challenge-row-2')).toBeTruthy();
    screen.unmount();
  });

  it('pops the verdict and the streak on a correct room answer', async () => {
    const relay = {
      loadWallet: jest.fn(async () => ({balance: 125, available: true})),
      fetchChallenge: jest.fn(async () => invitation('playing')),
      fetchChallengePresence: jest.fn(async () => ({
        roomId: 'room-1',
        code: '123456',
        tiles: [],
      })),
      answerChallenge: jest.fn(async () => ({
        accepted: true,
        correct: true,
        answerPrimary: 'Gallus gallus',
        points: 180,
        elapsedMs: 1_200,
        late: false,
        answered: 1,
        total: 1,
        phase: 'playing' as ChallengePhase,
        standings: null,
        award: null,
      })),
    } as unknown as SearchRelayClient;

    const screen = render(
      <QuizScreen
        client={speciesClient}
        relay={relay}
        room={view}
        standings={standings}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId('quiz-option-0')).toBeTruthy(),
    );
    fireEvent.press(screen.getByTestId('quiz-option-0'));

    await waitFor(() =>
      expect(screen.getByTestId('challenge-feedback')).toBeTruthy(),
    );
    expect(screen.getByTestId('challenge-verdict')).toBeTruthy();
    expect(textOf(screen.getByTestId('challenge-feedback'))).toBe('CORRECT!');
    expect(textOf(screen.getByTestId('challenge-streak'))).toBe('STREAK ×3');
    screen.unmount();
  });

  it('shows at most four family tiles in the rail beside a live round', async () => {
    const frame = (slot: number) => ({
      slot,
      name: `PLAYER ${slot}`,
      on: true,
      version: 1,
      frameAt: Date.now(),
      frameUrl: `/v1/challenge/123456/presence/${slot}.jpg?v=1`,
      event: null,
    });
    const relay = {
      loadWallet: jest.fn(async () => ({balance: 125, available: true})),
      fetchChallenge: jest.fn(async () => invitation('playing')),
      fetchChallengePresence: jest.fn(async () => ({
        roomId: 'room-1',
        code: '123456',
        tiles: [
          frame(1),
          // A camera that is on but has not produced a frame yet: the avatar
          // stands in rather than the tile going blank.
          {...frame(2), name: 'DAD', version: 0, frameAt: 0, frameUrl: null},
          frame(3),
          frame(4),
          frame(5),
        ],
      })),
    } as unknown as SearchRelayClient;

    const screen = render(
      <QuizScreen
        client={speciesClient}
        relay={relay}
        room={view}
        standings={standings}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId('challenge-family-rail')).toBeTruthy(),
    );
    // The picture comes from the relay; the caption comes from the seating.
    expect(screen.getByTestId('challenge-frame-1').props.source.uri).toContain(
      '/presence/1.jpg?v=1',
    );
    expect(
      within(screen.getByTestId('challenge-player-1')).getByText('MUM'),
    ).toBeTruthy();
    expect(screen.getByTestId('challenge-avatar-2')).toBeTruthy();
    expect(
      within(screen.getByTestId('challenge-player-2')).getByText('DAD'),
    ).toBeTruthy();
    expect(screen.getByTestId('challenge-player-4')).toBeTruthy();
    // The rail is a glance, not a wall: a fifth face is dropped, not squeezed.
    expect(screen.queryByTestId('challenge-player-5')).toBeNull();
    screen.unmount();
  });
});
