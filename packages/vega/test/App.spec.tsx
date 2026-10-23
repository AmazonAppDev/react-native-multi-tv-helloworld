/**
 * Copyright (c) 2022 Amazon.com, Inc. or its affiliates.  All rights reserved.
 *
 * PROPRIETARY/CONFIDENTIAL.  USE IS SUBJECT TO LICENSE TERMS.
 */

import 'react-native';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {BackHandler} from '@amazon-devices/react-native-kepler';

import type {
  DeedList,
  EcoBalance,
  EpisodeList,
  FeedList,
  McpDataClient,
  PodcastEpisode,
  PodcastFeed,
  PodcastTheme,
  SanctuaryConditions,
  ThemeList,
  TvCommandPoll,
  TvPairing,
} from '@multitv/shared';
import {AppNavigator} from '../src/navigation/AppNavigator';
import type {SearchRelayClient} from '../src/screens/SearchScreen';

// The Kepler Jest mock exports BackHandler as a plain CommonJS object, but the
// react-native index dereferences `.default`, so it resolves to undefined.
jest.mock('react-native/Libraries/Utilities/BackHandler', () => ({
  __esModule: true,
  default: {
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    exitApp: jest.fn(),
  },
}));

// w3cmedia reaches into native turbo modules at import time, so the player's
// guarded wrapper is exercised against an in-memory stand-in.
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

const makeFeed = (
  id: number,
  title: string,
  description: string | null = null,
): PodcastFeed => ({
  id,
  url: `https://example.test/feed/${id}`,
  title,
  author: `Author ${id}`,
  link: null,
  image: null,
  language: 'en',
  categories: [],
  episodeCount: null,
  popularityScore: null,
  newestItemAt: null,
  newestEnclosureUrl: null,
  newestEnclosureDurationSec: null,
  podcastGuid: null,
  itunesId: null,
  description,
});

const TRENDING: PodcastFeed[] = Array.from({length: 8}, (_, index) =>
  makeFeed(index + 1, `Show ${index + 1}`),
);
TRENDING[0] = makeFeed(1, 'Show 1', '<p>Wild <b>audio</b> &amp; more</p>');

// Episode ids are 64-bit on the wire; keep them above 2^32 so a narrowing
// regression would fail here rather than on the device.
const EPISODES: PodcastEpisode[] = [
  {
    id: 9000000001,
    title: 'The canopy at dawn',
    enclosureUrl: 'https://example.test/audio/canopy.mp3',
    datePublished: '2026-10-15T06:00:00Z',
    durationSec: 2890,
    image: null,
    feedId: 4,
    feedTitle: 'Show 4',
  },
  {
    id: 9000000002,
    title: 'What the soil remembers',
    enclosureUrl: 'https://example.test/audio/soil.mp3',
    datePublished: '2026-10-08T06:00:00Z',
    durationSec: 1740,
    image: null,
    feedId: 4,
    feedTitle: 'Show 4',
  },
];

const THEMES: PodcastTheme[] = [
  'meditation',
  'mindfulness',
  'nature',
  'sustainability',
  'climate',
  'science',
  'motivational',
  'personal-development',
  'forest',
  'wellbeing',
].map(theme => ({
  theme,
  label: theme.charAt(0).toUpperCase() + theme.slice(1),
}));

const SANCTUARY: SanctuaryConditions = {
  carbonDioxidePpm: 412,
  europeanAqi: 32,
  humidityPct: 58,
  temperatureC: 24.1,
  observedAt: '2026-10-17T08:00:00Z',
  aqiLabel: 'Good',
  coordinate: {latitude: 59.33, longitude: 18.07},
  source: 'Open-Meteo modelled fields (not an on-site sensor)',
};

const ECO: EcoBalance = {
  balance: 0,
  tokensPerSapling: 100,
  note: 'This device has never held eco-tokens.',
};

const DEEDS: DeedList = {
  count: 0,
  deeds: [],
  note: 'This device has not adopted anything yet.',
};

interface FakeOptions {
  failThemes?: boolean;
  failSanctuary?: boolean;
  failEpisodes?: boolean;
  themeFeeds?: PodcastFeed[];
}

