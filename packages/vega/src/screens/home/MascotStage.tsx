import React, {useEffect, useRef, useState} from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  color,
  scaleFontSize,
  scaleWidth,
  space,
  typography,
} from '@multitv/shared';

export type MascotId = 'yang-na' | 'kae-na' | 'mother-tree';

const MASCOT_SOURCE: Record<MascotId, number> = {
  'yang-na': require('../../assets/brand/mascot-baby-yang-na.png'),
  'kae-na': require('../../assets/brand/mascot-baby-kae-na.png'),
  'mother-tree': require('../../assets/brand/guardian-kae-na.png'),
};

export const MASCOT_NAME: Record<MascotId, string> = {
  'yang-na': 'Yang Na',
  'kae-na': 'Kae Na',
  'mother-tree': 'Mother Tree',
};

/** Jest drives Animated timers outside act(); a still frame keeps CI quiet. */
const isTestEnvironment = (): boolean => {
  // `globalThis.jest` is not installed under the React Native preset, so the
  // environment variables Jest always sets are the reliable signal.
  const scope = globalThis as {
    jest?: unknown;
    process?: {env?: Record<string, string | undefined>};
  };
  return (
    typeof scope.jest !== 'undefined' ||
    scope.process?.env?.NODE_ENV === 'test' ||
    scope.process?.env?.JEST_WORKER_ID !== undefined
  );
};

