import React, {useEffect, useRef, useState} from 'react';
import {
  BackHandler,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  FocusManager,
  findNodeHandle,
} from '@amazon-devices/react-native-kepler';
import {
  color,
  focus,
  layout,
  radius,
  scaleFontSize,
  scaleHeight,
  scaleWidth,
  space,
  typography,
} from '@multitv/shared';
import {BrandMark} from './home/Brand';

export interface LearnScreenProps {
  /** FIELD GUIDE: the species catalogue. */
  onOpenSpecies?: () => void;
  /** GUESS WHO: the photo and clue quiz. */
  onOpenQuiz?: () => void;
  /** MEMORY MATCH: the species pair game. */
  onOpenMemory?: () => void;
  /** FAMILY QUIZ: the pass-the-remote challenge lobby. */
  onOpenChallenge?: () => void;
  onBack?: () => void;
}

type FocusDirection = 'up' | 'down' | 'left' | 'right';

/**
 * Design metrics, in 1920 x 1080 units. Four tiles plus three gaps fill the
 * 1728-unit content width that `layout.insetX` leaves on each side.
 */
const TILE_WIDTH = 408;
const TILE_HEIGHT = 207;
const TILE_GAP = 32;

const BackButton = React.forwardRef<View, {onPress?: () => void}>(
  function BackButton({onPress}, ref) {
    const [focused, setFocused] = useState(false);
    return (
      <TouchableOpacity
        ref={ref}
        testID="learn-back"
        activeOpacity={1}
        accessibilityRole="button"
        accessibilityLabel="Back to welcome"
        onPress={onPress}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.back,
          {borderColor: focused ? color.text : color.border},
        ]}>
        <Text
          style={[
            styles.backLabel,
            {fontSize: scaleFontSize(typography.caption)},
          ]}>
          ‹ WELCOME
        </Text>
      </TouchableOpacity>
    );
  },
);

interface LearnTileProps {
  label: string;
  kicker: string;
  art: number;
  hasTVPreferredFocus?: boolean;
  testID?: string;
  onPress?: () => void;
}

const LearnTile = React.forwardRef<View, LearnTileProps>(function LearnTile(
  {label, kicker, art, hasTVPreferredFocus, testID, onPress},
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
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[
        styles.tile,
        {
          borderColor: focused ? color.clay : 'transparent',
          backgroundColor: focused ? '#e8eff5' : color.tileSurface,
          zIndex: focused ? 2 : 0,
        },
      ]}>
      <View style={styles.tileCopy}>
        <Text
          style={[
            styles.kicker,
            {fontSize: scaleFontSize(typography.label)},
          ]}>
          {kicker}
        </Text>
        <Text
          style={[
            styles.tileLabel,
            {
              // Four tiles share the row, so the label keeps the full 42px.
              fontSize: scaleFontSize(42),
              lineHeight: scaleFontSize(52),
            },
          ]}
          numberOfLines={2}>
          {label.replace(' ', '\n')}
        </Text>
      </View>
      <Image source={art} style={styles.art} resizeMode="contain" accessible={false} />
    </TouchableOpacity>
  );
});

/**
 * GLOBIE LEARN hub. The WELCOME tile used to drop straight onto the podcast
 * dashboard; this screen is the fork between the species field guide and the
 * three species games.
 */