const makeClient = (options: FakeOptions = {}) => {
  const calls: string[] = [];
  const callTool = jest.fn(
    async (name: string, args?: Record<string, unknown>): Promise<unknown> => {
      calls.push(name);
      if (name === 'get_podcasts_by_theme') {
        if (args && 'theme' in args) {
          const feeds = options.themeFeeds ?? [];
          return {count: feeds.length, feeds} as FeedList;
        }
        if (options.failThemes) {
          throw new Error('Themes down');
        }
        return {count: THEMES.length, themes: THEMES} as ThemeList;
      }
      if (name === 'search_podcasts') {
        const feeds = options.themeFeeds ?? TRENDING.slice(0, 2);
        return {count: feeds.length, feeds, note: null} as FeedList;
      }
      if (name === 'get_podcast_episodes') {
        if (options.failEpisodes) {
          throw new Error('Episodes unavailable');
        }
        return {
          count: EPISODES.length,
          feedId: Number(args?.feedId ?? 4),
          episodes: EPISODES,
        } as EpisodeList;
      }
      if (name === 'get_sanctuary_conditions') {
        if (options.failSanctuary) {
          throw new Error('Sanctuary unavailable');
        }
        return SANCTUARY;
      }
      if (name === 'get_eco_balance') {
        return ECO;
      }
      if (name === 'get_my_deeds') {
        return DEEDS;
      }
      throw new Error(`Unexpected tool ${name}`);
    },
  );

  const client = {
    connect: jest.fn(async () => undefined),
    callTool,
  } as unknown as McpDataClient;

  return {client, calls};
};

// A relay that answers once and then waits forever, so the poll loop settles.
const never = () => new Promise<TvCommandPoll>(() => {});

const makeRelay = (
  next: () => Promise<TvCommandPoll> = never,
): SearchRelayClient => ({
  requestPairing: jest.fn(
    async (): Promise<TvPairing> => ({
      code: '398280',
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      spoken: 'Pairing code three nine eight two eight zero.',
    }),
  ),
  nextCommand: jest.fn(next),
  handoff: jest.fn(async () => ({stored: true})),
  publishDeck: jest.fn(async () => ({stored: true})),
  reportAnswer: jest.fn(async () => null),
  advanceGame: jest.fn(async () => null),
  loadWallet: jest.fn(async () => ({balance: 0, available: true})),
  awardTokens: jest.fn(async (_key: string, amount: number) => ({
    balance: amount,
    awarded: amount,
    available: true,
  })),
  loadWardrobe: jest.fn(async () => ({
    balance: 0,
    items: [
      {itemKey: 'yang-na', price: 0, owned: true},
      {itemKey: 'kae-na', price: 80, owned: false},
      {itemKey: 'mother-tree', price: 240, owned: false},
    ],
    available: true,
  })),
  spendTokens: jest.fn(async (item: string) => ({
    balance: 0,
    spent: 0,
    owned: item === 'yang-na',
    available: true,
  })),
  openChallenge: jest.fn(async () => ({
    roomId: 'room-1',
    code: '123456',
    deckId: 'deck-1',
    phase: 'lobby' as const,
    expiresAt: Date.now() + 60_000,
  })),
  joinChallenge: jest.fn(async (code: string, name: string) => ({
    roomId: 'room-1',
    code,
    slot: 1,
    players: [{slot: 1, name, team: 0 as const}],
  })),
  startChallenge: jest.fn(async () => ({
    roomId: 'room-1',
    phase: 'playing' as const,
    index: 0,
    total: 1,
    endsAt: Date.now() + 15_000,
  })),
  answerChallenge: jest.fn(async () => ({
    accepted: true,
    correct: true,
    answerPrimary: 'Show 1',
    points: 100,
    elapsedMs: 0,
    late: false,
    answered: 1,
    total: 1,
    phase: 'standings' as const,
    standings: [],
    award: null,
  })),
  nextChallengeRound: jest.fn(async () => ({
    roomId: 'room-1',
    phase: 'finished' as const,
    index: 0,
    total: 1,
    standings: [],
    final: true,
    award: null,
  })),
  fetchChallenge: jest.fn(async (code: string) => ({
    roomId: 'room-2',
    code,
    deckId: 'deck-1',
    deck: {deckId: 'deck-1', rounds: []},
    phase: 'lobby' as const,
    players: [],
    expiresAt: Date.now() + 60_000,
  })),
  fetchChallengePresence: jest.fn(async (code: string) => ({
    roomId: 'room-2',
    code,
    tiles: [],
  })),
  leaveChallenge: jest.fn(async (roomId: string) => ({
    roomId,
    closed: true as const,
  })),
});

