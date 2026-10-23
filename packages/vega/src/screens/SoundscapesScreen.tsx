import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
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
  TVFocusGuideView,
  findNodeHandle,
} from '@amazon-devices/react-native-kepler';
import {
  CoverArt,
  FocusCard,
  Shelf,
  StateView,
  color,
  createGlobieMcpClient,
  focus,
  layout,
  loadDeviceId,
  plainText,
  radius,
  scaleFontSize,
  scaleHeight,
  scaleWidth,
  space,
  typography,
} from '@multitv/shared';
import type {
  FeedList,
  McpDataClient,
  PodcastFeed,
  PodcastTheme,
  ThemeList,
} from '@multitv/shared';
import {BrandMark, GearGlyph} from './home/Brand';
import {MascotStage} from './home/MascotStage';
import {ThemeChips} from './home/ThemeChips';

export interface SoundscapesScreenProps {
  /** Injected in tests; the app uses the device-id backed MCP client. */
  client?: McpDataClient;
  onOpenFeed?: (feed: PodcastFeed) => void;
  onBack?: () => void;
}

type Status = 'loading' | 'ready' | 'error';
type FocusDirection = 'up' | 'down' | 'left' | 'right';

/** The page opens on the meditation shelf; every chip filters it in place. */
const DEFAULT_THEME = 'meditation';

const pickTheme = (themes: PodcastTheme[]): PodcastTheme | null =>
  themes.find(theme => theme.theme === DEFAULT_THEME) ?? themes[0] ?? null;

