import React, {useEffect, useRef, useState} from 'react';
import {Animated, Easing, StyleSheet, Text, View} from 'react-native';
import {
  color,
  layout,
  radius,
  scaleFontSize,
  scaleHeight,
  scaleWidth,
  space,
  typography,
} from '@multitv/shared';
import {MASCOT_NAME, MascotStage, useReducedMotion} from '../home/MascotStage';
import type {MascotId} from '../home/MascotStage';
import {playRewardCue} from './rewardSfx';
import type {RewardCue} from './rewardSfx';

export type RewardVariant = RewardCue;

export interface RewardBurstProps {
  /** `match` is the compact burst; `perfect` fills the screen for a run. */
  variant?: RewardVariant;
  /** Which baby guardian celebrates; alternate them so both are seen. */
  mascot: Exclude<MascotId, 'mother-tree'>;
  /** Tokens credited by this moment. The chip counts up to it. */
  amount: number;
  /** Small caps above the score, e.g. "PAIR FOUND". */
  label?: string;
  /** The running score, e.g. "3 / 6 PAIRS". */
  score?: string;
  /** Overrides the hold time, for a moment shorter than a whole run. */
  durationMs?: number;
  /** What `amount` counts, e.g. "POINTS" when a round pays no tokens. */
  unitLabel?: string;
  onDone?: () => void;
  testID?: string;
}

const SPARKS = 8;
/** Visible time before the overlay fades out. */
const MATCH_MS = 1400;
const PERFECT_MS = 2600;
const EXIT_MS = 280;

/**
 * The Duolingo-shaped celebration, rebuilt on `Animated` only.
 *
 * The cues cloned from the reference: the mascot pops with a springy scale
 * (`1 + 0.16 sin(pi t)`) and a two-stage hop, one ring expands behind it and
 * fades, eight sparks fly outward, and the token count rolls up instead of
 * appearing whole. Reduced motion draws the same frame without movement.
 *
 * The overlay never takes the remote: `pointerEvents="none"` means focus stays
 * on the cards underneath while the burst plays over them.
 */
