import React, {useEffect, useRef, useState} from 'react';
import {Animated, Easing, StyleSheet, View} from 'react-native';
import type {StyleProp, TextStyle, ViewStyle} from 'react-native';
import {
  color,
  scaleHeight,
  scaleWidth,
  space,
} from '@multitv/shared';
import {useReducedMotion} from '../home/MascotStage';

/**
 * The small beats that make a score feel earned.
 *
 * `RewardBurst` is the full-screen moment; these are the pieces a screen keeps
 * on itself - a number that rolls up, a block that pops in, confetti behind a
 * winner. All of them are `Animated` only and none of them can take the
 * remote: the confetti layer is `pointerEvents="none"`.
 */

export interface CountUpProps {
  value: number;
  /** How long the roll takes. Four digits still read at 720 ms. */
  durationMs?: number;
  delayMs?: number;
  prefix?: string;
  suffix?: string;
  style?: StyleProp<TextStyle>;
  testID?: string;
}

/** A score that rolls up instead of appearing whole. */
export const CountUp = ({
  value,
  durationMs = 720,
  delayMs = 0,
  prefix = '',
  suffix = '',
  style,
  testID,
}: CountUpProps) => {
  const reduced = useReducedMotion();
  const counter = useRef(new Animated.Value(reduced ? value : 0)).current;
  const [shown, setShown] = useState(reduced ? value : 0);

  useEffect(() => {
    if (reduced) {
      setShown(value);
      return undefined;
    }
    const listener = counter.addListener(({value: next}) =>
      setShown(Math.max(0, Math.round(next))),
    );
    counter.setValue(0);
    const roll = Animated.timing(counter, {
      toValue: value,
      duration: durationMs,
      delay: delayMs,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    roll.start();
    return () => {
      roll.stop();
      counter.removeListener(listener);
    };
  }, [counter, delayMs, durationMs, reduced, value]);

  return (
    <Animated.Text testID={testID} style={style}>
      {`${prefix}${shown}${suffix}`}
    </Animated.Text>
  );
};

export interface PopInProps {
  /** Change this to replay the pop - a round id, an answer key, a score. */
  trigger?: string | number;
  delayMs?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  children: React.ReactNode;
}

/**
 * The house entrance: 320 ms cubic, scale `[0.86, 1.16, 1]` with a short hop.
 * The same curve `RewardBurst` and the standings use, so every screen moves
 * alike. Reduce Motion draws the final frame immediately.
 */
export const PopIn = ({
  trigger,
  delayMs = 0,
  style,
  testID,
  children,
}: PopInProps) => {
  const reduced = useReducedMotion();
  const enter = useRef(new Animated.Value(reduced ? 1 : 0)).current;

  useEffect(() => {
    if (reduced) {
      enter.setValue(1);
      return undefined;
    }
    enter.setValue(0);
    const pop = Animated.timing(enter, {
      toValue: 1,
      duration: 320,
      delay: delayMs,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    pop.start();
    return () => pop.stop();
  }, [delayMs, enter, reduced, trigger]);

  const pop = enter.interpolate({
    inputRange: [0, 0.45, 1],
    outputRange: [0.86, 1.16, 1],
  });
  const lift = enter.interpolate({
    inputRange: [0, 0.45, 1],
    outputRange: [scaleHeight(space.sm), -scaleHeight(space.xxs), 0],
  });

  return (
    <Animated.View
      testID={testID}
      style={[
        style,
        {opacity: enter, transform: [{translateY: lift}, {scale: pop}]},
      ]}>
      {children}
    </Animated.View>
  );
};

/** Enough pieces to read as a shower on a 1080p panel, few enough to animate. */
const PIECES = 14;
const FALL_MS = 1500;
const FALL_DISTANCE = 620;

/**
 * Gold and mint paper falling behind a winner. One shot, not a loop: the TV
 * should not keep animating after the moment has landed.
 */
export const Confetti = ({testID = 'confetti'}: {testID?: string}) => {
  const reduced = useReducedMotion();
  const pieces = useRef(
    Array.from({length: PIECES}, () => new Animated.Value(0)),
  ).current;

  useEffect(() => {
    if (reduced) {
      return undefined;
    }
    const fall = Animated.stagger(
      45,
      pieces.map(piece =>
        Animated.timing(piece, {
          toValue: 1,
          duration: FALL_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: false,
        }),
      ),
    );
    fall.start();
    return () => fall.stop();
  }, [pieces, reduced]);

  if (reduced) {
    return null;
  }

  return (
    <View
      testID={testID}
      pointerEvents="none"
      accessible={false}
      style={styles.confetti}>
      {pieces.map((piece, index) => (
        <Animated.View
          key={index}
          style={[
            styles.piece,
            {
              left: `${(index * 37) % 96}%`,
              backgroundColor: index % 2 === 0 ? color.gold : color.accent,
              opacity: piece.interpolate({
                inputRange: [0, 0.1, 0.8, 1],
                outputRange: [0, 1, 1, 0],
              }),
              transform: [
                {
                  translateY: piece.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-scaleHeight(40), scaleHeight(FALL_DISTANCE)],
                  }),
                },
                {
                  translateX: piece.interpolate({
                    inputRange: [0, 0.33, 0.66, 1],
                    outputRange: [0, scaleWidth(18), -scaleWidth(14), 0],
                  }),
                },
                {
                  rotate: piece.interpolate({
                    inputRange: [0, 1],
                    outputRange: [
                      '0deg',
                      `${(index % 2 === 0 ? 1 : -1) * 240}deg`,
                    ],
                  }),
                },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  confetti: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  piece: {
    position: 'absolute',
    top: 0,
    width: scaleWidth(14),
    height: scaleWidth(26),
    borderRadius: scaleWidth(3),
  },
});
