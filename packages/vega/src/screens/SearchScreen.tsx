import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  BackHandler,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {TVFocusGuideView} from '@amazon-devices/react-native-kepler';
import {
  FocusCard,
  Shelf,
  StateView,
  color,
  createGlobieMcpClient,
  createTvRelayClient,
  focus,
  layout,
  loadDeviceId,
  radius,
  scaleFontSize,
  scaleHeight,
  scaleWidth,
  space,
  typography,
} from '@multitv/shared';
import type {
  ChallengeAdvanced,
  ChallengeAnswered,
  ChallengeInvitation,
  ChallengeJoined,
  ChallengeLeft,
  ChallengeOpened,
  ChallengePresenceSnapshot,
  ChallengeStarted,
  EcoAward,
  EcoSpend,
  EcoWallet,
  EcoWardrobe,
  FeedList,
  GameDeck,
  GameDeckRound,
  GameSnapshot,
  McpDataClient,
  PodcastFeed,
  TvCommandPoll,
  TvPairing,
} from '@multitv/shared';
import type {HandoffRelay} from './player/HandoffNotice';

/** A relay that cannot be reached must not spin: pause between attempts. */
const RETRY_PAUSE_MS = 3_000;

/** One voice search, numbered so a repeated query still runs again. */
export interface SearchRequest {
  query: string;
  id: number;
}

/**
 * The relay calls this app makes; injected in tests.
 *
 * The `game.*` members belong to Guess Who rather than to search, but the
 * navigator injects one relay for the whole app, so this is where the surface
 * lives. They are required: a test relay must still stub them, even if the test
 * never opens the quiz.
 */
export interface SearchRelayClient extends HandoffRelay {
  requestPairing(): Promise<TvPairing>;
  nextCommand(waitMs: number, signal?: AbortSignal): Promise<TvCommandPoll>;
  publishDeck(deck: GameDeck): Promise<{stored: boolean}>;
  reportAnswer(roundId: string, choice: string): Promise<GameSnapshot | null>;
  advanceGame(): Promise<GameSnapshot | null>;
  /** Challenge rooms: the server scores, so these replace local scoring. */
  openChallenge(rounds: GameDeckRound[]): Promise<ChallengeOpened>;
  joinChallenge(code: string, name: string, team?: 0 | 1): Promise<ChallengeJoined>;
  startChallenge(roomId: string): Promise<ChallengeStarted>;
  answerChallenge(
    roomId: string,
    slot: number,
    roundId: string,
    choice: string,
  ): Promise<ChallengeAnswered>;
  nextChallengeRound(roomId: string): Promise<ChallengeAdvanced>;
  /** Reads a room by its six digits before this television has a seat. */
  fetchChallenge(code: string): Promise<ChallengeInvitation>;
  /** The family wall: one tile per seat, polled while the lobby is open. */
  fetchChallengePresence(code: string): Promise<ChallengePresenceSnapshot>;
  /** Gives up a seat, or closes the whole room when `slot` is omitted. */
  leaveChallenge(roomId: string, slot?: number): Promise<ChallengeLeft>;
  /** The eco-token total for this television; `available: false` is normal. */
  loadWallet(): Promise<EcoWallet>;
  /** Credits one reward once per key, so a remount cannot pay twice. */
  awardTokens(key: string, amount: number): Promise<EcoAward>;
  /** What this television owns, and what the rest of the wardrobe costs. */
  loadWardrobe(): Promise<EcoWardrobe>;
  /** Buys one item; the server holds the price and debits once. */
  spendTokens(item: string): Promise<EcoSpend>;
}

export interface SearchScreenProps {
  /** Injected in tests; the app uses the device-id backed MCP client. */
  client?: McpDataClient;
  relay?: SearchRelayClient;
  /** A query delivered by the app-wide command loop. */
  request?: SearchRequest;
  /** Whether that loop has seen a paired Alexa account. */
  paired?: boolean;
  onOpenFeed?: (feed: PodcastFeed) => void;
  onBack?: () => void;
}

