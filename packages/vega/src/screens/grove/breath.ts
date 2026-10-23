import {BREATH_CUE_TEXT, REST_CUE_TEXT} from './meditations';

export type BreathPhaseKey = 'inhale' | 'hold' | 'exhale' | 'rest';
export type BreathPatternId = '478' | 'box';

export interface BreathPhase {
  key: BreathPhaseKey;
  label: string;
  seconds: number;
}

export interface BreathPattern {
  id: BreathPatternId;
  label: string;
  phases: BreathPhase[];
}

export const BREATH_PATTERNS: Record<BreathPatternId, BreathPattern> = {
  '478': {
    id: '478',
    label: '4-7-8-4 Sleep',
    phases: [
      {key: 'inhale', label: 'Inhale', seconds: 4},
      {key: 'hold', label: 'Hold', seconds: 7},
      {key: 'exhale', label: 'Exhale', seconds: 8},
      {key: 'rest', label: 'Rest', seconds: 4},
    ],
  },
  box: {
    id: 'box',
    label: 'Box (4-4-4-4)',
    phases: [
      {key: 'inhale', label: 'Inhale', seconds: 4},
      {key: 'hold', label: 'Hold', seconds: 4},
      {key: 'exhale', label: 'Exhale', seconds: 4},
      {key: 'rest', label: 'Rest', seconds: 4},
    ],
  },
};

export const BREATH_PATTERN_IDS: BreathPatternId[] = ['478', 'box'];

export const SESSION_LENGTHS = [0, 15, 30, 60];

export const roundSeconds = (pattern: BreathPatternId): number =>
  BREATH_PATTERNS[pattern].phases.reduce(
    (total, phase) => total + phase.seconds,
    0,
  );

export interface BreathPosition {
  phase: BreathPhase;
  secondsLeft: number;
  cycles: number;
}

/** Same clock as the web pacer: elapsed seconds in, phase and cycle out. */
export const phaseAt = (
  pattern: BreathPatternId,
  elapsedSeconds: number,
): BreathPosition => {
  const {phases} = BREATH_PATTERNS[pattern];
  const total = roundSeconds(pattern);
  const safe = Math.max(0, Math.floor(elapsedSeconds));
  const cycles = Math.floor(safe / total);
  let offset = safe % total;
  for (const phase of phases) {
    if (offset < phase.seconds) {
      return {phase, secondsLeft: phase.seconds - offset, cycles};
    }
    offset -= phase.seconds;
  }
  const last = phases[phases.length - 1];
  return {phase: last, secondsLeft: last.seconds, cycles};
};

export const formatClock = (seconds: number): string => {
  const safe = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${String(safe % 60).padStart(2, '0')}`;
};

export const paceLine = (pattern: BreathPatternId): string =>
  `${BREATH_PATTERNS[pattern].phases
    .map(phase => `${phase.seconds}s ${phase.label}`)
    .join(' • ')} — slow-breath pace`;

export const cueTextFor = (key: BreathPhaseKey): string =>
  key === 'rest' ? REST_CUE_TEXT : BREATH_CUE_TEXT[key];
