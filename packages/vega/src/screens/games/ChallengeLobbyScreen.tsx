import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  BackHandler,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  FocusManager,
  findNodeHandle,
} from '@amazon-devices/react-native-kepler';
import {
  PRESENCE_HOLD_MS,
  StateView,
  TvRelayError,
  color,
  focus,
  holdFreshFrames,
  layout,
  radius,
  scaleFontSize,
  scaleHeight,
  scaleWidth,
  space,
  typography,
} from '@multitv/shared';
import type {
  ChallengeOpened,
  ChallengePlayerView,
  ChallengePresenceTile,
  GameDeck,
  GameDeckRound,
  HeldFrames,
  SpeciesClient,
} from '@multitv/shared';
import {BrandMark} from '../home/Brand';
import type {SearchRelayClient} from '../SearchScreen';
import {BackPill} from './BackPill';
import {FamilyTile} from './FamilyTile';
import {JoinCard, joinUrlFor} from './JoinCard';
import {buildRounds, gameName} from './rounds';
import type {Rng} from './rounds';
import {useSpeciesPool} from './useSpeciesPool';

export interface ChallengeLaunch {
  room: ChallengeOpened;
  players: ChallengePlayerView[];
  /** The frozen rounds, kept so the head-to-head can tick each one. */
  deck: GameDeck | null;
}

export interface ChallengeLobbyScreenProps {
  /** Injected in tests; the app uses the default fetch-backed client. */
  client?: SpeciesClient;
  /** The voice relay that owns the room; without it there is nothing to join. */
  relay?: SearchRelayClient;
  onStarted?: (launch: ChallengeLaunch) => void;
  /** Opens the code screen so a second household can take a seat. */
  onOpenCode?: (launch: ChallengeLaunch) => void;
  onBack?: () => void;
  /** Injected in tests so a round is predictable. */
  rng?: Rng;
}

type FocusDirection = 'up' | 'down' | 'left' | 'right';

const ROUND_COUNT = 5;
/** The server seats eight; the TV wall has room for four names. */
const SLOTS_SHOWN = 4;
/** Mirrors SLOTS_MAX in the relay's challenge.ts. */
const SLOTS_MAX = 8;
const PLAYERS_MIN = 2;
/**
 * A telephone joins the room, not this television, so no push announces it.
 * The code is public while the lobby is open, so the room is read back on a
 * slow beat until START.
 */
const LOBBY_POLL_MS = 2_000;
/**
 * The family wall is a picture, so it beats faster than the roster. A phone
 * posts five frames a second and the tile shows the newest one a beat later;
 * 800 ms keeps the delay under the one-second budget the plan allows.
 */
const PRESENCE_POLL_MS = 800;
/** Said once when the room on screen can no longer seat a phone. */
const EXPIRED_NOTE = 'That code expired. Share the new one above.';

/**
 * What the grid actually draws: a seat whose camera toggled or whose frame
 * version moved. Compared as one string so a quiet room does not re-render
 * on every presence beat.
 */
const tilesKey = (tiles: ChallengePresenceTile[]): string =>
  tiles
    .map(
      tile =>
        `${tile.slot}:${tile.on ? 1 : 0}:${tile.version}:${tile.event?.at ?? 0}`,
    )
    .join('|');

/**
 * The server refuses a second live room per television, so a lobby that is
 * left and re-entered would otherwise be stuck on `room_live` for half an
 * hour. The last room is kept beside the screen and reused until it expires;
 * the lobby is the only place that knows the code.
 *
 * Only a room still in its lobby may be reused. A finished room keeps its
 * `expiresAt` for half an hour so its podium can stay on screen, and reusing
 * one would seat the next party in yesterday's scores.
 */
let seeded: {
  room: ChallengeOpened;
  players: ChallengePlayerView[];
  phase: string;
} | null = null;

const messageOf = (reason: unknown): string =>
  reason instanceof Error ? reason.message : String(reason);

/** The next visit opens a fresh room: the last one is over or forgotten. */
export const forgetChallengeRoom = (): void => {
  seeded = null;
};