export const RewardBurst = ({
  variant = 'match',
  mascot,
  amount,
  label,
  score,
  durationMs,
  unitLabel = 'ECO TOKENS',
  onDone,
  testID = 'reward-burst',
}: RewardBurstProps) => {
  const reduced = useReducedMotion();
  const perfect = variant === 'perfect';
  const mascotSize = perfect ? 380 : 240;
  const mascotPx = scaleWidth(mascotSize);
  const holdMs = durationMs ?? (perfect ? PERFECT_MS : MATCH_MS);

  const enter = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const ring = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const counter = useRef(new Animated.Value(reduced ? amount : 0)).current;
  const sparks = useRef(
    Array.from({length: SPARKS}, () => new Animated.Value(reduced ? 1 : 0)),
  ).current;
  const [shown, setShown] = useState(reduced ? amount : 0);
  const [hopKey, setHopKey] = useState(0);

  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    playRewardCue(variant);
  }, [variant]);

  useEffect(() => {
    if (reduced) {
      setShown(amount);
      const still = setTimeout(() => doneRef.current?.(), holdMs);
      return () => clearTimeout(still);
    }

    const listener = counter.addListener(({value}) =>
      setShown(Math.max(0, Math.round(value))),
    );
    // Starts the mascot's own 160 ms / 220 ms hop now that it is mounted.
    setHopKey(1);

    const intro = Animated.parallel([
      Animated.timing(enter, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(ring, {
        toValue: 1,
        duration: 820,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(counter, {
        toValue: amount,
        duration: 640,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.stagger(
        40,
        sparks.map(value =>
          Animated.timing(value, {
            toValue: 1,
            duration: 620,
            easing: Easing.out(Easing.quad),
            useNativeDriver: false,
          }),
        ),
      ),
    ]);
    intro.start();

    const hold = setTimeout(() => {
      Animated.timing(enter, {
        toValue: 0,
        duration: EXIT_MS,
        easing: Easing.in(Easing.quad),
        useNativeDriver: false,
      }).start(({finished}) => {
        if (finished) {
          doneRef.current?.();
        }
      });
    }, holdMs);

    return () => {
      clearTimeout(hold);
      intro.stop();
      counter.removeListener(listener);
    };
  }, [amount, counter, enter, holdMs, perfect, reduced, ring, sparks]);

  const pop = enter.interpolate({
    inputRange: [0, 0.45, 1],
    outputRange: [0.86, 1.16, 1],
  });
  const lift = enter.interpolate({
    inputRange: [0, 0.45, 1],
    outputRange: [scaleHeight(space.sm), -scaleHeight(space.xxs), 0],
  });
  const chipPop = enter.interpolate({
    inputRange: [0, 0.6, 1],
    outputRange: [0.8, 1.06, 1],
  });
  const ringScale = ring.interpolate({
    inputRange: [0, 1],
    outputRange: [0.55, 1.9],
  });
  const ringOpacity = ring.interpolate({
    inputRange: [0, 0.12, 1],
    outputRange: [0, 0.9, 0],
  });
  const sparkDistance = mascotPx * 0.62;

  return (
    <Animated.View
      testID={testID}
      style={[styles.overlay, {opacity: enter}]}
      pointerEvents="none"
      accessible={false}>
      <Animated.View
        style={[styles.stage, {transform: [{translateY: lift}, {scale: pop}]}]}>
        <View
          style={[
            styles.frame,
            {width: mascotPx, height: mascotPx},
          ]}>
          <Animated.View
            style={[
              styles.ring,
              {
                width: mascotPx,
                height: mascotPx,
                borderRadius: mascotPx / 2,
                opacity: ringOpacity,
                transform: [{scale: ringScale}],
              },
            ]}
          />
          {sparks.map((value, index) => {
            const angle = (index / SPARKS) * Math.PI * 2;
            const dx = Math.sin(angle) * sparkDistance;
            const dy = -Math.cos(angle) * sparkDistance;
            return (
              <Animated.View
                key={index}
                style={[
                  styles.spark,
                  {
                    backgroundColor: index % 2 === 0 ? color.gold : color.accent,
                    opacity: value.interpolate({
                      inputRange: [0, 0.6, 1],
                      outputRange: [0, 1, 0],
                    }),
                    transform: [
                      {
                        translateX: value.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, dx],
                        }),
                      },
                      {
                        translateY: value.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, dy],
                        }),
                      },
                      {
                        scale: value.interpolate({
                          inputRange: [0, 0.4, 1],
                          outputRange: [0.4, 1.1, 0.3],
                        }),
                      },
                      {rotate: '45deg'},
                    ],
                  },
                ]}
              />
            );
          })}
          <MascotStage
            variant={mascot}
            size={mascotSize}
            hopKey={hopKey}
            testID={`${testID}-mascot`}
          />
        </View>
      </Animated.View>

      <Text
        style={[
          styles.label,
          {fontSize: scaleFontSize(typography.label)},
        ]}>
        {label ?? (perfect ? 'PERFECT RUN' : 'NICE MATCH')}
      </Text>

      {score ? (
        <Text
          style={[
            styles.score,
            {
              fontSize: scaleFontSize(typography.display),
              lineHeight: scaleFontSize(typography.display) * 1.1,
            },
          ]}>
          {score}
        </Text>
      ) : null}

      <Animated.View style={[styles.chip, {transform: [{scale: chipPop}]}]}>
        <Text
          testID={`${testID}-amount`}
          style={[
            styles.chipText,
            {fontSize: scaleFontSize(typography.title)},
          ]}>
          +{shown} {unitLabel}
        </Text>
      </Animated.View>

      <Text
        style={[
          styles.caption,
          {fontSize: scaleFontSize(typography.label)},
        ]}>
        {MASCOT_NAME[mascot].toUpperCase()} · GLOBIE GUARDIAN
      </Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  /**
   * The games pad their root by the layout insets, and absolute children are
   * placed inside that padding. The negative offsets take the dimmer back out
   * to the real screen edges.
   */
  overlay: {
    position: 'absolute',
    top: -scaleHeight(layout.insetY),
    bottom: -scaleHeight(layout.insetY),
    left: -scaleWidth(layout.insetX),
    right: -scaleWidth(layout.insetX),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 31, 22, 0.78)',
  },
  stage: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    borderWidth: scaleWidth(4),
    borderColor: color.gold,
    backgroundColor: 'rgba(255, 206, 77, 0.10)',
  },
  spark: {
    position: 'absolute',
    width: scaleWidth(12),
    height: scaleWidth(12),
    borderRadius: scaleWidth(3),
  },
  label: {
    color: color.textMuted,
    fontWeight: '800',
    letterSpacing: 4,
    marginTop: scaleHeight(space.xs),
  },
  score: {
    color: color.gold,
    fontWeight: '800',
    letterSpacing: 1,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: scaleHeight(space.xxs),
    paddingHorizontal: scaleWidth(space.md),
    paddingVertical: scaleHeight(space.xxs),
    borderRadius: scaleWidth(radius.pill),
    borderWidth: scaleWidth(2),
    borderColor: color.gold,
    backgroundColor: 'rgba(255, 206, 77, 0.14)',
  },
  chipText: {
    color: color.gold,
    fontWeight: '800',
    letterSpacing: 2,
  },
  caption: {
    color: color.textMuted,
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: scaleHeight(space.xxs),
  },
});
