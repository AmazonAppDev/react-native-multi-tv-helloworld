import React from 'react';
import {Animated, StyleSheet, Text, View} from 'react-native';
import {color, scaleFontSize, scaleWidth, typography} from '@multitv/shared';

export interface BreathOrbProps {
  progress: Animated.Value;
  label: string;
  seconds: string | null;
  active: boolean;
  size?: number;
}

const DEFAULT_SIZE = 432;

/**
 * The pacer, drawn from stacked views because kepler has no SVG.
 *
 * `progress` runs 0 (contracted) to 1 (full breath); the parent owns the
 * timing so a paused session simply freezes on the current frame.
 */
export const BreathOrb = ({
  progress,
  label,
  seconds,
  active,
  size = DEFAULT_SIZE,
}: BreathOrbProps) => {
  const outer = scaleWidth(size);
  const glow = outer * 0.907;
  const accent = outer * 0.833;
  const disc = outer * 0.676;

  const discScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.78, 1],
  });
  const glowScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.94, 1.04],
  });
  const glowOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.16, 0.42],
  });
  const accentOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 1],
  });

  return (
    <View style={{width: outer, height: outer, alignItems: 'center', justifyContent: 'center'}} accessible={false}>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: outer,
          height: outer,
          borderRadius: outer / 2,
          borderWidth: scaleWidth(2),
          borderColor: color.border,
        }}
      />
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: glow,
          height: glow,
          borderRadius: glow / 2,
          borderWidth: scaleWidth(12),
          borderColor: color.textMuted,
          opacity: glowOpacity,
          transform: [{scale: glowScale}],
        }}
      />
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: accent,
          height: accent,
          borderRadius: accent / 2,
          borderWidth: scaleWidth(6),
          borderColor: color.clay,
          opacity: accentOpacity,
          transform: [{scale: glowScale}],
        }}
      />
      <Animated.View
        style={[
          styles.disc,
          {
            width: disc,
            height: disc,
            borderRadius: disc / 2,
            transform: [{scale: discScale}],
          },
        ]}>
        <Text
          style={[
            styles.label,
            {fontSize: scaleFontSize(typography.title), opacity: active ? 1 : 0.85},
          ]}>
          {label}
        </Text>
        {seconds ? (
          <Text
            style={[
              styles.seconds,
              {fontSize: scaleFontSize(typography.title), opacity: active ? 1 : 0.85},
            ]}>
            {seconds}
          </Text>
        ) : null}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  disc: {
    backgroundColor: color.surfaceInner,
    borderWidth: scaleWidth(1),
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: color.accent,
    fontWeight: '800',
    letterSpacing: 4,
  },
  seconds: {
    color: color.text,
    fontWeight: '700',
    paddingTop: scaleWidth(4),
  },
});
