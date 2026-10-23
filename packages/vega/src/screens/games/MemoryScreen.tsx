import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
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
  StateView,
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
import type {SpeciesClient} from '@multitv/shared';
import {BrandMark} from '../home/Brand';
import {useReducedMotion} from '../home/MascotStage';
import type {SearchRelayClient} from '../SearchScreen';
import {BackPill} from './BackPill';
import {Confetti, CountUp, PopIn} from './Celebrate';
import {RewardBurst} from './RewardBurst';
import {buildMemoryDeck, gameName} from './rounds';
import type {GameSpecies, MemoryCard, Rng} from './rounds';
import {useSpeciesPool} from './useSpeciesPool';

export interface MemoryScreenProps {
  /** Injected in tests; the app uses the default fetch-backed client. */
  client?: SpeciesClient;
  /** The voice relay's wallet; absent in tests, which still celebrate. */
  relay?: SearchRelayClient;
  onBack?: () => void;
  /** Injected in tests so the deck is predictable. */
  rng?: Rng;
}

type FocusDirection = 'up' | 'down' | 'left' | 'right';

/** Six pairs fill a four-wide, three-row grid without scrolling. */
const PAIRS = 6;
const COLUMNS = 4;
const CARD_WIDTH = 392;
const CARD_HEIGHT = 220;
const GRID_GAP = 40;
/** Long enough to read the name and let the photo finish loading. */
const MISMATCH_MS = 1600;
/** One pair is worth the same every time; the wallet dedupes the award. */
const MATCH_TOKENS = 5;

interface MatchReward {
  id: number;
  mascot: 'kae-na' | 'yang-na';
  score: string;
}

/**
 * MEMORY MATCH. Two copies of six species; the pair id, never the card image,
 * decides a match, so two different photos of one species still pair up.
 */
