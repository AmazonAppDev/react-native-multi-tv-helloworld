import {AudioContentType, AudioPlayer, AudioUsageType} from './w3cmedia';

/**
 * Why playback did not happen.
 *
 * `unsupported` is the one that matters here: on a Vega device it is what a
 * missing audio sink looks like (`MEDIA_ERR_SRC_NOT_SUPPORTED`), so the screen
 * can hand the sound to an Echo instead of blaming the stream. The other three
 * name failures the stream itself owns.
 */
export type AudioFailureReason =
  | 'unsupported'
  | 'network'
  | 'decode'
  | 'aborted'
  | 'unknown';

export interface PodcastAudioEvents {
  onTime?: (positionSec: number, durationSec: number) => void;
  onEnded?: () => void;
  onError?: (message: string, reason: AudioFailureReason) => void;
}

export interface StartResult {
  started: boolean;
  message?: string;
  /** True when the device could not open an audio output for this source. */
  unavailable?: boolean;
}

/** Native getters return NaN before the element exists; clamp them to 0. */
const finite = (value: number): number =>
  Number.isFinite(value) && value >= 0 ? value : 0;

/**
 * The player's plain `src` setter sends no User-Agent, and Buzzsprout /
 * Podtrac-fronted hosts answer a request without one with 403 text/html.
 * Any non-empty agent is accepted; this one says who is asking.
 */
const PLAYBACK_HEADERS: Record<string, string> = {
  'User-Agent': 'GlobieEarth/1.0 (Vega TV; +https://globie.earth)',
};

/** MediaError codes; the package ships no runtime enum for them. */
const MEDIA_ERR_ABORTED = 1;
const MEDIA_ERR_NETWORK = 2;
const MEDIA_ERR_DECODE = 3;
const MEDIA_ERR_SRC_NOT_SUPPORTED = 4;

/**
 * `setSrcWithCustomHeaders` is public at runtime but missing from the typings,
 * and the plain `src` setter hard-codes the headers to null.
 */
const setSource = (player: AudioPlayer, url: string): void => {
  const withHeaders = player as unknown as {
    setSrcWithCustomHeaders?: (
      source: string,
      headers: Record<string, string> | null,
    ) => void;
  };
  if (typeof withHeaders.setSrcWithCustomHeaders === 'function') {
    withHeaders.setSrcWithCustomHeaders(url, PLAYBACK_HEADERS);
  } else {
    player.src = url;
  }
};

/**
 * One guarded owner of the Vega `AudioPlayer`.
 *
 * The order below is not optional. `set src` before `initialize()` is safe
 * because `load()` early-returns while the element is missing, but listeners
 * added before `initialize()` are silently dropped, and `play()` called before
 * it rejects with `undefined` (MediaPlayer.play resolves and then rejects).
 * `loop` is stored and never read again, so repeat is driven by `ended`, and
 * `set currentTime` has no null guard, so every seek is wrapped.
 *
 * Every failure is reported as `{started: false}` plus a message; nothing here
 * throws at the caller.
 */
export class PodcastAudio {
  private player: AudioPlayer | null = null;
  private ready = false;
  private events: PodcastAudioEvents = {};
  private pendingSeekSec: number | null = null;
  private currentUrl: string | null = null;
  /** Set while a cue owns the source: what to give back when it ends. */
  private cueReturn: {
    url: string;
    at: number;
    playing: boolean;
  } | null = null;

  private readonly handleTime = () => {
    const player = this.player;
    if (!player) {
      return;
    }

    // A cue is a second or two long, so its position is not the episode's.
    // Feeding it to the screen would make the clock jump backwards.
    if (this.cueReturn) {
      return;
    }

    const durationSec = finite(player.duration);
    if (this.pendingSeekSec !== null && durationSec > 0) {
      const target = Math.min(
        this.pendingSeekSec,
        Math.max(durationSec - 1, 0),
      );
      this.pendingSeekSec = null;
      try {
        player.currentTime = target;
      } catch {
        // A dropped seek is not fatal; playback continues from the start.
      }
    }

    this.events.onTime?.(finite(player.currentTime), durationSec);
  };

