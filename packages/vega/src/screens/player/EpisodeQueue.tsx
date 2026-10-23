import React, {useEffect, useState} from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
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
import type {PodcastEpisode} from '@multitv/shared';
import {formatTime} from './TransportBar';

interface EpisodeRowProps {
  testID: string;
  episode: PodcastEpisode;
  current: boolean;
  hasTVPreferredFocus: boolean;
  onSelect: () => void;
}

const EpisodeRow = ({
  testID,
  episode,
  current,
  hasTVPreferredFocus,
  onSelect,
}: EpisodeRowProps) => {
  const [focused, setFocused] = useState(false);
  const meta = [
    episode.datePublished ? episode.datePublished.slice(0, 10) : null,
    episode.durationSec ? formatTime(episode.durationSec) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <TouchableOpacity
      testID={testID}
      activeOpacity={1}
      accessibilityRole="button"
      accessibilityLabel={episode.title}
      accessibilityHint="Plays this episode"
      accessibilityState={{selected: current}}
      hasTVPreferredFocus={hasTVPreferredFocus}
      onPress={onSelect}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[
        styles.row,
        {
          borderColor: focused ? color.text : color.border,
          backgroundColor: focused
            ? color.surfaceRaise
            : current
            ? color.accentSoft
            : 'transparent',
        },
      ]}>
      <View style={styles.rowText}>
        {current ? (
          <Text
            style={[
              styles.nowPlaying,
              {fontSize: scaleFontSize(typography.label)},
            ]}>
            NOW PLAYING
          </Text>
        ) : null}
        <Text
          style={[styles.rowTitle, {fontSize: scaleFontSize(typography.body)}]}
          numberOfLines={2}>
          {episode.title}
        </Text>
        {meta ? (
          <Text
            style={[
              styles.rowMeta,
              {fontSize: scaleFontSize(typography.caption)},
            ]}
            numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
};

export interface EpisodeQueueProps {
  episodes: PodcastEpisode[];
  currentId: number | null;
  onSelect: (episode: PodcastEpisode) => void;
  onClose: () => void;
}

/** Right sheet. BACK closes it and returns focus to the Queue control. */
export const EpisodeQueue = ({
  episodes,
  currentId,
  onSelect,
  onClose,
}: EpisodeQueueProps) => {
  const currentIndex = episodes.findIndex(episode => episode.id === currentId);
  const [closeFocused, setCloseFocused] = useState(false);
  /**
   * The sheet is redrawn by the player's clock several times a second, and a
   * permanent `hasTVPreferredFocus` re-requests focus on every pass - which
   * would pull the ring back to the current episode while the viewer walks
   * the list. Only the first pass claims it.
   */
  const [bootFocus, setBootFocus] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setBootFocus(false), 1200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.scrim} testID="episode-queue">
      <View style={styles.sheet}>
        <View style={styles.sheetHeader}>
          <Text
            style={[
              styles.sheetTitle,
              {fontSize: scaleFontSize(typography.title)},
            ]}>
            Episodes
          </Text>
          <TouchableOpacity
            testID="queue-close"
            activeOpacity={1}
            accessibilityRole="button"
            accessibilityLabel="Close the episode queue"
            onPress={onClose}
            onFocus={() => setCloseFocused(true)}
            onBlur={() => setCloseFocused(false)}
            style={[
              styles.close,
              closeFocused ? styles.closeFocused : null,
            ]}>
            <Text
              style={[
                styles.closeLabel,
                {fontSize: scaleFontSize(typography.caption)},
                closeFocused ? styles.closeLabelFocused : null,
              ]}>
              Close
            </Text>
          </TouchableOpacity>
        </View>
        <ScrollView>
          {episodes.map((episode, index) => (
            <EpisodeRow
              key={String(episode.id)}
              testID={`queue-episode-${index}`}
              episode={episode}
              current={episode.id === currentId}
              hasTVPreferredFocus={
                bootFocus && index === Math.max(0, currentIndex)
              }
              onSelect={() => onSelect(episode)}
            />
          ))}
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  sheet: {
    width: scaleWidth(760),
    height: '100%',
    backgroundColor: color.surfaceInner,
    paddingHorizontal: scaleWidth(space.md),
    paddingVertical: scaleHeight(layout.insetY),
    gap: scaleHeight(space.sm),
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: {
    color: color.text,
    fontWeight: '700',
  },
  close: {
    minHeight: scaleHeight(focus.target),
    justifyContent: 'center',
    paddingHorizontal: scaleWidth(space.sm),
    borderWidth: scaleWidth(focus.ringWidth),
    borderColor: 'transparent',
    borderRadius: scaleWidth(radius.pill),
  },
  closeFocused: {
    borderColor: color.text,
    backgroundColor: color.surfaceRaise,
  },
  closeLabel: {
    color: color.textMuted,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  closeLabelFocused: {
    color: color.text,
  },
  row: {
    minHeight: scaleHeight(focus.target) + scaleHeight(space.lg),
    justifyContent: 'center',
    marginBottom: scaleHeight(space.xxs),
    borderWidth: scaleWidth(focus.ringWidth),
    borderRadius: scaleWidth(radius.sm),
    paddingHorizontal: scaleWidth(space.sm),
    paddingVertical: scaleHeight(space.xxs),
  },
  rowText: {
    gap: scaleHeight(4),
  },
  nowPlaying: {
    color: color.accent,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  rowTitle: {
    color: color.text,
    fontWeight: '600',
  },
  rowMeta: {
    color: color.textMuted,
  },
});
