import React, {useState} from 'react';
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  color,
  focus,
  radius,
  scaleFontSize,
  scaleHeight,
  scaleWidth,
} from '@multitv/shared';
import {GearGlyph} from '../home/Brand';

export interface WelcomeTileProps {
  /** Two words; the design breaks the label after the first one. */
  label: string;
  /** Mascot artwork shown to the right of the label. */
  art: number;
  testID?: string;
  /** Takes the remote focus when the screen mounts. */
  hasTVPreferredFocus?: boolean;
  onPress?: () => void;
  /** Reported so the screen can stop retrying its focus claim. */
  onFocus?: () => void;
}

/** Design width of a menu tile on the WELCOME screen. */
const TILE_WIDTH = 482;
const TILE_HEIGHT = 207;

/**
 * A pale menu tile.
 *
 * The ring is always present and only changes colour, so focusing a tile never
 * reflows the row - the same rule as FocusCard and Chip. It is clay rather than
 * white or surface: the ring sits outside the fill, and a white ring vanishes
 * into the pale tile while a surface ring vanishes into the page behind it.
 */
export const WelcomeTile = React.forwardRef<View, WelcomeTileProps>(
  function WelcomeTile(
    {label, art, testID, hasTVPreferredFocus, onPress, onFocus},
    ref,
  ) {
    const [focused, setFocused] = useState(false);

    return (
      <TouchableOpacity
        ref={ref}
        testID={testID}
        activeOpacity={1}
        accessibilityRole="button"
        accessibilityLabel={label}
        hasTVPreferredFocus={hasTVPreferredFocus}
        onPress={onPress}
        onFocus={() => {
          setFocused(true);
          onFocus?.();
        }}
        onBlur={() => setFocused(false)}
        style={[
          styles.root,
          {
            borderColor: focused ? color.clay : 'transparent',
            backgroundColor: focused ? '#e8eff5' : color.tileSurface,
            zIndex: focused ? 2 : 0,
          },
        ]}>
        <Text
          style={[
            styles.label,
            {
              fontSize: scaleFontSize(50),
              lineHeight: scaleFontSize(62),
            },
          ]}
          numberOfLines={2}>
          {label.replace(' ', '\n')}
        </Text>
        <Image
          source={art}
          style={styles.art}
          resizeMode="contain"
          accessible={false}
        />
      </TouchableOpacity>
    );
  },
);

export interface WelcomeSettingTileProps {
  testID?: string;
  onPress?: () => void;
}

/** The centred SETTING tile: hero art on the left, cog above the label. */
export const WelcomeSettingTile = React.forwardRef<
  View,
  WelcomeSettingTileProps
>(function WelcomeSettingTile({testID, onPress}, ref) {
  const [focused, setFocused] = useState(false);

  return (
    <TouchableOpacity
      ref={ref}
      testID={testID}
      activeOpacity={1}
      accessibilityRole="button"
      accessibilityLabel="Setting"
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[
        styles.root,
        styles.setting,
        {
          borderColor: focused ? color.clay : 'transparent',
          backgroundColor: focused ? '#e8eff5' : color.tileSurface,
          zIndex: focused ? 2 : 0,
        },
      ]}>
      <Image
        source={require('../../assets/brand/guardian-yang-na.png')}
        style={styles.settingArt}
        resizeMode="contain"
        accessible={false}
      />
      <View style={styles.settingColumn}>
        <View style={styles.settingCog}>
          <GearGlyph size={40} tint={color.tileInk} holeTint={color.tileSurface} />
        </View>
        <Text
          style={[
            styles.label,
            {fontSize: scaleFontSize(50), lineHeight: scaleFontSize(62)},
          ]}>
          SETTING
        </Text>
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    maxWidth: scaleWidth(TILE_WIDTH),
    minHeight: scaleHeight(TILE_HEIGHT),
    borderWidth: scaleWidth(focus.ringWidth),
    borderRadius: scaleWidth(radius.md),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: scaleWidth(64),
    paddingRight: scaleWidth(20),
    overflow: 'hidden',
  },
  label: {
    color: color.tileInk,
    fontWeight: '800',
    letterSpacing: -0.5,
    flexShrink: 1,
  },
  art: {
    width: scaleWidth(124),
    height: scaleWidth(150),
  },
  setting: {
    flex: 0,
    width: scaleWidth(TILE_WIDTH),
    minHeight: scaleHeight(188),
    paddingLeft: scaleWidth(20),
    paddingRight: scaleWidth(28),
  },
  settingArt: {
    width: scaleWidth(116),
    height: scaleWidth(148),
  },
  settingColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingCog: {
    marginBottom: scaleHeight(2),
  },
});
