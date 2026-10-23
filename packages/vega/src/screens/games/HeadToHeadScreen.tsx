import React, {useCallback, useEffect, useMemo, useRef} from 'react';
import {BackHandler, StyleSheet, Text, View} from 'react-native';
import {
  StateView,
  color,
  layout,
  radius,
  scaleFontSize,
  scaleHeight,
  scaleWidth,
  space,
  typography,
} from '@multitv/shared';
import type {
  ChallengeAward,
  ChallengeStanding,
  GameDeck,
} from '@multitv/shared';
import {BrandMark} from '../home/Brand';
import {BackPill} from './BackPill';
import {Confetti, CountUp, PopIn} from './Celebrate';

export interface HeadToHeadScreenProps {
  /**
   * The frozen deck both households played. Its answer keys are what turn a
   * stored choice into a tick; without it the screen shows totals only.
   */
  deck?: GameDeck | null;
  /** Every seat in the room, as the server last ranked it. */
  standings: ChallengeStanding[];
  /** The seat this television played for. */
  slot: number;
  /** What the server paid this device for the room, when it said. */
  award?: ChallengeAward | null;
  onBack?: () => void;
}

type Tick = 'right' | 'wrong' | 'none';

/**
 * One marker per round: a filled tick for a correct press, a cross for a wrong
 * one, a hollow dot for a question this seat never answered.
 */
const ticksFor = (row: ChallengeStanding, deck: GameDeck | null): Tick[] => {
  if (!deck) {
    return [];
  }
  return deck.rounds.map(round => {
    const choice = row.answered?.[round.roundId];
    if (!choice) {
      return 'none';
    }
    return choice === round.answerKey ? 'right' : 'wrong';
  });
};

const tickMark = (tick: Tick): string => {
  if (tick === 'right') {
    return '✓';
  }
  if (tick === 'wrong') {
    return '✕';
  }
  return '·';
};

const tickColour = (tick: Tick): string => {
  if (tick === 'right') {
    return color.accent;
  }
  if (tick === 'wrong') {
    return color.danger;
  }
  return color.textMuted;
};

interface ColumnProps {
  label: string;
  row: ChallengeStanding | null;
  ticks: Tick[];
  total: number;
  /** The seat with the higher score wears the gold edge. */
  winner: boolean;
  testID: string;
}

const Column = ({label, row, ticks, total, winner, testID}: ColumnProps) => (
  <View style={[styles.column, winner && styles.columnWin]} testID={testID}>
    <View style={styles.kickerRow}>
      <Text style={[styles.kicker, {fontSize: scaleFontSize(typography.label)}]}>
        {label}
      </Text>
      {winner ? (
        <PopIn trigger={`winner:${row?.slot ?? 0}`} delayMs={280}>
          <Text
            testID={`${testID}-winner`}
            style={[styles.winTag, {fontSize: scaleFontSize(typography.label)}]}>
            WINNER
          </Text>
        </PopIn>
      ) : null}
    </View>
    <Text
      numberOfLines={1}
      style={[
        styles.name,
        winner && styles.nameWin,
        {fontSize: scaleFontSize(typography.title)},
      ]}>
      {row ? row.name.toUpperCase() : 'NOBODY'}
    </Text>
    {row ? (
      <CountUp
        testID={`${testID}-score`}
        value={row.score}
        durationMs={900}
        delayMs={120}
        style={[styles.score, winner && styles.scoreWin, {fontSize: scaleFontSize(120)}]}
      />
    ) : (
      <Text style={[styles.score, {fontSize: scaleFontSize(120)}]}>0</Text>
    )}
    <Text style={[styles.line, {fontSize: scaleFontSize(typography.body)}]}>
      {row ? row.correct : 0} / {total} CORRECT
    </Text>
    {ticks.length > 0 ? (
      <View style={styles.tickRow}>
        {ticks.map((tick, index) => (
          <PopIn
            key={index}
            trigger={`${row?.slot ?? 0}:${index}:${tick}`}
            delayMs={220 + index * 90}>
            <Text
              testID={`${testID}-round-${index + 1}`}
              style={[
                styles.tick,
                {
                  color: tickColour(tick),
                  fontSize: scaleFontSize(typography.title),
                },
              ]}>
              {tickMark(tick)}
            </Text>
          </PopIn>
        ))}
      </View>
    ) : null}
  </View>
);

/**
 * HEAD TO HEAD. The screen that answers "did I beat them": two households'
 * seats side by side, one tick per round, and the delta in tokens.
 *
 * Both households played the same frozen deck and were each paid on their own
 * device, so only this device's payout is known here; the other column is
 * points, not money.
 */
