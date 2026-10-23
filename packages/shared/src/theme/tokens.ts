/**
 * Design tokens for the 1920 x 1080 TV canvas.
 *
 * The palette is the Globie Earth / Amazon brand language: deep forest
 * surfaces (#001f16 -> #003629 -> #1b5e3c), mint ink (#bbedda, #a0d1be),
 * and a clay + gold accent pair borrowed from the quest and mission cards.
 * Dark surfaces keep the ten-foot UI calm; mint is the only chroma that
 * carries focus, so the focus ring never competes with cover art.
 *
 * Values are expressed in design units. Components pass them through
 * scaleWidth / scaleHeight / scaleFontSize so the same styles also render
 * correctly on a 720p device.
 */

export const color = {
  /** App background: the darkest forest, close enough to black for video. */
  surface: '#001f16',
  /** Cards, tiles, pairing panel, cover art base. */
  surfaceInner: '#003629',
  /** Focused fill. Never animated: swapped in one style pass. */
  surfaceRaise: '#1b5e3c',
  /** The pale blue-grey menu tiles on the WELCOME screen. */
  tileSurface: '#c8d1d9',
  /** Near-black ink for copy that sits on a pale tile. */
  tileInk: '#0b1a14',

  text: '#f8f9fa',
  textMuted: '#a0d1be',

  /** Mint-tinted hairline; reads as an edge on forest, never as a box. */
  border: 'rgba(187, 221, 218, 0.16)',

  /** Primary accent (mint) for selected chips, progress, active rows. */
  accent: '#bbedda',
  /** 16% mint wash behind the primary action. */
  accentSoft: 'rgba(187, 221, 218, 0.16)',
  /** Mid forest, for brand marks and secondary emphasis. */
  accentDeep: '#1b5e3c',

  /** Amber + gold from the mission cards; used sparingly. */
  clay: '#fca867',
  gold: '#ffce4d',

  /** Coral, legible on forest, for error copy. */
  danger: '#ff7a5c',

  scrim: 'rgba(0, 31, 22, 0.86)',
} as const;

/** Brand gradient stops, rendered as stacked bands (no gradient module). */
export const brandGradient = ['#003629', '#1b5e3c', '#71a08f'] as const;

export const space = {
  xxs: 8,
  xs: 16,
  sm: 20,
  md: 30,
  lg: 40,
  xl: 50,
  xxl: 60,
} as const;

export const radius = {
  sm: 20,
  md: 30,
  lg: 40,
  pill: 9999,
} as const;

export const typography = {
  display: 72,
  headline: 44,
  title: 32,
  body: 28,
  caption: 24,
  label: 22,
} as const;

/** Design-spec name for the type scale. */
export {typography as type};

export const focus = {
  ringWidth: 10,
  ringOffset: 4,
  scale: 1.06,
  target: 56,
} as const;

export const layout = {
  insetX: 96,
  insetY: 54,
  headerHeight: 56,
  heroHeight: 270,
  shelfHeight: 300,
  infoHeight: 130,
} as const;
