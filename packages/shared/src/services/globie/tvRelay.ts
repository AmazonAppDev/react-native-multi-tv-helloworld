/**
 * The voice relay between the Alexa Skill and this app.
 *
 * A Skill cannot navigate another process on the television - its directives
 * only speak and play audio - so the phone-side skill posts a command to the
 * Globie Earth server and the app collects it here. See
 * infra/mcp/src/tvCommands.ts for the other half and for the pairing rules.
 *
 * The routes sit on the same origin as /mcp, so the base URL is derived rather
 * than configured: one deployment cannot half-move.
 */

import {GLOBIE_MCP_ENDPOINT} from './mcpClient';
import type {PodcastFeed} from './types';

/** https://mcp.globie.earth/mcp -> https://mcp.globie.earth */
export const GLOBIE_RELAY_BASE_URL = GLOBIE_MCP_ENDPOINT.replace(/\/mcp$/, '');

/** One answer tile, as the Skill has to speak it. */
export interface GameChoice {
  /** Stable per deck: what an answer command names. */
  key: string;
  /** English (or Latin) name - the only spelling worth reading aloud. */
  primary: string;
  /** The Thai name, shown on the TV and never spoken. */
  secondary: string | null;
}

/**
 * One question, published so the server can judge an answer it never saw.
 *
 * The Skill cannot ask the TV for the answer key: Alexa abandons the request
 * after about eight seconds and nothing on the TV can be queried inbound. So
 * the deck travels to the server while the screen still owns it, and the
 * server keeps the copy a spoken answer is checked against.
 */
export interface GameDeckRound {
  roundId: string;
  answerKey: string;
  options: GameChoice[];
  /** What the Skill reads out; the first one is enough for a turn. */
  clues: string[];
  hasPhoto: boolean;
  /** Absolute species photo URL, so a room round can draw it on the board. */
  image?: string | null;
}

export interface GameDeck {
  deckId: string;
  rounds: GameDeckRound[];
}

/** What the server decided about one spoken (or pressed) answer. */
export interface GameVerdict {
  /** Index of the round that was judged, not the one now on screen. */
  roundIndex: number;
  choice: string;
  correct: boolean;
  answerKey: string;
  answerPrimary: string;
}

/**
 * The whole game state as the server owns it.
 *
 * The TV renders this rather than its own counters whenever a voice session is
 * live, which is what keeps the spoken score and the screen from drifting.
 */
export interface GameSnapshot {
  sessionId: string;
  game: 'quiz';
  /** The question the screen should show now; `total` means the summary. */
  index: number;
  total: number;
  score: number;
  /** The round just judged, when this snapshot came from an answer. */
  verdict: GameVerdict | null;
  finished: boolean;
}

/**
 * A party as the television draws it.
 *
 * Rooms are server-owned (infra/mcp/src/challenge.ts): the host publishes a
 * deck, players take a slot, and every score is judged against the server's
 * clock. The TV never counts a challenge itself; it draws what arrived.
 */
export interface ChallengePlayerView {
  /** 1..8, stable for the life of the room. */
  slot: number;
  name: string;
  /** 0 = no team colour. */
  team: 0 | 1;
}

export type ChallengePhase = 'lobby' | 'playing' | 'standings' | 'finished';

export interface ChallengeLobby {
  roomId: string;
  /** Six digits, spoken aloud to join. */
  code: string;
  deckId: string;
  phase: ChallengePhase;
  players: ChallengePlayerView[];
  expiresAt: number;
}

/** A deck round minus its answer key: the TV renders, it does not hold it. */
export interface ChallengeQuestion {
  roundId: string;
  options: GameChoice[];
  clues: string[];
  hasPhoto: boolean;
  /** Present when the round is a photo round; the board draws it as the question. */
  image?: string | null;
}

export interface ChallengeStanding {
  slot: number;
  name: string;
  team: 0 | 1;
  score: number;
  correct: number;
  streak: number;
  /**
   * How many of this seat's answers landed after the window. Those earn
   * accuracy only, so the board carries the count that explains a low score.
   */
  lateAnswers?: number;
  /**
   * roundId -> choice, for the seat's whole party. A head-to-head screen reads
   * it against the frozen deck's answer keys to draw one tick per round.
   */
  answered?: Record<string, string>;
}

/** What the payout was worth when the last round closed. */
export interface ChallengeAward {
  tokens: number;
  awarded: number;
  balance: number | null;
  available: boolean;
}

