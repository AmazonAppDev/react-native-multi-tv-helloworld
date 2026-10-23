import 'react-native';
import {render} from '@testing-library/react-native';
import type {
  ChallengeAward,
  ChallengeStanding,
  GameDeck,
  GameDeckRound,
} from '@multitv/shared';
import {HeadToHeadScreen} from '../src/screens/games/HeadToHeadScreen';

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

const round = (id: string, answerKey: string): GameDeckRound => ({
  roundId: id,
  answerKey,
  options: [
    {key: answerKey, primary: `Species ${id}`, secondary: null},
    {key: `${id}-other`, primary: 'Other', secondary: null},
  ],
  clues: [`clue ${id}`],
  hasPhoto: false,
});

const deck: GameDeck = {
  deckId: 'deck-1',
  rounds: [round('r1', 'a'), round('r2', 'a'), round('r3', 'a')],
};

const seat = (
  slot: number,
  name: string,
  score: number,
  correct: number,
  answered: Record<string, string>,
): ChallengeStanding => ({
  slot,
  name,
  team: 0,
  score,
  correct,
  streak: 0,
  answered,
});

const award: ChallengeAward = {
  tokens: 25,
  awarded: 25,
  balance: 125,
  available: true,
};

describe('Head to head', () => {
  it('crowns the winning household in gold and gives them the verdict', () => {
    const screen = render(
      <HeadToHeadScreen
        deck={deck}
        standings={[
          seat(0, 'Baan Kae', 80, 2, {r1: 'a', r2: 'b'}),
          seat(1, 'Baan Yang', 60, 1, {r1: 'a', r2: 'b', r3: 'b'}),
        ]}
        slot={0}
        award={award}
      />,
    );

    expect(textOf(screen.getByTestId('head-to-head-verdict'))).toBe(
      'YOU BEAT THEM',
    );
    expect(screen.getByTestId('head-to-head-you-winner')).toBeTruthy();
    expect(screen.queryByTestId('head-to-head-them-winner')).toBeNull();

    // Reduced motion still has to show the whole number.
    expect(textOf(screen.getByTestId('head-to-head-you-score'))).toBe('80');
    expect(textOf(screen.getByTestId('head-to-head-them-score'))).toBe('60');

    // One marker per round, read against the frozen deck's answer keys.
    expect(textOf(screen.getByTestId('head-to-head-you-round-1'))).toBe('✓');
    expect(textOf(screen.getByTestId('head-to-head-you-round-2'))).toBe('✕');
    expect(textOf(screen.getByTestId('head-to-head-you-round-3'))).toBe('·');

    expect(textOf(screen.getByTestId('head-to-head-tokens'))).toBe(
      '+25 ECO TOKENS ON THIS TV',
    );
    screen.unmount();
  });

  it('hands the crown to the other seat when they win', () => {
    const screen = render(
      <HeadToHeadScreen
        deck={deck}
        standings={[
          seat(0, 'Baan Kae', 40, 1, {r1: 'a'}),
          seat(1, 'Baan Yang', 100, 3, {r1: 'a', r2: 'a', r3: 'a'}),
        ]}
        slot={0}
        award={null}
      />,
    );

    expect(textOf(screen.getByTestId('head-to-head-verdict'))).toBe(
      'THEY BEAT YOU',
    );
    expect(screen.getByTestId('head-to-head-them-winner')).toBeTruthy();
    expect(screen.queryByTestId('head-to-head-you-winner')).toBeNull();
    screen.unmount();
  });

  it('leaves both seats plain on a dead heat', () => {
    const screen = render(
      <HeadToHeadScreen
        deck={deck}
        standings={[
          seat(0, 'Baan Kae', 60, 2, {r1: 'a', r2: 'a'}),
          seat(1, 'Baan Yang', 60, 2, {r1: 'a', r2: 'a'}),
        ]}
        slot={0}
        award={null}
      />,
    );

    expect(textOf(screen.getByTestId('head-to-head-verdict'))).toBe(
      'DEAD HEAT',
    );
    expect(screen.queryByTestId('head-to-head-you-winner')).toBeNull();
    expect(screen.queryByTestId('head-to-head-them-winner')).toBeNull();
    screen.unmount();
  });

  it('asks for a second television instead of inventing an opponent', () => {
    const screen = render(
      <HeadToHeadScreen
        standings={[seat(0, 'Baan Kae', 60, 2, {})]}
        slot={0}
        award={null}
      />,
    );

    expect(screen.getByTestId('head-to-head-empty')).toBeTruthy();
    expect(screen.queryByTestId('head-to-head-verdict')).toBeNull();
    screen.unmount();
  });
});
