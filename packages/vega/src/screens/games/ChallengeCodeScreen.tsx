import React, {useCallback, useEffect, useRef, useState} from 'react';
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
  StateView,
  TvRelayError,
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
import type {
  ChallengeInvitation,
  ChallengeJoined,
  ChallengePlayerView,
} from '@multitv/shared';
import {BrandMark} from '../home/Brand';
import type {SearchRelayClient} from '../SearchScreen';
import {BackPill} from './BackPill';
import {JoinCard, joinUrlFor} from './JoinCard';

export interface ChallengeCodeScreenProps {
  /** The voice relay that owns the code and the seats. */
  relay?: SearchRelayClient;
  /** The room this television opened, when it has one. */
  room?: {roomId: string; code: string; players: ChallengePlayerView[]} | null;
  /** Where the digits are typed until Phase C serves a join page. */
  joinUrl?: (code: string) => string;
  onBack?: () => void;
  /** A seat taken in someone else's room, deck included. */
  onJoined?: (invitation: ChallengeInvitation, joined: ChallengeJoined) => void;
}

const CODE_LENGTH = 6;
const NAME_MAX = 16;

const defaultJoinUrl = joinUrlFor;

/**
 * Why a code was refused, in words a person on a sofa can act on.
 *
 * A wrong code, an expired code, a room that has already started and a room
 * with eight players all arrive as failed requests; only the relay's `code`
 * tells them apart, so that is what this reads.
 */
const refusalOf = (reason: unknown): string => {
  if (reason instanceof TvRelayError) {
    switch (reason.code) {
      case 'invalid_code':
        return 'A room code is six digits.';
      case 'not_found':
        return 'No room is waiting with that code. Check the digits on the other TV.';
      case 'challenge_unavailable':
        return 'Challenge rooms are offline right now. Try again in a moment.';
      case 'room_full':
        return 'That room already has eight players.';
      case 'room_closed':
        return 'That party has already started.';
      default:
        return reason.message;
    }
  }
  return reason instanceof Error ? reason.message : String(reason);
};

type FocusDirection = 'up' | 'down' | 'left' | 'right';

/**
 * CHALLENGE A FRIEND. Two households share one frozen deck: this television
 * shows the six digits its own room is holding, and can also take a seat in
 * another television's room by typing theirs.
 *
 * The invitation carries the deck with its answer keys, because the joining
 * household judges its own presses against the identical deck. Nothing here
 * scores or pays.
 */