/**
 * One seat's camera, as the television draws it (infra/mcp/src/tvCommands.ts).
 *
 * `frameUrl` is a path, not an address: the television prefixes the same relay
 * origin it polls, exactly as `JoinCard` does for the room's QR. It is null
 * until the seat has a frame that can still be read, so the tile falls back to
 * an avatar rather than a broken image.
 */
export interface ChallengePresenceTile {
  slot: number;
  name: string;
  on: boolean;
  /** Bumped per accepted frame; the image URL changes with the pixels. */
  version: number;
  /** Epoch ms of the latest accepted frame; 0 for none. */
  frameAt: number;
  frameUrl: string | null;
  /** Advisory reading from the phone's own CV. Never a score. */
  event: {type: string; score: number; at: number} | null;
}

/** The family wall: one tile per seat, polled while the lobby is open. */
export interface ChallengePresenceSnapshot {
  roomId: string;
  code: string;
  tiles: ChallengePresenceTile[];
}

/**
 * How long a tile keeps the frame it is already drawing.
 *
 * A relayed frame's url changes with every accepted frame, and an <Image>
 * handed a new uri drops the load it had in flight. Measured from this
 * machine the relay needs ~1.3 s to return a 2.6 KB jpeg, so a url that
 * rotated every poll (800 ms) never finished loading and the tile stayed
 * blank. Presence, the on/off flag and events still pass on every beat; only
 * the picture advances on this slower one.
 */
export const PRESENCE_HOLD_MS = 2_500;

/** The frames on screen, and when the wall last advanced them. */
export interface HeldFrames {
  at: number;
  bySlot: Record<number, {version: number; frameUrl: string | null}>;
}

/**
 * Returns the grid as it should be drawn: a slot keeps its current picture
 * until `holdMs` has passed, then takes the newest one. A camera turning off
 * is never held - the avatar has to appear at once - and neither is a seat
 * that had no picture to keep.
 */
export function holdFreshFrames(
  held: HeldFrames,
  tiles: ChallengePresenceTile[],
  now: number,
  holdMs: number,
): {held: HeldFrames; tiles: ChallengePresenceTile[]} {
  const holding = now - held.at < holdMs;
  const bySlot = {...held.bySlot};
  let advanced = false;
  const settled = tiles.map(tile => {
    const drawing = bySlot[tile.slot];
    if (
      holding &&
      tile.frameUrl &&
      drawing?.frameUrl &&
      drawing.frameUrl !== tile.frameUrl
    ) {
      return {...tile, version: drawing.version, frameUrl: drawing.frameUrl};
    }
    if (!drawing || drawing.frameUrl !== tile.frameUrl) {
      bySlot[tile.slot] = {version: tile.version, frameUrl: tile.frameUrl};
      advanced = true;
    }
    return tile;
  });
  return {
    held: {at: advanced ? now : held.at, bySlot},
    tiles: settled,
  };
}

/** The host's answer to freezing a deck and opening a lobby. */
export interface ChallengeOpened {
  roomId: string;
  code: string;
  deckId: string;
  phase: ChallengePhase;
  expiresAt: number;
}

/** A slot taken by a named player. */
export interface ChallengeJoined {
  roomId: string;
  code: string;
  slot: number;
  players: ChallengePlayerView[];
}

/** Round one, and the clock the server started for it. */
export interface ChallengeStarted {
  roomId: string;
  phase: ChallengePhase;
  index: number;
  total: number;
  endsAt: number;
}

/** The server's verdict on one press. Score is never computed on the TV. */
export interface ChallengeAnswered {
  accepted: boolean;
  correct: boolean;
  answerPrimary: string;
  points: number;
  elapsedMs: number;
  late: boolean;
  answered: number;
  total: number;
  phase: ChallengePhase;
  /** Present when that press closed the round, because everyone had answered. */
  standings: ChallengeStanding[] | null;
  award: ChallengeAward | null;
}

/** The host moved the room on: the next question, or the podium. */
export interface ChallengeAdvanced {
  roomId: string;
  phase: ChallengePhase;
  index: number;
  total: number;
  standings: ChallengeStanding[];
  final: boolean;
  award: ChallengeAward | null;
}

/**
 * The screens voice may name. Each is a chip or tile the viewer can already
 * reach with the D-pad; naming it carries no extra reach.
 */
