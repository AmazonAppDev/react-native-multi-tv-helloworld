import {sharedPodcastAudio} from '../player/podcastAudio';

/** The two cues rendered with ffmpeg into `src/assets/audio`. */
export type RewardCue = 'match' | 'perfect';

/**
 * The cues are Globie Earth's own published files, like the guided meditations,
 * rather than bundled assets. Bundling does not work on this device: the media
 * engine opens a source with `filesrc` outside the app's package mount, so a
 * `file:///pkg/...` URI fails with MEDIA_ERR_SRC_NOT_SUPPORTED even though the
 * mp3 is in the package. `src/assets/audio` stays as the master copy that is
 * published to this path.
 */
const CUE_BASE = 'https://globie.earth';

const cueUrl = (cue: RewardCue): string =>
  `${CUE_BASE}/cues/reward-${cue === 'perfect' ? 'perfect' : 'match'}.mp3`;

/**
 * Plays a reward cue on the shared media session.
 *
 * Vega hands out one audio session, so this borrows the podcast player rather
 * than opening a second one - and the player puts the episode back where it
 * was. Every failure - no session, an unsupported source, no audio sink -
 * becomes silence, never an error: the cue is decoration beside the match, not
 * part of it.
 */
export const playRewardCue = (cue: RewardCue): void => {
  try {
    void sharedPodcastAudio()
      .playCue(cueUrl(cue))
      .catch(() => undefined);
  } catch {
    // The match has already been scored; a missing sound changes nothing.
  }
};
