import React from 'react';
import {Image, StyleSheet, Text, View} from 'react-native';
import {
  color,
  radius,
  scaleFontSize,
  scaleWidth,
  space,
  typography,
} from '@multitv/shared';

/** Leaf mark plus wordmark, shared by every top-level screen. */
export const BrandMark = () => (
  <View style={styles.brand}>
    <View style={styles.brandMark}>
      <Image
        source={require('../../assets/brand/logo-mark.png')}
        style={styles.brandMarkImage}
        resizeMode="contain"
        accessible={false}
      />
    </View>
    <Text style={[styles.wordmark, {fontSize: scaleFontSize(typography.headline)}]}>
      Globie Earth
    </Text>
  </View>
);

export interface GearGlyphProps {
  /** Glyph size in 1920 x 1080 design units. */
  size?: number;
  tint?: string;
  /** Colour of the hole in the middle; usually the surface behind it. */
  holeTint?: string;
}

/**
 * Cog drawn from four crossed bars plus a ring.
 *
 * A vector glyph would be one text node, but the TV font set has no gear, so
 * the icon is built from plain views instead of risking a tofu box.
 */
export const GearGlyph = ({
  size = 36,
  tint = color.text,
  holeTint = color.surface,
}: GearGlyphProps) => {
  const px = scaleWidth(size);
  const tooth = Math.max(2, Math.round(px * 0.2));
  return (
    <View
      style={{width: px, height: px, alignItems: 'center', justifyContent: 'center'}}
      pointerEvents="none"
      accessible={false}>
      {[0, 45, 90, 135].map(angle => (
        <View
          key={angle}
          style={{
            position: 'absolute',
            width: tooth,
            height: px,
            borderRadius: tooth / 2,
            backgroundColor: tint,
            transform: [{rotate: `${angle}deg`}],
          }}
        />
      ))}
      <View
        style={{
          position: 'absolute',
          width: px * 0.58,
          height: px * 0.58,
          borderRadius: px * 0.29,
          backgroundColor: tint,
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: px * 0.24,
          height: px * 0.24,
          borderRadius: px * 0.12,
          backgroundColor: holeTint,
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleWidth(space.xs),
  },
  brandMark: {
    width: scaleWidth(44),
    height: scaleWidth(44),
    borderRadius: scaleWidth(radius.sm) / 2,
    backgroundColor: color.surfaceInner,
    alignItems: 'center',
    justifyContent: 'center',
    padding: scaleWidth(space.xxs) / 2,
  },
  brandMarkImage: {
    width: '100%',
    height: '100%',
  },
  wordmark: {
    color: color.text,
    fontWeight: '700',
    letterSpacing: -1,
  },
});