export type TvScreen = 'welcome' | 'quests' | 'learn' | 'focus' | 'settings' | 'wardrobe' | 'guessWho';

/**
 * The closed set the server will queue; each maps to a navigation the app
 * already performs.
 *
 * `openFeed` carries the whole show because the player reads its title, image
 * and author, and the television has no feed-by-id route of its own. The
 * server resolves it before queueing, so what arrives here is already the
 * payload the player renders.
 *
 * The `game.*` members carry the server's snapshot rather than a delta: the
 * TV draws the whole state, so a duplicated or dropped command cannot leave
 * the score ahead of the spoken verdict. The `challenge.*` members follow the
 * same rule for a room - whole lobby, whole question, whole standings.
 *
 * `back`, `openScreen` and `player.pause|resume` name the remote's own moves at
 * intent level. There is deliberately no raw key member: a queued key would
 * move focus from wherever the viewer has since parked it, and `back` is
 * resolved here against the screen that is actually showing.
 */
export type TvCommand =
  | {type: 'search'; query: string}
  | {type: 'openFeed'; feedId: number; feed: PodcastFeed}
  | {type: 'home'}
  | {type: 'back'}
  | {type: 'openScreen'; screen: TvScreen}
  | {type: 'player.pause'}
  | {type: 'player.resume'}
  | {type: 'game.start'; snapshot: GameSnapshot}
  | {type: 'game.answer'; snapshot: GameSnapshot}
  | {type: 'game.next'; snapshot: GameSnapshot}
  | {type: 'game.quit'}
  | {type: 'challenge.lobby'; room: ChallengeLobby}
  | {type: 'challenge.question'; round: ChallengeQuestion; index: number; total: number; endsAt: number}
  | {type: 'challenge.standings'; rows: ChallengeStanding[]; final: boolean; award?: ChallengeAward | null}
  | {type: 'challenge.presence'; roomId: string; tiles: ChallengePresenceTile[]}
  | {
      type: 'challenge.closed';
      reason: 'host_left' | 'expired';
      roomId: string;
    };

export interface TvPairing {
  /** Six digits, shown on the TV and spoken to Alexa. */
  code: string;
  expiresAt: string;
  spoken: string;
}

/**
 * What the TV asks Alexa to take over when it cannot play sound itself.
 *
 * Only an identifier, never a URL: the Skill resolves the media from its own
 * catalogue, so a TV cannot point the Echo at an arbitrary stream. `minutes`
 * is 10, 15 or 30 for the long guides and null for the short grounding lesson -
 * the exact vocabulary the Skill's PlayMeditationIntent already speaks.
 */
export type TvHandoff =
  | {type: 'meditation'; minutes: number | null; guideId: string}
  | {type: 'podcast'; feedId: number; episodeId: number};

export interface TvCommandPoll {
  command: TvCommand | null;
  paired: boolean;
}

/**
 * The eco-token wallet, as the reward popup reads it.
 *
 * `available: false` means the server could not price the award (the API is
 * unreachable, or 256_eco_tokens.sql is not applied yet). It is not an error:
 * the match still happened, so the popup shows what it earned and omits the
 * running total rather than refusing to celebrate.
 */
export interface EcoWallet {
  balance: number | null;
  available: boolean;
}

/** One award, and the total after it. `awarded` is 0 for an already-paid key. */
export interface EcoAward extends EcoWallet {
  awarded: number;
}

/** One thing the wardrobe sells: server-priced, and owned or not. */
export interface WardrobeItem {
  itemKey: string;
  price: number;
  owned: boolean;
}

/**
 * The wardrobe as this television sees it.
 *
 * The prices come from here rather than from the client's own table: a price a
 * modified client could choose is a price it could skip.
 */
export interface EcoWardrobe {
  balance: number | null;
  items: WardrobeItem[];
  available: boolean;
}

/** One purchase, and the total after it. `spent` is 0 for an already-owned item. */
export interface EcoSpend extends EcoWallet {
  spent: number;
  owned: boolean;
}

/**
 * A room as a household reads it before taking a seat.
 *
 * The deck travels with its answer keys: the joining television has to judge
 * its own presses against the identical deck the host published. The host's
 * device id is absent by design - each household is paid on its own.
 */
export interface ChallengeInvitation {
  roomId: string;
  code: string;
  deckId: string;
  deck: GameDeck;
  phase: ChallengePhase;
  players: ChallengeStanding[];
  /** Epoch milliseconds, as every deadline on this relay is. */
  expiresAt: number;
}

