import React, {useState} from 'react';
import {
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import {color, focus, radius, space, typography} from '../theme/tokens';
import {scaleFontSize, scaleWidth} from '../theme/scale';

export interface InfoTileProps {
  label: string;
  value: string;
  footer: string;
  /** Overrides for the footer line, e.g. the mandatory sanctuary source. */
  footerStyle?: StyleProp<TextStyle>;
  footerLines?: number;
  hasTVPreferredFocus?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

/**
 * Compact stat tile used by the Home info strip.
 *
 * Forwards its host ref so `FocusManager.setNextFocus` can receive a real tag.
 */
export const InfoTile = React.forwardRef<View, InfoTileProps>(function InfoTile(
  {
    label,
    value,
    footer,
    footerStyle,
    footerLines = 1,
    hasTVPreferredFocus = false,
    testID,
    style,
    onPress,
    onFocus,
    onBlur,
  },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const ring = scaleWidth(focus.ringWidth);

  return (
    <TouchableOpacity
      ref={ref}
      testID={testID}
      activeOpacity={1}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}. ${footer}`}
      hasTVPreferredFocus={hasTVPreferredFocus}
      onPress={onPress}
      onFocus={() => {
        setFocused(true);
        onFocus?.();
      }}
      onBlur={() => {
        setFocused(false);
        onBlur?.();
      }}
      style={[
        styles.root,
        {
          borderWidth: ring,
          borderColor: focused ? color.text : color.border,
          borderRadius: scaleWidth(radius.sm),
          backgroundColor: focused ? color.surfaceRaise : color.surfaceInner,
        },
        style,
      ]}>
      <Text
        style={[styles.label, {fontSize: scaleFontSize(typography.label)}]}
        numberOfLines={1}>
        {label.toUpperCase()}
      </Text>
      <Text
        style={[styles.value, {fontSize: scaleFontSize(typography.body)}]}
        numberOfLines={1}>
        {value}
      </Text>
      <Text
        style={[
          styles.footer,
          {fontSize: scaleFontSize(typography.caption)},
          footerStyle,
        ]}
        numberOfLines={footerLines}>
        {footer}
      </Text>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: scaleWidth(space.md),
    paddingVertical: scaleWidth(space.xxs),
  },
  label: {
    color: color.accent,
    letterSpacing: 1.5,
    fontWeight: '800',
  },
  value: {
    color: color.text,
    fontWeight: '700',
    paddingTop: scaleWidth(space.xxs) / 2,
  },
  footer: {
    color: color.textMuted,
    paddingTop: scaleWidth(space.xxs) / 2,
  },
});
