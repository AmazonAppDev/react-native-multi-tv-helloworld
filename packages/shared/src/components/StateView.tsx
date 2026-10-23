import React, {useState} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {color, focus, radius, space, typography} from '../theme/tokens';
import {scaleFontSize, scaleWidth} from '../theme/scale';

export type StateViewProps =
  | {variant: 'loading'; testID?: string}
  | {
      variant: 'empty';
      note: string;
      ctaLabel?: string;
      onCta?: () => void;
      testID?: string;
    }
  | {variant: 'error'; message: string; onRetry: () => void; testID?: string};

/**
 * Loading / empty / error surfaces.
 *
 * Loading is a static placeholder, never an animated shimmer: animation on
 * the 1 GB target competes with video decode. Empty copy is always the
 * backend's own note, rendered verbatim.
 */
export const StateView = (props: StateViewProps) => {
  if (props.variant === 'loading') {
    return <LoadingState testID={props.testID} />;
  }

  if (props.variant === 'empty') {
    return (
      <View testID={props.testID} style={styles.centered}>
        <Text style={[styles.note, {fontSize: scaleFontSize(typography.body)}]}>
          {props.note}
        </Text>
        {props.onCta ? (
          <StateButton
            label={props.ctaLabel ?? 'Browse themes'}
            onPress={props.onCta}
            testID="state-cta"
          />
        ) : null}
      </View>
    );
  }

  return (
    <View testID={props.testID} style={styles.centered}>
      <Text
        style={[
          styles.note,
          {fontSize: scaleFontSize(typography.body), color: color.danger},
        ]}>
        {props.message}
      </Text>
      <StateButton
        label="Retry"
        onPress={props.onRetry}
        testID="state-retry"
        hasTVPreferredFocus
      />
    </View>
  );
};

const LoadingState = ({testID}: {testID?: string}) => (
  <View testID={testID} style={styles.loadingRoot}>
    <View style={styles.heroBlock} />
    <View style={styles.cardRow}>
      {Array.from({length: 6}).map((_, index) => (
        <View key={index} style={styles.cardBlock} />
      ))}
    </View>
  </View>
);

interface StateButtonProps {
  label: string;
  onPress: () => void;
  testID?: string;
  hasTVPreferredFocus?: boolean;
}

const StateButton = ({
  label,
  onPress,
  testID,
  hasTVPreferredFocus = false,
}: StateButtonProps) => {
  const [focused, setFocused] = useState(false);
  const ring = scaleWidth(focus.ringWidth);

  return (
    <TouchableOpacity
      testID={testID}
      activeOpacity={1}
      accessibilityRole="button"
      accessibilityLabel={label}
      hasTVPreferredFocus={hasTVPreferredFocus}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[
        styles.button,
        {
          borderWidth: ring,
          borderColor: focused ? color.clay : color.accent,
          backgroundColor: color.accent,
        },
      ]}>
      <Text
        style={[
          styles.buttonLabel,
          {
            fontSize: scaleFontSize(typography.body),
            color: color.surface,
          },
        ]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: scaleWidth(space.md),
  },
  note: {
    color: color.textMuted,
    textAlign: 'center',
  },
  button: {
    minHeight: scaleWidth(focus.target),
    paddingHorizontal: scaleWidth(space.lg),
    justifyContent: 'center',
    borderRadius: scaleWidth(radius.pill),
  },
  buttonLabel: {
    fontWeight: '700',
  },
  loadingRoot: {
    flex: 1,
    gap: scaleWidth(space.md),
  },
  heroBlock: {
    height: scaleWidth(240),
    borderRadius: scaleWidth(radius.md),
    backgroundColor: color.surfaceInner,
  },
  cardRow: {
    flexDirection: 'row',
    gap: scaleWidth(space.md),
  },
  cardBlock: {
    width: scaleWidth(200),
    height: scaleWidth(200),
    borderRadius: scaleWidth(radius.sm),
    backgroundColor: color.surfaceInner,
  },
});
