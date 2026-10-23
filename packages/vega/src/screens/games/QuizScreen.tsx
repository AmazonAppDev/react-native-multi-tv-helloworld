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
  useTVEventHandler,
} from '@amazon-devices/react-native-kepler';
import type {HWEvent} from '@amazon-devices/react-native-kepler';
import {
  PRESENCE_HOLD_MS,
  StateView,
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
  ChallengeAnswered,
  ChallengeAward,
  ChallengePlayerView,
  ChallengePresenceTile,
  ChallengeQuestion,
  ChallengeStanding,
  HeldFrames,
  GameDeck,
  GameSnapshot,
  SpeciesClient,
} from '@multitv/shared';
import {BrandMark} from '../home/Brand';
import {useReducedMotion} from '../home/MascotStage';
import type {SearchRelayClient} from '../SearchScreen';
import {BackPill} from './BackPill';
import {Confetti, CountUp, PopIn} from './Celebrate';
import {FamilyTile} from './FamilyTile';
import {JoinCard, joinUrlFor} from './JoinCard';
import {RewardBurst} from './RewardBurst';
import {buildRounds, gameName} from './rounds';
import type {Rng} from './rounds';
import {useSpeciesPool} from './useSpeciesPool';

/**
 * What AppNavigator keeps from the `challenge.*` pushes. The server owns the
 * question, the score and the payout, so this is everything the screen is
 * allowed to know: no answer key, no clock of its own.
 */
export interface QuizRoomView {
  roomId: string;
  /** The six digits other households type; the answered-count poll reads them. */
  code: string;
  /** The slot the remote is playing for; Phase A seats the party here. */
  slot: number;
  players: ChallengePlayerView[];
  /** The pushed question; null until the server sends one. */
  question: ChallengeQuestion | null;
  index: number;
  total: number;
  /** Server clock: when the round stops paying for speed. */
  endsAt: number;
}

export interface QuizScreenProps {
  /** Injected in tests; the app uses the default fetch-backed client. */
  client?: SpeciesClient;
  /** The voice relay; absent in tests, which play the quiz on the D-pad only. */
  relay?: SearchRelayClient;
  /**
   * The server's view of the game while a voice session is driving it. Every
   * Skill turn carries a whole snapshot, so the screen redraws from this
   * rather than from its own counters - that is what keeps the spoken score
   * and the drawn score the same number.
   */
  snapshot?: GameSnapshot | null;
  /**
   * A challenge room driving this screen. Every press is reported and every
   * question, score and token comes back from the server; the screen never
   * scores a run or credits a wallet on its own.
   */
  room?: QuizRoomView | null;
  /**
   * The ranking the relay last pushed. Phones close a round without waking
   * this television, so the summary is fed from the push rather than from a
   * reply the board itself never asked for.
   */
  standings?: ChallengeStanding[] | null;
  /** The payout the relay reported when the last round closed. */
  payout?: ChallengeAward | null;
  onBack?: () => void;
  /** Opens the two-column card once a room has finished. */
  onHeadToHead?: (view: {
    standings: ChallengeStanding[];
    award: ChallengeAward | null;
  }) => void;
  /** Injected in tests so a round is predictable. */
  rng?: Rng;
}

type FocusDirection = 'up' | 'down' | 'left' | 'right';

const ROUND_COUNT = 5;
/** One named species; the wallet pays the whole run once, keyed by deck. */
const ROUND_TOKENS = 8;
/**
 * Mirrors ROUND_MS in the relay's challenge.ts. The push carries only the
 * deadline, so the bar needs the whole round to work out how much is left.
 */
const ROOM_ROUND_MS = 15_000;
/**
 * A single SELECT can arrive twice when NEXT swaps the deck: the key-up lands
 * on the option that has just mounted. Ignore option presses for this long
 * after a round is dealt so a press can never answer the next question.
 */
const DEAL_GRACE_MS = 400;
/**
 * The key-up of the SELECT that finishes the last round lands on PLAY AGAIN as
 * soon as the summary mounts. Hold that press off for longer than a slow
 * re-render so the result stays readable until the player presses on purpose.
 */
const SUMMARY_GRACE_MS = 2500;

interface QuizReward {
  id: string;
  mascot: 'kae-na' | 'yang-na';
  variant: 'match' | 'perfect';
  amount: number;
}

/** The id the deck publisher and a D-pad answer both compute for a round. */
const roundIdFor = (deckSession: number, index: number): string =>
  `quiz-${deckSession}-${index}`;

/**
 * Phones answer on their own; `challenge.standings` only lands when a round
 * closes, so the board reads the room back to know how many seats are in.
 */
const ROOM_POLL_MS = 1_000;
/**
 * The family rail beside a live round. Frames are polled, never pushed: five
 * a second per phone would swamp the command queue the television shares.
 */
const FAMILY_POLL_MS = 800;
/** The rail is a glance, not a wall: four faces at television distance. */
const FAMILY_SHOWN = 4;
/** Dots around the clock. Twenty reads as a dial at television distance. */
const CLOCK_SEGMENTS = 20;

/**
 * What the rail actually draws: a seat whose frame version moved. Compared as
 * one string so a room with no new pixels does not re-render.
 */
const familyKey = (tiles: ChallengePresenceTile[]): string =>
  tiles.map(tile => `${tile.slot}:${tile.version}`).join('|');

/** A dial, not a bar: the ring empties as the server's window closes. */
const CountdownRing = ({
  ratio,
  seconds,
}: {
  ratio: number;
  seconds: number;
}) => {
  const lit = Math.max(0, Math.round(ratio * CLOCK_SEGMENTS));
  const tint = ratio > 0.3 ? color.accent : color.danger;
  return (
    <View testID="challenge-clock" style={styles.clockRing}>
      {Array.from({length: CLOCK_SEGMENTS}, (_, index) => (
        <View
          key={index}
          pointerEvents="none"
          style={[
            styles.clockSegment,
            {transform: [{rotate: `${(index / CLOCK_SEGMENTS) * 360}deg`}]},
          ]}>
          <View
            style={[
              styles.clockTick,
              {backgroundColor: index < lit ? tint : color.surfaceInner},
            ]}
          />
        </View>
      ))}
      <Text
        testID="challenge-clock-value"
        style={[
          styles.clockText,
          {fontSize: scaleFontSize(typography.caption)},
        ]}>
        {seconds}s
      </Text>
    </View>
  );
};

/**
 * Names the price of a slow answer on the row it cost. A late answer still
 * earns accuracy points, so without this line a low score reads as a wrong one.
 */
const lateMark = (row: ChallengeStanding): string => {
  const late = row.lateAnswers ?? 0;
  if (late === 0) return '';
  return late === 1 ? ' · LATE' : ` · ${late} LATE`;
};

/**
 * One ranking row. Rows are keyed by the order the server last judged, so a
 * new order remounts them and they settle into place - the same 320 ms
 * `Easing.out(Easing.cubic)` and `[0.86, 1.16, 1]` pop `RewardBurst` uses.
 */
