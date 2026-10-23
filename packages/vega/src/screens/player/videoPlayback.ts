import type {VideoPlayer} from '@amazon-devices/react-native-w3cmedia';

export interface VideoPlaybackEvents {
  onTime?: (positionSec: number, durationSec: number) => void;
  onEnded?: () => void;
  onError?: (message: string) => void;
}

export interface StartResult {
  started: boolean;
  message?: string;
}

/** Native getters return NaN before the element exists; clamp them to 0. */
const finite = (value: number): number =>
  Number.isFinite(value) && value >= 0 ? value : 0;

/**
 * The player's plain `src` setter sends no User-Agent, and some hosts answer a
 * request without one with 403 text/html - the same refusal `PodcastAudio`
 * works around. Any non-empty agent is accepted; this one says who is asking.
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
const setSource = (player: VideoPlayer, url: string): void => {
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
 * One guarded owner of the Vega `VideoPlayer`.
 *
 * Same ordering law as `PodcastAudio`: `src` first (safe, `load()` early
 * returns), then `initialize()`, then listeners, then `play()`. Listeners
 * added before `initialize()` are dropped, and `play()` before it rejects.
 * The surface is not handled here: `KeplerVideoView` receives `element()` and
 * calls `setSurfaceHandle` itself.
 *
 * Every failure is reported as `{started: false}` plus a message; nothing here
 * throws at the caller.
 */
export class VideoPlayback {
  private readonly player: VideoPlayer;
  private ready = false;
  private events: VideoPlaybackEvents = {};

  constructor(player: VideoPlayer) {
    this.player = player;
  }

  /** Handed to `KeplerVideoView`; stable for the life of the screen. */
  element(): VideoPlayer {
    return this.player;
  }

  isLoaded(): boolean {
    return this.ready;
  }

  private readonly handleTime = () => {
    this.events.onTime?.(
      finite(this.player.currentTime),
      finite(this.player.duration),
    );
  };

  private readonly handleEnded = () => {
    this.events.onEnded?.();
  };

  /**
   * Names the actual cause. `play()` rejects with no reason and the element
   * exposes only `error.code`, so without this every failure reads the same -
   * and a refused stream was blamed on the viewer's network.
   */
  private readonly failureMessage = (): string => {
    let code = 0;
    let detail = '';
    try {
      code = this.player.error?.code ?? 0;
      detail = this.player.error?.message ?? '';
    } catch {
      code = 0;
      detail = '';
    }

    switch (code) {
      case MEDIA_ERR_NETWORK:
        return 'The video stream stopped responding. Check the connection and try again.';
      case MEDIA_ERR_DECODE:
        return 'This channel downloaded, but its video could not be decoded.';
      case MEDIA_ERR_SRC_NOT_SUPPORTED:
        return 'This channel could not be started. The host may have refused it, or this TV could not open the video.';
      case MEDIA_ERR_ABORTED:
        return 'Playback was interrupted.';
      default:
        return detail
          ? `Playback failed: ${detail}`
          : 'This channel could not be played. Try another channel.';
    }
  };

  private readonly handleError = () => {
    this.events.onError?.(this.failureMessage());
  };

  async open(url: string, events: VideoPlaybackEvents): Promise<StartResult> {
    if (!url) {
      return {started: false, message: 'This channel has no video URL.'};
    }

    this.events = events;

    try {
      setSource(this.player, url);
    } catch {
      return {started: false, message: 'This channel has no playable video.'};
    }

    if (!this.ready) {
      try {
        await this.player.initialize();
      } catch {
        return {started: false, message: 'The video engine did not start.'};
      }
      this.ready = true;
      this.player.addEventListener('timeupdate', this.handleTime);
      this.player.addEventListener('durationchange', this.handleTime);
      this.player.addEventListener('ended', this.handleEnded);
      this.player.addEventListener('error', this.handleError);
    }

    return this.play();
  }

  async play(): Promise<StartResult> {
    if (!this.ready) {
      return {started: false, message: 'Video is not ready yet.'};
    }

    try {
      await this.player.play();
    } catch {
      return {started: false, message: this.failureMessage()};
    }

    return {started: true};
  }

  pause(): void {
    try {
      this.player.pause();
    } catch {
      // Pausing an unloaded player is a no-op, not an error.
    }
  }

  seekTo(seconds: number): void {
    if (!this.ready) {
      return;
    }
    try {
      this.player.currentTime = Math.max(0, seconds);
    } catch {
      // Seeking before the element is loaded is dropped silently.
    }
  }

  seekBy(deltaSec: number): void {
    const durationSec = this.duration();
    const target = Math.max(0, this.position() + deltaSec);
    this.seekTo(
      durationSec > 0 ? Math.min(target, Math.max(durationSec - 1, 0)) : target,
    );
  }

  position(): number {
    return finite(this.player.currentTime);
  }

  duration(): number {
    return finite(this.player.duration);
  }

  dispose(): void {
    this.events = {};
    try {
      this.player.removeEventListener('timeupdate', this.handleTime);
      this.player.removeEventListener('durationchange', this.handleTime);
      this.player.removeEventListener('ended', this.handleEnded);
      this.player.removeEventListener('error', this.handleError);
      this.player.pause();
    } catch {
      // Teardown must never surface an error to the screen.
    }
    this.ready = false;
    void this.player.deinitialize().catch(() => undefined);
  }
}
