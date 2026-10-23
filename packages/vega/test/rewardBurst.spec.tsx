import 'react-native';
import {act, render} from '@testing-library/react-native';
import {RewardBurst} from '../src/screens/games/RewardBurst';

jest.mock('react-native/Libraries/Utilities/BackHandler', () => ({
  __esModule: true,
  default: {
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    exitApp: jest.fn(),
  },
}));

// The burst plays a cue through the shared podcast player, which reaches into
// w3cmedia's native turbo modules at import time.
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

    constructor(_audioType?: number, _audioUsage?: number) {}

    async initialize() {}

    async deinitialize() {}

    deinitializeSync() {
      return 0;
    }

    async setMediaControlFocus() {}

    addEventListener() {}

    removeEventListener() {}

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

// Jest does not put `jest` on globalThis, so the screen's test shortcut for
// Reduce Motion never fires here. Pin the branch the device takes instead.
jest.mock('../src/screens/home/MascotStage', () => ({
  ...jest.requireActual('../src/screens/home/MascotStage'),
  useReducedMotion: () => true,
}));

type Screen = ReturnType<typeof render>;

const textOf = (screen: Screen, testID: string): string => {
  const parts: string[] = [];
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(walk);
    } else if (value !== null && value !== undefined) {
      parts.push(String(value));
    }
  };
  walk(screen.getByTestId(testID).props.children);
  return parts.join('');
};

describe('Reward burst with Reduce Motion on', () => {
  it('draws the whole amount on the first frame of a match', () => {
    const screen = render(
      <RewardBurst mascot="yang-na" amount={5} label="PAIR FOUND" />,
    );

    expect(textOf(screen, 'reward-burst-amount')).toBe('+5 ECO TOKENS');
  });

  it('holds a match burst for 1400 ms', () => {
    jest.useFakeTimers();
    try {
      const onDone = jest.fn();
      render(
        <RewardBurst
          mascot="yang-na"
          amount={5}
          label="PAIR FOUND"
          onDone={onDone}
        />,
      );

      act(() => {
        jest.advanceTimersByTime(1399);
      });
      expect(onDone).not.toHaveBeenCalled();

      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(onDone).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('holds a perfect run for 2600 ms', () => {
    jest.useFakeTimers();
    try {
      const onDone = jest.fn();
      const screen = render(
        <RewardBurst
          variant="perfect"
          mascot="kae-na"
          amount={40}
          label="PERFECT LESSON"
          onDone={onDone}
        />,
      );

      expect(textOf(screen, 'reward-burst-amount')).toBe('+40 ECO TOKENS');

      act(() => {
        jest.advanceTimersByTime(2599);
      });
      expect(onDone).not.toHaveBeenCalled();

      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(onDone).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
