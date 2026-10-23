import React, {useEffect, useRef, useState} from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type {ImageSourcePropType} from 'react-native';
import {
  color,
  focus,
  layout,
  radius,
  scaleFontSize,
  scaleHeight,
  scaleWidth,
  space,
  typography,
} from '@multitv/shared';
import {useReducedMotion} from './home/MascotStage';
import {PodcastAudio, sharedPodcastAudio} from './player/podcastAudio';
import type {HandoffRelay} from './player/HandoffNotice';
import {BreathOrb} from './grove/BreathOrb';
import {GuidedLesson} from './grove/GuidedLesson';
import {
  BREATH_PATTERNS,
  BREATH_PATTERN_IDS,
  SESSION_LENGTHS,
  cueTextFor,
  formatClock,
  paceLine,
  phaseAt,
  roundSeconds,
  type BreathPatternId,
} from './grove/breath';
import {
  MEDITATION_GUIDES,
  PERSONAS,
  breathCueUrl,
  guideMinutes,
  turnPersona,
  type MeditationGuide,
  type PersonaId,
} from './grove/meditations';

export interface GroveScreenProps {
  onBack: () => void;
  /** Injected in tests; the app uses the device-id backed voice relay. */
  relay?: HandoffRelay;
}

interface SelectPillProps {
  testID: string;
  label: string;
  selected: boolean;
  onPress: () => void;
  avatar?: ImageSourcePropType;
  accessibilityLabel?: string;
  /** Primary call to action: taller, wider and set in body type. */
  emphasis?: boolean;
  /** Takes D-pad focus when the screen opens. */
  preferred?: boolean;
}

/** A focusable pill, sized for the D-pad and matching the web's chip row. */
const SelectPill = ({
  testID,
  label,
  selected,
  onPress,
  avatar,
  accessibilityLabel,
  emphasis = false,
  preferred = false,
}: SelectPillProps) => {
  const [focused, setFocused] = useState(false);

  return (
    <TouchableOpacity
      testID={testID}
      activeOpacity={1}
      accessibilityRole="button"
      accessibilityState={{selected}}
      accessibilityLabel={accessibilityLabel ?? label}
      hasTVPreferredFocus={preferred}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[
        styles.pill,
        emphasis && styles.pillEmphasis,
        selected && styles.pillSelected,
        focused && styles.pillFocused,
      ]}>
      {avatar ? (
        <Image source={avatar} style={styles.pillAvatar} resizeMode="contain" />
      ) : null}
      <Text
        style={[
          styles.pillLabel,
          {fontSize: scaleFontSize(emphasis ? typography.body : typography.label)},
          selected && styles.pillLabelSelected,
        ]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
};

interface GuideRowProps {
  guide: MeditationGuide;
  divider: boolean;
  onPress: () => void;
}

/** One recorded meditation, with a thumbnail of the voice that leads it. */
const GuideRow = ({guide, divider, onPress}: GuideRowProps) => {
  const [focused, setFocused] = useState(false);

  return (
    <TouchableOpacity
      testID={`meditation-${guide.id}`}
      activeOpacity={1}
      accessibilityRole="button"
      accessibilityLabel={`${guide.title}. ${guideMinutes(guide)} minutes. ${PERSONAS[guide.guide].displayName}.`}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[
        styles.guideRow,
        divider && styles.guideDivider,
        focused && styles.guideRowFocused,
      ]}>
      <Image
        source={PERSONAS[turnPersona(guide.turns[0])].image}
        style={styles.guideThumb}
        resizeMode="cover"
      />
      <View style={styles.guideText}>
        <Text
          numberOfLines={2}
          style={[
            styles.guideTitle,
            {
              fontSize: scaleFontSize(typography.body),
              lineHeight: scaleFontSize(34),
            },
          ]}>
          {guide.title}
        </Text>
        <Text
          numberOfLines={1}
          style={[styles.guideMeta, {fontSize: scaleFontSize(typography.label)}]}>
          {`${PERSONAS[turnPersona(guide.turns[0])].nameThai} · ${PERSONAS[guide.guide].displayName} · ${guideMinutes(guide)} min`}
        </Text>
      </View>
      <View style={styles.guidePlayChip}>
        <Text style={[styles.guidePlay, {fontSize: scaleFontSize(typography.label)}]}>▶</Text>
      </View>
    </TouchableOpacity>
  );
};