export const HeadToHeadScreen = ({
  deck,
  standings,
  slot,
  award,
  onBack,
}: HeadToHeadScreenProps) => {
  const backRef = useRef<View | null>(null);

  const mine = useMemo(
    () => standings.find(row => row.slot === slot) ?? standings[0] ?? null,
    [slot, standings],
  );
  const theirs = useMemo(() => {
    if (!mine) {
      return null;
    }
    return standings.find(row => row.slot !== mine.slot) ?? null;
  }, [mine, standings]);

  const total = deck ? deck.rounds.length : Math.max(
    mine?.correct ?? 0,
    theirs?.correct ?? 0,
  );

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

  const close = useCallback(() => onBack?.(), [onBack]);

  const verdict = !mine || !theirs
    ? ''
    : mine.score === theirs.score
      ? 'DEAD HEAT'
      : mine.score > theirs.score
        ? 'YOU BEAT THEM'
        : 'THEY BEAT YOU';

  return (
    <View style={styles.root} testID="head-to-head">
      {/* Paper behind both columns: the result is the moment, remote stays live. */}
      {mine && theirs ? <Confetti testID="head-to-head-confetti" /> : null}
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
          HEAD TO HEAD
        </Text>
        {verdict ? (
          <PopIn trigger={verdict} delayMs={160} testID="head-to-head-verdict-pop">
            <Text
              testID="head-to-head-verdict"
              style={[
                styles.verdict,
                mine && theirs && mine.score > theirs.score && styles.verdictWin,
                {fontSize: scaleFontSize(typography.title)},
              ]}>
              {verdict}
            </Text>
          </PopIn>
        ) : null}
      </View>

      {!mine || !theirs ? (
        <StateView
          variant="empty"
          testID="head-to-head-empty"
          note="Nobody else is on this card yet. Invite a second television with the room code."
          ctaLabel="BACK"
          onCta={close}
        />
      ) : (
        <View style={styles.body}>
          <Column
            testID="head-to-head-you"
            label="YOU"
            row={mine}
            ticks={ticksFor(mine, deck ?? null)}
            total={total}
            winner={mine.score > theirs.score}
          />
          <View style={styles.divider} />
          <Column
            testID="head-to-head-them"
            label="THEM"
            row={theirs}
            ticks={ticksFor(theirs, deck ?? null)}
            total={total}
            winner={theirs.score > mine.score}
          />
        </View>
      )}

      {award ? (
        <View style={styles.footer}>
          {award.tokens > 0 ? (
            <Text
              testID="head-to-head-tokens"
              style={[
                styles.tokens,
                {fontSize: scaleFontSize(typography.title)},
              ]}>
              +{award.tokens} ECO TOKENS ON THIS TV
            </Text>
          ) : null}
          {!award.available ? (
            <Text style={[styles.line, {fontSize: scaleFontSize(typography.caption)}]}>
              TOKENS SAVED ON THE DEVICE THAT STARTED THE PARTY
            </Text>
          ) : null}
          {award.available && award.balance === null ? (
            <Text style={[styles.line, {fontSize: scaleFontSize(typography.caption)}]}>
              EACH HOUSEHOLD WAS PAID ON ITS OWN TELEVISION
            </Text>
          ) : null}
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
  verdict: {
    color: color.accent,
    fontWeight: '800',
    letterSpacing: 2,
  },
  verdictWin: {
    color: color.gold,
    textShadowColor: 'rgba(255, 206, 77, 0.45)',
    textShadowOffset: {width: 0, height: scaleHeight(6)},
    textShadowRadius: scaleWidth(28),
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: scaleWidth(48),
    marginTop: scaleHeight(space.md),
  },
  column: {
    flex: 1,
    borderRadius: scaleWidth(radius.md),
    backgroundColor: color.surfaceInner,
    paddingHorizontal: scaleWidth(space.md),
    paddingVertical: scaleHeight(space.md),
  },
  columnWin: {
    // The winning seat reads first, before a single tick is counted.
    borderWidth: scaleWidth(2),
    borderColor: color.gold,
  },
  divider: {
    width: scaleWidth(2),
    backgroundColor: color.border,
  },
  kickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: scaleWidth(space.xs),
  },
  kicker: {
    color: color.textMuted,
    fontWeight: '800',
    letterSpacing: 3,
  },
  winTag: {
    color: color.surface,
    fontWeight: '800',
    letterSpacing: 2,
    paddingHorizontal: scaleWidth(space.xs),
    paddingVertical: scaleHeight(space.xxs / 2),
    borderRadius: scaleWidth(radius.pill),
    backgroundColor: color.gold,
    overflow: 'hidden',
  },
  name: {
    color: color.text,
    fontWeight: '700',
    marginTop: scaleHeight(space.xs),
  },
  nameWin: {
    color: color.gold,
  },
  score: {
    color: color.text,
    fontWeight: '700',
    letterSpacing: 2,
  },
  scoreWin: {
    color: color.gold,
    textShadowColor: 'rgba(255, 206, 77, 0.35)',
    textShadowOffset: {width: 0, height: scaleHeight(4)},
    textShadowRadius: scaleWidth(20),
  },
  line: {
    color: color.textMuted,
    fontWeight: '700',
    letterSpacing: 2,
  },
  tickRow: {
    flexDirection: 'row',
    gap: scaleWidth(space.sm),
    marginTop: scaleHeight(space.sm),
  },
  tick: {
    fontWeight: '800',
  },
  footer: {
    marginTop: scaleHeight(space.sm),
  },
  tokens: {
    color: color.accent,
    fontWeight: '800',
    letterSpacing: 2,
  },
});
