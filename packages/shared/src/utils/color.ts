/**
 * Deterministic colour generation for drawn cover art.
 *
 * No image is ever fetched: a seed string maps to a hue, and the cover is
 * filled with stacked bands interpolated between two HSL stops.
 */

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** FNV-1a, 32-bit. Stable across engines and cheap enough for 60 fps. */
export const fnv1a = (input: string): number => {
  let hash = FNV_OFFSET;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
};

/** Hue in degrees for a seed string. */
export const hueFor = (seed: string): number => fnv1a(seed) % 360;

const toHexChannel = (value: number): string => {
  const clamped = Math.round(value * 255);
  return clamped.toString(16).padStart(2, '0');
};

/** hsl -> #rrggbb. h in degrees, s and l in percent. */
export const hslToHex = (h: number, s: number, l: number): string => {
  const hue = ((h % 360) + 360) % 360;
  const saturation = Math.min(100, Math.max(0, s)) / 100;
  const lightness = Math.min(100, Math.max(0, l)) / 100;

  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lightness - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;

  if (hue < 60) {
    r = c;
    g = x;
  } else if (hue < 120) {
    r = x;
    g = c;
  } else if (hue < 180) {
    g = c;
    b = x;
  } else if (hue < 240) {
    g = x;
    b = c;
  } else if (hue < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  return `#${toHexChannel(r + m)}${toHexChannel(g + m)}${toHexChannel(
    b + m,
  )}`;
};

/**
 * Stacked bands from top to bottom, anchored to the brand palette.
 *
 * Most seeds land in the forest family (hue 148-174): a sunlit sage at the
 * top fading into the brand forest (#003629) at the bottom. One seed in six
 * drifts to clay and gold so a shelf still reads as a varied set of covers.
 */
export const coverBands = (seed: string, count = 8): string[] => {
  const hash = fnv1a(seed);
  const warm = hash % 6 === 0;
  const hue = warm ? 18 + (hash % 16) : 148 + (hash % 26);
  const lift = (hash >>> 9) % 9;
  const bands: string[] = [];

  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1);
    bands.push(
      warm
        ? hslToHex(hue + 6 * t, 46 + 26 * t, 60 - 44 * t)
        : hslToHex(hue + 8 * t, 30 + 48 * t, 52 + lift * 0.6 - 41 * t),
    );
  }

  return bands;
};

/** First letter of the title, uppercased; a note glyph when there is none. */
export const coverLetter = (title: string): string => {
  const trimmed = title.trim();
  return trimmed.length > 0 ? trimmed[0].toUpperCase() : '\u266A';
};