  private readonly handleEnded = () => {
    if (this.cueReturn) {
      this.restoreAfterCue();
      return;
    }
    this.events.onEnded?.();
  };

  /**
   * Gives the episode back after a cue, at the place it was interrupted.
   *
   * The platform hands out one engine, so a cue cannot mix with an episode:
   * it replaces the source for its own short length and then has to put the
   * episode back. Restoring position and play state is the whole point - a
   * cue that silently drops the listener's place is worse than no cue.
   */
  private restoreAfterCue(): void {
    const target = this.cueReturn;
    this.cueReturn = null;
    if (!target || !this.player) {
      return;
    }

    try {
      setSource(this.player, target.url);
    } catch {
      return;
    }

    this.pendingSeekSec = target.at > 1 ? target.at : null;
    if (target.playing) {
      void this.play();
    }
  }

  /**
   * Names the actual cause. `play()` rejects with `undefined` and the element
   * exposes only `error.code`, so without this every failure reads the same.
   */
  private readonly failure = (): {
    message: string;
    reason: AudioFailureReason;
  } => {
    let code = 0;
    let detail = '';
    try {
      code = this.player?.error?.code ?? 0;
      detail = this.player?.error?.message ?? '';
    } catch {
      code = 0;
      detail = '';
    }

    switch (code) {
      case MEDIA_ERR_NETWORK:
        return {
          message:
            'The audio stream stopped responding. Check the connection and try again.',
          reason: 'network',
        };
      case MEDIA_ERR_DECODE:
        return {
          message: 'This audio downloaded, but it could not be decoded.',
          reason: 'decode',
        };
      case MEDIA_ERR_SRC_NOT_SUPPORTED:
        return {
          message:
            'This audio could not be started. The host may have refused it, or this TV could not open the audio output.',
          reason: 'unsupported',
        };
      case MEDIA_ERR_ABORTED:
        return {message: 'Playback was interrupted.', reason: 'aborted'};
      default:
        return {
          message: detail
            ? `Playback failed: ${detail}`
            : 'This audio could not be played.',
          reason: 'unknown',
        };
    }
  };

  private readonly handleError = () => {
    // A cue that cannot open is silence, not a playback failure: the episode
    // still has to come back, and decoration never raises an error on screen.
    if (this.cueReturn) {
      this.restoreAfterCue();
      return;
    }
    const failure = this.failure();
    this.events.onError?.(failure.message, failure.reason);
  };

  isLoaded(): boolean {
    return this.player !== null && this.ready;
  }

  /**
   * Brings the engine up on demand.
   *
   * A cue can be the first sound of the session - the reward burst does not
   * require an episode to have played first - so both entry points go through
   * here rather than only `start()`.
   *
   * `initialize()` must settle before the source is assigned: `load()`
   * returns early while no media element exists, so a source set first is
   * never fetched and `play()` then fails with MEDIA_ERR_SRC_NOT_SUPPORTED.
   */
  private async ensureReady(): Promise<boolean> {
    if (!this.player) {
      this.player = new AudioPlayer(
        AudioContentType.CONTENT_TYPE_SPEECH,
        AudioUsageType.USAGE_MEDIA,
      );
    }
    if (this.ready) {
      return true;
    }

    try {
      await this.player.initialize();
    } catch {
      return false;
    }

    this.ready = true;
    this.player.addEventListener('timeupdate', this.handleTime);
    this.player.addEventListener('durationchange', this.handleTime);
    this.player.addEventListener('ended', this.handleEnded);
    this.player.addEventListener('error', this.handleError);
    return true;
  }

