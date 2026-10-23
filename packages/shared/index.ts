// Design system
export {
  color,
  brandGradient,
  space,
  radius,
  typography,
  typography as type,
  focus,
  layout,
} from './src/theme/tokens';
export {
  scaleWidth,
  scaleHeight,
  scaleFontSize,
  moderateScale,
} from './src/theme/scale';
export {
  fnv1a,
  hueFor,
  hslToHex,
  coverBands,
  coverLetter,
} from './src/utils/color';
export {plainText} from './src/utils/text';

export {CoverArt} from './src/components/CoverArt';
export type {CoverArtProps} from './src/components/CoverArt';
export {FocusCard} from './src/components/FocusCard';
export type {FocusCardProps} from './src/components/FocusCard';
export {Chip} from './src/components/Chip';
export type {ChipProps} from './src/components/Chip';
export {Shelf} from './src/components/Shelf';
export type {ShelfProps} from './src/components/Shelf';
export {InfoTile} from './src/components/InfoTile';
export type {InfoTileProps} from './src/components/InfoTile';
export {StateView} from './src/components/StateView';
export type {StateViewProps} from './src/components/StateView';

// HTTP Client (fetch-based)
export {createHttpClient} from './src/services/httpClient';
export type {HttpClientConfig, HttpResponse} from './src/services/httpClient';

// Globie Earth MCP
export {
  GlobieMcpClient,
  McpHttpError,
  McpProtocolError,
  McpRpcError,
  McpToolError,
  GLOBIE_MCP_ENDPOINT,
  createGlobieMcpClient,
} from './src/services/globie/mcpClient';
export type {
  McpClientOptions,
  McpDataClient,
} from './src/services/globie/mcpClient';
// Species catalogue (PostgREST) + Wikipedia summary proxy
export {
  SpeciesClient,
  SpeciesHttpError,
  SPECIES_API_BASE,
  SPECIES_TABS,
  GLOBIE_WEB_BASE,
  createSpeciesClient,
  speciesPageUrl,
  speciesWebPath,
} from './src/services/globie/species';
export type {
  SpeciesClientOptions,
  SpeciesListOptions,
  SpeciesPage,
  SpeciesRecord,
  SpeciesTabKey,
  SpeciesType,
} from './src/services/globie/species';
export {
  WikiClient,
  WikiHttpError,
  GLOBIE_WIKI_ENDPOINT,
  createWikiClient,
} from './src/services/globie/wiki';
export type {
  WikiClientOptions,
  WikiImage,
  WikiSummary,
  WikiSummaryOptions,
} from './src/services/globie/wiki';
// The voice relay between the Alexa Skill and the TV (infra/mcp/src/tvCommands.ts)
export {
  TvRelayClient,
  TvRelayError,
  GLOBIE_RELAY_BASE_URL,
  PRESENCE_HOLD_MS,
  createTvRelayClient,
  holdFreshFrames,
} from './src/services/globie/tvRelay';
export type {
  TvCommand,
  TvCommandPoll,
  TvHandoff,
  TvPairing,
  TvRelayOptions,
  HeldFrames,
  EcoAward,
  EcoWallet,
  EcoWardrobe,
  EcoSpend,
  WardrobeItem,
  ChallengeAdvanced,
  ChallengeAnswered,
  ChallengeAward,
  ChallengeInvitation,
  ChallengeJoined,
  ChallengeLeft,
  ChallengeLobby,
  ChallengeOpened,
  ChallengePhase,
  ChallengePlayerView,
  ChallengePresenceSnapshot,
  ChallengePresenceTile,
  ChallengeQuestion,
  ChallengeStanding,
  ChallengeStarted,
  GameChoice,
  GameDeck,
  GameDeckRound,
  GameSnapshot,
  GameVerdict,
} from './src/services/globie/tvRelay';
export type {
  Deed,
  DeedList,
  EcoBalance,
  EpisodeList,
  FeedList,
  GlobieTool,
  PodcastEpisode,
  PodcastFeed,
  PodcastTheme,
  SanctuaryConditions,
  StreamUrl,
  ThemeList,
} from './src/services/globie/types';

// Curated open channels (static, no network)
export {OPEN_CHANNELS} from './src/data/channels';
export type {OpenChannel} from './src/data/channels';

// Storage
export {
  loadDeviceId,
  loadLastPlayed,
  saveLastPlayed,
  loadResumePoint,
  saveResumePoint,
  clearResumePoint,
} from './src/services/storage';
export type {LastPlayed, ResumePoint} from './src/services/storage';