/** A seat given up, or the host closing the room and releasing the digits. */
export type ChallengeLeft =
  | {roomId: string; slot: number; players: ChallengePlayerView[]}
  | {roomId: string; closed: true};

/**
 * A refusal from the relay, with the machine-readable code beside its text.
 *
 * A challenge screen has to tell "no room with that code" (`not_found`) from
 * "challenges are offline" (`challenge_unavailable`) and "that room is full"
 * (`room_full`): all three arrive as a failed request, and only `code` tells
 * them apart. It is still an `Error`, so every existing catch keeps working.
 */
export class TvRelayError extends Error {
  readonly status: number;
  readonly code: string | null;
  /**
   * The room the refusal is about, when the relay names one. `room_live`
   * carries the room this television already holds, which is the only way a
   * screen can go and close it.
   */
  readonly roomId: string | null;

  constructor(
    status: number,
    code: string | null,
    message: string,
    roomId: string | null = null,
  ) {
    super(message);
    this.name = 'TvRelayError';
    this.status = status;
    this.code = code;
    this.roomId = roomId;
  }
}

export interface TvRelayOptions {
  /** The same device id /mcp uses: pairing belongs to this television. */
  getDeviceId: () => Promise<string>;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/**
 * A poll waits on the server, so the request timeout must outlast the wait. The
 * margin only covers the round trip - the server answers at the wait deadline
 * even when no command arrived.
 */
const POLL_TIMEOUT_MARGIN_MS = 5_000;
const PAIR_TIMEOUT_MS = 10_000;
const HANDOFF_TIMEOUT_MS = 5_000;
/** A deck publish is one small POST; a game turn must never hold the screen. */
const GAME_TIMEOUT_MS = 5_000;
/** A reward is decoration beside the match: it may not make the screen wait. */
const WALLET_TIMEOUT_MS = 5_000;

export class TvRelayClient {
  private readonly getDeviceId: () => Promise<string>;
  private readonly baseUrl: string;
  /** Only set when a caller injects one; the default is resolved per call. */
  private readonly fetchOverride: typeof fetch | undefined;

  constructor(options: TvRelayOptions) {
    this.getDeviceId = options.getDeviceId;
    this.baseUrl = options.baseUrl ?? GLOBIE_RELAY_BASE_URL;
    this.fetchOverride = options.fetchImpl;
  }

  /**
   * Resolved at call time, not in the constructor: a polyfill installed after
   * the first render would otherwise be missed for the client's whole life,
   * and a missing one would fail as an anonymous "not a function" far from
   * here. The message is what the pairing screen shows.
   */
  private fetchFor(path: string): typeof fetch {
    const impl =
      this.fetchOverride ?? (globalThis as {fetch?: typeof fetch}).fetch;
    if (typeof impl !== 'function') {
      throw new Error(`This TV has no fetch implementation to call ${path}.`);
    }
    return impl;
  }

  /** Shows a fresh six-digit code. Re-requesting invalidates the previous one. */
  async requestPairing(): Promise<TvPairing> {
    return this.send<TvPairing>('/v1/tv/pair', {
      method: 'POST',
      body: '{}',
      timeoutMs: PAIR_TIMEOUT_MS,
    });
  }

  /**
   * Waits up to `waitMs` for the next command. Resolves with a null command at
   * the deadline, so the caller can simply loop.
   */
  async nextCommand(waitMs: number, signal?: AbortSignal): Promise<TvCommandPoll> {
    return this.send<TvCommandPoll>(
      `/v1/tv/commands?waitMs=${Math.max(0, Math.floor(waitMs))}`,
      {method: 'GET', timeoutMs: Math.max(0, Math.floor(waitMs)) + POLL_TIMEOUT_MARGIN_MS, signal},
    );
  }

  /**
   * Tells the server which lesson or episode this TV wanted to hear, so the
   * next PlayMeditationIntent / PlayPodcastIntent / ResumeIntent from the
   * paired Alexa account plays that instead of a random pick.
   *
   * Best effort by design: an unpaired TV still gets the spoken carrier phrase,
   * so a refusal here must not surface as a second error on screen. The promise
   * still rejects - callers that care can await it.
   */
  async handoff(request: TvHandoff): Promise<{stored: boolean}> {
    return this.send<{stored: boolean}>('/v1/tv/handoff', {
      method: 'POST',
      body: JSON.stringify(request),
      timeoutMs: HANDOFF_TIMEOUT_MS,
    });
  }