  async start(
    url: string,
    startAtSec: number,
    events: PodcastAudioEvents,
  ): Promise<StartResult> {
    if (!url) {
      return {started: false, message: 'This episode has no audio URL.'};
    }

    this.events = events;

    if (!(await this.ensureReady())) {
      return {started: false, message: 'The audio engine did not start.'};
    }

    const player = this.player;
    if (!player) {
      return {started: false, message: 'The audio engine did not start.'};
    }

    try {
      setSource(player, url);
    } catch {
      return {started: false, message: 'This episode has no playable audio.'};
    }

    this.currentUrl = url;
    this.cueReturn = null;
    this.pendingSeekSec = startAtSec > 1 ? startAtSec : null;
    return this.play();
  }

  /**
   * Plays a short cue on the shared engine, then hands the episode back.
   *
   * Nothing is mixed: a cue cannot sound alongside the episode, so it borrows
   * the source. `restoreAfterCue` puts the episode back at the position it was
   * interrupted, which is why the return trip is recorded here rather than
   * left to the caller.
   */
  async playCue(url: string): Promise<StartResult> {
    if (!url) {
      return {started: false, message: 'This cue has no audio URL.'};
    }
    if (!(await this.ensureReady())) {
      return {started: false, message: 'Audio is not ready yet.'};
    }

    const player = this.player;
    if (!player) {
      return {started: false, message: 'Audio is not ready yet.'};
    }

    // A cue landing on top of a cue keeps the original return trip; there is
    // only one episode to give back, and overwriting would lose it.
    if (!this.cueReturn) {
      this.cueReturn = this.currentUrl
        ? {url: this.currentUrl, at: this.position(), playing: !this.isPaused()}
        : null;
    }

    try {
      setSource(player, url);
    } catch {
      this.restoreAfterCue();
      return {started: false, message: 'This cue could not be played.'};
    }

    const result = await this.play();
    if (!result.started) {
      this.restoreAfterCue();
    }
    return result;
  }

  async play(): Promise<StartResult> {
    if (!this.player || !this.ready) {
      return {started: false, message: 'Audio is not ready yet.'};
    }

    try {
      await this.player.play();
    } catch {
      const failure = this.failure();
      return {
        started: false,
        message: failure.message,
        unavailable: failure.reason === 'unsupported',
      };
    }

    return {started: true};
  }

  pause(): void {
    try {
      this.player?.pause();
    } catch {
      // Pausing an unloaded player is a no-op, not an error.
    }
  }

  seekTo(seconds: number): void {
    if (!this.player || !this.ready) {
      return;
    }
    try {
      this.player.currentTime = Math.max(0, seconds);
    } catch {
      // Seeking before the element is loaded is dropped silently.
    }
  }

  seekBy(deltaSec: number): void {
    if (!this.player || !this.ready) {
      return;
    }
    const durationSec = this.duration();
    const target = Math.max(0, this.position() + deltaSec);
    this.seekTo(
      durationSec > 0 ? Math.min(target, Math.max(durationSec - 1, 0)) : target,
    );
  }

  position(): number {
    return this.player ? finite(this.player.currentTime) : 0;
  }

  duration(): number {
    return this.player ? finite(this.player.duration) : 0;
  }

  isPaused(): boolean {
    return this.player ? this.player.paused : true;
  }

  dispose(): void {
    const player = this.player;
    this.player = null;
    this.ready = false;
    this.pendingSeekSec = null;
    this.currentUrl = null;
    this.cueReturn = null;
    this.events = {};

    if (!player) {
      return;
    }

    try {
      player.removeEventListener('timeupdate', this.handleTime);
      player.removeEventListener('durationchange', this.handleTime);
      player.removeEventListener('ended', this.handleEnded);
      player.removeEventListener('error', this.handleError);
      player.pause();
    } catch {
      // Teardown must never surface an error to the screen.
    }

    void player.deinitialize().catch(() => undefined);
  }
}

/**
 * The TV platform hands out one media session, so a second AudioPlayer
 * initialized while another is live gets no output. Focus mode needs the
 * breath cue and the guided lesson to take turns on the same engine.
 */
let shared: PodcastAudio | null = null;

export const sharedPodcastAudio = (): PodcastAudio => {
  if (shared === null) {
    shared = new PodcastAudio();
  }
  return shared;
};
