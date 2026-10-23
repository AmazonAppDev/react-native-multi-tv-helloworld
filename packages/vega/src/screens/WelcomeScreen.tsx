import React, {useEffect, useMemo, useRef, useState} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {
  FocusManager,
  findNodeHandle,
} from '@amazon-devices/react-native-kepler';
import {
  color,
  createGlobieMcpClient,
  layout,
  loadDeviceId,
  radius,
  scaleFontSize,
  scaleHeight,
  scaleWidth,
  space,
  typography,
} from '@multitv/shared';
import type {EcoBalance, McpDataClient} from '@multitv/shared';
import {BrandMark} from './home/Brand';
import {WelcomeSettingTile, WelcomeTile} from './welcome/WelcomeTile';

export interface WelcomeScreenProps {
  /** Injected in tests; the app uses the device-id backed MCP client. */
  client?: McpDataClient;
  /** GLOBIE LEARN: the species field guide. */
  onOpenLearn?: () => void;
  /** GLOBIE QUESTS: the mission hub. */
  onOpenQuests?: () => void;
  /** SOUND SCAPES: the meditation sound shelves. */
  onOpenSoundscapes?: () => void;
  /** SETTING: the device pairing panel is the only settings surface. */
  onOpenSettings?: () => void;
  /** WARDROBE: the mascot skins paid for with eco-tokens. */
  onOpenWardrobe?: () => void;
  /** DAILY FOCUS: the breathing and guided-session screen. */
  onOpenFocus?: () => void;
}

type FocusDirection = 'up' | 'down' | 'left' | 'right';

const formatCount = (value: number): string =>
  String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/**
 * Screen 0. A four-tile menu over the forest background.
 *
 * Tiles sit in one row with SETTING centred beneath, so the Cartesian focus
 * algorithm would have to guess the diagonal moves. Every edge is linked
 * explicitly instead - the same approach SoundscapesScreen uses for its shelf.
 */
