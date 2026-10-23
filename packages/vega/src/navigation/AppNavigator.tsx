import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {
  ChallengeAward,
  ChallengeOpened,
  ChallengePlayerView,
  ChallengeQuestion,
  ChallengeStanding,
  GameDeck,
  GameSnapshot,
  McpDataClient,
  PodcastFeed,
  SpeciesType,
  TvCommand,
} from '@multitv/shared';
import {createTvRelayClient, loadDeviceId} from '@multitv/shared';
import {GroveScreen} from '../screens/GroveScreen';
import {MissionScreen} from '../screens/MissionScreen';
import {QuestsScreen} from '../screens/QuestsScreen';
import {ChallengeCodeScreen} from '../screens/games/ChallengeCodeScreen';
import {
  ChallengeLobbyScreen,
  forgetChallengeRoom,
} from '../screens/games/ChallengeLobbyScreen';
import {HeadToHeadScreen} from '../screens/games/HeadToHeadScreen';
import {QuizScreen} from '../screens/games/QuizScreen';
import {MemoryScreen} from '../screens/games/MemoryScreen';
import {SpeciesScreen} from '../screens/species/SpeciesScreen';
import {SpeciesDetailScreen} from '../screens/species/SpeciesDetailScreen';
import {SmartPlayerScreen} from '../screens/SmartPlayerScreen';
import type {PlayerHandle} from '../screens/SmartPlayerScreen';
import {SearchScreen} from '../screens/SearchScreen';
import type {SearchRelayClient, SearchRequest} from '../screens/SearchScreen';
import {SoundscapesScreen} from '../screens/SoundscapesScreen';
import {VoiceControlScreen} from '../screens/VoiceControlScreen';
import {WardrobeScreen} from '../screens/WardrobeScreen';
import {WelcomeScreen} from '../screens/WelcomeScreen';
import {useTvCommandPoll} from './useTvCommandPoll';
import {setRemoteNav} from './remoteActions';

/** Where BACK from a pushed screen returns to. */
type ReturnTo = 'welcome' | 'soundscapes';

type Route =
  | {screen: 'welcome'}
  | {screen: 'soundscapes'}
  | {screen: 'settings'}
  | {
      screen: 'player';
      feed: PodcastFeed;
      origin: ReturnTo;
    }
  | {screen: 'search'; request?: SearchRequest; backTo: ReturnTo}
  | {screen: 'grove'; backTo: ReturnTo}
  | {screen: 'quests'}
  | {screen: 'mission'}
  | {screen: 'challenge'}
  | {screen: 'challengeCode'}
  | {screen: 'headToHead'}
  | {screen: 'quiz'}
  | {screen: 'memory'}
  | {screen: 'wardrobe'}
  | {screen: 'species'; backTo: SpeciesReturn}
  | {screen: 'speciesDetail'; type: SpeciesType; id: number; backTo: SpeciesReturn};

/** The field guide opens from WELCOME, the mission briefing or the hub. */
type SpeciesReturn = 'welcome' | 'quests' | 'mission';

/** The pill names the screen the field guide was opened from. */
const SPECIES_BACK_LABEL: Record<SpeciesReturn, string> = {
  welcome: '‹ WELCOME',
  quests: '‹ QUESTS',
  mission: '‹ MISSION',
};

export interface AppNavigatorProps {
  /** Injected in tests; the app uses the device-id backed MCP client. */
  client?: McpDataClient;
  /** Injected in tests; the app uses the device-id backed voice relay. */
  relay?: SearchRelayClient;
}

/**
 * The WELCOME menu is the root; every other screen is one level deep and no
 * route stack is kept. Entering the player stores the card id and the screen
 * it came from, so BACK puts focus back where it left.
 *
 * The voice relay is polled here rather than in the search screen: a spoken
 * command has to arrive whichever screen is showing, and the server serves one
 * pending poll per television.
 */
