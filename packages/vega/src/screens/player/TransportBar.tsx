import React, {forwardRef, useEffect, useRef, useState} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
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

export const formatTime = (totalSeconds: number): string => {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
};

interface TransportButtonProps {
  testID: string;
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
  hasTVPreferredFocus?: boolean;
}

const TransportButton = forwardRef<View, TransportButtonProps>(
  (
    {
      testID,
      label,
      accessibilityLabel,
      onPress,
      primary = false,
      disabled = false,
      hasTVPreferredFocus = false,
    }: TransportButtonProps,
    ref,
  ) => {
    const [focused, setFocused] = useState(false);

    return (
      <TouchableOpacity
        ref={ref}
        testID={testID}
        activeOpacity={1}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        disabled={disabled}
        hasTVPreferredFocus={hasTVPreferredFocus}
        onPress={onPress}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.button,
          {
            borderColor: focused
              ? color.text
              : primary
              ? color.accent
              : color.border,
            backgroundColor: primary
              ? color.accent
              : focused
              ? color.surfaceRaise
              : 'transparent',
            opacity: disabled ? 0.4 : 1,
          },
        ]}>
        <Text
          style={[
            styles.buttonLabel,
            {
              fontSize: scaleFontSize(typography.caption),
              color: primary
                ? color.surface
                : focused
                ? color.text
                : color.textMuted,
            },
          ]}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  },
);
TransportButton.displayName = 'TransportButton';

type FocusDirection = 'up' | 'down' | 'left' | 'right';

export interface TransportBarProps {
  playing: boolean;
  busy: boolean;
  positionSec: number;
  durationSec: number;
  sleepLabel: string;
  queueCount: number;
  /** Only the first entry to the screen should claim focus. */
  hasPreferredFocus: boolean;
  /** Set after the queue closes so BACK returns focus to the Queue control. */
  queueHasPreferredFocus?: boolean;
  onTogglePlay: () => void;
  onRestart: () => void;
  onSeekBy: (deltaSec: number) => void;
  onCycleSleep: () => void;
  onOpenQueue: () => void;
}

/**
 * Podcast transport. There is no playback-rate or captions control here
 * because neither is wired yet; shipping a dead button would be worse than
 * shipping none.
 */
export const TransportBar = ({
  playing,
  busy,
  positionSec,
  durationSec,
  sleepLabel,
  queueCount,
  hasPreferredFocus,
  queueHasPreferredFocus = false,
  onTogglePlay,
  onRestart,
  onSeekBy,
  onCycleSleep,
  onOpenQueue,
}: TransportBarProps) => {
  const ratio =
    durationSec > 0 ? Math.min(1, Math.max(0, positionSec / durationSec)) : 0;
  const playLabel = busy ? '⋯ Loading' : playing ? '❚❚ Pause' : '▶ Play';

  const restartRef = useRef<View | null>(null);
  const back30Ref = useRef<View | null>(null);
  const back10Ref = useRef<View | null>(null);
  const playRef = useRef<View | null>(null);
  const forward10Ref = useRef<View | null>(null);
  const forward30Ref = useRef<View | null>(null);
  const sleepRef = useRef<View | null>(null);
  const queueRef = useRef<View | null>(null);

  const tagOf = (node: View | null | undefined): number | null =>
    node ? findNodeHandle(node as unknown as React.Component) : null;

  useEffect(() => {
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

    // Deferred: on mount the buttons are not yet registered with the native
    // focus manager, so setNextFocus rejects their tags as invalid.
    const timer = setTimeout(() => {
      // The secondary row has no implicit D-pad link from the transport row, so
      // DOWN from any primary control lands on SLEEP and RIGHT reaches QUEUE.
      const primary = [
        restartRef,
        back30Ref,
        back10Ref,
        playRef,
        forward10Ref,
        forward30Ref,
      ];
      primary.forEach(ref => link(ref.current, sleepRef.current, 'down'));
      link(sleepRef.current, restartRef.current, 'up');
      link(sleepRef.current, queueRef.current, 'right');
      link(queueRef.current, sleepRef.current, 'left');
      link(queueRef.current, forward30Ref.current, 'up');
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.bar} testID="player-transport">
      <View style={styles.row}>
        <TransportButton
          ref={restartRef}
          testID="player-restart"
          label="⏮"
          accessibilityLabel="Restart episode"
          onPress={onRestart}
        />
        <TransportButton
          ref={back30Ref}
          testID="player-seek-back-30"
          label="−30s"
          accessibilityLabel="Skip back 30 seconds"
          onPress={() => onSeekBy(-30)}
        />
        <TransportButton
          ref={back10Ref}
          testID="player-seek-back-10"
          label="−10s"
          accessibilityLabel="Skip back 10 seconds"
          onPress={() => onSeekBy(-10)}
        />
        <TransportButton
          ref={playRef}
          testID="player-play"
          label={playLabel}
          accessibilityLabel={playing ? 'Pause episode' : 'Play episode'}
          onPress={onTogglePlay}
          primary
          disabled={busy}
          hasTVPreferredFocus={hasPreferredFocus && !queueHasPreferredFocus}
        />
        <TransportButton
          ref={forward10Ref}
          testID="player-seek-forward-10"
          label="+10s"
          accessibilityLabel="Skip forward 10 seconds"
          onPress={() => onSeekBy(10)}
        />
        <TransportButton
          ref={forward30Ref}
          testID="player-seek-forward-30"
          label="+30s"
          accessibilityLabel="Skip forward 30 seconds"
          onPress={() => onSeekBy(30)}
        />
        <View style={styles.progressArea}>
          <View style={styles.track}>
            <View style={[styles.fill, {width: `${ratio * 100}%`}]} />
          </View>
          <Text
            style={[
              styles.time,
              {fontSize: scaleFontSize(typography.caption)},
            ]}
            testID="player-time">
            {formatTime(positionSec)} / {formatTime(durationSec)}
          </Text>
        </View>
      </View>

      <View style={styles.secondaryRow}>
        <TransportButton
          ref={sleepRef}
          testID="player-sleep"
          label={sleepLabel}
          accessibilityLabel={`${sleepLabel}. Press to change the sleep timer.`}
          onPress={onCycleSleep}
        />
        <TransportButton
          ref={queueRef}
          testID="player-queue"
          label={`Queue (${queueCount})`}
          accessibilityLabel={`Open the episode queue, ${queueCount} episodes`}
          onPress={onOpenQueue}
          hasTVPreferredFocus={queueHasPreferredFocus}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  bar: {
    height: scaleHeight(190),
    backgroundColor: color.scrim,
    borderTopWidth: 1,
    borderTopColor: color.border,
    paddingHorizontal: scaleWidth(layout.insetX),
    paddingVertical: scaleHeight(space.sm),
    justifyContent: 'space-between',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleWidth(space.xxs),
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: scaleWidth(space.xs),
  },
  button: {
    minHeight: scaleHeight(focus.target),
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: scaleWidth(focus.ringWidth),
    borderRadius: scaleWidth(radius.pill),
    paddingHorizontal: scaleWidth(space.sm),
  },
  buttonLabel: {
    fontWeight: '700',
  },
  progressArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleWidth(space.sm),
    marginLeft: scaleWidth(space.xs),
  },
  track: {
    flex: 1,
    height: scaleHeight(8),
    borderRadius: scaleHeight(4),
    backgroundColor: color.border,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: color.accent,
  },
  time: {
    minWidth: scaleWidth(220),
    textAlign: 'right',
    color: color.textMuted,
  },
});
