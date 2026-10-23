import React, {useState} from 'react';
import {
  Image,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import {color, radius} from '../theme/tokens';
import {scaleFontSize, scaleWidth} from '../theme/scale';
import {coverBands, coverLetter} from '../utils/color';

export interface CoverArtProps {
  /** Stable seed; two cards with the same seed get the same cover. */
  seed: string;
  title: string;
  /** Square size in 1920 x 1080 design units. */
  size: number;
  /** Podcast artwork; the drawn cover shows while it loads or if it fails. */
  image?: string | null;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Cover art: the podcast's own artwork when the feed provides one, with the
 * brand gradient, title initial and mint HUD brackets drawn underneath so a
 * loading or failed image never leaves an empty hole in the layout.
 */
export const CoverArt = ({
  seed,
  title,
  size,
  image,
  style,
  testID,
}: CoverArtProps) => {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const showsArtwork = Boolean(image) && failedImage !== image;
  const bands = coverBands(seed);
  const px = scaleWidth(size);
  const inset = scaleWidth(Math.round(size * 0.06));
  const corner = scaleWidth(Math.round(size * 0.1));

  return (
    <View
      testID={testID}
      style={[
        styles.root,
        {
          width: px,
          height: px,
          borderRadius: scaleWidth(radius.sm),
        },
        style,
      ]}>
      {bands.map((band, index) => (
        <View key={index} style={[styles.band, {backgroundColor: band}]} />
      ))}
      {showsArtwork ? (
        <Image
          source={{uri: image as string}}
          style={styles.artwork}
          resizeMode="cover"
          onError={() => setFailedImage(image ?? null)}
          accessible={false}
          testID={testID ? `${testID}-artwork` : undefined}
        />
      ) : (
        <>
          <View
            style={[styles.corners, {top: inset, left: inset, right: inset, bottom: inset}]}
            pointerEvents="none"
            accessible={false}>
            <View style={[styles.corner, styles.cornerTopLeft, {width: corner, height: corner}]} />
            <View style={[styles.corner, styles.cornerTopRight, {width: corner, height: corner}]} />
            <View style={[styles.corner, styles.cornerBottomLeft, {width: corner, height: corner}]} />
            <View style={[styles.corner, styles.cornerBottomRight, {width: corner, height: corner}]} />
          </View>
          <View style={styles.letterLayer} pointerEvents="none" accessible={false}>
            <Text
              style={[styles.letter, {fontSize: scaleFontSize(Math.round(size * 0.4))}]}
              numberOfLines={1}>
              {coverLetter(title)}
            </Text>
          </View>
        </>
      )}
      <View
        pointerEvents="none"
        accessible={false}
        style={[
          styles.shade,
          {height: px * 0.3, backgroundColor: color.scrim, opacity: 0.35},
        ]}
      />
      <View
        pointerEvents="none"
        accessible={false}
        style={[
          styles.shade,
          {height: px * 0.12, backgroundColor: color.scrim, opacity: 0.5},
        ]}
      />
      <View
        pointerEvents="none"
        accessible={false}
        style={[
          styles.hairline,
          {borderRadius: scaleWidth(radius.sm) - scaleWidth(1)},
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    overflow: 'hidden',
    backgroundColor: color.surfaceInner,
  },
  artwork: {
    ...StyleSheet.absoluteFillObject,
  },
  shade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  hairline: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: scaleWidth(1),
    borderColor: color.border,
  },
  band: {
    flex: 1,
  },
  corners: {
    position: 'absolute',
  },
  corner: {
    position: 'absolute',
    borderColor: color.accent,
    opacity: 0.5,
  },
  cornerTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: scaleWidth(3),
    borderLeftWidth: scaleWidth(3),
    borderTopLeftRadius: scaleWidth(6),
  },
  cornerTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: scaleWidth(3),
    borderRightWidth: scaleWidth(3),
    borderTopRightRadius: scaleWidth(6),
  },
  cornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: scaleWidth(3),
    borderLeftWidth: scaleWidth(3),
    borderBottomLeftRadius: scaleWidth(6),
  },
  cornerBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: scaleWidth(3),
    borderRightWidth: scaleWidth(3),
    borderBottomRightRadius: scaleWidth(6),
  },
  letterLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: {
    color: color.text,
    fontWeight: '700',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: {width: 0, height: 2},
    textShadowRadius: 4,
  },
});