type Status = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Screen 2. Nothing here is typed on the TV: the Alexa Skill posts a search
 * query to the Globie Earth relay and this screen collects it, then runs the
 * same search_podcasts tool the phone app calls.
 *
 * The pairing code is the whole security story. The TV shows six digits; the
 * listener says them to Alexa; from then on only that Alexa identity may queue
 * work for this television (infra/mcp/src/tvCommands.ts).
 */
export const SearchScreen = ({
  client,
  relay,
  request,
  paired = false,
  onOpenFeed,
  onBack,
}: SearchScreenProps) => {
  const mcp = useMemo(
    () =>
      client ??
      createGlobieMcpClient({
        getDeviceId: loadDeviceId,
      }),
    [client],
  );

  const link = useMemo(
    () =>
      relay ??
      createTvRelayClient({
        getDeviceId: loadDeviceId,
      }),
    [relay],
  );

  const [pairing, setPairing] = useState<TvPairing | null>(null);
  const [pairingError, setPairingError] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [feeds, setFeeds] = useState<PodcastFeed[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [backFocused, setBackFocused] = useState(false);
  const searchRequest = useRef(0);

  const runSearch = useCallback(
    (nextQuery: string) => {
      const requestId = ++searchRequest.current;
      setQuery(nextQuery);
      setStatus('loading');
      setErrorMessage('');
      mcp
        .connect()
        .then(() => mcp.callTool<FeedList>('search_podcasts', {query: nextQuery, max: 20}))
        .then(result => {
          if (requestId !== searchRequest.current) {
            return;
          }
          setFeeds(result.feeds);
          setNote(result.note ?? null);
          setStatus('ready');
        })
        .catch(error => {
          if (requestId !== searchRequest.current) {
            return;
          }
          setFeeds([]);
          setErrorMessage(error instanceof Error ? error.message : String(error));
          setStatus('error');
        });
    },
    [mcp],
  );

  // The code the listener reads to Alexa. Refreshed shortly before it expires,
  // because a code left on screen must stay sayable. A paired TV stops asking:
  // every request invalidates the previous code, and there is nothing to show.
  useEffect(() => {
    if (paired) {
      setPairing(null);
      setPairingError('');
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const refresh = () => {
      link
        .requestPairing()
        .then(next => {
          if (cancelled) {
            return;
          }
          setPairing(next);
          setPairingError('');
          const expiresIn = Date.parse(next.expiresAt) - Date.now();
          if (Number.isFinite(expiresIn) && expiresIn > 0) {
            timer = setTimeout(refresh, Math.max(1_000, expiresIn - 30_000));
          }
        })
        .catch(error => {
          if (cancelled) {
            return;
          }
          setPairingError(error instanceof Error ? error.message : String(error));
          timer = setTimeout(refresh, RETRY_PAUSE_MS);
        });
    };

    refresh();
    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [link, reloadKey, paired]);

  // The navigator owns the poll; this screen runs whatever query it hands over.
  // `id` is unique per delivered command, so repeating a query still re-runs it.
  useEffect(() => {
    if (request) {
      runSearch(request.query);
    }
  }, [request, runSearch]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack?.();
      return true;
    });
    return () => subscription?.remove();
  }, [onBack]);

  const emptyNote =
    status === 'ready'
      ? (note ?? `No shows matched "${query}".`)
      : 'Ask Alexa: search the TV for forest podcasts.';

  return (
    <View style={styles.root} testID="search-screen">
      <View style={styles.header}>
        <Text style={[styles.title, {fontSize: scaleFontSize(typography.headline)}]}>
          Voice control
        </Text>
        <TouchableOpacity
          testID="search-back"
          activeOpacity={1}
          accessibilityRole="button"
          accessibilityLabel="Back to home"
          onPress={onBack}
          onFocus={() => setBackFocused(true)}
          onBlur={() => setBackFocused(false)}
          style={[
            styles.backButton,
            {
              borderColor: backFocused ? color.text : color.border,
              backgroundColor: backFocused
                ? color.surfaceRaise
                : color.surfaceInner,
            },
          ]}>
          <Text
            style={[
              styles.backLabel,
              {fontSize: scaleFontSize(typography.caption)},
            ]}>
            Back
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.pairingCard} testID="search-pairing">
        {paired ? (
          <Text style={[styles.pairingLine, {fontSize: scaleFontSize(typography.body)}]}>
            Paired. Ask Alexa: “search the TV for forest podcasts.”
          </Text>
        ) : pairing ? (
          <>
            <Text style={[styles.pairingHint, {fontSize: scaleFontSize(typography.caption)}]}>
              SAY TO ALEXA: “PAIR MY TV”
            </Text>
            <Text
              accessibilityLabel={`Pairing code ${pairing.code
                .split('')
                .join(' ')}`}
              style={[styles.code, {fontSize: scaleFontSize(typography.display)}]}>
              {pairing.code.split('').join(' ')}
            </Text>
            {/* The phrase alone is only half the handshake: Alexa answers it by
                asking for the digits, and nothing on this card said to read
                them until it did. */}
            <Text style={[styles.pairingLine, {fontSize: scaleFontSize(typography.caption)}]}>
              THEN READ THE SIX DIGITS ALOUD
            </Text>
          </>
        ) : (
          <Text style={[styles.pairingLine, {fontSize: scaleFontSize(typography.body)}]}>
            {pairingError || 'Asking the relay for a pairing code…'}
          </Text>
        )}
      </View>

      <View style={styles.results}>
        {query ? (
          <Text style={[styles.query, {fontSize: scaleFontSize(typography.caption)}]}>
            RESULTS FOR “{query.toUpperCase()}”
          </Text>
        ) : null}

        {status === 'loading' ? (
          <StateView variant="loading" testID="search-loading" />
        ) : null}

        {status === 'error' ? (
          <StateView
            variant="error"
            message={errorMessage}
            onRetry={() => {
              setReloadKey(key => key + 1);
              if (query) {
                runSearch(query);
              }
            }}
            testID="search-error"
          />
        ) : null}

        {status === 'ready' && feeds.length > 0 ? (
          <TVFocusGuideView enabled style={styles.shelfGuide}>
            <Shelf
              title="Shows"
              count={feeds.length}
              testID="search-shelf">
              {feeds.map((feed, index) => (
                <FocusCard
                  key={String(feed.id)}
                  title={feed.title}
                  subtitle={feed.author ?? undefined}
                  seed={String(feed.id)}
                  designWidth={160}
                  hasTVPreferredFocus={index === 0}
                  accessibilityLabel={`${feed.title}${
                    feed.author ? ` by ${feed.author}` : ''
                  }`}
                  accessibilityHint="Opens the player"
                  testID={`search-card-${index}`}
                  onPress={() => onOpenFeed?.(feed)}
                />
              ))}
            </Shelf>
          </TVFocusGuideView>
        ) : null}

        {status !== 'loading' && status !== 'error' && feeds.length === 0 ? (
          <StateView variant="empty" note={emptyNote} testID="search-empty" />
        ) : null}
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
  title: {
    color: color.text,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  backButton: {
    minHeight: scaleWidth(focus.target),
    paddingHorizontal: scaleWidth(space.md),
    justifyContent: 'center',
    borderRadius: scaleWidth(radius.pill),
    borderWidth: scaleWidth(focus.ringWidth),
  },
  backLabel: {
    color: color.text,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  pairingCard: {
    marginTop: scaleHeight(space.sm),
    paddingHorizontal: scaleWidth(space.md),
    paddingVertical: scaleHeight(space.sm),
    backgroundColor: color.surfaceInner,
    borderRadius: scaleWidth(radius.md),
    borderWidth: 1,
    borderColor: color.border,
    gap: scaleHeight(space.xxs),
  },
  pairingHint: {
    color: color.accent,
    fontWeight: '800',
    letterSpacing: 2,
  },
  code: {
    color: color.text,
    fontWeight: '700',
    letterSpacing: 8,
  },
  pairingLine: {
    color: color.textMuted,
  },
  results: {
    flex: 1,
    minHeight: 0,
    marginTop: scaleHeight(space.md),
  },
  query: {
    color: color.accent,
    fontWeight: '800',
    letterSpacing: 2,
  },
  shelfGuide: {
    flex: 1,
    minHeight: 0,
    marginTop: scaleHeight(space.xs),
  },
});
