import React from 'react';
import {
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import {color, radius, space, typography} from '../theme/tokens';
import {scaleFontSize, scaleWidth} from '../theme/scale';

export interface ShelfProps {
  title: string;
  /** Right-aligned count label source, e.g. 8 -> "8 shows". */
  count: number;
  /** Gap between cards in design units. Home uses the default, Soundscapes is wider. */
  laneGap?: number;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

/**
 * Section header plus a horizontal lane.
 *
 * ScrollView rather than FlatList: the set is capped at 20 items and the
 * index-based focus handling is simpler than tuning a virtualisation window
 * on a 1 GB device.
 */
export const Shelf = ({
  title,
  count,
  laneGap,
  testID,
  style,
  children,
}: ShelfProps) => {
  return (
    <View testID={testID} style={[styles.root, style]}>
      <View style={styles.header}>
        <Text style={[styles.title, {fontSize: scaleFontSize(typography.headline)}]}>
          {title}
        </Text>
        <View style={styles.countPill}>
          <Text
            style={[styles.count, {fontSize: scaleFontSize(typography.label)}]}>
            {count} {count === 1 ? 'show' : 'shows'}
          </Text>
        </View>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[
          styles.lane,
          laneGap != null && {gap: scaleWidth(laneGap)},
        ]}>
        {children}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flexGrow: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingBottom: scaleWidth(space.xxs),
  },
  title: {
    color: color.text,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  countPill: {
    paddingHorizontal: scaleWidth(space.xs),
    paddingVertical: scaleWidth(space.xxs) / 2,
    borderRadius: scaleWidth(radius.pill),
    backgroundColor: color.surfaceInner,
  },
  count: {
    color: color.accent,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  lane: {
    flexDirection: 'row',
    gap: scaleWidth(space.md),
    paddingVertical: scaleWidth(space.xxs),
  },
});