const StandingRow = ({
  row,
  rank,
  testID,
}: {
  row: ChallengeStanding;
  rank: number;
  testID: string;
}) => {
  const reduced = useReducedMotion();
  const enter = useRef(new Animated.Value(reduced ? 1 : 0)).current;

  useEffect(() => {
    if (reduced) {
      enter.setValue(1);
      return;
    }
    enter.setValue(0);
    const intro = Animated.timing(enter, {
      toValue: 1,
      duration: 320,
      delay: rank * 40,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    intro.start();
    return () => intro.stop();
  }, [enter, rank, reduced]);

  const pop = enter.interpolate({
    inputRange: [0, 0.45, 1],
    outputRange: [0.86, 1.16, 1],
  });
  const lift = enter.interpolate({
    inputRange: [0, 0.45, 1],
    outputRange: [scaleHeight(space.sm), -scaleHeight(space.xxs), 0],
  });

  return (
    <Animated.View
      testID={testID}
      style={[
        styles.standingRow,
        {opacity: enter, transform: [{translateY: lift}, {scale: pop}]},
      ]}>
      <Text
        style={[
          styles.standingName,
          {fontSize: scaleFontSize(typography.body)},
        ]}>
        {`P${row.slot} · ${row.name}${lateMark(row)}`}
      </Text>
      <Text
        style={[
          styles.standingScore,
          {fontSize: scaleFontSize(typography.body)},
        ]}>
        {row.score}
      </Text>
    </Animated.View>
  );
};

/**
 * GUESS WHO. A photo round shows the species and asks for the name; a round
 * without a photo starts from its first clue. Either way the three answers
 * are the same three, so the tiles never reflow between rounds.
 */
export const QuizScreen = ({
  client,
  relay,
  snapshot,
  room,
  standings,
  payout,
  onBack,
  onHeadToHead,
  rng,
}: QuizScreenProps) => {
  const {status, pool, error, retry} = useSpeciesPool(client);
  const [session, setSession] = useState(0);
  const [roundIndex, setRoundIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  /** Set once the Skill has driven a turn: the server now owns the score. */
  const [mirrored, setMirrored] = useState(false);
  const [wallet, setWallet] = useState<number | null>(null);
  const [reward, setReward] = useState<QuizReward | null>(null);
  /** Room answers are keyed by round, so a pushed question cannot inherit the
   *  previous round's verdict or turn. */
  const [press, setPress] = useState<{roundId: string; key: string} | null>(
    null,
  );
  const [reply, setReply] = useState<{
    roundId: string;
    data: ChallengeAnswered;
  } | null>(null);
  const [turn, setTurn] = useState<{roundId: string; slot: number} | null>(
    null,
  );
  const [rows, setRows] = useState<ChallengeStanding[] | null>(null);
  const [roomFinal, setRoomFinal] = useState(false);
  /** `answered / total` for the pushed round, read back once a second. */
  const [liveAnswered, setLiveAnswered] = useState<{
    roundId: string;
    count: number;
    total: number;
  } | null>(null);
  const [award, setAward] = useState<ChallengeAward | null>(null);
  /** Seats whose camera is on, as the relay last described them. */
  const [family, setFamily] = useState<ChallengePresenceTile[]>([]);
  /** The picture each rail tile is drawing, held until it has time to load. */
  const heldFrames = useRef<HeldFrames>({at: 0, bySlot: {}});
  const [remainingMs, setRemainingMs] = useState(Number.POSITIVE_INFINITY);
  const [roundWin, setRoundWin] = useState<{
    id: string;
    points: number;
  } | null>(null);
  /** Slots the TV has already reported this round, so the remote can wrap to a
   *  player who has not answered instead of ending the round early. */
  const [served, setServed] = useState<{
    roundId: string;
    slots: number[];
  } | null>(null);
  const roundSeenAt = useRef(0);
  /** When the round on screen was dealt, so a stray key-up cannot answer it. */
  const dealtAt = useRef(0);
  /** A photo URI that failed to load, so one bad URL cannot blank a round. */
  const [brokenPhoto, setBrokenPhoto] = useState<string | null>(null);
  /** One-shot: only the first option of a freshly dealt round claims focus. */
  const [bootFocus, setBootFocus] = useState(true);
  /** A round just landed, so its first option still has to be given the ring. */
  const claimRound = useRef(false);

  /** One-shot: the summary's action button claims the ring, then lets go. */
  const [summaryFocus, setSummaryFocus] = useState(false);
  /**
   * The action pill's own focus state. Its accent fill sits on the same accent
   * as every border in the quiz, so without a ring the player cannot tell that
   * the remote has moved off the answered option.
   */
  const [actionFocused, setActionFocused] = useState(false);
  /**
   * Which of the two completion pills is ringed. One shared boolean lit both
   * at once, so VIEW HEAD TO HEAD and DONE looked identical from the couch.
   */
  const [summaryButton, setSummaryButton] = useState<'head' | 'done' | null>(
    null,
  );

  const backRef = useRef<View | null>(null);
  const nextRef = useRef<View | null>(null);
  const optionNodes = useRef<Array<View | null>>([]);
  /** Round index that has already been advanced away from, so a duplicate
   *  SELECT (ours plus the global remote fallback) cannot skip a round. */
  const advancedRound = useRef(-1);
  /** What the screen is showing, so a late reply cannot rewind the game. */
  const sessionRef = useRef<string | null>(null);
  const indexRef = useRef(0);
  /** The deck that has already paid out; a re-render cannot credit it twice. */
  const awardedDeck = useRef<string | null>(null);
  /** Round already handed to the server, so a double SELECT cannot skip one. */
  const roomAdvance = useRef<string | null>(null);
  /** Turn already handed to the next player at the table. */
  const roomHandoff = useRef<string | null>(null);

  const rounds = useMemo(
    () => buildRounds(pool, ROUND_COUNT, rng),
    // `session` restarts the same pool with a fresh shuffle.
    [pool, session, rng],
  );

  const round = rounds[roundIndex];
  const question = room?.question ?? null;
  const roomRoundId = question?.roundId ?? null;
  const roomPress = press && press.roundId === roomRoundId ? press.key : null;
  const roomReply = reply && reply.roundId === roomRoundId ? reply.data : null;
  const roomTurn =
    turn && turn.roundId === roomRoundId
      ? turn.slot
      : (room?.players[0]?.slot ?? room?.slot ?? null);
  const roomEndsAt = room?.endsAt ?? 0;
  const finished = room
    ? roomFinal
    : rounds.length > 0 && roundIndex >= rounds.length;
  const playable = status === 'ready' && pool.length >= 3;
  indexRef.current = roundIndex;

  /**
   * The round actually on screen: a dealt solo round, or the relay's question
   * when this television is the board for a room. A room deals several rounds
   * without touching `roundIndex`, so keying on that alone armed the window
   * once and left every later room round with no ring.
   */
  const roundKey = room
    ? (question?.roundId ?? null)
    : round
      ? `solo:${roundIndex}`
      : null;

  useEffect(() => {
    // A permanent `hasTVPreferredFocus` re-requests focus on every re-render
    // (the round clock ticks once a second), which would drag the ring back to
    // the first option while the player is moving down the list.
    //
    // The window only opens once a round exists: the catalogue fetch outlasts
    // the mount, so arming at mount let the window expire before the options
    // were on screen and GUESS WHO opened with no ring anywhere.
    if (!roundKey) {
      return undefined;
    }
    claimRound.current = true;
    setBootFocus(true);
    dealtAt.current = Date.now();
    const timer = setTimeout(() => setBootFocus(false), 1200);
    return () => clearTimeout(timer);
  }, [roundKey, session]);

  /** When the summary appeared, so its own key-up cannot restart the deck. */
  const summaryAt = useRef(0);

  useEffect(() => {
    if (!finished) {
      setSummaryFocus(false);
      return undefined;
    }
    summaryAt.current = Date.now();
    setSummaryFocus(true);
    const timer = setTimeout(() => setSummaryFocus(false), 1200);
    return () => clearTimeout(timer);
  }, [finished]);

  const tableOrder = room
    ? [...room.players].sort((a, b) => a.slot - b.slot)
    : [];
  /** One team colour only once both teams are seated; a solo team is accent. */
  const tableHasTeams = tableOrder.some(player => player.team === 1);
  const servedSlots =
    served && served.roundId === roomRoundId ? served.slots : [];
  /** Who has not had the remote yet this round. */
  const unserved = tableOrder.filter(
    player => !servedSlots.includes(player.slot),
  );
  /**
   * Every seat is in for the round on screen. Phones close the round on the
   * server, so this is the only signal that makes the board's NEXT real.
   */
  const allSeated =
    room !== null &&
    roomRoundId !== null &&
    liveAnswered !== null &&
    liveAnswered.roundId === roomRoundId &&
    liveAnswered.total > 0 &&
    liveAnswered.count >= liveAnswered.total;
  /**
   * Where the remote goes after this answer. Wrapping matters: the last seat
   * answering first must pass to seat one, not close the round on everyone.
   */
  const nextPlayer =
    roomReply !== null && !allSeated && roomReply.answered < roomReply.total
      ? (unserved.find(player => player.slot > (roomTurn ?? 0)) ??
        unserved[0] ??
        null)
      : null;
  const turnName =
    tableOrder.find(player => player.slot === roomTurn)?.name ?? 'PLAYER';
  /**
   * The streak the server last reported for the seat holding the remote. A
   * two-round streak is the first one worth showing: it names a run without
   * patronising a player who has answered once.
   */
  const turnStreak = rows?.find(row => row.slot === roomTurn)?.streak ?? 0;
  /**
   * The server's window is spent. A phone that never answers must not stall
   * the party, so the board takes the clock as its own way to move on.
   */
  const clockOver =
    room !== null &&
    roomRoundId !== null &&
    roomEndsAt > 0 &&
    remainingMs <= 0;
  const sealed = room
    ? roomPress !== null || roomReply !== null || allSeated || clockOver
    : picked !== null;
  const clockRatio = Math.max(
    0,
    Math.min(1, remainingMs / ROOM_ROUND_MS),
  );
  const clockSeconds = Number.isFinite(remainingMs)
    ? Math.ceil(remainingMs / 1000)
    : Math.ceil(ROOM_ROUND_MS / 1000);

  /**
   * A phone's answer never wakes this television - the relay only pushes
   * `challenge.standings` once a round closes - so the board reads the room
   * back to count the seats that are in.
   */
  useEffect(() => {
    const code = room?.code;
    const roundId = question?.roundId;
    if (!relay || !code || !roundId || finished) {
      setLiveAnswered(null);
      return;
    }
    let live = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const read = () => {
      void relay
        .fetchChallenge(code)
        .then(found => {
          if (!live) return;
          const count = found.players.filter(
            player => player.answered?.[roundId] !== undefined,
          ).length;
          setLiveAnswered({roundId, count, total: found.players.length});
          // The last answer closes the room on the server, and a finished room
          // refuses NEXT - so the board takes that as its own ending.
          if (found.phase === 'finished') {
            setRoomFinal(true);
          }
        })
        .catch(() => {
          // The count is decoration; the round still runs without it.
        })
        .finally(() => {
          if (live) timer = setTimeout(read, ROOM_POLL_MS);
        });
    };
    read();
    return () => {
      live = false;
      if (timer !== null) clearTimeout(timer);
    };
  }, [finished, question?.roundId, relay, room?.code]);

  /**
   * The family rail beside a live round. Same contract as the lobby wall: the
   * relay keeps a frame for four seconds and a tile holds its url for 2.5 s
   * so the picture can load. A failed beat is not a broken round, so errors
   * are ignored and the rail keeps whatever it last showed.
   */
  useEffect(() => {
    const code = room?.code;
    if (!relay || !code || finished) {
      setFamily([]);
      return undefined;
    }
    let live = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    heldFrames.current = {at: 0, bySlot: {}};
    const read = () => {
      void relay
        .fetchChallengePresence(code)
        .then(found => {
          if (!live) return;
          const drawn = holdFreshFrames(
            heldFrames.current,
            found.tiles,
            Date.now(),
            PRESENCE_HOLD_MS,
          );
          heldFrames.current = drawn.held;
          const on = drawn.tiles.filter(tile => tile.on).slice(0, FAMILY_SHOWN);
          setFamily(current => (familyKey(current) === familyKey(on) ? current : on));
        })
        .catch(() => undefined)
        .finally(() => {
          if (live) timer = setTimeout(read, FAMILY_POLL_MS);
        });
    };
    read();
    return () => {
      live = false;
      if (timer !== null) clearTimeout(timer);
    };
  }, [finished, relay, room?.code]);

  /** A pushed ranking is the whole board, so it replaces whatever was drawn. */
  useEffect(() => {
    if (standings && standings.length > 0) {
      setRows(standings);
    }
  }, [standings]);

  useEffect(() => {
    if (payout) {
      setAward(payout);
    }
  }, [payout]);

  /**
   * The questions as the server has to see them to judge a spoken answer: the
   * answer key, the three names in the order they are drawn (so "two" is the
   * second tile), and the clue the Skill reads out instead of the photo.
   */
  const deck = useMemo<GameDeck | null>(() => {
    // A room's deck was frozen by the lobby and locked on the server; this
    // screen is not allowed to publish over it.
    if (room || !playable || rounds.length === 0) {
      return null;
    }
    return {
      // Republishing ends any game built on the old deck, which is what PLAY
      // AGAIN means, so the id changes with the shuffle.
      deckId: `quiz-${session}-${Date.now().toString(36)}`,
      rounds: rounds.map((item, index) => ({
        roundId: roundIdFor(session, index),
        answerKey: item.species.key,
        options: item.options.map(option => ({
          key: option.key,
          ...gameName(option),
        })),
        clues: item.clues,
        hasPhoto: Boolean(item.species.image),
      })),
    };
  }, [playable, room, rounds, session]);

  useEffect(() => {
    if (!deck || !relay) {
      return;
    }
    // Best effort: a TV that cannot reach the relay still plays with its own
    // counters, so a failed publish must not become an error on screen.
    void relay.publishDeck(deck).catch(() => undefined);
  }, [deck, relay]);

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

  /**
   * A finished run pays out once and celebrates with the same burst the
   * memory game uses. `deck.deckId` is the wallet key, so the summary sitting
   * on screen cannot credit the same run twice.
   */
  useEffect(() => {
    if (room || !finished || !deck || awardedDeck.current === deck.deckId) {
      return;
    }
    awardedDeck.current = deck.deckId;
    const perfect = score >= rounds.length;
    const amount = score * ROUND_TOKENS;
    if (amount <= 0) {
      return;
    }
    setReward({
      id: deck.deckId,
      mascot: perfect ? 'kae-na' : 'yang-na',
      variant: perfect ? 'perfect' : 'match',
      amount,
    });
    if (!relay) {
      return;
    }
    void relay
      .awardTokens(`quiz:${deck.deckId}`, amount)
      .then(award => {
        if (award.available) {
          setWallet(award.balance);
        }
      })
      .catch(() => undefined);
  }, [deck, finished, relay, room, rounds.length, score]);

  /**
   * The round clock. `endsAt` is the server's, so the bar drains from the
   * moment the question arrives, even if this screen drew it late.
   */
  useEffect(() => {
    if (!roomRoundId || roomFinal) {
      return undefined;
    }
    roundSeenAt.current = Date.now();
    setRoundWin(null);
    if (!roomEndsAt) {
      // A round without a deadline must not inherit the last round's spent
      // clock: that read `0s` and sealed the board the moment it appeared.
      setRemainingMs(ROOM_ROUND_MS);
      return undefined;
    }
    const tick = () => setRemainingMs(Math.max(0, roomEndsAt - Date.now()));
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [roomEndsAt, roomFinal, roomRoundId]);

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

  /**
   * Redraws from the server's view of the game.
   *
   * The verdict and the current question are separate: a spoken answer judges
   * a round and asks the next one in the same turn, so its snapshot carries a
   * verdict for `index - 1`. Only a D-pad reply still points at the question
   * on screen, and only that one is drawn as a picked tile.
   */
  const applySnapshot = useCallback((next: GameSnapshot) => {
    // Within one session the index only moves forward, so a slow D-pad reply
    // landing after a spoken turn must not drag the screen back.
    if (next.sessionId === sessionRef.current && next.index < indexRef.current) {
      return;
    }
    sessionRef.current = next.sessionId;
    setMirrored(true);
    setRoundIndex(next.index);
    setScore(next.score);
    const verdict =
      next.verdict && next.verdict.roundIndex === next.index ? next.verdict : null;
    setPicked(verdict ? verdict.choice : null);
    advancedRound.current = -1;
  }, []);

  useEffect(() => {
    if (snapshot) {
      applySnapshot(snapshot);
    }
  }, [snapshot, applySnapshot]);

  const choose = useCallback(
    (key: string) => {
      if (room) {
        const current = room.question;
        if (
          !current ||
          !relay ||
          roomFinal ||
          allSeated ||
          roomTurn === null ||
          roomPress !== null ||
          roomReply !== null
        ) {
          return;
        }
        // Always report: the server owns the score, the streak and the clock.
        setPress({roundId: current.roundId, key});
        void relay
          .answerChallenge(room.roomId, roomTurn, current.roundId, key)
          .then(result => {
            if (!result) {
              return;
            }
            setReply({roundId: current.roundId, data: result});
            setServed(state => {
              const slots =
                state && state.roundId === current.roundId ? state.slots : [];
              return slots.includes(roomTurn)
                ? state
                : {roundId: current.roundId, slots: [...slots, roomTurn]};
            });
            if (result.standings) {
              setRows(result.standings);
            }
            if (result.award) {
              setAward(result.award);
            }
            if (result.phase === 'finished') {
              setRoomFinal(true);
            } else if (result.correct && result.points > 0) {
              setRoundWin({
                id: `${current.roundId}:${roomTurn}`,
                points: result.points,
              });
            }
          })
          .catch(() => {
            // A refused press - a duplicate, or a round that moved on - leaves
            // the player free to try again.
            setPress(state =>
              state && state.roundId === current.roundId ? null : state,
            );
          });
        return;
      }
      if (!round || picked !== null) {
        return;
      }
      // The key-up from the SELECT that dealt this round can still land on the
      // first option; swallow it rather than answer a question nobody read.
      if (Date.now() - dealtAt.current < DEAL_GRACE_MS) {
        return;
      }
      setPicked(key);
      if (!mirrored || !relay) {
        if (key === round.species.key) {
          setScore(value => value + 1);
        }
        return;
      }
      // A voice game is live, so the score belongs to the server. Reporting the
      // press keeps both input paths on one number; a null reply means the
      // session ended behind the screen's back, and local scoring resumes.
      void relay
        .reportAnswer(roundIdFor(session, roundIndex), key)
        .then(result => {
          if (result) {
            applySnapshot(result);
          } else if (key === round.species.key) {
            setScore(value => value + 1);
          }
        })
        .catch(() => {
          if (key === round.species.key) {
            setScore(value => value + 1);
          }
        });
    },
    [
      allSeated,
      applySnapshot,
      mirrored,
      picked,
      relay,
      room,
      roomFinal,
      roomPress,
      roomReply,
      roomTurn,
      round,
      roundIndex,
      session,
    ],
  );

  const next = useCallback(() => {
    if (room) {
      if (!relay || !roomRoundId || roomFinal) {
        return;
      }
      // A press still in flight: let the server answer it before moving on.
      if (roomPress !== null && roomReply === null) {
        return;
      }
      if (nextPlayer) {
        // Hand the remote to the next seat rather than to the next round.
        const key = `${roomRoundId}:${roomTurn}`;
        if (roomHandoff.current === key) {
          return;
        }
        roomHandoff.current = key;
        // The pass unmounts the NEXT pill, so the ring has to come back to the
        // first option for the next seat - the round itself did not change.
        claimRound.current = true;
        setTurn({roundId: roomRoundId, slot: nextPlayer.slot});
        setPress(null);
        setReply(null);
        setRoundWin(null);
        return;
      }
      // Every slot has answered, or the clock ran out: the server closes the
      // round itself, so NEXT only asks for the next question.
      if (roomAdvance.current === roomRoundId) {
        return;
      }
      roomAdvance.current = roomRoundId;
      void relay
        .nextChallengeRound(room.roomId)
        .then(result => {
          if (!result) {
            return;
          }
          if (result.standings) {
            setRows(result.standings);
          }
          if (result.award) {
            setAward(result.award);
          }
          if (result.final) {
            setRoomFinal(true);
          }
        })
        .catch(() => {
          roomAdvance.current = null;
        });
      return;
    }
    if (advancedRound.current === roundIndex) {
      return;
    }
    advancedRound.current = roundIndex;
    setPicked(null);
    setRoundIndex(value => value + 1);
    if (mirrored && relay) {
      // Keeps the session on the question now drawn; a reply that never comes
      // leaves the screen one ahead, which the next spoken turn repairs.
      void relay
        .advanceGame()
        .then(result => {
          if (result) {
            applySnapshot(result);
          }
        })
        .catch(() => undefined);
    }
  }, [
    applySnapshot,
    mirrored,
    nextPlayer,
    relay,
    room,
    roomFinal,
    roomPress,
    roomReply,
    roomRoundId,
    roomTurn,
    roundIndex,
  ]);

  const restart = useCallback(() => {
    // The final SELECT both reveals the summary and releases onto PLAY AGAIN;
    // swallow that release so the score card is not replaced by a fresh round.
    if (Date.now() - summaryAt.current < SUMMARY_GRACE_MS) {
      return;
    }
    advancedRound.current = -1;
    sessionRef.current = null;
    awardedDeck.current = null;
    setReward(null);
    // The republish that follows deletes the server's game, so the screen
    // plays on its own counters again until a voice turn starts another.
    setMirrored(false);
    setSession(value => value + 1);
    setRoundIndex(0);
    setScore(0);
    setPicked(null);
  }, []);

  // Once a round is answered, SELECT should always move on. The global remote
  // fallback can only press the focused control, and focus does not reliably
  // land on NEXT on this build, so answer the key here as well. `next()` is
  // guarded per round, so the two paths cannot double-advance.
  const answeredRef = useRef(false);
  answeredRef.current = sealed;
  useTVEventHandler(
    useCallback(
      (event: HWEvent) => {
        if (event.eventType !== 'select' && event.eventType !== 'enter') {
          return;
        }
        if (event.eventKeyAction !== undefined && event.eventKeyAction !== 0) {
          return;
        }
        if (!answeredRef.current || finished) {
          return;
        }
        next();
      },
      [finished, next],
    ),
  );

  useEffect(() => {
    if (finished) {
      return;
    }
    if (room ? !question : status !== 'ready' || !round) {
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

    const nodes = optionNodes.current;
    // The options are stacked, so the remote's D-pad walks them vertically.
    link(backRef.current, nodes[0], 'down');
    link(nodes[0], backRef.current, 'up');
    link(nodes[0], nodes[1], 'down');
    link(nodes[1], nodes[0], 'up');
    link(nodes[1], nodes[2], 'down');
    link(nodes[2], nodes[1], 'up');
    if (sealed) {
      link(nodes[2], nextRef.current, 'down');
      link(nextRef.current, nodes[2], 'up');
    } else {
      link(nodes[2], backRef.current, 'down');
    }

    if (claimRound.current && !sealed) {
      // `hasTVPreferredFocus` alone does not land the ring here: the options
      // mount a beat after the screen (the catalogue loads first), by which
      // time the native focus manager has settled on the back pill. Claim the
      // first option explicitly, deferred so it has registered.
      claimRound.current = false;
      const tag = tagOf(nodes[0]);
      if (tag !== null) {
        const timer = setTimeout(() => {
          try {
            FocusManager.focus(tag);
          } catch {
            // Same stub limitation as setNextFocus.
          }
        }, 350);
        return () => clearTimeout(timer);
      }
    }
  }, [finished, picked, question, room, round, sealed, status]);

  // Once an answer lands, the options stop being the only exit: move the ring
  // to NEXT so the remote cannot get stuck on an answered round.
  useEffect(() => {
    if (!sealed) {
      return undefined;
    }
    // Deferred: the pill mounts in this same commit, and the native focus
    // manager only learns about it a frame or two later.
    const timer = setTimeout(() => {
      const node = nextRef.current;
      const tag = node
        ? findNodeHandle(node as unknown as React.Component)
        : null;
      if (tag === null) {
        return;
      }
      try {
        FocusManager.focus(tag);
      } catch {
        // The Jest turbo-module stub does not implement focus.
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [sealed]);

  const correct = round ? picked === round.species.key : false;
  const answerName = round ? gameName(round.species) : null;
  const photoUri = round?.species.image ?? null;
  // A URL that 404s leaves the panel blank, which would make the round
  // unanswerable; fall back to the written clue exactly as if there were none.
  const hasPhoto = Boolean(photoUri) && brokenPhoto !== photoUri;
  /**
   * A room round carries its photo in the relay's question; the deck no longer
   * has to be guessed from `hasPhoto`, and a URL that 404s falls back to the
   * question mark rather than a blank panel.
   */
  const roomPhotoUri =
    question?.image && brokenPhoto !== question.image ? question.image : null;
  const revealedClues = round
    ? (hasPhoto ? round.clues : round.clues.slice(1)).slice(0, 2)
    : [];
  // Room feedback has no answer key on this side: the server sends the name of
  // the right species, and names are unique within a deck round.
  const roomAnswerLabel = roomReply
    ? (question?.options.find(
        option => option.primary === roomReply.answerPrimary,
      ) ?? null)
    : null;
  const roomNextLabel = nextPlayer
    ? `PASS TO P${nextPlayer.slot} · ${nextPlayer.name.toUpperCase()}`
    : room && room.index + 1 >= room.total
      ? 'SEE RESULT'
      : 'NEXT ROUND →';
  const roomClue = question?.clues[0] ?? null;
  /** The order the server last judged; a change remounts the rows to re-settle. */
  const standingOrder = rows ? rows.map(row => row.slot).join('-') : '';

  return (
    <View style={styles.root} testID="quiz-screen">
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
          {room ? 'FAMILY CHALLENGE' : 'GUESS WHO'}
        </Text>
        {room && !finished ? (
          <Text
            testID="challenge-progress"
            style={[
              styles.tally,
              {fontSize: scaleFontSize(typography.caption)},
            ]}>
            ROUND {room.index + 1} / {room.total} ·{' '}
            {liveAnswered && liveAnswered.roundId === roomRoundId
              ? `${liveAnswered.count} / ${liveAnswered.total} ANSWERED`
              : `${room.players.length} PLAYERS`}
          </Text>
        ) : !room && playable && !finished ? (
          <Text
            testID="quiz-progress"
            style={[
              styles.tally,
              {fontSize: scaleFontSize(typography.caption)},
            ]}>
            ROUND {roundIndex + 1} / {rounds.length} · SCORE {score}
            {wallet === null ? '' : ` · ${wallet} TOKENS`}
          </Text>
        ) : null}
      </View>

      {!room && status === 'loading' ? (
        <StateView variant="loading" testID="quiz-loading" />
      ) : null}

      {!room && status === 'error' ? (
        <StateView
          variant="error"
          message={error}
          onRetry={retry}
          testID="quiz-error"
        />
      ) : null}

      {!room && status === 'ready' && !playable ? (
        <StateView
          variant="empty"
          note="The catalogue did not return enough species for a quiz."
          ctaLabel="BACK TO QUESTS"
          onCta={onBack}
          testID="quiz-empty"
        />
      ) : null}

      {finished ? (
        room ? (
          <View style={styles.summary} testID="challenge-summary">
            {/* Paper behind the champion, not over the buttons. */}
            {rows && rows.length > 0 ? <Confetti testID="challenge-confetti" /> : null}
            <Text
              style={[
                styles.summaryKicker,
                {fontSize: scaleFontSize(typography.label)},
              ]}>
              CHALLENGE COMPLETE
            </Text>
            {rows && rows.length > 0 ? (
              <PopIn
                trigger={`winner:${standingOrder}`}
                delayMs={120}
                style={styles.winnerBlock}
                testID="challenge-crown">
                <Text
                  testID="challenge-winner"
                  numberOfLines={1}
                  style={[
                    styles.summaryScore,
                    styles.winnerName,
                    {
                      fontSize: scaleFontSize(96),
                      lineHeight: scaleFontSize(108),
                    },
                  ]}>
                  {rows[0].name.toUpperCase()}
                </Text>
                <Text
                  style={[
                    styles.summaryLine,
                    {fontSize: scaleFontSize(typography.body)},
                  ]}>
                  P{rows[0].slot} · {rows[0].score} POINTS
                </Text>
              </PopIn>
            ) : (
              <Text
                style={[
                  styles.summaryLine,
                  {fontSize: scaleFontSize(typography.body)},
                ]}>
                SCORES ON THEIR WAY…
              </Text>
            )}
            <View style={styles.standings}>
              {(rows ?? []).map((row, rank) => (
                <StandingRow
                  key={`${standingOrder}:${row.slot}`}
                  row={row}
                  rank={rank}
                  testID={`challenge-row-${row.slot}`}
                />
              ))}
            </View>
            {award && award.tokens > 0 ? (
              <CountUp
                testID="challenge-tokens"
                value={award.tokens}
                prefix="+"
                suffix=" ECO TOKENS"
                delayMs={240}
                style={[
                  styles.summaryTokens,
                  {fontSize: scaleFontSize(typography.title)},
                ]}
              />
            ) : null}
            {award && !award.available ? (
              <Text
                style={[
                  styles.summaryLine,
                  {fontSize: scaleFontSize(typography.caption)},
                ]}>
                TOKENS SAVED ON THE HOST DEVICE
              </Text>
            ) : null}
            <View style={styles.joinRow} testID="challenge-summary-join">
              <JoinCard code={room.code} size={110} testID="challenge-summary-qr" />
              <View style={styles.joinCopy}>
                <Text
                  style={[
                    styles.joinLabel,
                    {fontSize: scaleFontSize(typography.label)},
                  ]}>
                  SAME ROOM · ANOTHER ROUND
                </Text>
                <Text
                  testID="challenge-summary-url"
                  numberOfLines={1}
                  style={[
                    styles.joinUrl,
                    {fontSize: scaleFontSize(typography.caption)},
                  ]}>
                  {joinUrlFor(room.code)}
                </Text>
              </View>
            </View>
            {onHeadToHead ? (
              <TouchableOpacity
                testID="challenge-head-to-head"
                activeOpacity={1}
                accessibilityRole="button"
                accessibilityLabel="View head to head"
                onPress={() => onHeadToHead({standings: rows ?? [], award})}
                onFocus={() => setSummaryButton('head')}
                onBlur={() => setSummaryButton(null)}
                style={[
                  styles.next,
                  styles.again,
                  summaryButton === 'head' && styles.nextFocused,
                ]}>
                <Text
                  style={[
                    styles.nextLabel,
                    {fontSize: scaleFontSize(typography.body)},
                  ]}>
                  VIEW HEAD TO HEAD
                </Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              ref={node => {
                nextRef.current = node;
              }}
              testID="challenge-done"
              activeOpacity={1}
              accessibilityRole="button"
              accessibilityLabel="Done"
              hasTVPreferredFocus={summaryFocus}
              onPress={onBack}
              onFocus={() => setSummaryButton('done')}
              onBlur={() => setSummaryButton(null)}
              style={[
                styles.next,
                styles.again,
                summaryButton === 'done' && styles.nextFocused,
              ]}>
              <Text
                style={[
                  styles.nextLabel,
                  {fontSize: scaleFontSize(typography.body)},
                ]}>
                DONE
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
        <View style={styles.summary} testID="quiz-summary">
          <Text
            style={[
              styles.summaryKicker,
              {fontSize: scaleFontSize(typography.label)},
            ]}>
            QUIZ COMPLETE
          </Text>
          <Text
            style={[
              styles.summaryScore,
              {fontSize: scaleFontSize(120), lineHeight: scaleFontSize(132)},
            ]}>
            {score} / {rounds.length}
          </Text>
          <Text
            style={[
              styles.summaryLine,
              {fontSize: scaleFontSize(typography.body)},
            ]}>
            {score === rounds.length
              ? 'A perfect run — every species named.'
              : 'Every round you missed comes from the same field guide.'}
          </Text>
          {score > 0 ? (
            <Text
              testID="quiz-tokens"
              style={[
                styles.summaryTokens,
                {fontSize: scaleFontSize(typography.title)},
              ]}>
              +{score * ROUND_TOKENS} ECO TOKENS
            </Text>
          ) : null}
          <TouchableOpacity
            ref={node => {
              nextRef.current = node;
            }}
            testID="quiz-again"
            activeOpacity={1}
            accessibilityRole="button"
            accessibilityLabel="Play again"
            hasTVPreferredFocus={summaryFocus}
            onPress={restart}
            onFocus={() => setActionFocused(true)}
            onBlur={() => setActionFocused(false)}
            style={[
              styles.next,
              styles.again,
              actionFocused && styles.nextFocused,
            ]}>
            <Text
              style={[
                styles.nextLabel,
                {fontSize: scaleFontSize(typography.body)},
              ]}>
              PLAY AGAIN
            </Text>
          </TouchableOpacity>
        </View>
        )
      ) : null}

      {room && !finished ? (
        question ? (
          <View style={styles.body} testID="challenge-body">
            <View style={styles.figure}>
              {roomPhotoUri ? (
                <Image
                  testID="challenge-photo"
                  source={{uri: roomPhotoUri}}
                  style={styles.photo}
                  resizeMode="cover"
                  accessible={false}
                  onError={() => setBrokenPhoto(roomPhotoUri)}
                />
              ) : (
                <Text
                  style={[styles.figureGlyph, {fontSize: scaleFontSize(160)}]}>
                  ?
                </Text>
              )}
            </View>

            <View style={styles.panel}>
              <View style={styles.turnRow}>
                <Text
                  testID="challenge-turn"
                  style={[
                    styles.turnChip,
                    {fontSize: scaleFontSize(typography.caption)},
                  ]}>
                  P{roomTurn} · {turnName.toUpperCase()}
                </Text>
                <CountdownRing
                  ratio={clockRatio}
                  seconds={clockSeconds}
                />
              </View>

              <Text
                style={[
                  styles.prompt,
                  {fontSize: scaleFontSize(typography.caption)},
                ]}>
                {roomPhotoUri ? 'WHICH SPECIES IS THIS?' : 'READ THE CLUE'}
              </Text>
              {roomClue && !roomPhotoUri ? (
                <Text
                  testID="challenge-clue"
                  style={[
                    styles.clue,
                    {fontSize: scaleFontSize(typography.body)},
                  ]}>
                  {roomClue}
                </Text>
              ) : null}

              <View style={styles.options}>
                {question.options.map((option, index) => (
                  <QuizOption
                    key={`${question.roundId}:${option.key}`}
                    ref={node => {
                      optionNodes.current[index] = node;
                    }}
                    testID={`quiz-option-${index}`}
                    primary={option.primary}
                    secondary={option.secondary}
                    hasTVPreferredFocus={index === 0 && bootFocus && !sealed}
                    answered={roomReply !== null}
                    isAnswer={
                      roomReply !== null &&
                      option.primary === roomReply.answerPrimary
                    }
                    isPicked={option.key === roomPress}
                    onPress={() => choose(option.key)}
                  />
                ))}
              </View>

              <View style={styles.feedback}>
                {roomReply !== null ? (
                  <>
                    <PopIn
                      trigger={roomRoundId ?? ''}
                      testID="challenge-verdict">
                      <Text
                        testID="challenge-feedback"
                        style={[
                          styles.feedbackTitle,
                          {
                            fontSize: scaleFontSize(typography.title),
                            color: roomReply.correct
                              ? color.accent
                              : color.danger,
                          },
                        ]}>
                        {roomReply.correct ? 'CORRECT!' : 'NOT QUITE'}
                      </Text>
                    </PopIn>
                    <Text
                      testID="challenge-answer"
                      numberOfLines={2}
                      style={[
                        styles.feedbackName,
                        {fontSize: scaleFontSize(typography.body)},
                      ]}>
                      {roomReply.answerPrimary}
                    </Text>
                    {roomAnswerLabel?.secondary ? (
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.feedbackThai,
                          {fontSize: scaleFontSize(typography.caption)},
                        ]}>
                        {roomAnswerLabel.secondary}
                      </Text>
                    ) : null}
                    <Text
                      testID="challenge-points"
                      style={[
                        styles.why,
                        {fontSize: scaleFontSize(typography.caption)},
                      ]}>
                      {roomReply.correct
                        ? `+${roomReply.points} PTS${
                            roomReply.late ? ' · LATE' : ''
                          }`
                        : 'NO POINTS THIS ROUND'}
                    </Text>
                    {roomReply.correct && turnStreak >= 2 ? (
                      <PopIn
                        trigger={`streak:${turnStreak}`}
                        delayMs={140}
                        style={styles.streakRow}>
                        <Text
                          testID="challenge-streak"
                          style={[
                            styles.streakChip,
                            {fontSize: scaleFontSize(typography.caption)},
                          ]}>
                          STREAK ×{turnStreak}
                        </Text>
                      </PopIn>
                    ) : null}
                    <TouchableOpacity
                      ref={node => {
                        nextRef.current = node;
                      }}
                      testID="challenge-next"
                      activeOpacity={1}
                      accessibilityRole="button"
                      accessibilityLabel={roomNextLabel}
                      onPress={next}
                      onFocus={() => setActionFocused(true)}
                      onBlur={() => setActionFocused(false)}
                      style={[styles.next, actionFocused && styles.nextFocused]}>
                      <Text
                        style={[
                          styles.nextLabel,
                          {fontSize: scaleFontSize(typography.body)},
                        ]}>
                        {roomNextLabel}
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : roomPress !== null ? (
                  <Text
                    style={[
                      styles.why,
                      {fontSize: scaleFontSize(typography.caption)},
                    ]}>
                    SCORING…
                  </Text>
                ) : allSeated || clockOver ? (
                  <>
                    <Text
                      testID="challenge-feedback"
                      style={[
                        styles.feedbackTitle,
                        {
                          fontSize: scaleFontSize(typography.title),
                          color: color.accent,
                        },
                      ]}>
                      {allSeated ? 'ALL ANSWERS IN' : "TIME'S UP"}
                    </Text>
                    <TouchableOpacity
                      ref={node => {
                        nextRef.current = node;
                      }}
                      testID="challenge-next"
                      activeOpacity={1}
                      accessibilityRole="button"
                      accessibilityLabel={roomNextLabel}
                      onPress={next}
                      onFocus={() => setActionFocused(true)}
                      onBlur={() => setActionFocused(false)}
                      style={[styles.next, actionFocused && styles.nextFocused]}>
                      <Text
                        style={[
                          styles.nextLabel,
                          {fontSize: scaleFontSize(typography.body)},
                        ]}>
                        {roomNextLabel}
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : null}
              </View>
            </View>

            {family.length > 0 ? (
              <View style={styles.familyRail} testID="challenge-family-rail">
                {family.map(tile => {
                  const seated = room.players.find(
                    player => player.slot === tile.slot,
                  );
                  return (
                    <FamilyTile
                      key={tile.slot}
                      slot={tile.slot}
                      name={seated?.name ?? tile.name}
                      tint={
                        tableHasTeams && seated?.team === 1
                          ? color.clay
                          : color.accent
                      }
                      framePath={tile.frameUrl}
                      variant="rail"
                    />
                  );
                })}
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.waiting} testID="challenge-waiting">
            <Text
              style={[
                styles.waitingLabel,
                {fontSize: scaleFontSize(typography.body)},
              ]}>
              GETTING THE NEXT QUESTION…
            </Text>
          </View>
        )
      ) : playable && !finished && round ? (
        <View style={styles.body}>
          <View style={styles.figure}>
            {hasPhoto ? (
              <Image
                testID="quiz-photo"
                source={{uri: photoUri ?? undefined}}
                style={styles.photo}
                resizeMode="cover"
                accessible={false}
                onError={() => setBrokenPhoto(photoUri)}
              />
            ) : (
              <Text
                style={[
                  styles.figureGlyph,
                  {fontSize: scaleFontSize(160)},
                ]}>
                ?
              </Text>
            )}
          </View>

          <View style={styles.panel}>
            <Text
              style={[
                styles.prompt,
                {fontSize: scaleFontSize(typography.caption)},
              ]}>
              {hasPhoto ? 'WHICH SPECIES IS THIS?' : 'READ THE CLUE'}
            </Text>
            {!hasPhoto ? (
              <Text
                testID="quiz-clue"
                style={[
                  styles.clue,
                  {fontSize: scaleFontSize(typography.body)},
                ]}>
                {round.clues[0]}
              </Text>
            ) : null}

            <View style={styles.options}>
              {round.options.map((option, index) => {
                const label = gameName(option);
                return (
                  <QuizOption
                    key={`${roundIndex}:${option.key}`}
                    ref={node => {
                      optionNodes.current[index] = node;
                    }}
                    testID={`quiz-option-${index}`}
                    primary={label.primary}
                    secondary={label.secondary}
                    hasTVPreferredFocus={index === 0 && bootFocus}
                    answered={picked !== null}
                    isAnswer={option.key === round.species.key}
                    isPicked={option.key === picked}
                    onPress={() => choose(option.key)}
                  />
                );
              })}
            </View>

            <View style={styles.feedback}>
              {picked !== null ? (
                <>
                  <PopIn
                    trigger={`solo:${roundIndex}:${picked}`}
                    testID="quiz-verdict">
                    <Text
                      testID="quiz-feedback"
                      style={[
                        styles.feedbackTitle,
                        {
                          fontSize: scaleFontSize(typography.title),
                          color: correct ? color.accent : color.danger,
                        },
                      ]}>
                      {correct ? 'CORRECT!' : 'NOT QUITE'}
                    </Text>
                  </PopIn>
                  {answerName ? (
                    <>
                      <Text
                        testID="quiz-answer"
                        numberOfLines={2}
                        style={[
                          styles.feedbackName,
                          {fontSize: scaleFontSize(typography.body)},
                        ]}>
                        {answerName.primary}
                      </Text>
                      {answerName.secondary ? (
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.feedbackThai,
                            {fontSize: scaleFontSize(typography.caption)},
                          ]}>
                          {answerName.secondary}
                        </Text>
                      ) : null}
                    </>
                  ) : null}
                  {revealedClues.map(clue => (
                    <Text
                      key={clue}
                      style={[
                        styles.why,
                        {fontSize: scaleFontSize(typography.caption)},
                      ]}>
                      {clue}
                    </Text>
                  ))}
                  <TouchableOpacity
                    ref={node => {
                      nextRef.current = node;
                    }}
                    testID="quiz-next"
                    activeOpacity={1}
                    accessibilityRole="button"
                    accessibilityLabel="Next round"
                    onPress={next}
                    onFocus={() => setActionFocused(true)}
                    onBlur={() => setActionFocused(false)}
                    style={[styles.next, actionFocused && styles.nextFocused]}>
                    <Text
                      style={[
                        styles.nextLabel,
                        {fontSize: scaleFontSize(typography.body)},
                      ]}>
                      {roundIndex + 1 >= rounds.length ? 'SEE RESULT' : 'NEXT →'}
                    </Text>
                  </TouchableOpacity>
                </>
              ) : null}
            </View>
          </View>
        </View>
      ) : null}

      {reward ? (
        <RewardBurst
          key={reward.id}
          variant={reward.variant}
          mascot={reward.mascot}
          amount={reward.amount}
          label={reward.variant === 'perfect' ? 'PERFECT LESSON' : 'QUIZ COMPLETE'}
          score={`${score} / ${rounds.length} CORRECT`}
          testID="quiz-reward"
          onDone={() =>
            setReward(current => (current?.id === reward.id ? null : current))
          }
        />
      ) : null}

      {/* A round win is a beat, not a payday: points, no wallet. Long enough
          to read the number, short enough to leave the verdict live. */}
      {roundWin && !roomFinal ? (
        <RewardBurst
          key={roundWin.id}
          variant="match"
          mascot="yang-na"
          amount={roundWin.points}
          durationMs={800}
          unitLabel="POINTS"
          label="ROUND WON"
          score={`P${roomTurn ?? ''} · ROUND ${(room?.index ?? 0) + 1}`}
          testID="challenge-burst"
          onDone={() =>
            setRoundWin(current =>
              current?.id === roundWin.id ? null : current,
            )
          }
        />
      ) : null}
    </View>
  );
};

interface QuizOptionProps {
  primary: string;
  secondary: string | null;
  testID: string;
  answered: boolean;
  isAnswer: boolean;
  isPicked: boolean;
  hasTVPreferredFocus: boolean;
  onPress: () => void;
}

const QuizOption = React.forwardRef<View, QuizOptionProps>(function QuizOption(
  {
    primary,
    secondary,
    testID,
    answered,
    isAnswer,
    isPicked,
    hasTVPreferredFocus,
    onPress,
  },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const reduced = useReducedMotion();
  /** The press has to land on screen now; the relay verdict can take a beat. */
  const pop = useRef(new Animated.Value(0)).current;
  /** The wrong tile shakes inside the window the verdict is on screen. */
  const shake = useRef(new Animated.Value(0)).current;
  /** The right tile gets its own pop, whichever tile was pressed. */
  const reveal = useRef(new Animated.Value(0)).current;
  const pressed = useRef(false);
  const settled = useRef(false);

  useEffect(() => {
    if (!isPicked || pressed.current) {
      return undefined;
    }
    pressed.current = true;
    if (reduced) {
      return undefined;
    }
    const beat = Animated.sequence([
      Animated.timing(pop, {
        toValue: 1,
        duration: 130,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(pop, {
        toValue: 0,
        duration: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
    ]);
    beat.start();
    return () => beat.stop();
  }, [isPicked, pop, reduced]);

  useEffect(() => {
    if (!answered || !isAnswer) {
      return undefined;
    }
    if (reduced) {
      reveal.setValue(0);
      return undefined;
    }
    const beat = Animated.sequence([
      Animated.timing(reveal, {
        toValue: 1,
        duration: 180,
        delay: 80,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(reveal, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
    ]);
    beat.start();
    return () => beat.stop();
  }, [answered, isAnswer, reduced, reveal]);

  useEffect(() => {
    if (!answered || isAnswer || settled.current) {
      return undefined;
    }
    settled.current = true;
    if (reduced || !isPicked) {
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
  }, [answered, isAnswer, isPicked, reduced, shake]);

  const semantic = answered
    ? isAnswer
      ? color.accent
      : isPicked
        ? color.danger
        : color.border
    : isPicked
      ? color.accent
      : color.border;
  const background =
    (answered && isAnswer) || (!answered && isPicked)
      ? color.surfaceRaise
      : color.surfaceInner;

  return (
    <Animated.View
      style={{
        transform: [
          {
            translateX: shake.interpolate({
              inputRange: [-1, 1],
              outputRange: [-scaleWidth(14), scaleWidth(14)],
            }),
          },
          {
            scale: pop.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 1.05],
            }),
          },
          {
            scale: reveal.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 1.07],
            }),
          },
        ],
      }}>
      <TouchableOpacity
        ref={ref}
        testID={testID}
        activeOpacity={1}
        accessibilityRole="button"
        accessibilityLabel={
          secondary ? `${primary}, ${secondary}` : primary
        }
        hasTVPreferredFocus={hasTVPreferredFocus}
        onPress={onPress}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.option,
          {
            borderColor: focused ? color.text : semantic,
            backgroundColor: background,
            zIndex: focused ? 2 : 0,
          },
        ]}>
        <Text
          numberOfLines={2}
          style={[
            styles.optionLabel,
            {fontSize: scaleFontSize(typography.body)},
          ]}>
          {primary}
        </Text>
        {secondary ? (
          <Text
            numberOfLines={1}
            style={[
              styles.optionAlt,
              {fontSize: scaleFontSize(typography.caption)},
            ]}>
            {secondary}
          </Text>
        ) : null}
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
    letterSpacing: 1,
  },
  turnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: scaleHeight(space.xxs),
  },
  turnChip: {
    color: color.surface,
    fontWeight: '800',
    letterSpacing: 2,
    paddingHorizontal: scaleWidth(space.xs),
    paddingVertical: scaleHeight(space.xxs / 2),
    borderRadius: scaleWidth(radius.pill),
    backgroundColor: color.accent,
    overflow: 'hidden',
  },
  clockRing: {
    width: scaleWidth(64),
    height: scaleWidth(64),
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: scaleWidth(space.xs),
  },
  clockSegment: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
  },
  clockTick: {
    width: scaleWidth(4),
    height: scaleWidth(10),
    borderRadius: scaleWidth(2),
  },
  clockText: {
    color: color.text,
    fontWeight: '800',
  },
  waiting: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waitingLabel: {
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
  figure: {
    width: scaleWidth(720),
    borderRadius: scaleWidth(radius.lg),
    backgroundColor: color.surfaceInner,
    borderWidth: scaleWidth(2),
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  figureGlyph: {
    color: color.accent,
    fontWeight: '800',
  },
  panel: {
    flex: 1,
    justifyContent: 'center',
  },
  prompt: {
    color: color.textMuted,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: scaleHeight(space.xs),
  },
  clue: {
    color: color.text,
    marginBottom: scaleHeight(space.sm),
  },
  options: {
    gap: scaleHeight(space.xs),
  },
  option: {
    minHeight: scaleHeight(112),
    justifyContent: 'center',
    paddingHorizontal: scaleWidth(space.md),
    borderRadius: scaleWidth(radius.md),
    borderWidth: scaleWidth(focus.ringWidth / 2),
  },
  optionLabel: {
    color: color.text,
    fontWeight: '700',
  },
  optionAlt: {
    color: color.textMuted,
    fontWeight: '600',
    marginTop: scaleHeight(space.xxs / 2),
  },
  feedback: {
    minHeight: scaleHeight(190),
    marginTop: scaleHeight(space.xs),
  },
  feedbackTitle: {
    fontWeight: '800',
    letterSpacing: 1,
  },
  feedbackName: {
    color: color.text,
    fontWeight: '700',
    marginTop: scaleHeight(space.xxs),
  },
  feedbackThai: {
    color: color.textMuted,
    marginTop: scaleHeight(space.xxs / 2),
  },
  why: {
    color: color.textMuted,
    marginTop: scaleHeight(space.xxs),
  },
  streakRow: {
    alignSelf: 'flex-start',
    marginTop: scaleHeight(space.xxs),
  },
  streakChip: {
    color: color.surface,
    fontWeight: '800',
    letterSpacing: 2,
    paddingHorizontal: scaleWidth(space.xs),
    paddingVertical: scaleHeight(space.xxs / 2),
    borderRadius: scaleWidth(radius.pill),
    backgroundColor: color.gold,
    overflow: 'hidden',
  },
  next: {
    alignSelf: 'flex-start',
    minHeight: scaleHeight(focus.target),
    justifyContent: 'center',
    marginTop: scaleHeight(space.xs),
    paddingHorizontal: scaleWidth(space.lg),
    borderRadius: scaleWidth(radius.pill),
    borderWidth: scaleWidth(focus.ringWidth / 2),
    borderColor: 'transparent',
    backgroundColor: color.accent,
  },
  nextFocused: {
    // Ink and white both vanish here: the ink ring disappears into the page
    // behind the pale pill, a white one into the pill itself. Clay reads
    // against both.
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
  winnerBlock: {
    alignItems: 'center',
    gap: scaleHeight(space.xxs),
  },
  winnerName: {
    // Gold plus a warm bloom: the champion reads before any row is scanned.
    color: color.gold,
    textAlign: 'center',
    textShadowColor: 'rgba(255, 206, 77, 0.4)',
    textShadowOffset: {width: 0, height: scaleHeight(6)},
    textShadowRadius: scaleWidth(28),
  },
  summaryLine: {
    color: color.textMuted,
    textAlign: 'center',
  },
  joinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleWidth(space.xs),
    marginTop: scaleHeight(space.xs),
  },
  joinCopy: {
    flexShrink: 1,
  },
  joinLabel: {
    color: color.textMuted,
    fontWeight: '800',
    letterSpacing: 3,
  },
  joinUrl: {
    color: color.accent,
    fontWeight: '700',
  },
  summaryTokens: {
    color: color.gold,
    fontWeight: '800',
    letterSpacing: 2,
  },
  standings: {
    minWidth: scaleWidth(520),
    gap: scaleHeight(space.xxs),
  },
  standingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: scaleWidth(space.md),
    paddingVertical: scaleHeight(space.xxs),
    borderRadius: scaleWidth(radius.sm),
    backgroundColor: color.surfaceInner,
  },
  standingName: {
    color: color.text,
    fontWeight: '700',
  },
  standingScore: {
    color: color.accent,
    fontWeight: '800',
  },
  familyRail: {
    width: scaleWidth(232),
    justifyContent: 'center',
    gap: scaleHeight(space.xxs),
  },
});
