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
import {scaleFontSize, scaleWidth} from '../theme/scale';
import {CoverArt} from './CoverArt';

export interface FocusCardProps {
  title: string;
  subtitle?: string;
  /** Stable seed for the drawn cover. */
  seed: string;
  /** Podcast artwork; falls back to the drawn cover. */
  image?: string | null;
  /** Card width in 1920 x 1080 design units. */
  designWidth?: number;
  hasTVPreferredFocus?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

/**
 * Shelf card with a physical focus ring.
 *
 * The ring border is always present and only changes colour, so focusing a
 * card never reflows the row. The scale transform is a style swap, not an
 * animated sequence, so rapid D-pad input cannot queue animations.
 *
 * Forwards its host ref so `FocusManager.setNextFocus` can receive a real tag.
 */
export const FocusCard = React.forwardRef<View, FocusCardProps>(
  function FocusCard(
    {
      title,
      subtitle,
      seed,
      image,
      designWidth = 200,
      hasTVPreferredFocus = false,
      testID,
      accessibilityLabel,
      accessibilityHint,
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
        accessibilityLabel={
          accessibilityLabel ?? `${title}${subtitle ? `, ${subtitle}` : ''}`
        }
        accessibilityHint={accessibilityHint}
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
            width: scaleWidth(designWidth),
            borderWidth: ring,
            borderRadius: scaleWidth(radius.sm),
            borderColor: focused ? color.text : 'transparent',
            backgroundColor: focused ? color.surfaceRaise : 'transparent',
            transform: [{scale: focused ? focus.scale : 1}],
            zIndex: focused ? 2 : 0,
          },
          style,
        ]}>
        <View
          style={[
            styles.artFrame,
            {
              width: scaleWidth(designWidth - focus.ringWidth * 2),
              height: scaleWidth(designWidth - focus.ringWidth * 2 - 50),
              borderRadius: scaleWidth(radius.sm),
            },
          ]}>
          <CoverArt
            seed={seed}
            title={title}
            image={image}
            size={designWidth - focus.ringWidth * 2}
          />
        </View>
        <View style={styles.textBlock}>
          <Text
            style={[
              styles.title,
              {
                fontSize: scaleFontSize(26),
                lineHeight: scaleFontSize(30),
                minHeight: scaleFontSize(120),
              },
            ]}
            numberOfLines={4}>
            {title}
          </Text>
          {subtitle ? (
            <Text
              style={[
                styles.subtitle,
                {fontSize: scaleFontSize(typography.caption)},
              ]}
              numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  },
);

const styles = StyleSheet.create({
  root: {
    padding: scaleWidth(space.xxs),
  },
  artFrame: {
    overflow: 'hidden',
  },
  textBlock: {
    paddingTop: scaleWidth(space.xxs),
  },
  title: {
    color: color.text,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  subtitle: {
    color: color.textMuted,
    paddingTop: scaleWidth(space.xxs) / 2,
  },
});
