import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  BackHandler,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  CoverArt,
  color,
  createGlobieMcpClient,
  focus,
  layout,
  loadDeviceId,
  loadLastPlayed,
  loadResumePoint,
  plainText,
  radius,
  saveLastPlayed,
  saveResumePoint,
  scaleFontSize,
  scaleHeight,
  scaleWidth,
  space,
  typography,
} from '@multitv/shared';
import type {
  EpisodeList,
  McpDataClient,
  PodcastEpisode,
  PodcastFeed,
} from '@multitv/shared';
import {EpisodeQueue} from './player/EpisodeQueue';
import {HandoffNotice, useHandoff} from './player/HandoffNotice';
import type {HandoffRelay} from './player/HandoffNotice';
import {PodcastAudio} from './player/podcastAudio';
import {TransportBar} from './player/TransportBar';

/** The moves voice may make on a mounted player. Both are the transport bar's. */
export interface PlayerHandle {
  pause: () => void;
  resume: () => void;
}

export interface SmartPlayerScreenProps {
  feed: PodcastFeed;
  onBack: () => void;
  /** Injected in tests; the app uses the device-id backed MCP client. */
  client?: McpDataClient;
  /** Injected in tests; the app uses the device-id backed voice relay. */
  relay?: HandoffRelay;
  /**
   * Filled with pause/resume while this screen is mounted and cleared on
   * unmount, so a spoken command can never reach a closed player.
   */
  handleRef?: React.MutableRefObject<PlayerHandle | null>;
}

type Status = 'loading' | 'ready' | 'error';

/** Cycle order for the sleep control: off, 15, 30, 45 minutes. */
const SLEEP_OPTIONS = [0, 15, 30, 45];

/**
 * Screen 2. Episodes come from `get_podcast_episodes`; playback runs through
 * one `PodcastAudio` instance so the w3cmedia quirks stay in a single guarded
 * file. Every failure is surfaced as text on screen, never thrown.
 */