  /**
   * Hands the server the questions this screen is showing, so a spoken answer
   * can be judged without a round trip to an app that cannot be asked.
   *
   * Republishing replaces the previous deck and ends any session built on it,
   * which is exactly what a "play again" does.
   */
  async publishDeck(deck: GameDeck): Promise<{stored: boolean}> {
    return this.send<{stored: boolean}>('/v1/tv/game/deck', {
      method: 'POST',
      body: JSON.stringify(deck),
      timeoutMs: GAME_TIMEOUT_MS,
    });
  }

  /**
   * Reports a D-pad answer so the server's score stays the only score.
   *
   * Only called while a voice session is live: without one the screen owns its
   * own counters and a failed POST would be a silent cost. `null` means the
   * server had no session or no such round, and the screen keeps its local
   * verdict.
   */
  async reportAnswer(roundId: string, choice: string): Promise<GameSnapshot | null> {
    const result = await this.send<{snapshot: GameSnapshot | null}>('/v1/tv/game/answer', {
      method: 'POST',
      body: JSON.stringify({roundId, choice}),
      timeoutMs: GAME_TIMEOUT_MS,
    });
    return result.snapshot ?? null;
  }

  /**
   * Tells the server the screen moved on, so the next spoken answer targets
   * the question now shown rather than the one just answered.
   */
  async advanceGame(): Promise<GameSnapshot | null> {
    const result = await this.send<{snapshot: GameSnapshot | null}>('/v1/tv/game/next', {
      method: 'POST',
      body: '{}',
      timeoutMs: GAME_TIMEOUT_MS,
    });
    return result.snapshot ?? null;
  }

  /**
   * Freezes a deck and opens a party (infra/mcp/src/challenge.ts).
   *
   * The rounds are the same ones the quiz screen built; the server keeps the
   * answer key and owns the clock, so the TV must not score this deck itself.
   */
  async openChallenge(rounds: GameDeckRound[]): Promise<ChallengeOpened> {
    return this.send<ChallengeOpened>('/v1/tv/challenge', {
      method: 'POST',
      body: JSON.stringify({rounds}),
      timeoutMs: GAME_TIMEOUT_MS,
    });
  }

  /** Takes a named slot in a room the host opened. */
  async joinChallenge(code: string, name: string, team?: 0 | 1): Promise<ChallengeJoined> {
    return this.send<ChallengeJoined>('/v1/tv/challenge/join', {
      method: 'POST',
      body: JSON.stringify({code, name, team}),
      timeoutMs: GAME_TIMEOUT_MS,
    });
  }

  /** Starts round one. Only the host device may, and only from the lobby. */
  async startChallenge(roomId: string): Promise<ChallengeStarted> {
    return this.send<ChallengeStarted>('/v1/tv/challenge/start', {
      method: 'POST',
      body: JSON.stringify({roomId}),
      timeoutMs: GAME_TIMEOUT_MS,
    });
  }

  /**
   * Reports one slot's press. Called for every press, never only while a voice
   * session is live: in a room the server is the only score.
   */
  async answerChallenge(
    roomId: string,
    slot: number,
    roundId: string,
    choice: string,
  ): Promise<ChallengeAnswered> {
    return this.send<ChallengeAnswered>('/v1/tv/challenge/answer', {
      method: 'POST',
      body: JSON.stringify({roomId, slot, roundId, choice}),
      timeoutMs: GAME_TIMEOUT_MS,
    });
  }

  /** The host moves on: next question, or the podium when `final` is true. */
  async nextChallengeRound(roomId: string): Promise<ChallengeAdvanced> {
    return this.send<ChallengeAdvanced>('/v1/tv/challenge/next', {
      method: 'POST',
      body: JSON.stringify({roomId}),
      timeoutMs: GAME_TIMEOUT_MS,
    });
  }

  /**
   * Reads a room by its six digits, before this television has taken a seat.
   *
   * The invitation carries the frozen deck with its answer keys, because the
   * joining television judges its own presses. Refusals arrive as
   * `TvRelayError` with the server's `code`: `invalid_code`, `not_found`, or
   * `challenge_unavailable` when persistence has not been applied.
   */
  async fetchChallenge(code: string): Promise<ChallengeInvitation> {
    return this.send<ChallengeInvitation>(`/v1/tv/challenge/${encodeURIComponent(code)}`, {
      method: 'GET',
      timeoutMs: GAME_TIMEOUT_MS,
    });
  }

