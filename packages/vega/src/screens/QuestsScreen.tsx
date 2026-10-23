import React, {useEffect, useRef, useState} from 'react';
import {
  Animated,
  BackHandler,
  Easing,
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
import {useReducedMotion} from './home/MascotStage';
import {BrandMark} from './home/Brand';

export interface QuestsScreenProps {
  /** MISSION: the Biodiversity Keeper briefing. */
  onOpenMission?: () => void;
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
        testID="quests-back"
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

interface QuestTileProps {
  label: string;
  kicker: string;
  art: number;
  /** Ribbon in the top-right corner, e.g. the new mission. */
  badge?: string;
  /** Staggers the mount entrance so the row wipes in from the left. */
  index: number;
  hasTVPreferredFocus?: boolean;
  testID?: string;
  onPress?: () => void;
}

const QuestTile = React.forwardRef<View, QuestTileProps>(function QuestTile(
  {label, kicker, art, badge, index, hasTVPreferredFocus, testID, onPress},
  ref,
) {
  const reduced = useReducedMotion();
  const [focused, setFocused] = useState(false);
  const enter = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const artScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduced) {
      return undefined;
    }
    const animation = Animated.timing(enter, {
      toValue: 1,
      duration: 420,
      delay: 60 + index * 90,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [enter, index, reduced]);

  // The art pops out of the tile on focus; the ring alone reads a little flat
  // at ten feet on a pale card.
  const popArt = (to: number) => {
    if (reduced) {
      artScale.setValue(to);
      return;
    }
    Animated.spring(artScale, {
      toValue: to,
      friction: 7,
      tension: 90,
      useNativeDriver: false,
    }).start();
  };

  const lift = enter.interpolate({
    inputRange: [0, 1],
    outputRange: [scaleHeight(28), 0],
  });

  return (
    <Animated.View style={{opacity: enter, transform: [{translateY: lift}]}}>
      <TouchableOpacity
        ref={ref}
        testID={testID}
        activeOpacity={1}
        accessibilityRole="button"
        accessibilityLabel={badge ? `${label}, ${badge}` : label}
        hasTVPreferredFocus={hasTVPreferredFocus}
        onPress={onPress}
        onFocus={() => {
          setFocused(true);
          popArt(1.1);
        }}
        onBlur={() => {
          setFocused(false);
          popArt(1);
        }}
        style={[
          styles.tile,
          {
            borderColor: focused ? color.clay : 'transparent',
            backgroundColor: focused ? '#e8eff5' : color.tileSurface,
            zIndex: focused ? 2 : 0,
          },
        ]}>
        {badge ? (
          <View style={styles.badge}>
            <Text
              style={[
                styles.badgeLabel,
                {fontSize: scaleFontSize(16)},
              ]}>
              {badge}
            </Text>
          </View>
        ) : null}
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
        <Animated.View style={{transform: [{scale: artScale}]}}>
          <Image
            source={art}
            style={styles.art}
            resizeMode="contain"
            accessible={false}
          />
        </Animated.View>
      </TouchableOpacity>
    </Animated.View>
  );
});

/**
 * GLOBIE QUESTS hub.
 *
 * Every mission and game the grove offers starts here. The first tile is the
 * live Biodiversity Keeper mission; the three games keep the shelf company.
 */
export const QuestsScreen = ({
  onOpenMission,
  onOpenQuiz,
  onOpenMemory,
  onOpenChallenge,
  onBack,
}: QuestsScreenProps) => {
  const backRef = useRef<View | null>(null);
  const missionRef = useRef<View | null>(null);
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
      link(backRef.current, missionRef.current, 'down');
      link(missionRef.current, backRef.current, 'up');

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
    <View style={styles.root} testID="quests-screen">
      <View style={styles.header}>
        <BackButton ref={backRef} onPress={onBack} />
        <BrandMark />
      </View>

      <Text
        style={[
          styles.title,
          {fontSize: scaleFontSize(104), lineHeight: scaleFontSize(118)},
        ]}>
        QUESTS
      </Text>
      <Text
        style={[
          styles.subtitle,
          {fontSize: scaleFontSize(typography.body)},
        ]}>
        Pick a mission. Every answer grows the field guide.
      </Text>

      <View style={styles.tileRow}>
        <QuestTile
          ref={node => {
            missionRef.current = node;
            tileNodes.current[0] = node;
          }}
          testID="quests-tile-mission"
          index={0}
          label="MISSION"
          kicker="BIODIVERSITY KEEPER"
          badge="NEW"
          art={require('../assets/brand/guardian-kae-na.png')}
          hasTVPreferredFocus={bootFocus}
          onPress={onOpenMission}
        />
        <QuestTile
          ref={node => {
            tileNodes.current[1] = node;
          }}
          testID="quests-tile-memory"
          index={1}
          label="MEMORY MATCH"
          kicker="SPECIES PAIRS"
          art={require('../assets/brand/mascot-baby-kae-na.png')}
          onPress={onOpenMemory}
        />
        <QuestTile
          ref={node => {
            tileNodes.current[2] = node;
          }}
          testID="quests-tile-quiz"
          index={2}
          label="GUESS WHO"
          kicker="PHOTO QUIZ"
          art={require('../assets/brand/mascot-baby-yang-na.png')}
          onPress={onOpenQuiz}
        />
        <QuestTile
          ref={node => {
            tileNodes.current[3] = node;
          }}
          testID="quests-tile-challenge"
          index={3}
          label="FAMILY QUIZ"
          kicker="PASS THE REMOTE"
          art={require('../assets/brand/guardian-yang-na.png')}
          onPress={onOpenChallenge}
        />
      </View>

      <View style={styles.hintRow}>
        <View style={styles.hintDot} />
        <Text
          style={[
            styles.hint,
            {fontSize: scaleFontSize(typography.caption)},
          ]}>
          New mission live · Biodiversity Keeper · 300 XP + 700 eco-tokens
        </Text>
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
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    paddingHorizontal: scaleWidth(space.xs),
    paddingVertical: scaleHeight(4),
    borderBottomLeftRadius: scaleWidth(radius.sm),
    backgroundColor: color.gold,
  },
  badgeLabel: {
    color: color.tileInk,
    fontWeight: '800',
    letterSpacing: 2,
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
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleWidth(space.xxs),
    marginTop: scaleHeight(space.xl),
  },
  hintDot: {
    width: scaleWidth(10),
    height: scaleWidth(10),
    borderRadius: scaleWidth(5),
    backgroundColor: color.gold,
  },
  hint: {
    color: color.textMuted,
    fontWeight: '600',
    letterSpacing: 1,
  },
});