export const SmartPlayerScreen = ({
  feed,
  onBack,
  client,
  relay,
  handleRef,
}: SmartPlayerScreenProps) => {
  const mcp = useMemo(
    () =>
      client ??
      createGlobieMcpClient({
        getDeviceId: loadDeviceId,
      }),
    [client],
  );

  const [status, setStatus] = useState<Status>('loading');
  const [episodes, setEpisodes] = useState<PodcastEpisode[]>([]);
  const [current, setCurrent] = useState<PodcastEpisode | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [positionSec, setPositionSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [sleepMinutes, setSleepMinutes] = useState(0);
  const [queueOpen, setQueueOpen] = useState(false);
  const [preferred, setPreferred] = useState<'play' | 'queue'>('play');
  const [backFocused, setBackFocused] = useState(false);

  // Created once; `PodcastAudio` allocates no native player until start().
  const audioRef = useRef<PodcastAudio | null>(null);
  if (audioRef.current === null) {
    audioRef.current = new PodcastAudio();
  }
  const audio = audioRef.current;

  // The Echo is the fallback speaker: a Vega build with no audio sink fails
  // every play, so the episode is parked for the paired Alexa account.
  const {
    state: handoffState,
    park: parkHandoff,
    reset: resetHandoff,
  } = useHandoff(relay);

  // Latest-value refs so the `ended` handler and the unmount cleanup never
  // read a stale render closure.
  const episodesRef = useRef(episodes);
  episodesRef.current = episodes;
  const currentRef = useRef(current);
  currentRef.current = current;
  const queueOpenRef = useRef(queueOpen);
  queueOpenRef.current = queueOpen;
  const startEpisodeRef = useRef<(episode: PodcastEpisode) => void>(
    () => undefined,
  );

  const persistResume = useCallback(
    (episode: PodcastEpisode, position: number) => {
      if (position < 5) {
        return;
      }
      const point = {
        feedId: feed.id,
        episodeId: episode.id,
        positionSec: Math.floor(position),
        updatedAt: new Date().toISOString(),
      };
      void saveResumePoint(point);
      void saveLastPlayed(point);
    },
    [feed.id],
  );

  const startEpisode = useCallback(
    async (episode: PodcastEpisode) => {
      setBusy(true);
      setMessage(null);
      resetHandoff();

      const resume = await loadResumePoint(episode.id).catch(() => null);
      const startAt = resume?.positionSec ?? 0;

      const result = await audio.start(episode.enclosureUrl, startAt, {
        onTime: (position, duration) => {
          setPositionSec(position);
          if (duration > 0) {
            setDurationSec(duration);
          }
        },
        onEnded: () => {
          const list = episodesRef.current;
          const index = list.findIndex(item => item.id === episode.id);
          const next = index >= 0 ? list[index + 1] : undefined;
          if (next) {
            startEpisodeRef.current(next);
            return;
          }
          setPlaying(false);
          setPositionSec(0);
          setDurationSec(episode.durationSec ?? 0);
        },
        onError: (detail, reason) => {
          setMessage(detail);
          setPlaying(false);
          if (reason === 'unsupported') {
            void parkHandoff({
              type: 'podcast',
              feedId: feed.id,
              episodeId: episode.id,
            });
          }
        },
      });

      setBusy(false);

      if (!result.started) {
        setPlaying(false);
        setMessage(result.message ?? 'This episode could not be played.');
        if (result.unavailable) {
          void parkHandoff({
            type: 'podcast',
            feedId: feed.id,
            episodeId: episode.id,
          });
        }
        return;
      }

      setCurrent(episode);
      setPlaying(true);
      setPositionSec(startAt);
      setDurationSec(episode.durationSec ?? audio.duration());
      persistResume(episode, startAt);
    },
    [audio, feed.id, parkHandoff, persistResume, resetHandoff],
  );
  startEpisodeRef.current = startEpisode;

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setStatus('loading');
      setMessage(null);
      try {
        await mcp.connect();
        const list = await mcp.callTool<EpisodeList>('get_podcast_episodes', {
          feedId: feed.id,
          max: 30,
        });
        if (cancelled) {
          return;
        }
        const next = list.episodes ?? [];
        setEpisodes(next);
        setStatus('ready');
        if (next.length === 0) {
          setMessage(
            list.note ?? 'No episodes are published for this show yet.',
          );
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        setStatus('error');
        setMessage(error instanceof Error ? error.message : String(error));
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [mcp, feed.id]);

  // Pick the episode to show before Play is pressed: last played for this
  // show when there is one, otherwise the newest episode.
  useEffect(() => {
    if (episodes.length === 0) {
      return;
    }

    let cancelled = false;

    const pick = async () => {
      const last = await loadLastPlayed().catch(() => null);
      const match =
        last && last.feedId === feed.id
          ? episodes.find(episode => episode.id === last.episodeId)
          : undefined;
      const episode = match ?? episodes[0];
      if (cancelled) {
        return;
      }

      setCurrent(previous => previous ?? episode);
      setDurationSec(episode.durationSec ?? 0);

      const resume = await loadResumePoint(episode.id).catch(() => null);
      if (!cancelled && resume) {
        setPositionSec(resume.positionSec);
      }
    };

    void pick();
    return () => {
      cancelled = true;
    };
  }, [episodes, feed.id]);

  useEffect(() => {
    if (sleepMinutes === 0) {
      return;
    }

    const timer = setTimeout(() => {
      audio.pause();
      setPlaying(false);
      setSleepMinutes(0);
      setMessage(`Sleep timer ended playback after ${sleepMinutes} minutes.`);
      const episode = currentRef.current;
      if (episode) {
        persistResume(episode, audio.position());
      }
    }, sleepMinutes * 60 * 1000);

    return () => clearTimeout(timer);
  }, [audio, sleepMinutes, persistResume]);

  useEffect(() => {
    return () => {
      const episode = currentRef.current;
      if (episode) {
        persistResume(episode, audio.position());
      }
      audio.dispose();
    };
  }, [audio, persistResume]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (queueOpenRef.current) {
          setQueueOpen(false);
          setPreferred('queue');
          return true;
        }
        onBack();
        return true;
      },
    );
    return () => subscription?.remove();
  }, [onBack]);

  const pausePlayback = useCallback(() => {
    if (!audio.isLoaded()) {
      return;
    }
    audio.pause();
    setPlaying(false);
    const episode = currentRef.current;
    if (episode) {
      persistResume(episode, audio.position());
    }
  }, [audio, persistResume]);

  const resumePlayback = useCallback(async () => {
    const episode = currentRef.current ?? episodesRef.current[0];
    if (!episode) {
      setMessage(
        status === 'loading'
          ? 'Episodes are still loading.'
          : 'No episodes are available for this show yet.',
      );
      return;
    }

    // First press, or a resume point that has not touched the player yet.
    if (!audio.isLoaded()) {
      await startEpisode(episode);
      return;
    }

    setBusy(true);
    const result = await audio.play();
    setBusy(false);

    if (result.started) {
      setPlaying(true);
      setMessage(null);
      return;
    }

    setMessage(result.message ?? 'This episode could not be played.');
    if (result.unavailable) {
      void parkHandoff({
        type: 'podcast',
        feedId: feed.id,
        episodeId: episode.id,
      });
    }
  }, [audio, feed.id, parkHandoff, startEpisode, status]);

  const togglePlay = useCallback(async () => {
    if (busy) {
      return;
    }

    if (playing) {
      pausePlayback();
      return;
    }

    await resumePlayback();
  }, [busy, pausePlayback, playing, resumePlayback]);

  useEffect(() => {
    if (!handleRef) {
      return;
    }
    // The same two callbacks the transport bar calls, so a spoken pause and a
    // pressed pause cannot land in different places.
    handleRef.current = {
      pause: pausePlayback,
      resume: () => {
        void resumePlayback();
      },
    };
    return () => {
      handleRef.current = null;
    };
  }, [handleRef, pausePlayback, resumePlayback]);

  const restart = useCallback(() => {
    audio.seekTo(0);
    setPositionSec(0);
  }, [audio]);

  const seekBy = useCallback(
    (deltaSec: number) => {
      audio.seekBy(deltaSec);
      setPositionSec(audio.position());
    },
    [audio],
  );

  const cycleSleep = useCallback(() => {
    setSleepMinutes(value => {
      const index = SLEEP_OPTIONS.indexOf(value);
      return SLEEP_OPTIONS[(index + 1) % SLEEP_OPTIONS.length];
    });
  }, []);

  const selectFromQueue = useCallback(
    (episode: PodcastEpisode) => {
      setQueueOpen(false);
      setPreferred('play');
      void startEpisode(episode);
    },
    [startEpisode],
  );

  const description = plainText(feed.description);
  const sleepLabel =
    sleepMinutes === 0 ? 'Sleep off' : `Sleep ${sleepMinutes}m`;

  return (
    <View style={styles.root} testID="smart-player">
      <View style={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity
            testID="player-back"
            activeOpacity={1}
            accessibilityRole="button"
            accessibilityLabel="Back"
            accessibilityHint="Returns to the home screen"
            onPress={onBack}
            onFocus={() => setBackFocused(true)}
            onBlur={() => setBackFocused(false)}
            style={[
              styles.back,
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
                {fontSize: scaleFontSize(typography.body)},
              ]}>
              ‹ Back
            </Text>
          </TouchableOpacity>
          <Text
            style={[
              styles.headerTitle,
              {fontSize: scaleFontSize(typography.body)},
            ]}
            numberOfLines={1}>
            {feed.title}
          </Text>
        </View>

        <View style={styles.body}>
          <CoverArt
            seed={String(feed.id)}
            title={feed.title}
            image={feed.image}
            size={480}
            testID="player-cover"
          />
          <View style={styles.textColumn}>
            <Text
              style={[
                styles.eyebrow,
                {fontSize: scaleFontSize(typography.label)},
              ]}>
              PODCAST
            </Text>
            <Text
              style={[
                styles.title,
                {fontSize: scaleFontSize(typography.headline)},
              ]}
              numberOfLines={2}
              testID="player-title">
              {feed.title}
            </Text>
            {feed.author ? (
              <Text
                style={[
                  styles.author,
                  {fontSize: scaleFontSize(typography.body)},
                ]}
                numberOfLines={1}>
                {feed.author}
              </Text>
            ) : null}
            {description ? (
              <Text
                style={[
                  styles.description,
                  {fontSize: scaleFontSize(typography.body)},
                ]}
                numberOfLines={3}>
                {description}
              </Text>
            ) : null}
            {current ? (
              <Text
                style={[
                  styles.episode,
                  {fontSize: scaleFontSize(typography.body)},
                ]}
                numberOfLines={2}
                testID="player-episode-title">
                {current.title}
              </Text>
            ) : null}
            {message ? (
              <Text
                style={[
                  styles.message,
                  {fontSize: scaleFontSize(typography.caption)},
                ]}
                numberOfLines={3}
                testID="player-message">
                {message}
              </Text>
            ) : null}
            <HandoffNotice state={handoffState} testID="player-handoff" />
            {status === 'loading' ? (
              <Text
                style={[
                  styles.status,
                  {fontSize: scaleFontSize(typography.caption)},
                ]}
                testID="player-loading">
                Loading episodes…
              </Text>
            ) : null}
          </View>
        </View>
      </View>

      <TransportBar
        playing={playing}
        busy={busy}
        positionSec={positionSec}
        durationSec={durationSec}
        sleepLabel={sleepLabel}
        queueCount={episodes.length}
        hasPreferredFocus={preferred === 'play'}
        queueHasPreferredFocus={preferred === 'queue'}
        onTogglePlay={() => {
          void togglePlay();
        }}
        onRestart={restart}
        onSeekBy={seekBy}
        onCycleSleep={cycleSleep}
        onOpenQueue={() => setQueueOpen(true)}
      />

      {queueOpen ? (
        <EpisodeQueue
          episodes={episodes}
          currentId={current ? current.id : null}
          onSelect={selectFromQueue}
          onClose={() => {
            setQueueOpen(false);
            setPreferred('queue');
          }}
        />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.surface,
  },
  content: {
    flex: 1,
    paddingHorizontal: scaleWidth(layout.insetX),
    paddingTop: scaleHeight(layout.insetY),
  },
  header: {
    height: scaleHeight(layout.headerHeight),
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleWidth(space.md),
  },
  back: {
    minHeight: scaleHeight(focus.target),
    justifyContent: 'center',
    borderWidth: scaleWidth(focus.ringWidth),
    borderRadius: scaleWidth(radius.pill),
    paddingHorizontal: scaleWidth(space.sm),
  },
  backLabel: {
    color: color.text,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  headerTitle: {
    flex: 1,
    color: color.textMuted,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleWidth(space.lg),
    paddingTop: scaleHeight(space.md),
    paddingBottom: scaleHeight(space.md),
  },
  textColumn: {
    flex: 1,
    justifyContent: 'center',
  },
  eyebrow: {
    color: color.accent,
    fontWeight: '800',
    letterSpacing: 2,
  },
  title: {
    color: color.text,
    fontWeight: '700',
    letterSpacing: -0.6,
    paddingTop: scaleHeight(space.xxs),
  },
  author: {
    color: color.textMuted,
    paddingTop: scaleHeight(space.xxs),
  },
  description: {
    color: color.textMuted,
    paddingTop: scaleHeight(space.sm),
  },
  episode: {
    color: color.text,
    fontWeight: '600',
    paddingTop: scaleHeight(space.sm),
  },
  message: {
    color: color.danger,
    paddingTop: scaleHeight(space.xs),
  },
  status: {
    color: color.textMuted,
    paddingTop: scaleHeight(space.xs),
  },
});