describe('Globie Earth navigation', () => {
  const NAV_FEEDS = [
    makeFeed(201, 'Meditation Sounds', '<p>Calm <b>forest</b> audio</p>'),
    makeFeed(202, 'Christian Meditation'),
  ];

  const openSoundscapes = async (screen: ReturnType<typeof render>) => {
    fireEvent.press(screen.getByTestId('welcome-tile-soundscapes'));
    await screen.findByTestId('soundscapes-shelf');
  };

  it('returns to the soundscapes shelf on hardware BACK and reloads it', async () => {
    const {client, calls} = makeClient({themeFeeds: NAV_FEEDS});
    const screen = render(<AppNavigator client={client} relay={makeRelay()} />);

    await openSoundscapes(screen);
    fireEvent.press(screen.getByTestId('soundscapes-card-1'));
    await screen.findByTestId('player-episode-title');
    expect(screen.getByTestId('smart-player')).toBeTruthy();

    const themeCalls = () =>
      calls.filter(name => name === 'get_podcasts_by_theme').length;
    const before = themeCalls();

    const mockCalls = (BackHandler.addEventListener as jest.Mock).mock.calls;
    const handler = mockCalls[mockCalls.length - 1][1] as () => boolean;
    act(() => {
      expect(handler()).toBe(true);
    });

    await screen.findByTestId('soundscapes-shelf');
    expect(screen.queryByTestId('smart-player')).toBeNull();
    // Themes and the default feed list are fetched once more on remount.
    await waitFor(() => expect(themeCalls()).toBe(before + 2));
  });

  it('opens voice search when the relay delivers a query', async () => {
    const {client, calls} = makeClient();
    const relay = makeRelay();
    (relay.nextCommand as jest.Mock).mockResolvedValueOnce({
      command: {type: 'search', query: 'forest podcasts'},
      paired: true,
    });

    const screen = render(<AppNavigator client={client} relay={relay} />);

    await screen.findByTestId('search-screen');
    await screen.findByTestId('search-card-0');

    expect(calls).toContain('search_podcasts');
    expect(screen.getByText('RESULTS FOR “FOREST PODCASTS”')).toBeTruthy();
    expect(
      screen.getByText('Paired. Ask Alexa: “search the TV for forest podcasts.”'),
    ).toBeTruthy();
    expect(screen.queryByText('SAY TO ALEXA: “PAIR MY TV”')).toBeNull();
  });

  it('opens the player on the feed the relay resolved', async () => {
    const {client} = makeClient();
    const relay = makeRelay();
    (relay.nextCommand as jest.Mock).mockResolvedValueOnce({
      command: {type: 'openFeed', feedId: 4, feed: makeFeed(4, 'Show 4')},
      paired: true,
    });

    const screen = render(<AppNavigator client={client} relay={relay} />);

    // No search screen in between: the server already resolved the show, so
    // the command is a single navigation to the player.
    await screen.findByTestId('player-episode-title');
    expect(screen.queryByTestId('search-screen')).toBeNull();
    expect(screen.getByTestId('player-title').props.children).toBe('Show 4');
  });

  it('returns to the welcome menu when the relay delivers a home command', async () => {
    const {client} = makeClient({themeFeeds: NAV_FEEDS});
    const relay = makeRelay();

    let resolvePoll: (poll: TvCommandPoll) => void = () => {};
    (relay.nextCommand as jest.Mock).mockReturnValueOnce(
      new Promise<TvCommandPoll>(resolve => {
        resolvePoll = resolve;
      }),
    );

    const screen = render(<AppNavigator client={client} relay={relay} />);
    await openSoundscapes(screen);
    fireEvent.press(screen.getByTestId('soundscapes-card-1'));
    await screen.findByTestId('player-episode-title');

    await act(async () => {
      resolvePoll({command: {type: 'home'}, paired: true});
    });

    await screen.findByTestId('welcome-screen');
    expect(screen.queryByTestId('smart-player')).toBeNull();
  });

  it('opens the wardrobe from the WELCOME header and returns on BACK', async () => {
    const {client} = makeClient({themeFeeds: NAV_FEEDS});
    const screen = render(<AppNavigator client={client} relay={makeRelay()} />);

    fireEvent.press(screen.getByTestId('header-wardrobe'));

    await screen.findByTestId('wardrobe-screen');
    expect(await screen.findByText('0 ECO-TOKENS')).toBeTruthy();

    const mockCalls = (BackHandler.addEventListener as jest.Mock).mock.calls;
    const handler = mockCalls[mockCalls.length - 1][1] as () => boolean;
    act(() => {
      expect(handler()).toBe(true);
    });

    await screen.findByTestId('welcome-screen');
    expect(screen.queryByTestId('wardrobe-screen')).toBeNull();
  });

  it('opens the focus mode from DAILY FOCUS and returns on BACK', async () => {
    const {client} = makeClient();
    const screen = render(<AppNavigator client={client} relay={makeRelay()} />);

    fireEvent.press(screen.getByTestId('header-daily-focus'));

    await screen.findByTestId('grove-screen');
    expect(screen.getByTestId('grove-back')).toBeTruthy();

    const mockCalls = (BackHandler.addEventListener as jest.Mock).mock.calls;
    const handler = mockCalls[mockCalls.length - 1][1] as () => boolean;
    act(() => {
      expect(handler()).toBe(true);
    });

    await screen.findByTestId('welcome-screen');
    expect(screen.queryByTestId('grove-screen')).toBeNull();
  });
});

