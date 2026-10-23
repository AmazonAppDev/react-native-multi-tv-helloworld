import React, {useState} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
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

interface BackPillProps {
  label?: string;
  accessibilityLabel?: string;
  testID?: string;
  onPress?: () => void;
}

/** The same pill the guide screens use: ring always drawn, colour only. */
export const BackPill = React.forwardRef<View, BackPillProps>(
  function BackPill(
    {
      label = '‹ QUESTS',
      accessibilityLabel = 'Back to quests',
      testID = 'game-back',
      onPress,
    },
    ref,
  ) {
    const [focused, setFocused] = useState(false);
    return (
      <TouchableOpacity
        ref={ref}
        testID={testID}
        activeOpacity={1}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.back,
          {borderColor: focused ? color.text : color.border},
        ]}>
        <Text style={[styles.label, {fontSize: scaleFontSize(typography.caption)}]}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  },
);

const styles = StyleSheet.create({
  back: {
    minHeight: scaleHeight(focus.target),
    justifyContent: 'center',
    paddingHorizontal: scaleWidth(space.sm),
    borderRadius: scaleWidth(radius.pill),
    borderWidth: scaleWidth(focus.ringWidth / 2),
  },
  label: {
    color: color.text,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