export const AppNavigator = ({client, relay}: AppNavigatorProps) => {
  const [route, setRoute] = useState<Route>({screen: 'welcome'});
  /** The server's latest word on a voice game, handed to the quiz screen. */
  const [gameSnapshot, setGameSnapshot] = useState<GameSnapshot | null>(null);
  /**
   * The live challenge room. The server judges every press and pays the
   * party, so the navigator keeps only what the pushes carry: the room, who
   * is seated, the question on screen and the clock it was given.
   */
  const [challengeRoom, setChallengeRoom] = useState<ChallengeOpened | null>(
    null,
  );
  const [challengePlayers, setChallengePlayers] = useState<
    ChallengePlayerView[]
  >([]);
  const [challengeQuestion, setChallengeQuestion] =
    useState<ChallengeQuestion | null>(null);
  const [challengeRound, setChallengeRound] = useState({
    index: 0,
    total: 0,
    endsAt: 0,
  });
  /** The frozen rounds, kept for the head-to-head's per-round ticks. */
  const [challengeDeck, setChallengeDeck] = useState<GameDeck | null>(null);
  const [challengeStandings, setChallengeStandings] = useState<
    ChallengeStanding[]
  >([]);
  const [challengeAward, setChallengeAward] = useState<ChallengeAward | null>(
    null,
  );
  const searchSequence = useRef(0);
  /** The mounted player's pause/resume handle; null while the player is closed. */
  const playerRef = useRef<PlayerHandle | null>(null);

  const closeChallenge = useCallback(() => {
    // The lobby's remembered room dies with the one on screen; otherwise the
    // next FAMILY QUIZ would reopen a party that already has its podium.
    forgetChallengeRoom();
    setChallengeRoom(null);
    setChallengePlayers([]);
    setChallengeQuestion(null);
    setChallengeRound({index: 0, total: 0, endsAt: 0});
    setChallengeDeck(null);
    setChallengeStandings([]);
    setChallengeAward(null);
  }, []);

  const relays = useMemo(
    () => relay ?? createTvRelayClient({getDeviceId: loadDeviceId}),
    [relay],
  );

  // The relay keys pairing to this id, so it has to be readable from the log
  // when the TV has no on-screen way to show it.
  useEffect(() => {
    void loadDeviceId().then(id => console.log('[globie] tv device id', id));
  }, []);

  const openFeed = useCallback((feed: PodcastFeed) => {
    setRoute(current => ({
      screen: 'player',
      feed,
      origin: current.screen === 'soundscapes' ? 'soundscapes' : 'welcome',
    }));
  }, []);

  const closePlayer = useCallback(() => {
    setRoute(current => {
      if (current.screen !== 'player') {
        return current;
      }
      if (current.origin === 'soundscapes') {
        return {screen: 'soundscapes'};
      }
      return {screen: 'welcome'};
    });
  }, []);

  const goBackTo = useCallback((target: ReturnTo) => {
    setRoute({screen: target});
  }, []);

  /**
   * One level back, resolved against the screen that is actually showing.
   * The `onBack` props below call this too, so a spoken "back" and the BACK
   * key can never disagree about where a screen returns to.
   */
  const goBack = useCallback(
    (current: Route) => {
      if (current.screen === 'player') {
        closePlayer();
        return;
      }
      if (current.screen === 'search' || current.screen === 'grove') {
        goBackTo(current.backTo);
        return;
      }
      if (current.screen === 'species') {
        setRoute({screen: current.backTo});
        return;
      }
      if (current.screen === 'speciesDetail') {
        setRoute({screen: 'species', backTo: current.backTo});
        return;
      }
      if (current.screen === 'quiz') {
        // Leaving ends the mirror, exactly as the quiz's own back does.
        setGameSnapshot(null);
        if (challengeRoom) {
          closeChallenge();
        }
        setRoute({screen: 'quests'});
        return;
      }
      if (current.screen === 'headToHead') {
        closeChallenge();
        setRoute({screen: 'quests'});
        return;
      }
      if (current.screen === 'challengeCode') {
        setRoute({screen: 'challenge'});
        return;
      }
      if (
        current.screen === 'mission' ||
        current.screen === 'challenge' ||
        current.screen === 'memory'
      ) {
        setRoute({screen: 'quests'});
        return;
      }
      // WELCOME, SOUNDSCAPES, SETTINGS and WARDROBE are the top of the tree.
      setRoute({screen: 'welcome'});
    },
    [challengeRoom, closeChallenge, closePlayer, goBackTo],
  );

  // The on-screen remote's HOME / BACK / MENU belong to the navigator: only it
  // knows the route. Re-registered on every route change so BACK is never stale.
  useEffect(() => {
    setRemoteNav({
      home: () => setRoute({screen: 'welcome'}),
      back: () => goBack(route),
      menu: () =>
        setRoute(current =>
          current.screen === 'settings' ? current : {screen: 'settings'},
        ),
    });
  }, [goBack, route]);

  const onCommand = useCallback(
    (command: TvCommand) => {
      if (command.type === 'search') {
        searchSequence.current += 1;
        const request = {query: command.query, id: searchSequence.current};
        setRoute(current => ({
          screen: 'search',
          request,
          backTo:
            current.screen === 'soundscapes' ? 'soundscapes' : 'welcome',
        }));
        return;
      }
      if (command.type === 'openFeed') {
        // The server resolved the show before queueing, so the payload is
        // already what the player renders - no lookup and no search screen.
        openFeed(command.feed);
        return;
      }
      if (command.type === 'home') {
        setRoute({screen: 'welcome'});
        return;
      }
      if (command.type === 'back') {
        // Resolved against the route captured at dispatch, so the same table
        // the BACK key uses answers here.
        goBack(route);
        return;
      }
      if (command.type === 'openScreen') {
        // Named destinations are chips the viewer can already reach, so this
        // is a jump rather than a new place to be.
        if (command.screen === 'quests') {
          setRoute({screen: 'quests'});
          return;
        }
        if (command.screen === 'learn') {
          setRoute({screen: 'species', backTo: 'welcome'});
          return;
        }
        if (command.screen === 'focus') {
          setRoute({screen: 'grove', backTo: 'welcome'});
          return;
        }
        if (command.screen === 'settings') {
          setRoute({screen: 'settings'});
          return;
        }
        if (command.screen === 'wardrobe') {
          setRoute({screen: 'wardrobe'});
          return;
        }
        if (command.screen === 'guessWho') {
          // The quiz is where the deck is published, so this is the first beat
          // of the voice-only way in: open here, then the Skill deals.
          setRoute({screen: 'quiz'});
          return;
        }
        setRoute({screen: 'welcome'});
        return;
      }
      if (command.type === 'player.pause') {
        playerRef.current?.pause();
        return;
      }
      if (command.type === 'player.resume') {
        playerRef.current?.resume();
        return;
      }
      if (command.type === 'challenge.lobby') {
        // A room was opened or a seat taken. From anywhere but the quiz this
        // is the way into the party; the lobby draws the roster itself.
        const sameRoom = challengeRoom?.roomId === command.room.roomId;
        setChallengeRoom({
          roomId: command.room.roomId,
          code: command.room.code,
          deckId: command.room.deckId,
          phase: command.room.phase,
          expiresAt: command.room.expiresAt,
        });
        setChallengePlayers(command.room.players);
        if (!sameRoom) {
          setChallengeQuestion(null);
          setChallengeRound({index: 0, total: 0, endsAt: 0});
        }
        setRoute(current =>
          current.screen === 'quiz' ? current : {screen: 'challenge'},
        );
        return;
      }
      if (command.type === 'challenge.question') {
        // The push is the whole round, so the screen mounts already on the
        // question the server asked and the clock it started.
        setChallengeQuestion(command.round);
        setChallengeRound({
          index: command.index,
          total: command.total,
          endsAt: command.endsAt,
        });
        setGameSnapshot(null);
        // The lobby's start call normally seats the room first; if the push
        // wins that race the question waits for `onStarted` to open the quiz.
        if (challengeRoom) {
          setRoute({screen: 'quiz'});
        }
        return;
      }
      if (command.type === 'challenge.standings') {
        // Whole ranking, not a delta: the summary and the head-to-head draw
        // exactly what the server last judged.
        setChallengeStandings(command.rows);
        if (command.award) {
          setChallengeAward(command.award);
        }
        if (command.final) {
          // The podium is the end of the room; a later FAMILY QUIZ must open
          // a new one instead of reseating this party.
          forgetChallengeRoom();
        }
        return;
      }
      if (command.type === 'challenge.presence') {
        // Pixels never travel through the command queue. The lobby polls the
        // same tiles every 800 ms, so this push is only a wake-up; absorbing it
        // here documents that instead of relying on the chain falling through.
        return;
      }
      if (command.type === 'challenge.closed') {
        // The lobby replaces its own room: closing a stale one a moment
        // before opening a fresh one is routine there, and acting on that
        // push would unmount the screen that is about to show the new code.
        if (route.screen === 'challenge') {
          return;
        }
        // Anywhere else only the room on screen matters. Without this check a
        // stale room's closure would end the party that replaced it.
        if (challengeRoom && command.roomId !== challengeRoom.roomId) {
          return;
        }
        closeChallenge();
        setRoute(current =>
          current.screen === 'quiz' ||
          current.screen === 'challenge' ||
          current.screen === 'challengeCode' ||
          current.screen === 'headToHead'
            ? {screen: 'quests'}
            : current,
        );
        return;
      }
      if (command.type === 'game.start') {
        // The snapshot is the whole game, so the screen needs no handshake:
        // it mounts already on the question the Skill just spoke.
        closeChallenge();
        setGameSnapshot(command.snapshot);
        setRoute({screen: 'quiz'});
        return;
      }
      if (command.type === 'game.answer' || command.type === 'game.next') {
        // Only a screen that is drawing the game can use a turn; a snapshot
        // kept while the quiz is closed would be applied on the next visit.
        if (route.screen === 'quiz') {
          setGameSnapshot(command.snapshot);
        }
        return;
      }
      if (command.type === 'game.quit') {
        setGameSnapshot(null);
        setRoute(current =>
          current.screen === 'quiz' ? {screen: 'quests'} : current,
        );
      }
    },
    [challengeRoom, closeChallenge, goBack, openFeed, route],
  );

  const {paired, error: relayError} = useTvCommandPoll({relay: relays, onCommand});

  if (route.screen === 'welcome') {
    return (
      <WelcomeScreen
        client={client}
        onOpenLearn={() => setRoute({screen: 'species', backTo: 'welcome'})}
        onOpenQuests={() => setRoute({screen: 'quests'})}
        onOpenSoundscapes={() => setRoute({screen: 'soundscapes'})}
        onOpenSettings={() => setRoute({screen: 'settings'})}
        onOpenWardrobe={() => setRoute({screen: 'wardrobe'})}
        onOpenFocus={() => setRoute({screen: 'grove', backTo: 'welcome'})}
      />
    );
  }

  if (route.screen === 'soundscapes') {
    return (
      <SoundscapesScreen
        client={client}
        onOpenFeed={openFeed}
        onBack={() => goBack(route)}
      />
    );
  }

  if (route.screen === 'settings') {
    return (
      <VoiceControlScreen
        relay={relays}
        paired={paired}
        relayError={relayError ?? undefined}
        onBack={() => goBack(route)}
      />
    );
  }

  if (route.screen === 'wardrobe') {
    return (
      <WardrobeScreen
        relay={relays}
        onBack={() => goBack(route)}
      />
    );
  }

  if (route.screen === 'search') {
    return (
      <SearchScreen
        client={client}
        relay={relays}
        request={route.request}
        paired={paired}
        onOpenFeed={openFeed}
        onBack={() => goBack(route)}
      />
    );
  }

  if (route.screen === 'grove') {
    return <GroveScreen relay={relays} onBack={() => goBack(route)} />;
  }

  if (route.screen === 'quests') {
    return (
      <QuestsScreen
        onOpenMission={() => setRoute({screen: 'mission'})}
        onOpenQuiz={() => setRoute({screen: 'quiz'})}
        onOpenMemory={() => setRoute({screen: 'memory'})}
        onOpenChallenge={() => setRoute({screen: 'challenge'})}
        onBack={() => goBack(route)}
      />
    );
  }

  if (route.screen === 'mission') {
    return (
      <MissionScreen
        onOpenSpecies={() => setRoute({screen: 'species', backTo: 'mission'})}
        onBack={() => goBack(route)}
      />
    );
  }

  if (route.screen === 'challenge') {
    return (
      <ChallengeLobbyScreen
        relay={relays}
        onOpenCode={launch => {
          // The lobby owns the code before the party starts; keeping the room
          // and its frozen deck here lets the code screen draw both.
          setChallengeRoom(launch.room);
          setChallengePlayers(launch.players);
          setChallengeDeck(launch.deck);
          setRoute({screen: 'challengeCode'});
        }}
        onStarted={({room, players, deck}) => {
          // The room and its table are already in hand; the first question
          // arrives on the next push and the quiz opens on it.
          setChallengeRoom(room);
          setChallengePlayers(players);
          setChallengeDeck(deck);
          setGameSnapshot(null);
          setRoute({screen: 'quiz'});
        }}
        onBack={() => goBack(route)}
      />
    );
  }

  if (route.screen === 'challengeCode') {
    return (
      <ChallengeCodeScreen
        relay={relays}
        room={
          challengeRoom
            ? {
                roomId: challengeRoom.roomId,
                code: challengeRoom.code,
                players: challengePlayers,
              }
            : null
        }
        onJoined={(invitation, joined) => {
          // The invitation carries the frozen deck with its answer keys, so
          // this household judges the identical rounds. The first question
          // arrives when the host starts the party.
          setChallengeRoom({
            roomId: invitation.roomId,
            code: invitation.code,
            deckId: invitation.deckId,
            phase: invitation.phase,
            expiresAt: invitation.expiresAt,
          });
          setChallengePlayers(joined.players);
          setChallengeDeck(invitation.deck);
          setChallengeQuestion(null);
          setChallengeRound({index: 0, total: 0, endsAt: 0});
        }}
        onBack={() => goBack(route)}
      />
    );
  }

  if (route.screen === 'headToHead') {
    return (
      <HeadToHeadScreen
        deck={challengeDeck}
        standings={challengeStandings}
        slot={challengePlayers[0]?.slot ?? 1}
        award={challengeAward}
        onBack={() => goBack(route)}
      />
    );
  }

  if (route.screen === 'quiz') {
    // A room's whole state lives on the server, so the screen is handed one
    // shape every time and never scores, clocks or pays on its own.
    const roomView = challengeRoom
      ? {
          roomId: challengeRoom.roomId,
          code: challengeRoom.code,
          slot: challengePlayers[0]?.slot ?? 1,
          players: challengePlayers,
          question: challengeQuestion,
          index: challengeRound.index,
          total: challengeRound.total,
          endsAt: challengeRound.endsAt,
        }
      : null;
    return (
      <QuizScreen
        relay={relays}
        snapshot={roomView ? null : gameSnapshot}
        room={roomView}
        standings={challengeStandings}
        payout={challengeAward}
        onHeadToHead={({standings, award}) => {
          // The summary already judged every round; the two-column card just
          // redraws it against the deck this television is holding.
          setChallengeStandings(standings);
          setChallengeAward(award);
          setRoute({screen: 'headToHead'});
        }}
        onBack={() => goBack(route)}
      />
    );
  }

  if (route.screen === 'memory') {
    return (
      <MemoryScreen
        relay={relays}
        onBack={() => goBack(route)}
      />
    );
  }

  if (route.screen === 'species') {
    return (
      <SpeciesScreen
        backLabel={SPECIES_BACK_LABEL[route.backTo]}
        onOpenDetail={(type, id) =>
          setRoute({screen: 'speciesDetail', type, id, backTo: route.backTo})
        }
        onBack={() => goBack(route)}
      />
    );
  }

  if (route.screen === 'speciesDetail') {
    return (
      <SpeciesDetailScreen
        type={route.type}
        id={route.id}
        onBack={() => goBack(route)}
      />
    );
  }

  if (route.screen === 'player') {
    return (
      <SmartPlayerScreen
        feed={route.feed}
        client={client}
        relay={relays}
        handleRef={playerRef}
        onBack={closePlayer}
      />
    );
  }

  return null;
};
