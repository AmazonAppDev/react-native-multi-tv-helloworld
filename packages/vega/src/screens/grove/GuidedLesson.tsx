import React, {useEffect, useRef, useState} from 'react';
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  color,
  focus,
  radius,
  scaleFontSize,
  scaleHeight,
  scaleWidth,
  space,
  typography,
} from '@multitv/shared';
import {PodcastAudio, sharedPodcastAudio} from '../player/podcastAudio';
import {HandoffNotice, useHandoff} from '../player/HandoffNotice';
import type {HandoffRelay} from '../player/HandoffNotice';
import {
  guideMinutes,
  PERSONAS,
  turnPersona,
  turnText,
  turnUrl,
  type MeditationGuide,
} from './meditations';

export interface GuidedLessonProps {
  guide: MeditationGuide;
  onClose: () => void;
  /** Injected in tests; the app uses the device-id backed voice relay. */
  relay?: HandoffRelay;
}

const READ_ALONG =
  'Read-along — the voice could not play. The words are below.';

const failure = (message?: string) =>
  message ? `${READ_ALONG} ${message}` : READ_ALONG;

/**
 * The duration the Skill's PlayMeditationIntent speaks, or null for the short
 * grounding lesson. The guides are named after their length, so the id is the
 * only exact source: a computed minute count may round to 9 or 31.
 */
const handoffMinutes = (guide: MeditationGuide): number | null => {
  switch (guide.id) {
    case 'ten':
      return 10;
    case 'fifteen':
      return 15;
    case 'thirty':
      return 30;
    default:
      return null;
  }
};

/**
 * One guided meditation, played turn by turn from the production voice files.
 * Audio runs through the same PodcastAudio player used by the podcast screen.
 */
