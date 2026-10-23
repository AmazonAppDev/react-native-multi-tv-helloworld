import React from 'react';
import {Image, StyleSheet, Text, View} from 'react-native';
import {
  GLOBIE_RELAY_BASE_URL,
  color,
  radius,
  scaleFontSize,
  scaleHeight,
  scaleWidth,
  space,
  typography,
} from '@multitv/shared';

export interface FamilyTileProps {
  slot: number;
  /** The seated player, or null for a seat nobody has taken. */
  name: string | null;
  /** The team colour when the party has teams, the accent otherwise. */
  tint: string;
  /**
   * The frame's path as the relay reports it. Null while the camera is off or
   * the last frame has aged out, which is exactly when the avatar stands in.
   */
  framePath: string | null;
  /**
   * `wall` is the lobby's wide grid tile; `rail` is the narrow column beside a
   * live round, where the picture stacks over its caption instead of beside it.
   */
  variant?: 'wall' | 'rail';
}

/**
 * One seat on the family wall.
 *
 * The picture is a plain <Image> pointed at the relay: a phone posts a JPEG,
 * the relay keeps it for four seconds, and the path changes with every
 * accepted frame (`?v=`), so the screen cannot redraw a cached face. A seat
 * with no picture - camera denied, camera off, phone asleep - keeps its name
 * and draws an avatar, so the grid never shows a broken tile. The television
 * itself never captures anything.
 */
export const FamilyTile = ({
  slot,
  name,
  tint,
  framePath,
  variant = 'wall',
}: FamilyTileProps) => (
  <View
    testID={`challenge-player-${slot}`}
    style={[styles.tile, variant === 'rail' && styles.rail, {borderColor: tint}]}>
    {framePath ? (
      <Image
        testID={`challenge-frame-${slot}`}
        source={{uri: `${GLOBIE_RELAY_BASE_URL}${framePath}`}}
        resizeMode="cover"
        style={[styles.preview, variant === 'rail' && styles.railPreview]}
      />
    ) : (
      <View
        style={[styles.preview, variant === 'rail' && styles.railPreview]}
        testID={`challenge-avatar-${slot}`}>
        <View style={[styles.avatar, {borderColor: tint}]}>
          <Text
            style={[
              styles.avatarInk,
              {fontSize: scaleFontSize(typography.body)},
            ]}>
            {name ? name.slice(0, 1).toUpperCase() : '+'}
          </Text>
        </View>
      </View>
    )}
    <View style={[styles.caption, variant === 'rail' && styles.railCaption]}>
      <Text
        style={[
          styles.slot,
          {
            fontSize: scaleFontSize(typography.caption),
            color: name ? tint : color.textMuted,
          },
        ]}>
        P{slot}
      </Text>
      <Text
        numberOfLines={1}
        style={[styles.name, {fontSize: scaleFontSize(typography.body)}]}>
        {name ?? 'OPEN'}
      </Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  tile: {
    width: scaleWidth(364),
    minHeight: scaleHeight(112),
    borderRadius: scaleWidth(radius.md),
    borderWidth: scaleWidth(2),
    backgroundColor: color.surfaceInner,
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleWidth(space.xs),
    paddingHorizontal: scaleWidth(space.xs),
  },
  rail: {
    width: scaleWidth(232),
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: scaleHeight(space.xxs),
    paddingVertical: scaleHeight(space.xxs),
  },
  preview: {
    width: scaleWidth(160),
    height: scaleHeight(90),
    borderRadius: scaleWidth(radius.sm),
    backgroundColor: color.surfaceRaise,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  railPreview: {
    width: '100%',
    height: scaleHeight(104),
  },
  avatar: {
    width: scaleWidth(72),
    height: scaleWidth(72),
    borderRadius: scaleWidth(36),
    borderWidth: scaleWidth(2),
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInk: {
    color: color.text,
    fontWeight: '800',
  },
  caption: {
    flex: 1,
  },
  railCaption: {
    flex: 0,
    paddingHorizontal: scaleWidth(space.xxs),
  },
  slot: {
    fontWeight: '800',
    letterSpacing: 2,
  },
  name: {
    color: color.text,
    fontWeight: '700',
    marginTop: scaleHeight(space.xxs / 2),
  },
});