export const MemoryScreen = ({client, relay, onBack, rng}: MemoryScreenProps) => {
  const {status, pool, error, retry} = useSpeciesPool(client);
  const [session, setSession] = useState(0);
  const [flipped, setFlipped] = useState<string[]>([]);
  const [matched, setMatched] = useState<string[]>([]);
  const [moves, setMoves] = useState(0);
  const [wallet, setWallet] = useState<number | null>(null);
  const [reward, setReward] = useState<MatchReward | null>(null);
  const [bootFocus, setBootFocus] = useState(true);
  const [summaryFocus, setSummaryFocus] = useState(false);
  /** The summary pill is an accent fill, so it needs its own ring. */
  const [againFocused, setAgainFocused] = useState(false);

  const backRef = useRef<View | null>(null);
  const cardNodes = useRef<Array<View | null>>([]);
  /** Counts matches, so the two baby guardians alternate. */
  const matchCount = useRef(0);

  const deck = useMemo(
    () => buildMemoryDeck(pool, PAIRS, rng),
    // `session` deals a fresh deck from the same pool.
    [pool, session, rng],
  );

  const finished = deck.length > 0 && matched.length * 2 >= deck.length;
  const playable = status === 'ready' && pool.length >= 2;

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

  // Cleared once: a permanent `hasTVPreferredFocus` re-requests focus on every
  // re-render, which would snap the ring back to the first card after each
  // D-pad move. Re-armed by `restart` so the fresh deck claims the ring again.
  useEffect(() => {
    if (!bootFocus) {
      return undefined;
    }
    const timer = setTimeout(() => setBootFocus(false), 1500);
    return () => clearTimeout(timer);
  }, [bootFocus]);

  // Same one-shot treatment for the summary: the deck is gone, so PLAY AGAIN
  // has to claim the ring once or the D-pad has nothing to move from.
  useEffect(() => {
    if (!finished) {
      setSummaryFocus(false);
      return undefined;
    }
    setSummaryFocus(true);
    const timer = setTimeout(() => setSummaryFocus(false), 1200);
    return () => clearTimeout(timer);
  }, [finished]);

  const flip = useCallback(
    (card: MemoryCard) => {
      if (
        matched.includes(card.pair) ||
        flipped.includes(card.key) ||
        flipped.length >= 2
      ) {
        return;
      }
      const next = [...flipped, card.key];
      setFlipped(next);
      if (next.length === 2) {
        setMoves(value => value + 1);
      }
    },
    [flipped, matched],
  );

  /** A pair found: celebrate it, then let the wallet confirm the credit. */
  const celebrate = useCallback(
    (pair: string) => {
      const found = matchCount.current + 1;
      matchCount.current = found;
      setReward({
        id: found,
        mascot: found % 2 === 0 ? 'kae-na' : 'yang-na',
        score: `${found} / ${deck.length / 2} PAIRS`,
      });
      if (!relay) {
        return;
      }
      // The key is stable per pair per deal, so a burst replay or a remount
      // cannot pay the same pair twice.
      void relay
        .awardTokens(`memory:${session}:${pair}`, MATCH_TOKENS)
        .then(award => {
          if (award.available) {
            setWallet(award.balance);
          }
        })
        .catch(() => undefined);
    },
    [deck.length, relay, session],
  );

  useEffect(() => {
    if (!relay) {
      return undefined;
    }
    let mounted = true;
    void relay
      .loadWallet()
      .then(walletNow => {
        if (mounted && walletNow.available) {
          setWallet(walletNow.balance);
        }
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [relay]);

  useEffect(() => {
    if (flipped.length !== 2) {
      return;
    }
    const [first, second] = flipped;
    const cardA = deck.find(card => card.key === first);
    const cardB = deck.find(card => card.key === second);
    if (!cardA || !cardB) {
      return;
    }
    if (cardA.pair === cardB.pair) {
      setMatched(pairs => [...pairs, cardA.pair]);
      setFlipped([]);
      celebrate(cardA.pair);
      return;
    }
    // A mismatch stays visible long enough to be read, then turns back over.
    const timer = setTimeout(() => setFlipped([]), MISMATCH_MS);
    return () => clearTimeout(timer);
  }, [celebrate, flipped, deck]);

  const restart = useCallback(() => {
    matchCount.current = 0;
    setReward(null);
    setSession(value => value + 1);
    setFlipped([]);
    setMatched([]);
    setMoves(0);
    // The summary unmounts with the old deck, so without this the new grid
    // renders with no focused node and the D-pad goes dead.
    setBootFocus(true);
  }, []);

  useEffect(() => {
    if (status !== 'ready' || finished || deck.length === 0) {
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

    const nodes = cardNodes.current;
    nodes.forEach((node, index) => {
      if (!node) {
        return;
      }
      const row = Math.floor(index / COLUMNS);
      const column = index % COLUMNS;
      if (column > 0) {
        link(node, nodes[index - 1], 'left');
      }
      if (column < COLUMNS - 1) {
        link(node, nodes[index + 1], 'right');
      }
      if (row > 0) {
        link(node, nodes[index - COLUMNS], 'up');
      } else {
        link(node, backRef.current, 'up');
      }
      link(node, nodes[index + COLUMNS], 'down');
    });
    link(backRef.current, nodes[0], 'down');
  }, [status, finished, deck]);

  return (
    <View style={styles.root} testID="memory-screen">
      <View style={styles.header}>
        <BackPill ref={backRef} onPress={onBack} />
        <BrandMark />
      </View>

      <View style={styles.titleRow}>
        <Text
          style={[
            styles.title,
            {fontSize: scaleFontSize(84), lineHeight: scaleFontSize(96)},
          ]}>
          MEMORY MATCH
        </Text>
        {playable && !finished ? (
          <Text
            testID="memory-moves"
            style={[
              styles.tally,
              {fontSize: scaleFontSize(typography.caption)},
            ]}>
            MOVES {moves} · PAIRS {matched.length} / {deck.length / 2}
            {wallet === null ? '' : ` · ${wallet} TOKENS`}
          </Text>
        ) : null}
      </View>

      {status === 'loading' ? (
        <StateView variant="loading" testID="memory-loading" />
      ) : null}

      {status === 'error' ? (
        <StateView
          variant="error"
          message={error}
          onRetry={retry}
          testID="memory-error"
        />
      ) : null}

      {status === 'ready' && !playable ? (
        <StateView
          variant="empty"
          note="The catalogue did not return enough species for a memory deck."
          ctaLabel="BACK TO QUESTS"
          onCta={onBack}
          testID="memory-empty"
        />
      ) : null}

      {finished ? (
        <View style={styles.summary} testID="memory-summary">
          <Confetti testID="memory-confetti" />
          <Text
            style={[
              styles.summaryKicker,
              {fontSize: scaleFontSize(typography.label)},
            ]}>
            ALL PAIRS FOUND
          </Text>
          <PopIn trigger={`moves:${moves}:${session}`} delayMs={100}>
            <CountUp
              testID="memory-summary-moves"
              value={moves}
              suffix=" MOVES"
              delayMs={140}
              style={[
                styles.summaryScore,
                {fontSize: scaleFontSize(120), lineHeight: scaleFontSize(132)},
              ]}
            />
          </PopIn>
          <Text
            style={[
              styles.summaryLine,
              {fontSize: scaleFontSize(typography.body)},
            ]}>
            {moves <= deck.length
              ? 'Sharp eyes — that is close to a perfect memory.'
              : 'Try again and beat your move count.'}
          </Text>
          <CountUp
            testID="memory-tokens"
            value={matched.length * MATCH_TOKENS}
            prefix="+"
            suffix=" ECO TOKENS"
            delayMs={240}
            style={[
              styles.summaryTokens,
              {fontSize: scaleFontSize(typography.title)},
            ]}
          />
          <TouchableOpacity
            testID="memory-again"
            activeOpacity={1}
            accessibilityRole="button"
            accessibilityLabel="Deal a new deck"
            hasTVPreferredFocus={summaryFocus}
            onPress={restart}
            onFocus={() => setAgainFocused(true)}
            onBlur={() => setAgainFocused(false)}
            style={[styles.next, styles.again, againFocused && styles.nextFocused]}>
            <Text
              style={[
                styles.nextLabel,
                {fontSize: scaleFontSize(typography.body)},
              ]}>
              PLAY AGAIN
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {playable && !finished ? (
        <View style={styles.grid} testID="memory-grid">
          {deck.map((card, index) => (
            <MemoryTile
              key={card.key}
              ref={node => {
                cardNodes.current[index] = node;
              }}
              testID={`memory-card-${index}`}
              species={card.species}
              faceUp={flipped.includes(card.key) || matched.includes(card.pair)}
              matched={matched.includes(card.pair)}
              wrong={
                flipped.length === 2 &&
                flipped.includes(card.key) &&
                !matched.includes(card.pair)
              }
              hasTVPreferredFocus={bootFocus && index === 0}
              onPress={() => flip(card)}
            />
          ))}
        </View>
      ) : null}

      {reward ? (
        <RewardBurst
          key={reward.id}
          mascot={reward.mascot}
          amount={MATCH_TOKENS}
          label="PAIR FOUND"
          score={reward.score}
          onDone={() =>
            setReward(current => (current?.id === reward.id ? null : current))
          }
        />
      ) : null}
    </View>
  );
};

interface MemoryTileProps {
  species: GameSpecies;
  faceUp: boolean;
  matched: boolean;
  /** The two cards of a miss: they shake while the player reads them. */
  wrong: boolean;
  hasTVPreferredFocus: boolean;
  testID: string;
  onPress: () => void;
}

const MemoryTile = React.forwardRef<View, MemoryTileProps>(function MemoryTile(
  {species, faceUp, matched, wrong, hasTVPreferredFocus, testID, onPress},
  ref,
) {
  const [focused, setFocused] = useState(false);
  const [failed, setFailed] = useState(false);
  const reduced = useReducedMotion();
  /** What the tile is drawing right now; the face swaps edge-on. */
  const [drawn, setDrawn] = useState(faceUp);
  const [flash, setFlash] = useState(false);
  /** 0 = edge-on, 1 = flat. Drives the scaleX squash that reads as a flip. */
  const turn = useRef(new Animated.Value(1)).current;
  const pop = useRef(new Animated.Value(0)).current;
  const shake = useRef(new Animated.Value(0)).current;
  const lastFace = useRef(faceUp);
  const wasMatched = useRef(matched);
  const wasWrong = useRef(false);

  useEffect(() => {
    if (lastFace.current === faceUp) {
      return undefined;
    }
    const target = faceUp;
    lastFace.current = target;
    if (reduced) {
      setDrawn(target);
      turn.setValue(1);
      return undefined;
    }
    turn.setValue(0);
    const listener = turn.addListener(({value}) => {
      if (value >= 0.5) {
        setDrawn(target);
      }
    });
    const beat = Animated.sequence([
      Animated.timing(turn, {
        toValue: 0.5,
        duration: 130,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(turn, {
        toValue: 1,
        duration: 170,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
    ]);
    beat.start();
    return () => {
      beat.stop();
      turn.removeListener(listener);
    };
  }, [faceUp, reduced, turn]);

  useEffect(() => {
    if (!matched || wasMatched.current) {
      return undefined;
    }
    wasMatched.current = true;
    if (reduced) {
      return undefined;
    }
    setFlash(true);
    const beat = Animated.sequence([
      Animated.timing(pop, {
        toValue: 1,
        duration: 150,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(pop, {
        toValue: 0,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
    ]);
    beat.start();
    const timer = setTimeout(() => setFlash(false), 420);
    return () => {
      beat.stop();
      clearTimeout(timer);
    };
  }, [matched, pop, reduced]);

  useEffect(() => {
    if (!wrong || wasWrong.current) {
      if (!wrong) {
        wasWrong.current = false;
      }
      return undefined;
    }
    wasWrong.current = true;
    if (reduced) {
      return undefined;
    }
    const wobble = Animated.sequence(
      [-1, 1, -0.55, 0.55, 0].map(to =>
        Animated.timing(shake, {
          toValue: to,
          duration: 70,
          easing: Easing.linear,
          useNativeDriver: false,
        }),
      ),
    );
    wobble.start();
    return () => wobble.stop();
  }, [reduced, shake, wrong]);

  const showPhoto = drawn && Boolean(species.image) && !failed;
  const label = gameName(species);

  return (
    <Animated.View
      style={[
        styles.cardShell,
        {
          transform: [
            {
              translateX: shake.interpolate({
                inputRange: [-1, 1],
                outputRange: [-scaleWidth(12), scaleWidth(12)],
              }),
            },
            {
              scaleX: turn.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: [1, 0.08, 1],
              }),
            },
            {
              scale: pop.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 1.06],
              }),
            },
          ],
        },
      ]}>
      <TouchableOpacity
        ref={ref}
        testID={testID}
        activeOpacity={1}
        accessibilityRole="button"
        accessibilityLabel={
          drawn
            ? label.secondary
              ? `${label.primary}, ${label.secondary}`
              : label.primary
            : 'Hidden card'
        }
        hasTVPreferredFocus={hasTVPreferredFocus}
        onPress={onPress}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.card,
          {
            borderColor: focused
              ? color.text
              : flash
                ? color.gold
                : matched
                  ? color.accent
                  : color.border,
            backgroundColor: drawn ? color.surfaceRaise : color.surfaceInner,
            zIndex: focused ? 2 : 0,
          },
        ]}>
        {drawn ? (
          <>
            {showPhoto ? (
              <Image
                source={{uri: species.image ?? undefined}}
                style={styles.photo}
                resizeMode="cover"
                accessible={false}
                onError={() => setFailed(true)}
              />
            ) : (
              <Text
                style={[
                  styles.monogram,
                  {
                    fontSize: scaleFontSize(typography.headline),
                    lineHeight: scaleFontSize(typography.headline),
                  },
                ]}>
                {label.primary.slice(0, 1)}
              </Text>
            )}
            <View style={styles.nameBar}>
              <Text
                numberOfLines={1}
                style={[
                  styles.name,
                  {fontSize: scaleFontSize(typography.caption)},
                ]}>
                {label.primary}
              </Text>
              {label.secondary ? (
                <Text
                  numberOfLines={1}
                  style={[
                    styles.nameAlt,
                    {fontSize: scaleFontSize(typography.label)},
                  ]}>
                  {label.secondary}
                </Text>
              ) : null}
            </View>
          </>
        ) : (
          <Text
            style={[styles.glyph, {fontSize: scaleFontSize(typography.display)}]}>
            ?
          </Text>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
});

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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: scaleHeight(space.xs),
  },
  title: {
    color: color.text,
    fontWeight: '700',
    letterSpacing: 2,
  },
  tally: {
    color: color.textMuted,
    fontWeight: '700',
    letterSpacing: 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: scaleWidth(GRID_GAP),
    marginTop: scaleHeight(space.sm),
  },
  cardShell: {
    width: scaleWidth(CARD_WIDTH),
    height: scaleHeight(CARD_HEIGHT),
  },
  card: {
    width: scaleWidth(CARD_WIDTH),
    height: scaleHeight(CARD_HEIGHT),
    borderRadius: scaleWidth(radius.md),
    borderWidth: scaleWidth(focus.ringWidth / 2),
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  monogram: {
    color: color.accent,
    fontWeight: '800',
  },
  nameBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: scaleWidth(space.xs),
    paddingVertical: scaleHeight(space.xxs),
    backgroundColor: color.scrim,
  },
  name: {
    color: color.text,
    fontWeight: '700',
    lineHeight: scaleFontSize(typography.caption) * 1.25,
  },
  nameAlt: {
    color: color.textMuted,
    fontWeight: '600',
    lineHeight: scaleFontSize(typography.label) * 1.4,
  },
  glyph: {
    color: color.accent,
    fontWeight: '800',
  },
  summary: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: scaleHeight(space.sm),
  },
  summaryKicker: {
    color: color.textMuted,
    fontWeight: '800',
    letterSpacing: 4,
  },
  summaryScore: {
    color: color.accent,
    fontWeight: '800',
  },
  summaryLine: {
    color: color.textMuted,
    textAlign: 'center',
  },
  summaryTokens: {
    color: color.gold,
    fontWeight: '800',
    letterSpacing: 2,
  },
  next: {
    alignSelf: 'flex-start',
    minHeight: scaleHeight(focus.target),
    justifyContent: 'center',
    marginTop: scaleHeight(space.xs),
    paddingHorizontal: scaleWidth(space.lg),
    borderRadius: scaleWidth(radius.pill),
    borderWidth: scaleWidth(4),
    borderColor: 'transparent',
    backgroundColor: color.accent,
  },
  nextFocused: {
    // Ink disappears into the page behind the pale pill and white
    // disappears into the pill; clay reads against both.
    borderColor: color.clay,
  },
  again: {
    alignSelf: 'center',
  },
  nextLabel: {
    color: color.surface,
    fontWeight: '800',
    letterSpacing: 1,
  },
});
