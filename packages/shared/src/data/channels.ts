/**
 * The open channels offered by the video screen.
 *
 * Vega's `w3cmedia` player accepts a progressive MP4 by URL but has no HLS
 * demuxer, so every entry here must be a single MP4 file with its `moov` in a
 * form the pipeline can parse. Nothing is fetched ahead of time and nothing is
 * proxied; playback goes straight to the publisher.
 *
 * Every entry needs a real credit line. Do not add a stream whose licence is
 * unclear just to make the list longer.
 */
export interface OpenChannel {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly credit: string;
  readonly url: string;
}

export const OPEN_CHANNELS: readonly OpenChannel[] = [
  {
    id: 'bipbop',
    title: 'BipBop test card',
    subtitle: 'Progressive MP4 · H.264',
    credit: 'Apple developer sample stream',
    url: 'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/v2/main.mp4',
  },
  {
    id: 'sintel-trailer',
    title: 'Sintel — trailer',
    subtitle: 'Progressive MP4 · H.264',
    credit: 'Blender Foundation · CC BY 3.0',
    url: 'https://media.w3.org/2010/05/sintel/trailer.mp4',
  },
  {
    id: 'bunny-trailer',
    title: 'Big Buck Bunny — trailer',
    subtitle: 'Progressive MP4 · H.264',
    credit: 'Blender Foundation · CC BY 3.0',
    url: 'https://media.w3.org/2010/05/bunny/trailer.mp4',
  },
];
