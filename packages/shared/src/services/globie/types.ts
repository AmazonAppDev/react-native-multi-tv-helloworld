/**
 * Payload shapes returned by the Globie Earth MCP server
 * (https://mcp.globie.earth/mcp). Verified against the live server.
 */

export interface PodcastFeed {
  id: number;
  url: string;
  title: string;
  author: string | null;
  link: string | null;
  image: string | null;
  language: string | null;
  categories: string[];
  /** Null on trending feeds, populated on theme-filtered feeds. */
  episodeCount: number | null;
  popularityScore: number | null;
  newestItemAt: string | null;
  newestEnclosureUrl: string | null;
  newestEnclosureDurationSec: number | null;
  podcastGuid: string | null;
  itunesId: number | null;
  description: string | null;
}

export interface PodcastEpisode {
  /** 64-bit identifier — exceeds 2^32, never cast to int32. */
  id: number;
  title: string;
  enclosureUrl: string;
  datePublished: string | null;
  durationSec: number | null;
  image: string | null;
  feedId: number;
  feedTitle: string | null;
}

export interface PodcastTheme {
  theme: string;
  label: string;
}

export interface FeedList {
  count: number;
  feeds: PodcastFeed[];
  note?: string | null;
}

export interface ThemeList {
  count: number;
  themes: PodcastTheme[];
  note?: string | null;
}

export interface EpisodeList {
  count: number;
  feedId: number;
  episodes: PodcastEpisode[];
  note?: string | null;
}

export interface SanctuaryConditions {
  carbonDioxidePpm: number;
  europeanAqi: number;
  humidityPct: number;
  temperatureC: number;
  observedAt: string;
  aqiLabel: string;
  coordinate: {latitude: number; longitude: number};
  /** Rendered verbatim: it states that these are modelled, not measured, fields. */
  source: string;
}

export interface EcoBalance {
  balance: number;
  tokensPerSapling: number;
  note?: string | null;
}

/** The server returns an empty array today; the shape is not yet documented. */
export type Deed = Record<string, unknown>;

export interface DeedList {
  count: number;
  deeds: Deed[];
  note?: string | null;
}

export interface StreamUrl {
  enclosureUrl: string;
  streamUrl: string;
  expiresInSec: number;
}

/** Read-only tools wired to the v1 screens. */
export type GlobieTool =
  | 'search_podcasts'
  | 'get_trending_podcasts'
  | 'get_podcasts_by_theme'
  | 'get_podcast_episodes'
  | 'get_podcast_stream_url'
  | 'get_sanctuary_conditions'
  | 'get_eco_balance'
  | 'get_my_deeds';