export const ChallengeCodeScreen = ({
  relay,
  room,
  joinUrl = defaultJoinUrl,
  onBack,
  onJoined,
}: ChallengeCodeScreenProps) => {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [invitation, setInvitation] = useState<ChallengeInvitation | null>(null);
  const [joined, setJoined] = useState<ChallengeJoined | null>(null);
  const [looking, setLooking] = useState(false);
  const [seating, setSeating] = useState(false);
  const [notice, setNotice] = useState('');
  /** One-shot: the code field takes the ring on arrival, then lets the D-pad go. */
  const [bootFocus, setBootFocus] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setBootFocus(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  const backRef = useRef<View | null>(null);
  const codeRef = useRef<TextInput | null>(null);
  const nameRef = useRef<TextInput | null>(null);
  const lookRef = useRef<View | null>(null);
  const seatRef = useRef<View | null>(null);

  const digitsOnly = useCallback(
    (value: string) => value.replace(/[^0-9]/g, '').slice(0, CODE_LENGTH),
    [],
  );

  const lookup = useCallback(() => {
    if (!relay || looking || code.length !== CODE_LENGTH) {
      return;
    }
    setLooking(true);
    setNotice('');
    setInvitation(null);
    setJoined(null);
    void relay
      .fetchChallenge(code)
      .then(found => setInvitation(found))
      .catch(reason => setNotice(refusalOf(reason)))
      .finally(() => setLooking(false));
  }, [code, looking, relay]);

  const takeSeat = useCallback(() => {
    const trimmed = name.trim();
    if (!relay || !invitation || seating || !trimmed) {
      return;
    }
    setSeating(true);
    setNotice('');
    void relay
      .joinChallenge(invitation.code, trimmed.slice(0, NAME_MAX))
      .then(seat => {
        setJoined(seat);
        onJoined?.(invitation, seat);
      })
      .catch(reason => setNotice(refusalOf(reason)))
      .finally(() => setSeating(false));
  }, [invitation, name, onJoined, relay, seating]);

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

    link(backRef.current, codeRef.current, 'down');
    link(codeRef.current, backRef.current, 'up');
    link(codeRef.current, lookRef.current, 'down');
    link(lookRef.current, codeRef.current, 'up');
    link(lookRef.current, nameRef.current, 'down');
    link(nameRef.current, lookRef.current, 'up');
    link(nameRef.current, seatRef.current, 'down');
    link(seatRef.current, nameRef.current, 'up');
  }, [invitation]);

  const canLook = Boolean(relay) && code.length === CODE_LENGTH && !looking;
  const canSeat = Boolean(relay && invitation) && Boolean(name.trim()) && !seating;

  return (
    <View style={styles.root} testID="challenge-code">
      <View style={styles.header}>
        <BackPill
          ref={backRef}
          label="‹ LOBBY"
          accessibilityLabel="Back to the challenge lobby"
          onPress={onBack}
        />
        <BrandMark />
      </View>

      <View style={styles.titleRow}>
        <Text
          style={[
            styles.title,
            {fontSize: scaleFontSize(84), lineHeight: scaleFontSize(96)},
          ]}>
          CHALLENGE A FRIEND
        </Text>
        {invitation ? (
          <Text
            testID="challenge-code-rounds"
            style={[
              styles.tally,
              {fontSize: scaleFontSize(typography.caption)},
            ]}>
            {invitation.deck.rounds.length} ROUNDS ·{' '}
            {invitation.players.length} PLAYERS
          </Text>
        ) : null}
      </View>

      <View style={styles.body}>
        <View style={styles.left}>
          <Text
            style={[
              styles.kicker,
              {fontSize: scaleFontSize(typography.label)},
            ]}>
            YOUR ROOM
          </Text>
          {room ? (
            <>
              <View
                style={styles.pill}
                testID="challenge-code-value"
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
              <View style={styles.joinRow}>
                <JoinCard
                  code={room.code}
                  size={200}
                  testID="challenge-code-qr"
                />
                <View style={styles.joinCopy}>
                  <Text
                    testID="challenge-code-url"
                    style={[
                      styles.url,
                      {fontSize: scaleFontSize(typography.body)},
                    ]}>
                    {joinUrl(room.code)}
                  </Text>
                  <Text
                    style={[
                      styles.hint,
                      {fontSize: scaleFontSize(typography.caption)},
                    ]}>
                    Scan with a phone camera, or type that address into any
                    browser. Phones answer on their own screen.
                  </Text>
                </View>
              </View>
              <Text
                style={[
                  styles.hint,
                  {fontSize: scaleFontSize(typography.caption)},
                ]}>
                Share this with who you want to beat. On the other television,
                open FAMILY QUIZ, type the six digits and take a seat.
              </Text>
              <Text
                testID="challenge-code-roster"
                style={[
                  styles.hint,
                  {fontSize: scaleFontSize(typography.caption)},
                ]}>
                {room.players.length > 0
                  ? `Seated here: ${room.players
                      .map(player => player.name)
                      .join(' · ')}`
                  : 'Nobody is seated in this room yet.'}
              </Text>
            </>
          ) : (
            <Text
              testID="challenge-code-none"
              style={[
                styles.hint,
                {fontSize: scaleFontSize(typography.caption)},
              ]}>
              This television has not opened a room. Run FAMILY QUIZ to get a
              code, or take a seat on the right.
            </Text>
          )}
        </View>

        <View style={styles.right}>
          <Text
            style={[
              styles.kicker,
              {fontSize: scaleFontSize(typography.label)},
            ]}>
            JOIN THEIR ROOM
          </Text>
          <TextInput
            ref={codeRef}
            testID="challenge-code-input"
            value={code}
            onChangeText={value => setCode(digitsOnly(value))}
            onSubmitEditing={lookup}
            placeholder="000000"
            placeholderTextColor={color.textMuted}
            selectionColor={color.accent}
            keyboardType="number-pad"
            maxLength={CODE_LENGTH}
            returnKeyType="search"
            editable={!joined}
            hasTVPreferredFocus={bootFocus}
            style={[
              styles.input,
              styles.codeInput,
              {fontSize: scaleFontSize(typography.title)},
            ]}
          />

          <TouchableOpacity
            ref={lookRef}
            testID="challenge-code-lookup"
            activeOpacity={1}
            accessibilityRole="button"
            accessibilityLabel="Look up room code"
            disabled={!canLook}
            onPress={lookup}
            style={[styles.action, !canLook ? styles.actionOff : null]}>
            <Text
              style={[
                styles.actionLabel,
                {fontSize: scaleFontSize(typography.body)},
              ]}>
              {looking ? 'LOOKING…' : 'LOOK UP ROOM'}
            </Text>
          </TouchableOpacity>

          {invitation && !joined ? (
            <>
              <TextInput
                ref={nameRef}
                testID="challenge-code-name"
                value={name}
                onChangeText={setName}
                onSubmitEditing={takeSeat}
                placeholder="Your name"
                placeholderTextColor={color.textMuted}
                selectionColor={color.accent}
                maxLength={NAME_MAX}
                returnKeyType="done"
                style={[
                  styles.input,
                  {fontSize: scaleFontSize(typography.label)},
                ]}
              />
              <TouchableOpacity
                ref={seatRef}
                testID="challenge-code-seat"
                activeOpacity={1}
                accessibilityRole="button"
                accessibilityLabel="Take a seat"
                disabled={!canSeat}
                onPress={takeSeat}
                style={[
                  styles.start,
                  !canSeat ? styles.actionOff : null,
                ]}>
                <Text
                  style={[
                    styles.startLabel,
                    {fontSize: scaleFontSize(typography.body)},
                  ]}>
                  {seating ? 'TAKING A SEAT…' : 'TAKE A SEAT'}
                </Text>
              </TouchableOpacity>
            </>
          ) : null}

          {joined ? (
            <StateView
              variant="empty"
              testID="challenge-code-seated"
              note={`You are P${joined.slot} in room ${joined.code}. The other television starts the party.`}
              ctaLabel="BACK"
              onCta={onBack}
            />
          ) : null}

          {notice ? (
            <Text
              testID="challenge-code-notice"
              style={[
                styles.notice,
                {fontSize: scaleFontSize(typography.caption)},
              ]}>
              {notice}
            </Text>
          ) : null}
        </View>
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
  pill: {
    width: scaleWidth(760),
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
  url: {
    color: color.accent,
    fontWeight: '700',
  },
  joinRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: scaleWidth(space.sm),
    marginTop: scaleHeight(space.sm),
  },
  joinCopy: {
    flex: 1,
  },
  hint: {
    color: color.textMuted,
    marginTop: scaleHeight(space.xs),
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
  codeInput: {
    fontFamily: 'monospace',
    fontWeight: '700',
    letterSpacing: scaleWidth(4),
    textAlign: 'center',
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
  start: {
    alignSelf: 'flex-start',
    minHeight: scaleHeight(focus.target),
    justifyContent: 'center',
    marginTop: scaleHeight(space.sm),
    paddingHorizontal: scaleWidth(space.lg),
    borderRadius: scaleWidth(radius.pill),
    backgroundColor: color.accent,
  },
  startLabel: {
    color: color.surface,
    fontWeight: '800',
    letterSpacing: 1,
  },
  actionOff: {
    opacity: 0.4,
  },
  notice: {
    color: color.danger,
    marginTop: scaleHeight(space.xs),
  },
});