describe('Globie Earth welcome menu', () => {
  it('starts on the four-tile menu', async () => {
    const {client} = makeClient();
    const screen = render(<AppNavigator client={client} relay={makeRelay()} />);

    expect(screen.getByTestId('welcome-screen')).toBeTruthy();
    expect(screen.getByTestId('welcome-title').props.children).toBe('WELCOME');
    expect(screen.getByTestId('welcome-tile-learn')).toBeTruthy();
    expect(screen.getByTestId('welcome-tile-soundscapes')).toBeTruthy();
    expect(screen.getByTestId('welcome-tile-quests')).toBeTruthy();
    expect(screen.getByTestId('welcome-tile-setting')).toBeTruthy();

    // The wardrobe entry and the device's eco balance live here, nowhere else.
    expect(screen.getByTestId('header-daily-focus')).toBeTruthy();
    expect(screen.getByTestId('header-wardrobe')).toBeTruthy();
    expect(screen.getByTestId('welcome-eco')).toBeTruthy();
    expect(await screen.findByText('0 eco-tokens')).toBeTruthy();
  });

  it('opens the voice control setting from SETTING and returns on BACK', async () => {
    const {client} = makeClient();
    const screen = render(<AppNavigator client={client} relay={makeRelay()} />);

    fireEvent.press(screen.getByTestId('welcome-tile-setting'));
    await screen.findByTestId('voice-control-screen');
    expect(screen.getByTestId('voice-control-heading').props.children).toBe(
      'VOICE CONTROL\nSETTING',
    );
    expect(screen.getByTestId('voice-control-wave')).toBeTruthy();
    expect(screen.getByTestId('voice-control-tree')).toBeTruthy();
    expect(await screen.findByText('398280')).toBeTruthy();

    const mockCalls = (BackHandler.addEventListener as jest.Mock).mock.calls;
    const handler = mockCalls[mockCalls.length - 1][1] as () => boolean;
    act(() => {
      expect(handler()).toBe(true);
    });

    await screen.findByTestId('welcome-screen');
  });
});

