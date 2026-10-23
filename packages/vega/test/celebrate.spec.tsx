import 'react-native';
import {render} from '@testing-library/react-native';
import {Confetti, CountUp, PopIn} from '../src/screens/games/Celebrate';

/**
 * Jest reports `useReducedMotion()` as on, so every animated component has a
 * still-frame path. This mock lets a test ask for the moving one as well.
 */
let mockReducedMotion = true;

jest.mock('../src/screens/home/MascotStage', () => ({
  __esModule: true,
  useReducedMotion: () => mockReducedMotion,
}));

afterEach(() => {
  mockReducedMotion = true;
});

describe('CountUp', () => {
  it('draws the final number at once when motion is reduced', () => {
    const screen = render(
      <CountUp testID="count" value={140} prefix="+" suffix=" ECO TOKENS" />,
    );

    expect(screen.getByTestId('count').props.children).toBe('+140 ECO TOKENS');
    screen.unmount();
  });

  it('starts at zero so the roll has somewhere to travel from', () => {
    mockReducedMotion = false;
    const screen = render(<CountUp testID="count" value={140} prefix="+" />);

    expect(screen.getByTestId('count').props.children).toBe('+0');
    screen.unmount();
  });
});

describe('PopIn', () => {
  it('renders its child so the moment is never lost to animation', () => {
    const screen = render(
      <PopIn testID="pop" trigger="round-1">
        <CountUp testID="count" value={5} />
      </PopIn>,
    );

    expect(screen.getByTestId('pop')).toBeTruthy();
    expect(screen.getByTestId('count').props.children).toBe('5');
    screen.unmount();
  });
});

describe('Confetti', () => {
  it('draws nothing when motion is reduced', () => {
    const screen = render(<Confetti testID="paper" />);

    expect(screen.queryByTestId('paper')).toBeNull();
    screen.unmount();
  });

  it('is a shower that can never take the remote', () => {
    mockReducedMotion = false;
    const screen = render(<Confetti testID="paper" />);
    const layer = screen.getByTestId('paper');

    expect(layer.props.pointerEvents).toBe('none');
    expect(layer.props.accessible).toBe(false);
    expect(layer.children).toHaveLength(14);
    screen.unmount();
  });
});
