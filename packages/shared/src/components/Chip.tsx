import React, {useState} from 'react';
import {
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import {color, focus, radius, space, typography} from '../theme/tokens';
import {scaleFontSize, scaleHeight, scaleWidth} from '../theme/scale';

export interface ChipProps {
  label: string;
  selected?: boolean;
  /**
   * Marks the chip as inert for accessibility and dims it. The node stays
   * focusable on purpose: on Vega a disabled node cannot hold the ring, so
   * disabling it would drop focus and turn the next ENTER into BACK.
   */
  disabled?: boolean;
  hasTVPreferredFocus?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

/**
 * Selectable filter chip. Selection and focus are separate visual states.
 *
 * Forwards its host ref so `FocusManager.setNextFocus` can receive a real tag.
 */
export const Chip = React.forwardRef<View, ChipProps>(function Chip(
  {
    label,
    selected = false,
    disabled = false,
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
      accessibilityState={{selected, disabled}}
      accessibilityLabel={`${label}${selected ? ', selected' : ''}`}
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
          minHeight: scaleHeight(focus.target),
          paddingHorizontal: scaleWidth(space.sm),
          borderRadius: scaleWidth(radius.pill),
          borderWidth: ring,
          // The ring sits outside the pill, so white would vanish into the pale
          // accent fill of a selected chip. Clay reads against mint and against
          // the page behind an unselected chip.
          borderColor: focused
            ? color.clay
            : selected
            ? color.accent
            : color.border,
          backgroundColor: selected
            ? color.accent
            : focused
            ? color.surfaceRaise
            : 'transparent',
          opacity: disabled ? 0.45 : 1,
        },
        style,
      ]}>
      <Text
        style={[
          styles.label,
          {
            fontSize: scaleFontSize(typography.caption),
            color: selected ? color.surface : color.textMuted,
          },
        ]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