describe('Globie Earth soundscapes', () => {
  const SOUNDSCAPE_FEEDS = [
    makeFeed(201, 'Meditation Sounds', '<p>Calm <b>forest</b> audio</p>'),
    makeFeed(202, 'Christian Meditation'),
  ];

  const openSoundscapes = async (screen: ReturnType<typeof render>) => {
    fireEvent.press(screen.getByTestId('welcome-tile-soundscapes'));
    await screen.findByTestId('soundscapes-shelf');
  };

  it('renders the meditation shelf, chips and hero', async () => {
    const {client, calls} = makeClient({themeFeeds: SOUNDSCAPE_FEEDS});
    const screen = render(<AppNavigator client={client} relay={makeRelay()} />);

    await openSoundscapes(screen);

    expect(screen.getByTestId('soundscapes-heading').props.children).toBe(
      'SOUNDSCAPES',
    );
    expect(screen.getByTestId('soundscapes-title').props.children).toBe(
      'Meditation Sounds',
    );
    expect(screen.getByTestId('soundscapes-description').props.children).toBe(
      'Calm forest audio',
    );
    expect(screen.getByText('2 shows')).toBeTruthy();
    expect(screen.getByTestId('soundscapes-card-0')).toBeTruthy();
    expect(screen.getByTestId('soundscapes-card-1')).toBeTruthy();
    expect(screen.getByTestId('chip-meditation').props.accessibilityState).toEqual(
      {selected: true, disabled: false},
    );
    expect(screen.getByTestId('chip-personal-development')).toBeTruthy();

    // The wardrobe and the eco balance belong to WELCOME, not this page.
    expect(screen.queryByTestId('header-wardrobe')).toBeNull();
    expect(screen.queryByTestId('header-search')).toBeNull();
    expect(screen.queryByTestId('welcome-eco')).toBeNull();
    expect(screen.queryByTestId('soundscapes-daily-focus')).toBeNull();
    expect(screen.queryByTestId('info-impact')).toBeNull();

    // Themes first, then the meditation feed list.
    expect(
      calls.filter(name => name === 'get_podcasts_by_theme').length,
    ).toBe(2);
  });

  it('replaces the shelf and the hero when a theme is selected', async () => {
    const themeFeeds = [makeFeed(101, 'Nature One'), makeFeed(102, 'Nature Two')];
    const {client} = makeClient({themeFeeds});
    const screen = render(<AppNavigator client={client} relay={makeRelay()} />);

    await openSoundscapes(screen);
    fireEvent.press(screen.getByTestId('chip-nature'));

    await waitFor(() =>
      expect(screen.getByTestId('soundscapes-title').props.children).toBe(
        'Nature One',
      ),
    );
    expect(screen.getByText('2 shows')).toBeTruthy();
    expect(screen.getByText('NATURE')).toBeTruthy();
    expect(screen.getByTestId('chip-nature').props.accessibilityState).toEqual({
      selected: true,
      disabled: false,
    });
  });

  it('shows the server error and retries', async () => {
    const {client, calls} = makeClient({failThemes: true});
    const screen = render(<AppNavigator client={client} relay={makeRelay()} />);

    fireEvent.press(screen.getByTestId('welcome-tile-soundscapes'));
    await screen.findByTestId('soundscapes-error');
    expect(screen.getByText('Themes down')).toBeTruthy();

    fireEvent.press(screen.getByTestId('state-retry'));

    await waitFor(() =>
      expect(
        calls.filter(name => name === 'get_podcasts_by_theme').length,
      ).toBe(2),
    );
    expect(screen.getByTestId('soundscapes-error')).toBeTruthy();
  });

  it('opens the player and returns to the shelf on BACK', async () => {
    const {client} = makeClient({themeFeeds: SOUNDSCAPE_FEEDS});
    const screen = render(<AppNavigator client={client} relay={makeRelay()} />);

    await openSoundscapes(screen);
    fireEvent.press(screen.getByTestId('soundscapes-card-1'));
    await screen.findByTestId('player-episode-title');
    expect(screen.getByTestId('player-title').props.children).toBe(
      'Christian Meditation',
    );
    expect(screen.getByTestId('player-play').props.hasTVPreferredFocus).toBe(
      true,
    );

    const mockCalls = (BackHandler.addEventListener as jest.Mock).mock.calls;
    const handler = mockCalls[mockCalls.length - 1][1] as () => boolean;
    act(() => {
      expect(handler()).toBe(true);
    });

    await screen.findByTestId('soundscapes-shelf');
    expect(screen.queryByTestId('smart-player')).toBeNull();
  });
});