export const WelcomeScreen = ({
  client,
  onOpenLearn,
  onOpenQuests,
  onOpenSoundscapes,
  onOpenSettings,
  onOpenWardrobe,
  onOpenFocus,
}: WelcomeScreenProps) => {
  const mcp = useMemo(
    () =>
      client ??
      createGlobieMcpClient({
        getDeviceId: loadDeviceId,
      }),
    [client],
  );

  const [eco, setEco] = useState<EcoBalance | null>(null);
  const [wardrobeFocused, setWardrobeFocused] = useState(false);
  const [dailyFocusFocused, setDailyFocusFocused] = useState(false);
  // Only the first render asks for the remote focus. If it stayed true, the
  // native setter would call requestFocus() again on every re-render and snap
  // the ring back to LEARN after each D-pad move.
  const [bootFocus, setBootFocus] = useState(true);

  const learnRef = useRef<View | null>(null);
  const soundscapesRef = useRef<View | null>(null);
  const questsRef = useRef<View | null>(null);
  const settingRef = useRef<View | null>(null);
  const wardrobeRef = useRef<View | null>(null);
  const dailyFocusRef = useRef<View | null>(null);
  /** Set once the tile really has the remote focus. */
  const learnHasFocus = useRef(false);

  useEffect(() => {
    let cancelled = false;
    mcp
      .connect()
      .then(() => mcp.callTool<EcoBalance>('get_eco_balance'))
      .then(value => {
        if (!cancelled) {
          setEco(value);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEco(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [mcp]);

  useEffect(() => {
    const timer = setTimeout(() => setBootFocus(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const tagOf = (node: View | null | undefined): number | null => {
      if (!node) {
        return null;
      }
      try {
        return findNodeHandle(node as unknown as React.Component);
      } catch {
        return null;
      }
    };
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

    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (delay: number, run: () => void) => {
      timers.push(setTimeout(run, delay));
    };

    // Start on GLOBIE LEARN. This used to be `hasTVPreferredFocus`, but the
    // native setter calls requestFocus() on every re-render, which snapped
    // the ring back to this tile after each D-pad move.
    const claimFocus = () => {
      if (learnHasFocus.current) {
        return;
      }
      const focusedTag = tagOf(learnRef.current);
      try {
        if (focusedTag !== null) {
          FocusManager.focus(focusedTag);
        }
      } catch {
        // The Jest turbo-module stub does not implement focus().
      }
    };

    // Deferred: on mount the tiles are not yet registered with the native
    // focus manager, so setNextFocus rejects their tags as invalid. Waiting a
    // frame lets the tiles attach and makes every link stick.
    later(300, () => {
      link(learnRef.current, soundscapesRef.current, 'right');
      link(soundscapesRef.current, learnRef.current, 'left');
      link(soundscapesRef.current, questsRef.current, 'right');
      link(questsRef.current, soundscapesRef.current, 'left');

      [learnRef, soundscapesRef, questsRef].forEach(tile =>
        link(tile.current, settingRef.current, 'down'),
      );
      [learnRef, soundscapesRef, questsRef].forEach(tile =>
        link(tile.current, wardrobeRef.current, 'up'),
      );
      link(wardrobeRef.current, learnRef.current, 'down');
      link(settingRef.current, soundscapesRef.current, 'up');

      // The header pills sit side by side, left of the eco balance.
      link(dailyFocusRef.current, wardrobeRef.current, 'right');
      link(wardrobeRef.current, dailyFocusRef.current, 'left');
      link(dailyFocusRef.current, learnRef.current, 'down');

      claimFocus();
    });

    // Returning from a child screen tears a heavy tree down and the tiles can
    // attach after that first attempt; the native manager then falls back to
    // the header button, which leaves the row without a ring. The claim is
    // retried until the tile reports focus, so a viewer who already moved never
    // sees the ring jump back.
    later(1500, claimFocus);
    later(3000, claimFocus);

    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <View style={styles.root} testID="welcome-screen">
      <View style={styles.header}>
        <BrandMark />
        <View style={styles.headerActions}>
          <TouchableOpacity
            ref={dailyFocusRef}
            testID="header-daily-focus"
            activeOpacity={1}
            accessibilityRole="button"
            accessibilityLabel="Daily Focus, open focus mode"
            onPress={onOpenFocus}
            onFocus={() => setDailyFocusFocused(true)}
            onBlur={() => setDailyFocusFocused(false)}
            style={[
              styles.dailyButton,
              dailyFocusFocused && styles.dailyButtonFocused,
              {borderColor: dailyFocusFocused ? color.gold : color.border},
            ]}>
            <View
              style={[
                styles.dailyDot,
                dailyFocusFocused && styles.dailyDotFocused,
              ]}
            />
            <Text
              style={[
                styles.dailyLabel,
                dailyFocusFocused && styles.dailyLabelFocused,
                {fontSize: scaleFontSize(typography.caption)},
              ]}>
              Daily Focus
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            ref={wardrobeRef}
            testID="header-wardrobe"
            activeOpacity={1}
            accessibilityRole="button"
            accessibilityLabel="Wardrobe"
            onPress={onOpenWardrobe}
            onFocus={() => setWardrobeFocused(true)}
            onBlur={() => setWardrobeFocused(false)}
            style={[
              styles.wardrobeButton,
              wardrobeFocused && styles.wardrobeButtonFocused,
              {borderColor: wardrobeFocused ? color.text : color.border},
            ]}>
            <Text
              style={[
                styles.wardrobeLabel,
                {fontSize: scaleFontSize(typography.caption)},
              ]}>
              Wardrobe
            </Text>
          </TouchableOpacity>
          <View style={styles.ecoPill} testID="welcome-eco">
            <View style={styles.ecoDot} />
            <Text
              style={[
                styles.ecoText,
                {fontSize: scaleFontSize(typography.caption)},
              ]}>
              {eco ? `${formatCount(eco.balance)} eco-tokens` : 'eco balance'}
            </Text>
          </View>
        </View>
      </View>

      <Text
        style={[styles.title, {fontSize: scaleFontSize(104), lineHeight: scaleFontSize(118)}]}
        testID="welcome-title">
        WELCOME
      </Text>

      <View style={styles.tileRow}>
        <WelcomeTile
          ref={learnRef}
          testID="welcome-tile-learn"
          label="GLOBIE LEARN"
          art={require('../assets/brand/mascot-baby-kae-na.png')}
          hasTVPreferredFocus={bootFocus}
          onFocus={() => {
            learnHasFocus.current = true;
          }}
          onPress={onOpenLearn}
        />
        <WelcomeTile
          ref={soundscapesRef}
          testID="welcome-tile-soundscapes"
          label="SOUND SCAPES"
          art={require('../assets/brand/guardian-kae-na.png')}
          onPress={onOpenSoundscapes}
        />
        <WelcomeTile
          ref={questsRef}
          testID="welcome-tile-quests"
          label="GLOBIE QUESTS"
          art={require('../assets/brand/mascot-baby-yang-na.png')}
          onPress={onOpenQuests}
        />
      </View>

      <View style={styles.settingRow}>
        <WelcomeSettingTile
          ref={settingRef}
          testID="welcome-tile-setting"
          onPress={onOpenSettings}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.surface,
    paddingTop: scaleHeight(layout.insetY),
    paddingBottom: scaleHeight(layout.insetY),
  },
  header: {
    height: scaleHeight(layout.headerHeight),
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scaleWidth(layout.insetX),
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleWidth(space.xs),
    marginLeft: 'auto',
  },
  dailyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleWidth(space.xxs),
    borderWidth: scaleWidth(2),
    borderRadius: scaleWidth(radius.pill),
    paddingHorizontal: scaleWidth(space.sm),
    paddingVertical: scaleWidth(space.xxs),
    backgroundColor: color.surfaceInner,
  },
  dailyButtonFocused: {
    backgroundColor: color.gold,
  },
  dailyDot: {
    width: scaleWidth(10),
    height: scaleWidth(10),
    borderRadius: scaleWidth(5),
    backgroundColor: color.gold,
  },
  dailyDotFocused: {
    backgroundColor: color.surface,
  },
  dailyLabel: {
    color: color.gold,
    fontWeight: '700',
  },
  dailyLabelFocused: {
    color: color.surface,
  },
  wardrobeButton: {
    borderWidth: scaleWidth(2),
    borderRadius: scaleWidth(radius.pill),
    paddingHorizontal: scaleWidth(space.sm),
    paddingVertical: scaleWidth(space.xxs),
    backgroundColor: color.surfaceInner,
  },
  wardrobeButtonFocused: {
    backgroundColor: color.surfaceRaise,
  },
  wardrobeLabel: {
    color: color.text,
    fontWeight: '600',
  },
  ecoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleWidth(space.xxs),
    borderRadius: scaleWidth(radius.pill),
    paddingHorizontal: scaleWidth(space.sm),
    paddingVertical: scaleWidth(space.xxs),
    backgroundColor: color.surfaceInner,
  },
  ecoDot: {
    width: scaleWidth(12),
    height: scaleWidth(12),
    borderRadius: scaleWidth(6),
    backgroundColor: color.gold,
  },
  ecoText: {
    color: color.text,
    fontWeight: '600',
  },
  title: {
    color: color.text,
    fontWeight: '700',
    letterSpacing: 2,
    textAlign: 'center',
    marginTop: scaleHeight(96),
  },
  tileRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: scaleWidth(164),
    paddingHorizontal: scaleWidth(72),
    marginTop: scaleHeight(150),
  },
  settingRow: {
    alignItems: 'center',
    marginTop: scaleHeight(110),
  },
});

/** Re-exported so the navigator has one import for both screens. */
export type {WelcomeScreenProps as WelcomeProps};
