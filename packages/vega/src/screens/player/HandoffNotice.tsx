import React, {useCallback, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {
  color,
  radius,
  scaleFontSize,
  scaleHeight,
  scaleWidth,
  space,
  typography,
} from '@multitv/shared';
import type {TvHandoff} from '@multitv/shared';

/**
 * The relay call this card needs; `TvRelayClient` satisfies it structurally.
 *
 * A Vega build without an audio sink fails every play with
 * MEDIA_ERR_SRC_NOT_SUPPORTED (the virtual device is the usual one), and no
 * amount of code makes sound come out of it. So the TV parks what it was
 * opening on the server and asks the listener to say one phrase to the paired
 * Echo; a Skill cannot be pushed audio, only asked for it.
 */
export interface HandoffRelay {
  handoff(request: TvHandoff): Promise<{stored: boolean}>;
}

export type HandoffState = 'idle' | 'sending' | 'sent' | 'unpaired' | 'failed';

/** The carrier phrase; `ResumeIntent` consumes a parked item whatever its kind. */
export const HANDOFF_PHRASE = '“Alexa, resume”';

const copyFor = (state: HandoffState): string | null => {
  switch (state) {
    case 'sending':
      return 'Handing it to your Echo…';
    case 'sent':
      return 'Say it to the paired Echo. It will play exactly what this TV was opening.';
    case 'unpaired':
      return 'Pair this TV with your Echo from Voice control, then say it again.';
    case 'failed':
      return 'The relay did not answer. Check the connection, then say it to the Echo.';
    default:
      return null;
  }
};

/** Parks one lesson or episode and reports whether the Echo now knows it. */
export function useHandoff(relay: HandoffRelay | undefined) {
  const [state, setState] = useState<HandoffState>('idle');

  const park = useCallback(
    async (request: TvHandoff) => {
      if (!relay) {
        setState('unpaired');
        return;
      }
      setState('sending');
      try {
        const result = await relay.handoff(request);
        setState(result.stored ? 'sent' : 'unpaired');
      } catch {
        setState('failed');
      }
    },
    [relay],
  );

  const reset = useCallback(() => setState('idle'), []);

  return {state, park, reset};
}

export interface HandoffNoticeProps {
  state: HandoffState;
  testID?: string;
}

/**
 * The visible half of the hand-off: what happened and the exact words to say.
 * Rendered only after an audio failure, never as a permanent banner.
 */
export const HandoffNotice = ({state, testID = 'handoff-notice'}: HandoffNoticeProps) => {
  const copy = copyFor(state);
  if (copy === null) {
    return null;
  }

  return (
    <View style={styles.card} testID={testID}>
      <Text style={[styles.title, {fontSize: scaleFontSize(typography.label)}]}>
        NO SOUND ON THIS TV
      </Text>
      <Text style={[styles.phrase, {fontSize: scaleFontSize(typography.body)}]}>
        {HANDOFF_PHRASE}
      </Text>
      <Text style={[styles.copy, {fontSize: scaleFontSize(typography.label)}]}>{copy}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: scaleWidth(radius.md),
    borderWidth: scaleWidth(1),
    borderColor: color.clay,
    backgroundColor: 'rgba(0, 54, 41, 0.72)',
    paddingHorizontal: scaleWidth(space.sm),
    paddingVertical: scaleHeight(space.xs),
    marginTop: scaleHeight(space.xs),
  },
  title: {
    color: color.accent,
    fontWeight: '800',
    letterSpacing: 2,
  },
  phrase: {
    color: color.text,
    fontWeight: '700',
    paddingTop: scaleHeight(4),
  },
  copy: {
    color: color.textMuted,
    paddingTop: scaleHeight(2),
  },
});