export const LearnScreen = ({
  onOpenSpecies,
  onOpenQuiz,
  onOpenMemory,
  onOpenChallenge,
  onBack,
}: LearnScreenProps) => {
  const backRef = useRef<View | null>(null);
  const guideRef = useRef<View | null>(null);
  const tileNodes = useRef<Array<View | null>>([]);
  const [bootFocus, setBootFocus] = useState(true);

  useEffect(() => {
    // Cleared once, so later re-renders stop re-requesting focus on the first
    // tile and the ring can actually move along the row.
    const timer = setTimeout(() => setBootFocus(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (!onBack) {
          return false;
        }
        onBack();
        return true;
      },
    );
    return () => subscription?.remove();
  }, [onBack]);

  useEffect(() => {
    const tagOf = (node: View | null | undefined): number | null =>
      node ? findNodeHandle(node as unknown as React.Component) : null;
    const link = (
      from: View | null | undefined,
      to: View | null | undefined,
      direction: FocusDirection,
    ) => {
      const fromTag = tagOf(from);
      const toTag = tagOf(to);
      if (fromTag === null || toTag === null) {
        return;
      }
      try {
        FocusManager.setNextFocus(fromTag, toTag, direction);
      } catch {
        // The Jest turbo-module stub does not implement setNextFocus.
      }
    };

    // Deferred: on mount the tiles are not yet registered with the native
    // focus manager, so setNextFocus rejects their tags as invalid.
    const timer = setTimeout(() => {
      link(backRef.current, guideRef.current, 'down');
      link(guideRef.current, backRef.current, 'up');

      // Every tile is enabled now, so the ring walks the whole row and each
      // tile returns to BACK on UP.
      const chain = tileNodes.current.filter(Boolean);
      chain.forEach(node => link(node, backRef.current, 'up'));
      chain.forEach((node, index) => {
        link(node, chain[index - 1], 'left');
        link(node, chain[index + 1], 'right');
      });
    }, 300);

    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.root} testID="learn-screen">
      <View style={styles.header}>
        <BackButton ref={backRef} onPress={onBack} />
        <BrandMark />
      </View>

      <Text
        style={[
          styles.title,
          {fontSize: scaleFontSize(104), lineHeight: scaleFontSize(118)},
        ]}>
        LEARN
      </Text>
      <Text
        style={[
          styles.subtitle,
          {fontSize: scaleFontSize(typography.body)},
        ]}>
        The forest around you, one species at a time.
      </Text>

      <View style={styles.tileRow}>
        <LearnTile
          ref={node => {
            guideRef.current = node;
            tileNodes.current[0] = node;
          }}
          testID="learn-tile-species"
          label="FIELD GUIDE"
          kicker="5,000+ SPECIES"
          art={require('../assets/brand/flower.png')}
          hasTVPreferredFocus={bootFocus}
          onPress={onOpenSpecies}
        />
        <LearnTile
          ref={node => {
            tileNodes.current[1] = node;
          }}
          testID="learn-tile-memory"
          label="MEMORY MATCH"
          kicker="SPECIES PAIRS"
          art={require('../assets/brand/mascot-baby-kae-na.png')}
          onPress={onOpenMemory}
        />
        <LearnTile
          ref={node => {
            tileNodes.current[2] = node;
          }}
          testID="learn-tile-quiz"
          label="GUESS WHO"
          kicker="PHOTO QUIZ"
          art={require('../assets/brand/mascot-baby-yang-na.png')}
          onPress={onOpenQuiz}
        />
        <LearnTile
          ref={node => {
            tileNodes.current[3] = node;
          }}
          testID="learn-tile-challenge"
          label="FAMILY QUIZ"
          kicker="PASS THE REMOTE"
          art={require('../assets/brand/guardian-yang-na.png')}
          onPress={onOpenChallenge}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.surface,
    paddingHorizontal: scaleWidth(layout.insetX),
    paddingVertical: scaleHeight(layout.insetY),
  },
  header: {
    height: scaleHeight(layout.headerHeight),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  back: {
    minHeight: scaleHeight(focus.target),
    justifyContent: 'center',
    paddingHorizontal: scaleWidth(space.sm),
    borderRadius: scaleWidth(radius.pill),
    borderWidth: scaleWidth(2),
  },
  backLabel: {
    color: color.text,
    fontWeight: '700',
    letterSpacing: 1,
  },
  title: {
    color: color.text,
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: scaleHeight(56),
  },
  subtitle: {
    color: color.textMuted,
    marginTop: scaleHeight(space.xxs),
  },
  tileRow: {
    flexDirection: 'row',
    gap: scaleWidth(TILE_GAP),
    marginTop: scaleHeight(110),
  },
  tile: {
    width: scaleWidth(TILE_WIDTH),
    minHeight: scaleHeight(TILE_HEIGHT),
    borderWidth: scaleWidth(focus.ringWidth),
    borderRadius: scaleWidth(radius.md),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: scaleWidth(32),
    paddingRight: scaleWidth(12),
    overflow: 'hidden',
  },
  tileCopy: {
    flexShrink: 1,
  },
  kicker: {
    color: color.surfaceRaise,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: scaleHeight(space.xxs),
  },
  tileLabel: {
    color: color.tileInk,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  art: {
    width: scaleWidth(88),
    height: scaleWidth(106),
  },
});