const liveSeed = (): typeof seeded =>
  seeded && seeded.phase === 'lobby' && seeded.room.expiresAt > Date.now()
    ? seeded
    : null;

/**
 * FAMILY QUIZ lobby. This screen owns the deck: `openChallenge` judges the
 * rounds, so the questions have to be built here, from the same species page
 * and the same `buildRounds` the solo quiz uses. After START the quiz screen
 * draws whatever the server pushes, never this deck.
 */
export const ChallengeLobbyScreen = ({
  client,
  relay,
  onStarted,
  onOpenCode,
  onBack,
  rng,
}: ChallengeLobbyScreenProps) => {
  const seed = useMemo(liveSeed, []);
  const {status, pool, error, retry} = useSpeciesPool(client);
  const [session] = useState(() => Date.now());
  const [room, setRoom] = useState<ChallengeOpened | null>(seed?.room ?? null);
  const [players, setPlayers] = useState<ChallengePlayerView[]>(
    seed?.players ?? [],
  );
  /**
   * The family wall, as the relay last described it. Frames are never pushed
   * here - five a second per phone would swamp the command queue - so the
   * grid is polled and only a changed version or toggle is stored.
   */
  const [presence, setPresence] = useState<ChallengePresenceTile[]>([]);
  const [name, setName] = useState('');
  const [team, setTeam] = useState<0 | 1>(0);
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState('');
  const [notice, setNotice] = useState('');
  const [staleNote, setStaleNote] = useState('');
  /**
   * One-shot: the lobby polls for players, and a permanent
   * `hasTVPreferredFocus` would drag the ring back into the name field on
   * every poll.
   */
  const [bootFocus, setBootFocus] = useState(true);
  /** Which lobby control owns the ring, so the remote can see where it is. */
  const [focusKey, setFocusKey] = useState<
    'invite' | 'input' | 'team' | 'add' | 'start' | null
  >(null);

  useEffect(() => {
    // The name field only mounts once the room opens, so the preferred-focus
    // window has to start then. Starting it at screen mount let the window
    // expire first and left the ring on BACK.
    if (!room) {
      return;
    }
    setBootFocus(true);
    const timer = setTimeout(() => setBootFocus(false), 1500);
    return () => clearTimeout(timer);
  }, [room?.code]);

  const backRef = useRef<View | null>(null);
  const inviteRef = useRef<View | null>(null);
  const nameRef = useRef<TextInput | null>(null);
  const teamRef = useRef<View | null>(null);
  const addRef = useRef<View | null>(null);
  const startRef = useRef<View | null>(null);

  const rounds = useMemo(
    () => buildRounds(pool, ROUND_COUNT, rng),
    // `session` keeps the memo honest: it is the deck's identity.
    [pool, session, rng],
  );

  const deck = useMemo<GameDeckRound[] | null>(() => {
    if (status !== 'ready' || rounds.length === 0) {
      return null;
    }
    return rounds.map((item, index) => ({
      roundId: `quiz-${session}-${index}`,
      answerKey: item.species.key,
      options: item.options.map(option => ({
        key: option.key,
        ...gameName(option),
      })),
      clues: item.clues,
      hasPhoto: Boolean(item.species.image),
      // The deck is the only thing every screen shares, so the photo has to
      // ride with the round: without it the board can only draw a "?".
      ...(item.species.image ? {image: item.species.image} : {}),
    }));
  }, [rounds, session, status]);

  const deckKey = deck ? deck.map(round => round.roundId).join('|') : '';
  const openedDeck = useRef<string | null>(null);
  /** One open at a time: a re-render must not mint a second room. */
  const openingRef = useRef(false);
  /** The picture each tile is drawing, held until it has had time to load. */
  const heldFrames = useRef<HeldFrames>({at: 0, bySlot: {}});

  const adopt = useCallback(
    (opened: ChallengeOpened, table: ChallengePlayerView[] = []) => {
      setRoom(opened);
      setPlayers(table);
      setPresence([]);
      seeded = {room: opened, players: table, phase: 'lobby'};
    },
    [],
  );

  const open = useCallback(() => {
    if (!deck || !relay) {
      return;
    }
    const attempt = (recovered: boolean) => {
      openedDeck.current = deckKey;
      openingRef.current = true;
      setOpening(true);
      setOpenError('');
      void relay
        .openChallenge(deck)
        .then(opened => {
          openingRef.current = false;
          setOpening(false);
          adopt(opened);
        })
        .catch(reason => {
          openingRef.current = false;
          if (
            reason instanceof TvRelayError &&
            reason.code === 'room_live' &&
            reason.roomId
          ) {
            const held = liveSeed();
            if (held && held.room.roomId === reason.roomId) {
              // This television already owns that room: it is the one the
              // code on screen points at. Closing it would throw away the
              // digits a family is about to type, so take it back instead.
              openedDeck.current = deckKey;
              setOpening(false);
              adopt(held.room, held.players);
              return;
            }
            if (!recovered) {
              // A room from an earlier party is still holding the television,
              // so the relay refuses every open for half an hour. Close that
              // one and try once more instead of stranding the lobby.
              const staleRoom = reason.roomId;
              void relay
                .leaveChallenge(staleRoom)
                .then(() => {
                  attempt(true);
                })
                .catch(closeFailure => {
                  openedDeck.current = null;
                  setOpening(false);
                  setOpenError(messageOf(closeFailure));
                });
              return;
            }
          }
          openedDeck.current = null;
          setOpening(false);
          setOpenError(messageOf(reason));
        });
    };
    attempt(false);
  }, [adopt, deck, deckKey, relay]);

  useEffect(() => {
    if (
      !deck ||
      !relay ||
      room ||
      openingRef.current ||
      openedDeck.current === deckKey
    ) {
      return;
    }
    open();
  }, [deck, deckKey, open, relay, room]);

  useEffect(() => {
    if (room) {
      seeded = {room, players, phase: 'lobby'};
    }
  }, [room, players]);

  useEffect(() => {
    const code = room?.code;
    if (!relay || !code) {
      return;
    }
    let live = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    /**
     * The room is gone: expired, started elsewhere, or closed while this
     * screen was away. Dropping it lets the open effect mint a fresh code.
     * An expiry is explained, because the digits on screen were shareable a
     * moment ago; a room that simply moved on is not.
     */
    const drop = (expired: boolean) => {
      forgetChallengeRoom();
      openedDeck.current = null;
      setRoom(null);
      setPlayers([]);
      setPresence([]);
      if (expired) {
        setStaleNote(EXPIRED_NOTE);
      }
    };
    const read = () => {
      void relay
        .fetchChallenge(code)
        .then(found => {
          if (!live) {
            return;
          }
          if (found.phase !== 'lobby') {
            drop(false);
            return;
          }
          setPlayers(current => {
            const grown = [...current];
            for (const row of found.players) {
              if (!grown.some(player => player.slot === row.slot)) {
                grown.push({slot: row.slot, name: row.name, team: row.team});
              }
            }
            // Returning the same array keeps a quiet lobby from re-rendering
            // twice a second.
            if (grown.length === current.length) {
              return current;
            }
            return grown.sort((left, right) => left.slot - right.slot);
          });
        })
        .catch(reason => {
          // A closed room is forgotten by the relay, so a read of it is a
          // `not_found`, not a missed beat. Anything else leaves the roster
          // as it was; the next beat retries.
          if (
            live &&
            reason instanceof TvRelayError &&
            reason.code === 'not_found'
          ) {
            drop(true);
          }
        })
        .finally(() => {
          if (live) {
            timer = setTimeout(read, LOBBY_POLL_MS);
          }
        });
    };
    read();
    return () => {
      live = false;
      if (timer !== null) {
        clearTimeout(timer);
      }
    };
  }, [relay, room?.code]);

  /**
   * The family wall's own beat. A camera is optional and a failed read is not
   * a broken lobby, so this ignores errors entirely: the next beat retries and
   * the tiles keep whatever they last showed.
   */
  useEffect(() => {
    const code = room?.code;
    if (!relay || !code) {
      return;
    }
    let live = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    heldFrames.current = {at: 0, bySlot: {}};
    const read = () => {
      void relay
        .fetchChallengePresence(code)
        .then(found => {
          if (!live) {
            return;
          }
          const drawn = holdFreshFrames(
            heldFrames.current,
            found.tiles,
            Date.now(),
            PRESENCE_HOLD_MS,
          );
          heldFrames.current = drawn.held;
          setPresence(current =>
            tilesKey(current) === tilesKey(drawn.tiles) ? current : drawn.tiles,
          );
        })
        .catch(() => undefined)
        .finally(() => {
          if (live) {
            timer = setTimeout(read, PRESENCE_POLL_MS);
          }
        });
    };
    read();
    return () => {
      live = false;
      if (timer !== null) {
        clearTimeout(timer);
      }
    };
  }, [relay, room?.code]);

  /**
   * `expiresAt` is the relay's deadline for seating a phone here. The poll
   * would notice within a beat, but a beat can fail and a code that cannot
   * seat anyone is worse than a blank one, so the room is dropped at the
   * deadline itself and the screen opens a fresh one.
   */
  useEffect(() => {
    if (!room) {
      return;
    }
    const timer = setTimeout(() => {
      forgetChallengeRoom();
      openedDeck.current = null;
      setRoom(null);
      setPlayers([]);
      setPresence([]);
      setStaleNote(EXPIRED_NOTE);
    }, Math.max(0, room.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [room]);

  const addPlayer = useCallback(() => {
    const trimmed = name.trim();
    if (!room || !relay || busy || !trimmed || players.length >= SLOTS_MAX) {
      return;
    }
    setBusy(true);
    setNotice('');
    void relay
      .joinChallenge(room.code, trimmed.slice(0, 16), team)
      .then(joined => {
        setPlayers(joined.players);
        setName('');
        // The new code has just seated someone, so the expiry note is spent.
        setStaleNote('');
      })
      .catch(reason => setNotice(messageOf(reason)))
      .finally(() => setBusy(false));
  }, [busy, name, players.length, relay, room, team]);

  const launch = useMemo<ChallengeLaunch | null>(
    () =>
      room
        ? {
            room,
            players,
            deck: deck ? {deckId: room.deckId, rounds: deck} : null,
          }
        : null,
    [deck, players, room],
  );

  const start = useCallback(() => {
    if (!room || !relay || busy || players.length < PLAYERS_MIN) {
      return;
    }
    setBusy(true);
    setNotice('');
    void relay
      .startChallenge(room.roomId)
      .then(() => onStarted?.(launch ?? {room, players, deck: null}))
      .catch(reason => setNotice(messageOf(reason)))
      .finally(() => setBusy(false));
  }, [busy, launch, onStarted, players, relay, room]);

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
    if (!room) {
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

    const input = nameRef.current as unknown as View | null;
    link(backRef.current, inviteRef.current, 'down');
    link(inviteRef.current, backRef.current, 'up');
    link(inviteRef.current, input, 'right');
    link(input, inviteRef.current, 'up');
    link(input, teamRef.current, 'down');
    link(teamRef.current, input, 'up');
    link(teamRef.current, addRef.current, 'down');
    link(addRef.current, teamRef.current, 'up');
    link(addRef.current, startRef.current, 'down');
    link(startRef.current, addRef.current, 'up');
    // The bottom of the column wraps back to its top instead of jumping to
    // BACK: DOWN on START used to leave the lobby entirely.
    link(startRef.current, input, 'down');
  }, [room]);

  const hasTeams = players.some(player => player.team === 1);
  const ready = Boolean(room);

  return (
    <View style={styles.root} testID="challenge-lobby">
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
          FAMILY QUIZ
        </Text>
        <Text
          testID="challenge-count"
          style={[
            styles.tally,
            {fontSize: scaleFontSize(typography.caption)},
          ]}>
          {players.length} / {SLOTS_MAX} PLAYERS
        </Text>
      </View>

      {!room && status === 'loading' ? (
        <StateView variant="loading" testID="challenge-loading" />
      ) : null}

      {!room && status === 'error' ? (
        <StateView
          variant="error"
          message={error}
          onRetry={retry}
          testID="challenge-error"
        />
      ) : null}

      {!room && openError ? (
        <StateView
          variant="error"
          message={openError}
          onRetry={open}
          testID="challenge-open-error"
        />
      ) : null}

      {status === 'ready' && !deck && !room ? (
        <StateView
          variant="empty"
          note="The catalogue did not return enough species for a quiz."
          ctaLabel="BACK TO QUESTS"
          onCta={onBack}
          testID="challenge-empty"
        />
      ) : null}

      {!room && !openError && status === 'ready' && deck ? (
        <StateView variant="loading" testID="challenge-opening" />
      ) : null}

      {ready && room ? (
        <View style={styles.body}>
          <View style={styles.left}>
            <Text
              style={[
                styles.kicker,
                {fontSize: scaleFontSize(typography.label)},
              ]}>
              SHARE THIS CODE
            </Text>
            <View style={styles.shareRow}>
              <View
                style={styles.pill}
                testID="challenge-code"
                accessible
                accessibilityLabel={`Room code ${room.code
                  .split('')
                  .join(' ')}`}>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.code,
                    {
                      fontSize: scaleFontSize(typography.display),
                      letterSpacing: scaleWidth(5),
                    },
                  ]}>
                  {room.code}
                </Text>
              </View>
              <JoinCard
                code={room.code}
                size={200}
                testID="challenge-lobby-qr"
              />
            </View>
            {staleNote ? (
              <Text
                testID="challenge-stale"
                style={[
                  styles.stale,
                  {fontSize: scaleFontSize(typography.caption)},
                ]}>
                {staleNote}
              </Text>
            ) : null}
            <Text
              testID="challenge-join-url"
              style={[styles.url, {fontSize: scaleFontSize(typography.body)}]}>
              {joinUrlFor(room.code)}
            </Text>
            <Text
              style={[
                styles.hint,
                {fontSize: scaleFontSize(typography.caption)},
              ]}>
              Scan the square with a phone camera, or open that address in any
              browser. Everyone who joins plays from their own screen.
            </Text>

            <TouchableOpacity
              ref={inviteRef}
              testID="challenge-invite"
              activeOpacity={1}
              accessibilityRole="button"
              accessibilityLabel="Challenge a friend"
              disabled={!onOpenCode}
              onPress={() => {
                if (launch) {
                  onOpenCode?.(launch);
                }
              }}
              style={[styles.action, !onOpenCode ? styles.actionOff : null, focusKey === 'invite' && styles.actionFocused]}
              onFocus={() => setFocusKey('invite')}
              onBlur={() => setFocusKey(null)}>
              <Text
                style={[
                  styles.actionLabel,
                  {fontSize: scaleFontSize(typography.body)},
                ]}>
                CHALLENGE A FRIEND
              </Text>
            </TouchableOpacity>

            <View style={styles.tiles}>
              {Array.from({length: SLOTS_SHOWN}, (_, index) => {
                const slot = index + 1;
                const player = players.find(item => item.slot === slot);
                const tile = presence.find(item => item.slot === slot);
                const tint = !player
                  ? color.border
                  : !hasTeams
                    ? color.accent
                    : player.team === 1
                      ? color.clay
                      : color.accent;
                return (
                  <FamilyTile
                    key={slot}
                    slot={slot}
                    name={player ? player.name : null}
                    tint={tint}
                    framePath={tile?.frameUrl ?? null}
                  />
                );
              })}
            </View>
          </View>

          <View style={styles.right}>
            <Text
              style={[
                styles.kicker,
                {fontSize: scaleFontSize(typography.label)},
              ]}>
              ADD A PLAYER
            </Text>
            <TextInput
              ref={nameRef}
              testID="challenge-name"
              value={name}
              onChangeText={setName}
              onSubmitEditing={addPlayer}
              placeholder="Player name"
              placeholderTextColor={color.textMuted}
              selectionColor={color.accent}
              returnKeyType="done"
              hasTVPreferredFocus={bootFocus}
              onFocus={() => setFocusKey('input')}
              onBlur={() => setFocusKey(null)}
              style={[
                styles.input,
                focusKey === 'input' && styles.inputFocused,
                {fontSize: scaleFontSize(typography.label)},
              ]}
            />

            <TouchableOpacity
              ref={teamRef}
              testID="challenge-team"
              activeOpacity={1}
              accessibilityRole="button"
              accessibilityLabel={`Team ${team === 0 ? 'A' : 'B'}, press to switch`}
              onFocus={() => setFocusKey('team')}
              onBlur={() => setFocusKey(null)}
              onPress={() => setTeam(current => (current === 0 ? 1 : 0))}
              style={[styles.team, focusKey === 'team' && styles.teamFocused]}>
              <Text
                style={[
                  styles.teamLabel,
                  {fontSize: scaleFontSize(typography.caption)},
                ]}>
                TEAM {team === 0 ? 'A' : 'B'} · PRESS TO SWITCH
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              ref={addRef}
              testID="challenge-add"
              activeOpacity={1}
              accessibilityRole="button"
              accessibilityLabel="Add player"
              // Kept enabled so the ring never dies on a dimmed button: Vega
              // drops focus when the focused node is disabled, which left the
              // lobby with no focus at all after a player was seated. The
              // `addPlayer` guard already ignores the press.
              accessibilityState={{
                disabled: !name.trim() || busy || players.length >= SLOTS_MAX,
              }}
              onFocus={() => setFocusKey('add')}
              onBlur={() => setFocusKey(null)}
              onPress={addPlayer}
              style={[
                styles.action,
                // Dim only while the ring is elsewhere; a 0.4-opacity ring is
                // unreadable from the couch.
                (!name.trim() || busy || players.length >= SLOTS_MAX) &&
                focusKey !== 'add'
                  ? styles.actionOff
                  : null,
                focusKey === 'add' && styles.actionFocused,
              ]}>
              <Text
                style={[
                  styles.actionLabel,
                  {fontSize: scaleFontSize(typography.body)},
                ]}>
                ADD TO ROOM
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              ref={startRef}
              testID="challenge-start"
              activeOpacity={1}
              accessibilityRole="button"
              accessibilityLabel="Start challenge"
              // Same reason as ADD TO ROOM: a disabled node cannot hold the
              // ring, and `start` refuses to launch under PLAYERS_MIN anyway.
              accessibilityState={{disabled: players.length < PLAYERS_MIN || busy}}
              onFocus={() => setFocusKey('start')}
              onBlur={() => setFocusKey(null)}
              onPress={start}
              style={[
                styles.start,
                (players.length < PLAYERS_MIN || busy) && focusKey !== 'start'
                  ? styles.actionOff
                  : null,
                focusKey === 'start' && styles.startFocused,
              ]}>
              <Text
                style={[
                  styles.startLabel,
                  {fontSize: scaleFontSize(typography.body)},
                ]}>
                START CHALLENGE
              </Text>
            </TouchableOpacity>

            <Text
              testID="challenge-hint"
              style={[
                styles.note,
                {fontSize: scaleFontSize(typography.caption)},
              ]}>
              {players.length < PLAYERS_MIN
                ? `Add ${PLAYERS_MIN - players.length} more player${
                    PLAYERS_MIN - players.length === 1 ? '' : 's'
                  } to start.`
                : 'Everyone answers on this remote. Five rounds, fastest first.'}
            </Text>

            {notice ? (
              <Text
                testID="challenge-notice"
                style={[
                  styles.notice,
                  {fontSize: scaleFontSize(typography.caption)},
                ]}>
                {notice}
              </Text>
            ) : null}

            {opening ? (
              <Text
                style={[
                  styles.note,
                  {fontSize: scaleFontSize(typography.caption)},
                ]}>
                Opening the room…
              </Text>
            ) : null}
          </View>
        </View>
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
  body: {
    flex: 1,
    flexDirection: 'row',
    gap: scaleWidth(56),
    marginTop: scaleHeight(space.sm),
  },
  left: {
    width: scaleWidth(760),
  },
  right: {
    flex: 1,
    justifyContent: 'center',
  },
  kicker: {
    color: color.textMuted,
    fontWeight: '800',
    letterSpacing: 3,
    marginBottom: scaleHeight(space.xs),
  },
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleWidth(space.sm),
  },
  pill: {
    flex: 1,
    height: scaleHeight(152),
    borderRadius: scaleWidth(radius.pill),
    backgroundColor: color.tileSurface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  code: {
    color: color.tileInk,
    fontFamily: 'monospace',
    fontWeight: '700',
    textAlign: 'center',
  },
  hint: {
    color: color.textMuted,
    marginTop: scaleHeight(space.xs),
  },
  url: {
    color: color.accent,
    fontWeight: '700',
    marginTop: scaleHeight(space.xs),
  },
  stale: {
    color: color.danger,
    fontWeight: '700',
    marginTop: scaleHeight(space.xs),
  },
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: scaleWidth(space.xs),
    marginTop: scaleHeight(space.md),
  },
  input: {
    minHeight: scaleHeight(focus.target),
    paddingHorizontal: scaleWidth(space.sm),
    borderRadius: scaleWidth(radius.pill),
    borderWidth: scaleWidth(2),
    borderColor: color.border,
    backgroundColor: color.surfaceInner,
    color: color.text,
  },
  inputFocused: {
    borderColor: color.accent,
  },
  team: {
    alignSelf: 'flex-start',
    minHeight: scaleHeight(focus.target),
    justifyContent: 'center',
    marginTop: scaleHeight(space.xs),
    paddingHorizontal: scaleWidth(space.md),
    borderRadius: scaleWidth(radius.pill),
    borderWidth: scaleWidth(2),
    borderColor: color.border,
  },
  teamFocused: {
    borderColor: color.text,
    backgroundColor: color.surfaceRaise,
  },
  teamLabel: {
    color: color.textMuted,
    fontWeight: '700',
    letterSpacing: 2,
  },
  action: {
    alignSelf: 'flex-start',
    minHeight: scaleHeight(focus.target),
    justifyContent: 'center',
    marginTop: scaleHeight(space.xs),
    paddingHorizontal: scaleWidth(space.lg),
    borderRadius: scaleWidth(radius.pill),
    borderWidth: scaleWidth(2),
    borderColor: color.accent,
  },
  actionLabel: {
    color: color.accent,
    fontWeight: '800',
    letterSpacing: 1,
  },
  actionFocused: {
    borderColor: color.text,
    backgroundColor: color.surfaceRaise,
  },
  start: {
    alignSelf: 'flex-start',
    minHeight: scaleHeight(focus.target),
    justifyContent: 'center',
    marginTop: scaleHeight(space.sm),
    paddingHorizontal: scaleWidth(space.lg),
    borderRadius: scaleWidth(radius.pill),
    borderWidth: scaleWidth(4),
    borderColor: 'transparent',
    backgroundColor: color.accent,
  },
  startFocused: {
    // Ink disappears into the page behind the pale pill and white
    // disappears into the pill; clay reads against both.
    borderColor: color.clay,
  },
  startLabel: {
    color: color.surface,
    fontWeight: '800',
    letterSpacing: 1,
  },
  actionOff: {
    opacity: 0.4,
  },
  note: {
    color: color.textMuted,
    marginTop: scaleHeight(space.xs),
  },
  notice: {
    color: color.danger,
    marginTop: scaleHeight(space.xs),
  },
});