  /**
   * The family wall: one tile per seat, with a version that changes per frame.
   *
   * Polled while the lobby is open. A tile carries a path, not image bytes, so
   * the television draws frames straight from the relay and nothing large
   * crosses this client.
   */
  async fetchChallengePresence(code: string): Promise<ChallengePresenceSnapshot> {
    return this.send<ChallengePresenceSnapshot>(
      `/v1/tv/challenge/${encodeURIComponent(code)}/presence`,
      {method: 'GET', timeoutMs: GAME_TIMEOUT_MS},
    );
  }

  /** Gives up a seat, or closes the whole room when `slot` is omitted. */
  async leaveChallenge(roomId: string, slot?: number): Promise<ChallengeLeft> {
    return this.send<ChallengeLeft>('/v1/tv/challenge/leave', {
      method: 'POST',
      body: JSON.stringify({roomId, slot}),
      timeoutMs: GAME_TIMEOUT_MS,
    });
  }

  /**
   * The eco-token total this television has earned.
   *
   * Rejects like every other relay call; the badge renders `available: false`
   * from the payload when the server itself cannot price it.
   */
  async loadWallet(): Promise<EcoWallet> {
    return this.send<EcoWallet>('/v1/tv/wallet', {
      method: 'GET',
      timeoutMs: WALLET_TIMEOUT_MS,
    });
  }

  /**
   * Credits one reward and returns the new total.
   *
   * `key` is the game's own record of what was rewarded, so the server can be
   * told the same match twice - a retry after a timeout, a remounted screen -
   * without paying twice. The answer's `awarded` is 0 in that case.
   */
  async awardTokens(key: string, amount: number): Promise<EcoAward> {
    return this.send<EcoAward>('/v1/tv/wallet/award', {
      method: 'POST',
      body: JSON.stringify({key, amount}),
      timeoutMs: WALLET_TIMEOUT_MS,
    });
  }

  /** What this television owns, and what the rest costs. */
  async loadWardrobe(): Promise<EcoWardrobe> {
    return this.send<EcoWardrobe>('/v1/tv/wardrobe', {
      method: 'GET',
      timeoutMs: WALLET_TIMEOUT_MS,
    });
  }

  /**
   * Buys one item, once.
   *
   * The item travels; the price does not - the server holds it. A retried
   * purchase answers `spent: 0`, and an unaffordable one is a rejection with
   * `code: 'insufficient_tokens'`, so the panel can say which happened.
   */
  async spendTokens(item: string): Promise<EcoSpend> {
    return this.send<EcoSpend>('/v1/tv/wallet/spend', {
      method: 'POST',
      body: JSON.stringify({item}),
      timeoutMs: WALLET_TIMEOUT_MS,
    });
  }

  private async send<T>(
    path: string,
    init: {method: string; body?: string; timeoutMs: number; signal?: AbortSignal},
  ): Promise<T> {
    const impl = this.fetchFor(path);
    const deviceId = await this.getDeviceId();
    // The caller's signal and the request timeout both have to end the fetch;
    // one controller is aborted by whichever fires first.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), init.timeoutMs);
    const forwardAbort = () => controller.abort();
    init.signal?.addEventListener('abort', forwardAbort);

    try {
      const response = await impl(`${this.baseUrl}${path}`, {
        method: init.method,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Device-Id': deviceId,
        },
        body: init.body,
        signal: controller.signal,
      });

      const text = await response.text();
      let payload: unknown = null;
      if (text) {
        try {
          payload = JSON.parse(text);
        } catch {
          payload = null;
        }
      }

      if (!response.ok) {
        const refusal = payload as
          | {error?: string; code?: string; roomId?: string}
          | null;
        const message = refusal?.error ?? `The TV relay answered ${response.status}.`;
        throw new TvRelayError(
          response.status,
          refusal?.code ?? null,
          message,
          refusal?.roomId ?? null,
        );
      }

      return payload as T;
    } finally {
      clearTimeout(timer);
      init.signal?.removeEventListener('abort', forwardAbort);
    }
  }
}

export function createTvRelayClient(options: TvRelayOptions): TvRelayClient {
  return new TvRelayClient(options);
}