export const GuidedLesson = ({guide, onClose, relay}: GuidedLessonProps) => {
  const [turnIndex, setTurnIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [finished, setFinished] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const handoff = useHandoff(relay);

  const audioRef = useRef<PodcastAudio | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestRef = useRef(0);

  const parkForAlexa = () => {
    void handoff.park({
      type: 'meditation',
      minutes: handoffMinutes(guide),
      guideId: guide.id,
    });
  };

  const getAudio = () => {
    if (audioRef.current === null) {
      audioRef.current = sharedPodcastAudio();
    }
    return audioRef.current;
  };

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  async function playTurn(index: number) {
    const turn = guide.turns[index];
    const request = ++requestRef.current;
    clearTimer();
    setTurnIndex(index);
    setHasPlayed(true);
    setFinished(false);
    setStatus(null);
    handoff.reset();

    const result = await getAudio().start(turnUrl(turn), 0, {
      onEnded: () => {
        if (request !== requestRef.current) {
          return;
        }
        timerRef.current = setTimeout(() => {
          if (request !== requestRef.current) {
            return;
          }
          if (index + 1 < guide.turns.length) {
            void playTurn(index + 1);
          } else {
            setPlaying(false);
            setFinished(true);
            setStatus('Nothing was asked of you here. The grove stays open.');
          }
        }, turn.pauseSeconds * 1000);
      },
      onError: (message, reason) => {
        if (request !== requestRef.current) {
          return;
        }
        setPlaying(false);
        setStatus(failure(message));
        // The unsupported case is this device having no audio sink, not the
        // file being broken; the Echo is the only way this lesson is heard.
        if (reason === 'unsupported') {
          parkForAlexa();
        }
      },
    });

    if (request !== requestRef.current) {
      return;
    }
    if (!result.started) {
      setPlaying(false);
      setStatus(failure(result.message));
      if (result.unavailable) {
        parkForAlexa();
      }
      return;
    }
    setPlaying(true);
  }

  function pause() {
    requestRef.current++;
    clearTimer();
    audioRef.current?.pause();
    setPlaying(false);
  }

  function toggle() {
    if (playing) {
      pause();
      return;
    }
    void playTurn(finished ? 0 : turnIndex);
  }

  function goTo(index: number) {
    if (index < 0 || index >= guide.turns.length) {
      return;
    }
    const wasPlaying = playing;
    requestRef.current++;
    clearTimer();
    audioRef.current?.pause();
    setTurnIndex(index);
    setFinished(false);
    setStatus(null);
    if (wasPlaying) {
      void playTurn(index);
    }
  }

  useEffect(
    () => () => {
      requestRef.current++;
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
      audioRef.current?.pause();
    },
    [],
  );

  const turn = guide.turns[turnIndex];
  const persona = PERSONAS[turnPersona(turn)];
  const statusLabel = playing
    ? 'Guiding'
    : finished
      ? 'Session complete'
      : hasPlayed
        ? 'Paused'
        : 'Ready';
  const primaryLabel = playing ? 'Pause' : finished ? 'Begin again' : 'Begin';

  const renderButton = (
    id: string,
    label: string,
    onPress: () => void,
    options: {primary?: boolean; disabled?: boolean; preferred?: boolean} = {},
  ) => {
    const isFocused = focused === id;
    const disabled = options.disabled === true;
    return (
      <TouchableOpacity
        testID={`lesson-${id}`}
        activeOpacity={1}
        hasTVPreferredFocus={options.preferred}
        accessibilityRole="button"
        /**
         * Inert rather than `disabled`: on Vega a disabled node cannot hold the
         * ring, so disabling the focused turn button drops focus out of the
         * lesson entirely. It stays focusable and the press is ignored instead.
         */
        accessibilityState={{disabled}}
        accessibilityLabel={
          id === 'toggle'
            ? playing
              ? 'Pause the lesson'
              : 'Begin the lesson'
            : id === 'change'
              ? 'Choose a different meditation guide'
              : label
        }
        onPress={() => {
          if (!disabled) {
            onPress();
          }
        }}
        onFocus={() => setFocused(id)}
        onBlur={() => setFocused(null)}
        style={[
          styles.button,
          options.primary && styles.buttonPrimary,
          isFocused && styles.buttonFocused,
          options.disabled && styles.buttonDisabled,
        ]}>
        <Text
          style={[
            styles.buttonLabel,
            options.primary && styles.buttonLabelPrimary,
            {fontSize: scaleFontSize(typography.caption)},
          ]}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.root} testID="guided-lesson">
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={[styles.eyebrow, {fontSize: scaleFontSize(typography.label)}]}>
            GUIDED LESSON
          </Text>
          <Text style={[styles.title, {fontSize: scaleFontSize(typography.headline)}]}>
            {guide.title}
          </Text>
          <Text style={[styles.subtitle, {fontSize: scaleFontSize(typography.caption)}]}>
            {`${guide.turns.length} turns · ${guideMinutes(guide)} min · led by ${PERSONAS[guide.guide].displayName}`}
          </Text>
        </View>
        <View style={styles.counter}>
          <Text style={[styles.counterValue, {fontSize: scaleFontSize(typography.title)}]}>
            {`${turnIndex + 1} / ${guide.turns.length}`}
          </Text>
          <Text style={[styles.counterLabel, {fontSize: scaleFontSize(typography.label)}]}>
            TURN
          </Text>
        </View>
      </View>

      <View style={styles.progressRow}>
        {guide.turns.map((item, index) => (
          <View
            key={item.tag}
            style={[
              styles.progressSegment,
              index < turnIndex && styles.progressPast,
              index === turnIndex && styles.progressCurrent,
            ]}
          />
        ))}
      </View>

      <View style={styles.body}>
        <View style={styles.avatarColumn}>
          <View style={styles.avatarGlow} />
          <Image source={persona.image} style={styles.avatar} resizeMode="contain" />
          <Text style={[styles.avatarName, {fontSize: scaleFontSize(typography.title)}]}>
            {persona.displayName}
          </Text>
          <Text style={[styles.avatarMeta, {fontSize: scaleFontSize(typography.caption)}]}>
            {`${persona.nameThai} · ${persona.nameLatin}`}
          </Text>
          <View style={[styles.statusPill, playing && styles.statusPillLive]}>
            <View style={[styles.statusDot, playing && styles.statusDotLive]} />
            <Text
              style={[styles.statusLabel, {fontSize: scaleFontSize(typography.label)}]}>
              {statusLabel.toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={styles.turnCard}>
          <Text style={[styles.turnLabel, {fontSize: scaleFontSize(typography.label)}]}>
            {playing ? 'LISTEN' : 'THE WORDS'}
          </Text>
          <Text style={[styles.turnText, {fontSize: scaleFontSize(typography.body)}]}>
            {turnText(turn)}
          </Text>
          <Text style={[styles.hint, {fontSize: scaleFontSize(typography.label)}]}>
            {status ??
              'Each turn plays in the recorded voice of the guardian who speaks it.'}
          </Text>
          <HandoffNotice state={handoff.state} testID="lesson-handoff" />
        </View>
      </View>

      <View style={styles.controls}>
        {renderButton('prev', '‹ Previous turn', () => goTo(turnIndex - 1), {
          disabled: turnIndex === 0,
        })}
        {renderButton('toggle', `${primaryLabel}`, toggle, {
          primary: true,
          preferred: true,
        })}
        {renderButton('next', 'Next turn ›', () => goTo(turnIndex + 1), {
          disabled: turnIndex === guide.turns.length - 1,
        })}
        <View style={styles.controlsSpacer} />
        {renderButton('change', 'Change guide', onClose)}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingTop: scaleHeight(space.xs),
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerText: {
    flex: 1,
    paddingRight: scaleWidth(space.md),
  },
  eyebrow: {
    color: color.accent,
    fontWeight: '800',
    letterSpacing: 3,
  },
  title: {
    color: color.text,
    fontWeight: '700',
    letterSpacing: -0.5,
    paddingTop: scaleHeight(space.xxs) / 2,
  },
  subtitle: {
    color: color.textMuted,
    paddingTop: scaleHeight(space.xxs) / 2,
  },
  counter: {
    alignItems: 'flex-end',
  },
  counterValue: {
    color: color.accent,
    fontWeight: '700',
  },
  counterLabel: {
    color: color.textMuted,
    fontWeight: '800',
    letterSpacing: 3,
  },
  progressRow: {
    flexDirection: 'row',
    gap: scaleWidth(6),
    paddingTop: scaleHeight(space.xs),
  },
  progressSegment: {
    flex: 1,
    height: scaleHeight(6),
    borderRadius: scaleHeight(3),
    backgroundColor: 'rgba(248, 249, 250, 0.1)',
  },
  progressPast: {
    backgroundColor: color.textMuted,
  },
  progressCurrent: {
    backgroundColor: color.clay,
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    gap: scaleWidth(space.lg),
    paddingVertical: scaleHeight(space.sm),
  },
  avatarColumn: {
    width: scaleWidth(300),
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarGlow: {
    position: 'absolute',
    top: scaleHeight(10),
    width: scaleWidth(260),
    height: scaleWidth(260),
    borderRadius: scaleWidth(130),
    backgroundColor: color.accent,
    opacity: 0.12,
  },
  avatar: {
    width: scaleWidth(270),
    height: scaleHeight(330),
  },
  avatarName: {
    color: color.text,
    fontWeight: '700',
  },
  avatarMeta: {
    color: color.textMuted,
    paddingTop: scaleHeight(2),
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleWidth(8),
    paddingHorizontal: scaleWidth(space.xs),
    paddingVertical: scaleHeight(6),
    borderRadius: scaleWidth(radius.pill),
    backgroundColor: color.surfaceInner,
    borderWidth: scaleWidth(1),
    borderColor: color.border,
    marginTop: scaleHeight(space.xxs),
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
  turnCard: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: color.surfaceInner,
    borderRadius: scaleWidth(radius.md),
    borderWidth: scaleWidth(1),
    borderColor: color.border,
    paddingHorizontal: scaleWidth(space.md),
    paddingVertical: scaleHeight(space.sm),
  },
  turnLabel: {
    color: color.accent,
    fontWeight: '800',
    letterSpacing: 3,
  },
  turnText: {
    color: color.text,
    lineHeight: scaleFontSize(typography.body) * 1.5,
    paddingTop: scaleHeight(space.xs),
  },
  hint: {
    color: color.textMuted,
    paddingTop: scaleHeight(space.sm),
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleWidth(space.xs),
  },
  controlsSpacer: {
    flex: 1,
  },
  button: {
    minHeight: scaleHeight(focus.target),
    justifyContent: 'center',
    borderRadius: scaleWidth(radius.pill),
    borderWidth: scaleWidth(2),
    borderColor: color.border,
    paddingHorizontal: scaleWidth(space.sm),
  },
  buttonPrimary: {
    backgroundColor: color.clay,
    borderColor: color.clay,
    paddingHorizontal: scaleWidth(space.lg),
  },
  buttonFocused: {
    borderWidth: scaleWidth(focus.ringWidth),
    borderColor: color.text,
  },
  buttonDisabled: {
    opacity: 0.35,
  },
  buttonLabel: {
    color: color.text,
    fontWeight: '700',
  },
  buttonLabelPrimary: {
    color: color.surface,
    fontWeight: '800',
  },
});