/**
 * Focus mode: the grove drops away and the pacer takes the screen.
 *
 * The left column is the breath orb, the voice and the session clock; the right
 * column lists the recorded meditations. Opening one hands the body to
 * GuidedLesson, which streams the production voice turns from globie.earth.
 */
export const GroveScreen = ({onBack, relay}: GroveScreenProps) => {
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const durationRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cueAudioRef = useRef<PodcastAudio | null>(null);

  const [persona, setPersona] = useState<PersonaId>('mother');
  const [pattern, setPattern] = useState<BreathPatternId>('478');
  const [voiceOn, setVoiceOn] = useState(true);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [sessionMinutes, setSessionMinutes] = useState(0);
  const [selected, setSelected] = useState<MeditationGuide | null>(null);
  const [backFocused, setBackFocused] = useState(false);

  const elapsedRef = useRef(0);
  const selectedRef = useRef<MeditationGuide | null>(null);

  const position = phaseAt(pattern, elapsed);
  const phaseKey = position.phase.key;
  const round = roundSeconds(pattern);
  const limit = sessionMinutes * 60;
  const complete = limit > 0 && elapsed >= limit;

  useEffect(() => {
    elapsedRef.current = elapsed;
  }, [elapsed]);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  // One wall-clock tick a second; a late frame does not shorten the session.
  useEffect(() => {
    if (!running) {
      return undefined;
    }
    let last = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      const delta = (now - last) / 1000;
      last = now;
      const next = elapsedRef.current + delta;
      if (limit > 0 && next >= limit) {
        elapsedRef.current = limit;
        setElapsed(limit);
        setRunning(false);
        return;
      }
      elapsedRef.current = next;
      setElapsed(next);
    }, 1000);
    durationRef.current = id;
    return () => {
      clearInterval(id);
      durationRef.current = null;
    };
  }, [limit, running]);

  // The orb opens on the in-breath, holds full, and closes on the out-breath.
  const phaseIdentity = `${pattern}:${position.cycles}:${phaseKey}`;
  useEffect(() => {
    const current = phaseAt(pattern, elapsedRef.current);
    const into = current.phase.seconds - current.secondsLeft;
    const fraction = Math.min(1, into / current.phase.seconds);
    const remainingMs = Math.max(1, (current.phase.seconds - into) * 1000);

    if (!running) {
      return undefined;
    }

    if (reducedMotion) {
      progress.setValue(
        current.phase.key === 'inhale'
          ? fraction
          : current.phase.key === 'exhale'
            ? 1 - fraction
            : current.phase.key === 'hold'
              ? 1
              : 0,
      );
      return undefined;
    }

    if (current.phase.key === 'inhale') {
      progress.setValue(fraction);
      const animation = Animated.timing(progress, {
        toValue: 1,
        duration: remainingMs,
        easing: Easing.linear,
        useNativeDriver: false,
      });
      animation.start();
      return () => animation.stop();
    }

    if (current.phase.key === 'exhale') {
      progress.setValue(1 - fraction);
      const animation = Animated.timing(progress, {
        toValue: 0,
        duration: remainingMs,
        easing: Easing.linear,
        useNativeDriver: false,
      });
      animation.start();
      return () => animation.stop();
    }

    progress.stopAnimation();
    progress.setValue(current.phase.key === 'hold' ? 1 : 0);
    return undefined;
  }, [phaseIdentity, pattern, progress, reducedMotion, running]);

  // Speak the phase cue in the chosen guardian's recorded voice.
  useEffect(() => {
    if (!running || !voiceOn || phaseKey === 'rest') {
      return undefined;
    }
    if (cueAudioRef.current === null) {
      cueAudioRef.current = sharedPodcastAudio();
    }
    void cueAudioRef.current.start(breathCueUrl(persona, phaseKey), 0, {});
    return () => {
      cueAudioRef.current?.pause();
    };
  }, [phaseIdentity, persona, phaseKey, running, voiceOn]);

  useEffect(
    () => () => {
      cueAudioRef.current?.dispose();
      cueAudioRef.current = null;
      if (durationRef.current !== null) {
        clearInterval(durationRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (selectedRef.current !== null) {
          setSelected(null);
          return true;
        }
        onBack();
        return true;
      },
    );
    return () => subscription?.remove();
  }, [onBack]);

  const resetClock = () => {
    elapsedRef.current = 0;
    setElapsed(0);
    setRunning(false);
    progress.stopAnimation();
    progress.setValue(0);
    cueAudioRef.current?.pause();
  };

  const toggleSession = () => {
    if (complete) {
      resetClock();
      setRunning(true);
      return;
    }
    if (running) {
      setRunning(false);
      cueAudioRef.current?.pause();
      return;
    }
    setRunning(true);
  };

  const remaining = limit > 0 ? Math.max(0, limit - elapsed) : elapsed;
  const clock = formatClock(remaining);
  const clockLabel = limit > 0 ? 'Session remaining' : 'Session elapsed';
  const statusText = running
    ? `${position.phase.label.toUpperCase()} · ${position.secondsLeft}S`
    : complete
      ? 'SESSION COMPLETE'
      : elapsed > 0
        ? 'PAUSED'
        : 'READY';
  const primaryLabel = running ? 'Pause' : complete ? 'Begin again' : 'Begin';

  return (
    <View style={styles.root} testID="grove-screen">
      <View style={styles.canopyTop} pointerEvents="none" accessible={false} />
      <View style={styles.canopyBottom} pointerEvents="none" accessible={false} />

      <View style={styles.header}>
        <View>
          <Text style={[styles.eyebrow, {fontSize: scaleFontSize(typography.label)}]}>
            FOCUS MODE
          </Text>
          <Text style={[styles.title, {fontSize: scaleFontSize(typography.headline)}]}>
            Globie
          </Text>
          <Text style={[styles.subtitle, {fontSize: scaleFontSize(typography.caption)}]}>
            Breathe with the grove.
          </Text>
        </View>
        <TouchableOpacity
          testID="grove-back"
          activeOpacity={1}
          accessibilityRole="button"
          accessibilityLabel="Close focus mode"
          onPress={onBack}
          onFocus={() => setBackFocused(true)}
          onBlur={() => setBackFocused(false)}
          style={[
            styles.back,
            {
              borderColor: backFocused ? color.text : color.border,
              backgroundColor: backFocused ? color.surfaceRaise : color.surfaceInner,
            },
          ]}>
          <Text style={[styles.backLabel, {fontSize: scaleFontSize(typography.body)}]}>
            × Close
          </Text>
        </TouchableOpacity>
      </View>

      {selected !== null ? (
        <GuidedLesson guide={selected} relay={relay} onClose={() => setSelected(null)} />
      ) : (
        <View style={styles.body}>
          <View style={styles.left}>
            <View style={styles.voiceRow}>
              <Text style={[styles.controlLabel, {fontSize: scaleFontSize(typography.label)}]}>
                VOICE GUIDE
              </Text>
              <View style={styles.segmented}>
                <SelectPill
                  testID="voice-mother"
                  label="Mother Tree"
                  avatar={PERSONAS.mother.image}
                  selected={persona === 'mother'}
                  onPress={() => setPersona('mother')}
                  accessibilityLabel="Mother Tree, แค-นา, voice guide"
                />
                <SelectPill
                  testID="voice-father"
                  label="Father Tree"
                  avatar={PERSONAS.father.image}
                  selected={persona === 'father'}
                  onPress={() => setPersona('father')}
                  accessibilityLabel="Father Tree, ยางนา, voice guide"
                />
              </View>
              <SelectPill
                testID="voice-toggle"
                label={voiceOn ? 'Voice on' : 'Voice off'}
                selected={voiceOn}
                onPress={() => setVoiceOn(value => !value)}
                accessibilityLabel={
                  voiceOn ? 'Turn breath voice cues off' : 'Turn breath voice cues on'
                }
              />
            </View>

            <View style={styles.patternRow}>
              <Text style={[styles.controlLabel, {fontSize: scaleFontSize(typography.label)}]}>
                BREATH PATTERN
              </Text>
              {BREATH_PATTERN_IDS.map(id => (
                <SelectPill
                  key={id}
                  testID={`breath-pattern-${id}`}
                  label={BREATH_PATTERNS[id].label}
                  selected={pattern === id}
                  onPress={() => {
                    setPattern(id);
                    resetClock();
                  }}
                  accessibilityLabel={`${BREATH_PATTERNS[id].label} breathing pattern`}
                />
              ))}
            </View>

            <View style={styles.orbWrap}>
              <BreathOrb
                progress={progress}
                label={position.phase.label.toUpperCase()}
                seconds={null}
                active={running}
                size={356}
              />
            </View>

            <View style={[styles.statusPill, running && styles.statusPillLive]}>
              <View style={[styles.statusDot, running && styles.statusDotLive]} />
              <Text style={[styles.statusLabel, {fontSize: scaleFontSize(typography.label)}]}>
                {statusText}
              </Text>
            </View>

            <View style={styles.cueRow}>
              <Image source={PERSONAS[persona].image} style={styles.cueAvatar} resizeMode="cover" />
              <Text style={[styles.cueText, {fontSize: scaleFontSize(typography.body)}]}>
                {cueTextFor(phaseKey)}
              </Text>
            </View>

            <Text style={[styles.pace, {fontSize: scaleFontSize(typography.label)}]}>
              {`${BREATH_PATTERNS[pattern].label} · Cycle ${position.cycles + 1} · ${round}s round`}
            </Text>
            <Text style={[styles.paceMuted, {fontSize: scaleFontSize(typography.label)}]}>
              {paceLine(pattern)}
            </Text>

            <View style={styles.clockRow}>
              <Text style={[styles.clock, {fontSize: scaleFontSize(typography.display)}]}>
                {clock}
              </Text>
              <Text style={[styles.clockLabel, {fontSize: scaleFontSize(typography.caption)}]}>
                {clockLabel}
              </Text>
            </View>

            <View style={styles.controlsRow}>
              <Text style={[styles.controlLabel, {fontSize: scaleFontSize(typography.label)}]}>
                SESSION LENGTH
              </Text>
              {SESSION_LENGTHS.map(minutes => (
                <SelectPill
                  key={minutes}
                  testID={`session-${minutes}`}
                  label={minutes === 0 ? 'No timer' : `${minutes} min`}
                  selected={sessionMinutes === minutes}
                  onPress={() => {
                    setSessionMinutes(minutes);
                    resetClock();
                  }}
                  accessibilityLabel={
                    minutes === 0 ? 'Open session, no timer' : `${minutes} minute session`
                  }
                />
              ))}
              <View style={styles.controlActions}>
                <SelectPill
                  testID="breath-toggle"
                  label={primaryLabel}
                  selected
                  emphasis
                  preferred
                  onPress={toggleSession}
                  accessibilityLabel={running ? 'Pause the breath pacer' : 'Begin the breath pacer'}
                />
                <SelectPill
                  testID="breath-reset"
                  label="Reset"
                  selected={false}
                  onPress={resetClock}
                  accessibilityLabel="Reset the breath pacer"
                />
              </View>
            </View>
          </View>

          <View style={styles.right}>
            <View style={styles.listHeader}>
              <Text style={[styles.listTitle, {fontSize: scaleFontSize(typography.label)}]}>
                GUIDED MEDITATION
              </Text>
              <Text style={[styles.listCount, {fontSize: scaleFontSize(typography.label)}]}>
                {`${MEDITATION_GUIDES.length} guides`}
              </Text>
            </View>

            <View style={styles.listCard}>
              {MEDITATION_GUIDES.map((guide, index) => (
                <GuideRow
                  key={guide.id}
                  guide={guide}
                  divider={index < MEDITATION_GUIDES.length - 1}
                  onPress={() => {
                    setRunning(false);
                    cueAudioRef.current?.pause();
                    setSelected(guide);
                  }}
                />
              ))}
            </View>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.surface,
    paddingHorizontal: scaleWidth(layout.insetX),
    paddingVertical: scaleHeight(layout.insetY),
    overflow: 'hidden',
  },
  canopyTop: {
    position: 'absolute',
    top: -scaleHeight(220),
    left: -scaleWidth(120),
    right: -scaleWidth(120),
    height: scaleHeight(420),
    borderRadius: scaleWidth(radius.lg) * 4,
    backgroundColor: 'rgba(27, 94, 60, 0.35)',
  },
  canopyBottom: {
    position: 'absolute',
    bottom: -scaleHeight(300),
    left: -scaleWidth(160),
    right: -scaleWidth(160),
    height: scaleHeight(460),
    borderRadius: scaleWidth(radius.lg) * 4,
    backgroundColor: 'rgba(113, 160, 143, 0.12)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  eyebrow: {
    color: color.accent,
    fontWeight: '800',
    letterSpacing: 3,
  },
  title: {
    color: color.text,
    fontWeight: '700',
    letterSpacing: -1,
    paddingTop: scaleHeight(space.xxs) / 2,
  },
  subtitle: {
    color: color.textMuted,
    paddingTop: scaleHeight(space.xxs) / 2,
  },
  back: {
    minHeight: scaleHeight(focus.target),
    justifyContent: 'center',
    borderWidth: scaleWidth(focus.ringWidth),
    borderRadius: scaleWidth(radius.pill),
    paddingHorizontal: scaleWidth(space.md),
  },
  backLabel: {
    color: color.text,
    fontWeight: '700',
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    gap: scaleWidth(space.lg),
    paddingTop: scaleHeight(space.xs),
  },
  left: {
    flex: 1,
  },
  right: {
    width: scaleWidth(600),
    paddingTop: scaleHeight(space.xxs),
  },
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleWidth(space.xxs),
  },
  segmented: {
    flexDirection: 'row',
    gap: scaleWidth(space.xxs),
    padding: scaleWidth(4),
    borderRadius: scaleWidth(radius.pill),
    borderWidth: scaleWidth(1),
    borderColor: color.border,
    backgroundColor: 'rgba(0, 31, 22, 0.55)',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleWidth(10),
    minHeight: scaleHeight(46),
    paddingHorizontal: scaleWidth(space.xs),
    borderRadius: scaleWidth(radius.pill),
    // The ring band is always reserved and always 2px, so focusing a pill
    // changes its colour only and never reflows the row.
    borderWidth: scaleWidth(2),
    borderColor: 'transparent',
  },
  pillSelected: {
    backgroundColor: color.clay,
    borderColor: color.clay,
  },
  pillEmphasis: {
    minHeight: scaleHeight(58),
    paddingHorizontal: scaleWidth(space.lg),
  },
  /**
   * Only the colour changes: keeping the selected fill means a focused pill
   * still reads as the chosen one. White is the one ring that survives both the
   * clay fill and the dark page behind the row.
   */
  pillFocused: {
    borderColor: color.text,
  },
  pillAvatar: {
    width: scaleWidth(28),
    height: scaleWidth(28),
    borderRadius: scaleWidth(14),
  },
  pillLabel: {
    color: color.textMuted,
    fontWeight: '700',
  },
  pillLabelSelected: {
    color: color.surface,
    fontWeight: '800',
  },
  orbWrap: {
    alignItems: 'center',
    paddingTop: scaleHeight(space.xxs),
  },
  patternRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleWidth(space.xxs),
    paddingTop: scaleHeight(space.xxs),
  },
  statusPill: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleWidth(10),
    paddingHorizontal: scaleWidth(space.xs),
    paddingVertical: scaleHeight(6),
    borderRadius: scaleWidth(radius.pill),
    borderWidth: scaleWidth(1),
    borderColor: color.border,
    backgroundColor: color.surfaceInner,
  },
  statusPillLive: {
    borderColor: color.clay,
  },
  statusDot: {
    width: scaleWidth(8),
    height: scaleWidth(8),
    borderRadius: scaleWidth(4),
    backgroundColor: color.textMuted,
  },
  statusDotLive: {
    backgroundColor: color.clay,
  },
  statusLabel: {
    color: color.text,
    fontWeight: '800',
    letterSpacing: 2,
  },
  cueRow: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleWidth(space.xs),
    paddingTop: scaleHeight(space.xxs),
  },
  cueAvatar: {
    width: scaleWidth(32),
    height: scaleWidth(32),
    borderRadius: scaleWidth(16),
  },
  cueText: {
    color: color.text,
    fontWeight: '600',
  },
  pace: {
    textAlign: 'center',
    color: color.textMuted,
    paddingTop: scaleHeight(space.xxs),
  },
  paceMuted: {
    textAlign: 'center',
    color: 'rgba(160, 209, 190, 0.62)',
    paddingTop: scaleHeight(2),
  },
  clockRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: scaleWidth(space.xs),
    paddingTop: scaleHeight(space.xxs),
  },
  clock: {
    color: color.text,
    fontWeight: '700',
    letterSpacing: -2,
  },
  clockLabel: {
    color: color.textMuted,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleWidth(space.xxs),
    paddingTop: scaleHeight(space.xxs),
  },
  controlLabel: {
    width: scaleWidth(300),
    color: color.textMuted,
    fontWeight: '800',
    letterSpacing: 1,
  },
  controlActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleWidth(space.xxs),
    marginLeft: scaleWidth(space.md),
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: scaleHeight(space.xxs),
  },
  listTitle: {
    color: color.accent,
    fontWeight: '800',
    letterSpacing: 2,
  },
  listCount: {
    color: color.textMuted,
  },
  listCard: {
    flex: 1,
    borderRadius: scaleWidth(radius.md),
    borderWidth: scaleWidth(1),
    borderColor: color.border,
    backgroundColor: 'rgba(0, 54, 41, 0.72)',
    paddingHorizontal: scaleWidth(space.xs),
    paddingVertical: scaleHeight(4),
    overflow: 'hidden',
  },
  guideRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleWidth(space.xs),
    paddingHorizontal: scaleWidth(space.xs),
    borderRadius: scaleWidth(radius.md),
    // Reserved ring band, so walking the list does not resize the rows.
    borderWidth: scaleWidth(2),
    borderColor: 'transparent',
  },
  guideRowFocused: {
    backgroundColor: color.surfaceRaise,
    borderColor: color.text,
  },
  guideDivider: {
    borderBottomWidth: scaleWidth(1),
    borderBottomColor: color.border,
  },
  guideThumb: {
    width: scaleWidth(64),
    height: scaleWidth(64),
    borderRadius: scaleWidth(32),
    backgroundColor: color.surfaceInner,
  },
  guideText: {
    flex: 1,
  },
  guideTitle: {
    color: color.text,
    fontWeight: '700',
  },
  guideMeta: {
    color: color.textMuted,
    paddingTop: scaleHeight(2),
  },
  guidePlayChip: {
    width: scaleWidth(46),
    height: scaleWidth(46),
    borderRadius: scaleWidth(23),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.clay,
  },
  guidePlay: {
    color: color.surface,
    fontWeight: '800',
    paddingLeft: scaleWidth(2),
  },
});
