import React from 'react';
import {Image, StyleSheet, View} from 'react-native';
import {
  GLOBIE_RELAY_BASE_URL,
  color,
  radius,
  scaleWidth,
} from '@multitv/shared';

/**
 * The address a phone opens to play this room.
 *
 * The relay owns `/play/<code>` and forwards it to the board, so one host
 * serves every page a player is ever asked to type or scan.
 */
export const joinUrlFor = (code: string) => `${GLOBIE_RELAY_BASE_URL}/play/${code}`;

/** The same address drawn as a square by the relay, which owns a QR encoder. */
export const joinQrUrlFor = (code: string) =>
  `${GLOBIE_RELAY_BASE_URL}/v1/challenge/${code}/qr.png`;

interface JoinCardProps {
  code: string;
  /** Side of the square, in design pixels. */
  size?: number;
  testID?: string;
}

/**
 * A room as a phone sees it.
 *
 * The television has no QR encoder and no SVG, so this is just an <Image>:
 * the relay renders the PNG from the code in the URL. A white frame keeps the
 * module edges sharp against the dark surface behind it.
 */
export const JoinCard = ({code, size = 220, testID = 'join-card'}: JoinCardProps) => (
  <View style={styles.frame} testID={testID}>
    <Image
      testID={`${testID}-qr`}
      source={{uri: joinQrUrlFor(code)}}
      resizeMode="contain"
      style={{
        width: scaleWidth(size),
        height: scaleWidth(size),
        borderRadius: scaleWidth(radius.sm),
        backgroundColor: '#ffffff',
      }}
    />
  </View>
);

const styles = StyleSheet.create({
  frame: {
    alignSelf: 'flex-start',
    padding: scaleWidth(10),
    borderRadius: scaleWidth(radius.sm),
    borderWidth: scaleWidth(2),
    borderColor: color.border,
    backgroundColor: '#ffffff',
  },
});