/** Shared by the stage and the full-screen grove. */
export const useReducedMotion = (): boolean => {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (typeof AccessibilityInfo.isReduceMotionEnabled !== 'function') {
      return undefined;
    }
    AccessibilityInfo.isReduceMotionEnabled()
      .then(value => {
        if (mounted) {
          setReduced(Boolean(value));
        }
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  return reduced || isTestEnvironment();
};

export interface MascotStageProps {
  variant: MascotId;
  /** Stage size in 1920 x 1080 design units. */
  size?: number;
  /** Uppercase caption under the pedestal. */
  label?: string;
  /** Change this key to make the mascot hop, e.g. on a hero change. */
  hopKey?: string | number;
  testID?: string;
}

/**
 * Baby guardian on a holo pedestal.
 *
 * Ported from the web QuestMascotStage: the sway, bob and orbit are ambient and
 * never touch a focus ring. Everything stops on unmount, and reduced motion
 * freezes the stage on one legible frame.
 */
export const MascotStage = ({
  variant,
  size = 180,
  label,
  hopKey,
  testID,
}: MascotStageProps) => {
  const reduced = useReducedMotion();
  const ambient = useRef(new Animated.Value(0)).current;
  const orbit = useRef(new Animated.Value(0)).current;
  const hop = useRef(new Animated.Value(0)).current;
  const lastHop = useRef(hopKey);

  const sizePx = scaleWidth(size);
  const ringWidth = sizePx * 0.92;
  const ringHeight = sizePx * 0.24;
  const dot = scaleWidth(7);

  useEffect(() => {
    if (reduced) {
      ambient.setValue(0.5);
      orbit.setValue(0);
      return undefined;
    }
    const ambientLoop = Animated.loop(
      Animated.timing(ambient, {
        toValue: 1,
        duration: 6000,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    );
    const orbitLoop = Animated.loop(
      Animated.timing(orbit, {
        toValue: 1,
        duration: 9000,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    );
    ambientLoop.start();
    orbitLoop.start();
    return () => {
      ambientLoop.stop();
      orbitLoop.stop();
    };
  }, [ambient, orbit, reduced]);

  useEffect(() => {
    if (lastHop.current === hopKey) {
      return undefined;
    }
    lastHop.current = hopKey;
    if (reduced) {
      hop.setValue(0);
      return undefined;
    }
    hop.setValue(0);
    const animation = Animated.sequence([
      Animated.timing(hop, {
        toValue: 0.5,
        duration: 160,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }),
      Animated.timing(hop, {
        toValue: 1,
        duration: 220,
        easing: Easing.in(Easing.quad),
        useNativeDriver: false,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [hop, hopKey, reduced]);

  const rotate = ambient.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['-2.4deg', '2.4deg', '-2.4deg'],
  });
  const bob = ambient.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, -sizePx * 0.035, 0],
  });
  const breathe = ambient.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.02, 1],
  });
  const hopY = hop.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, -sizePx * 0.14, 0],
  });
  const ringScale = ambient.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.97, 1.05, 0.97],
  });
  const ringOpacity = ambient.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.45, 0.9, 0.45],
  });
  const orbitRotate = orbit.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const name = MASCOT_NAME[variant];

  return (
    <View
      style={styles.root}
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${name}, a guardian of the Globie Earth grove`}>
      <View style={[styles.stage, {width: sizePx, height: sizePx * 0.98}]}>
        <View
          style={[
            styles.ringHalo,
            {
              width: ringWidth * 1.1,
              height: ringHeight * 1.35,
              borderRadius: ringHeight,
              marginLeft: -ringWidth * 0.55,
            },
          ]}
          pointerEvents="none"
          accessible={false}
        />
        <Animated.View
          style={[
            styles.ring,
            {
              width: ringWidth,
              height: ringHeight,
              borderRadius: ringHeight / 2,
              marginLeft: -ringWidth / 2,
              opacity: ringOpacity,
              transform: [{scale: ringScale}],
            },
          ]}
          pointerEvents="none"
          accessible={false}
        />
        <Animated.View
          style={[
            styles.orbit,
            {
              width: ringWidth,
              height: ringWidth * 0.8,
              marginLeft: -ringWidth / 2,
              transform: [{rotate: orbitRotate}],
            },
          ]}
          pointerEvents="none"
          accessible={false}>
          {[0, 120, 240].map(angle => {
            const radians = (angle * Math.PI) / 180;
            const radius = ringWidth * 0.44;
            return (
              <View
                key={angle}
                style={[
                  styles.mote,
                  {
                    width: dot,
                    height: dot,
                    borderRadius: dot / 2,
                    left: ringWidth / 2 - dot / 2 + Math.sin(radians) * radius,
                    top:
                      ringWidth * 0.4 -
                      dot / 2 -
                      Math.cos(radians) * radius * 0.52,
                  },
                ]}
              />
            );
          })}
        </Animated.View>
        <Animated.View
          style={[
            styles.mascot,
            {
              width: sizePx * 0.72,
              height: sizePx * 0.84,
              bottom: sizePx * 0.12,
              marginLeft: -sizePx * 0.36,
              transform: [
                {translateY: hopY},
                {translateY: bob},
                {rotate},
                {scale: breathe},
              ],
            },
          ]}
          pointerEvents="none"
          accessible={false}>
          <Image
            source={MASCOT_SOURCE[variant]}
            style={styles.image}
            resizeMode="contain"
            accessible={false}
          />
        </Animated.View>
      </View>
      {label ? (
        <Text
          style={[styles.label, {fontSize: scaleFontSize(typography.label)}]}
          numberOfLines={1}>
          {label}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
  },
  stage: {
    justifyContent: 'flex-end',
  },
  ringHalo: {
    position: 'absolute',
    bottom: -scaleWidth(space.xxs),
    left: '50%',
    backgroundColor: 'rgba(187, 221, 218, 0.05)',
    borderWidth: scaleWidth(1),
    borderColor: 'rgba(187, 221, 218, 0.2)',
  },
  ring: {
    position: 'absolute',
    bottom: 0,
    left: '50%',
    borderWidth: scaleWidth(3),
    borderColor: color.accent,
    backgroundColor: 'rgba(187, 221, 218, 0.06)',
  },
  orbit: {
    position: 'absolute',
    bottom: scaleWidth(space.xxs),
    left: '50%',
  },
  mote: {
    position: 'absolute',
    backgroundColor: color.accent,
    opacity: 0.85,
  },
  mascot: {
    position: 'absolute',
    left: '50%',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  label: {
    color: color.accent,
    fontWeight: '800',
    letterSpacing: 1.6,
    paddingTop: scaleWidth(space.xxs),
  },
});