const BackButton = React.forwardRef<View, {onPress?: () => void}>(
  function BackButton({onPress}, ref) {
    const [focused, setFocused] = useState(false);
    return (
      <TouchableOpacity
        ref={ref}
        testID="soundscapes-back"
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

/**
 * Screen 2. A meditation shelf with the leading show pulled up as a hero.
 *
 * The right column is a downward hero: the page title and rule sit above the
 * artwork, and the companion stands beside it. The left column carries the
 * show copy and actions, so D-pad focus only ever moves between the two
 * action pills, the theme row and the cards.
 */
export const SoundscapesScreen = ({
  client,
  onOpenFeed,
  onBack,
}: SoundscapesScreenProps) => {
  const mcp = useMemo(
    () =>
      client ??
      createGlobieMcpClient({
        getDeviceId: loadDeviceId,
      }),
    [client],
  );

  const [status, setStatus] = useState<Status>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [themes, setThemes] = useState<PodcastTheme[]>([]);
  const [selectedTheme, setSelectedTheme] = useState<PodcastTheme | null>(null);
  const [feeds, setFeeds] = useState<PodcastFeed[]>([]);
  const [shelfNote, setShelfNote] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [focusedAction, setFocusedAction] = useState<
    'cta' | 'episodes' | null
  >(null);
  const heroCtaRef = useRef<View | null>(null);
  const backRef = useRef<View | null>(null);
  const chipNodes = useRef<Array<View | null>>([]);
  const cardNodes = useRef<Map<string, View>>(new Map());
  const themeRequest = useRef(0);

  /**
   * The CTA is rendered from the first frame (the shelf data gates only the
   * copy above it), so a preferred-focus claim made here survives the
   * platform's initial focus pass. It is released once the user has had time
   * to move, so the claim is not re-applied on a later remount.
   */
  const [ctaBootFocus, setCtaBootFocus] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setCtaBootFocus(false), 1200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setStatus('loading');
      setErrorMessage('');
      try {
        await mcp.connect();
        const themeResult = await mcp.callTool<ThemeList>(
          'get_podcasts_by_theme',
          {},
        );
        if (cancelled) {
          return;
        }
        const initial = pickTheme(themeResult.themes);
        setThemes(themeResult.themes);
        setSelectedTheme(initial);
        setFocusedIndex(0);
        if (!initial) {
          setFeeds([]);
          setShelfNote(themeResult.note ?? null);
          setStatus('ready');
          return;
        }
        const list = await mcp.callTool<FeedList>('get_podcasts_by_theme', {
          theme: initial.theme,
          max: 20,
        });
        if (cancelled) {
          return;
        }
        setFeeds(list.feeds);
        setShelfNote(list.note ?? null);
        setStatus('ready');
      } catch (error) {
        if (cancelled) {
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : String(error));
        setStatus('error');
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [mcp, reloadKey]);

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
    if (status !== 'ready') {
      return;
    }
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

    const firstChip = chipNodes.current[0];
    const firstCard = cardNodes.current.get(String(feeds[0]?.id));

    link(heroCtaRef.current, firstChip, 'down');
    link(heroCtaRef.current, backRef.current, 'up');
    link(backRef.current, heroCtaRef.current, 'down');
    chipNodes.current.forEach(node => {
      link(node, heroCtaRef.current, 'up');
      link(node, firstCard, 'down');
    });
    feeds.forEach(feed => {
      const card = cardNodes.current.get(String(feed.id));
      link(card, firstChip, 'up');
    });
  }, [status, feeds, themes]);

  const handleSelectTheme = useCallback(
    (theme: PodcastTheme) => {
      setSelectedTheme(theme);
      setShelfNote(null);
      const requestId = ++themeRequest.current;
      mcp
        .callTool<FeedList>('get_podcasts_by_theme', {
          theme: theme.theme,
          max: 20,
        })
        .then(result => {
          if (requestId !== themeRequest.current) {
            return;
          }
          setFeeds(result.feeds);
          setShelfNote(result.note ?? null);
          setFocusedIndex(0);
        })
        .catch(error => {
          if (requestId !== themeRequest.current) {
            return;
          }
          setFeeds([]);
          setShelfNote(error instanceof Error ? error.message : String(error));
        });
    },
    [mcp],
  );

  const heroFeed =
    feeds[Math.min(focusedIndex, feeds.length - 1)] ?? feeds[0] ?? null;
  const eyebrow = (selectedTheme?.label ?? 'MEDITATION').toUpperCase();
  const shelfTitle = selectedTheme?.label ?? 'Meditation';
  const emptyNote = shelfNote ?? 'No shows matched that theme.';
  const longTitle = (heroFeed?.title.length ?? 0) > 26;
  const description = plainText(heroFeed?.description);

  return (
    <View style={styles.root} testID="soundscapes-screen">
      <View style={styles.columns}>
        <View style={styles.leftColumn}>
          <View style={styles.brandRow}>
            <BackButton ref={backRef} onPress={onBack} />
            <BrandMark />
            <Image
              source={require('../assets/brand/flower.png')}
              style={styles.daisy}
              resizeMode="contain"
              accessible={false}
            />
          </View>

          <View style={styles.heroCopy}>
            {status === 'ready' && heroFeed ? (
              <>
                <View style={styles.eyebrowPill}>
                  <Text
                    style={[
                      styles.eyebrow,
                      {fontSize: scaleFontSize(typography.label)},
                    ]}>
                    {eyebrow}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.heroTitle,
                    {
                      fontSize: scaleFontSize(
                        longTitle ? typography.headline : typography.display,
                      ),
                      lineHeight: scaleFontSize(longTitle ? 50 : 78),
                    },
                  ]}
                  numberOfLines={longTitle ? 2 : 1}
                  testID="soundscapes-title">
                  {heroFeed.title}
                </Text>
                {description ? (
                  <Text
                    style={[
                      styles.description,
                      {
                        fontSize: scaleFontSize(typography.caption),
                        lineHeight: scaleFontSize(30),
                      },
                    ]}
                    numberOfLines={2}
                    testID="soundscapes-description">
                    {description}
                  </Text>
                ) : null}
              </>
            ) : null}
            <View style={styles.actions}>
              <TouchableOpacity
                ref={heroCtaRef}
                testID="soundscapes-cta"
                activeOpacity={1}
                accessibilityRole="button"
                accessibilityLabel={
                  heroFeed ? `Listen ${heroFeed.title}` : 'Listen'
                }
                accessibilityHint="Opens the player"
                hasTVPreferredFocus={ctaBootFocus}
                onPress={() => {
                  if (heroFeed) {
                    onOpenFeed?.(heroFeed);
                  }
                }}
                onFocus={() => setFocusedAction('cta')}
                onBlur={() => setFocusedAction(null)}
                style={[
                  styles.primary,
                  focusedAction === 'cta' && styles.actionFocused,
                ]}>
                <Text
                  style={[
                    styles.primaryLabel,
                    {fontSize: scaleFontSize(typography.body)},
                  ]}>
                  ▶ Listen
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="soundscapes-episodes"
                activeOpacity={1}
                accessibilityRole="button"
                accessibilityLabel={
                  heroFeed ? `Episodes of ${heroFeed.title}` : 'Episodes'
                }
                accessibilityHint="Opens the show"
                onPress={() => {
                  if (heroFeed) {
                    onOpenFeed?.(heroFeed);
                  }
                }}
                onFocus={() => setFocusedAction('episodes')}
                onBlur={() => setFocusedAction(null)}
                style={[
                  styles.secondary,
                  focusedAction === 'episodes' && styles.actionFocused,
                ]}>
                <Text
                  style={[
                    styles.secondaryLabel,
                    {fontSize: scaleFontSize(typography.body)},
                  ]}>
                  Episodes
                </Text>
              </TouchableOpacity>
              {heroFeed?.author ? (
                <Text
                  style={[
                    styles.author,
                    {fontSize: scaleFontSize(typography.caption)},
                  ]}
                  numberOfLines={1}>
                  by {heroFeed.author}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        <View style={styles.rightColumn}>
          <View style={styles.pageTitleRow}>
            <Text
              style={[
                styles.pageTitle,
                {
                  fontSize: scaleFontSize(typography.display),
                  lineHeight: scaleFontSize(78),
                },
              ]}
              testID="soundscapes-heading">
              SOUNDSCAPES
            </Text>
            <GearGlyph size={47} />
          </View>
          <View style={styles.rule} />
          {status === 'ready' && heroFeed ? (
            <View style={styles.coverRow}>
              <CoverArt
                seed={String(heroFeed.id)}
                title={heroFeed.title}
                image={heroFeed.image}
                size={216}
                testID="soundscapes-cover"
              />
              <MascotStage
                variant="mother-tree"
                size={188}
                hopKey={String(heroFeed.id)}
                label="GLOBIE COMPANION"
                testID="soundscapes-mascot"
              />
            </View>
          ) : null}
        </View>
      </View>

      {status === 'loading' ? (
        <StateView variant="loading" testID="soundscapes-loading" />
      ) : null}

      {status === 'error' ? (
        <StateView
          variant="error"
          message={errorMessage}
          onRetry={() => setReloadKey(key => key + 1)}
          testID="soundscapes-error"
        />
      ) : null}

      {status === 'ready' ? (
        <>
          <View style={styles.chipsRow}>
            <View style={styles.chipsWrap}>
              <ThemeChips
                themes={themes}
                selectedTheme={selectedTheme?.theme ?? null}
                onSelect={handleSelectTheme}
                onChipRef={(index, node) => {
                  chipNodes.current[index] = node;
                }}
                testID="soundscapes-chips"
              />
            </View>
            <Text style={styles.moreGlyph} accessible={false}>
              ›
            </Text>
          </View>

          <TVFocusGuideView enabled style={styles.shelfGuide}>
            {feeds.length > 0 ? (
              <Shelf
                title={shelfTitle}
                count={feeds.length}
                laneGap={50}
                testID="soundscapes-shelf">
                {feeds.map((feed, index) => (
                  <FocusCard
                    key={String(feed.id)}
                    ref={node => {
                      if (node) {
                        cardNodes.current.set(String(feed.id), node);
                      } else {
                        cardNodes.current.delete(String(feed.id));
                      }
                    }}
                    title={feed.title}
                    seed={String(feed.id)}
                    image={feed.image}
                    designWidth={200}
                    accessibilityLabel={`${feed.title}${
                      feed.author ? ` by ${feed.author}` : ''
                    }`}
                    accessibilityHint="Opens the player"
                    testID={`soundscapes-card-${index}`}
                    onFocus={() => setFocusedIndex(index)}
                    onPress={() => onOpenFeed?.(feed)}
                  />
                ))}
              </Shelf>
            ) : (
              <StateView
                variant="empty"
                note={emptyNote}
                testID="soundscapes-empty"
              />
            )}
          </TVFocusGuideView>
        </>
      ) : null}
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
  columns: {
    flexDirection: 'row',
    gap: scaleWidth(space.lg),
  },
  leftColumn: {
    flex: 1.4,
  },
  rightColumn: {
    flex: 1,
  },
  brandRow: {
    height: scaleHeight(75),
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: scaleWidth(24),
  },
  back: {
    minHeight: scaleHeight(focus.target),
    justifyContent: 'center',
    paddingHorizontal: scaleWidth(space.sm),
    borderRadius: scaleWidth(radius.pill),
    borderWidth: scaleWidth(focus.ringWidth / 2),
  },
  backLabel: {
    color: color.text,
    fontWeight: '700',
    letterSpacing: 1,
  },
  daisy: {
    width: scaleWidth(117),
    height: scaleWidth(101),
    marginTop: scaleHeight(8),
  },
  heroCopy: {
    flexShrink: 1,
  },
  eyebrowPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: scaleWidth(space.xs),
    paddingVertical: scaleWidth(space.xxs) / 2,
    borderRadius: scaleWidth(radius.pill),
    backgroundColor: color.accent,
    marginBottom: scaleHeight(space.xxs),
  },
  eyebrow: {
    color: color.surface,
    fontWeight: '800',
    letterSpacing: 2,
  },
  heroTitle: {
    color: color.text,
    fontWeight: '700',
    letterSpacing: -1,
  },
  description: {
    color: color.textMuted,
    paddingTop: scaleHeight(space.xxs) / 2,
    flexShrink: 1,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleWidth(space.sm),
    paddingTop: scaleHeight(space.sm),
  },
  primary: {
    minHeight: scaleHeight(focus.target),
    justifyContent: 'center',
    borderWidth: scaleWidth(focus.ringWidth),
    borderColor: color.accent,
    borderRadius: scaleWidth(radius.pill),
    paddingHorizontal: scaleWidth(space.md),
    backgroundColor: color.accent,
  },
  primaryLabel: {
    color: color.surface,
    fontWeight: '700',
  },
  actionFocused: {
    borderColor: color.text,
  },
  secondary: {
    minHeight: scaleHeight(focus.target),
    justifyContent: 'center',
    borderWidth: scaleWidth(focus.ringWidth),
    borderColor: color.border,
    borderRadius: scaleWidth(radius.pill),
    paddingHorizontal: scaleWidth(space.md),
    backgroundColor: color.surfaceInner,
  },
  secondaryLabel: {
    color: color.text,
    fontWeight: '700',
  },
  author: {
    color: color.textMuted,
    flexShrink: 1,
  },
  pageTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pageTitle: {
    color: color.text,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  rule: {
    height: scaleHeight(14),
    backgroundColor: color.text,
    marginTop: scaleHeight(6),
  },
  coverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleWidth(115),
    marginTop: scaleHeight(space.xxs),
  },
  chipsRow: {
    height: scaleHeight(focus.target),
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: scaleHeight(30),
  },
  chipsWrap: {
    flex: 1,
    minWidth: 0,
  },
  moreGlyph: {
    color: color.text,
    fontSize: scaleFontSize(44),
    lineHeight: scaleFontSize(44),
    paddingLeft: scaleWidth(space.xs),
    paddingBottom: scaleHeight(4),
  },
  shelfGuide: {
    flex: 1,
    minHeight: 0,
    marginTop: scaleHeight(space.lg),
  },
});
