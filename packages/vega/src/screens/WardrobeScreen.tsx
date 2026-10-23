import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  BackHandler,
  StyleSheet,
  Text,
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
import type {EcoWardrobe, WardrobeItem} from '@multitv/shared';
import type {SearchRelayClient} from './SearchScreen';
import {BrandMark} from './home/Brand';
import {MASCOT_NAME, MascotStage} from './home/MascotStage';
import type {MascotId} from './home/MascotStage';

export interface WardrobeScreenProps {
  /** Injected in tests; the app uses the device-id backed voice relay. */
  relay?: SearchRelayClient;
  onBack?: () => void;
}

type Status = 'loading' | 'ready' | 'error';
type FocusDirection = 'up' | 'down' | 'left' | 'right';

/** Design metrics, in 1920 x 1080 units. */
const CARD_WIDTH = 420;

const formatCount = (value: number): string =>
  String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** The catalogue's keys are the mascot ids, so the art and the name line up. */
const isMascotId = (key: string): key is MascotId =>
  key === 'yang-na' || key === 'kae-na' || key === 'mother-tree';

const nameOf = (item: WardrobeItem): string =>
  isMascotId(item.itemKey) ? MASCOT_NAME[item.itemKey] : item.itemKey;

const BackButton = React.forwardRef<View, {onPress?: () => void}>(
  function BackButton({onPress}, ref) {
    const [focused, setFocused] = useState(false);
    return (
      <TouchableOpacity
        ref={ref}
        testID="wardrobe-back"
        activeOpacity={1}
        accessibilityRole="button"
        accessibilityLabel="Back to home"
        onPress={onPress}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.back,
          {borderColor: focused ? color.text : color.border},
        ]}>
        <Text
          style={[
            styles.backLabel,
            {fontSize: scaleFontSize(typography.caption)},
          ]}>
          ‹ HOME
        </Text>
      </TouchableOpacity>
    );
  },
);

interface CardProps {
  item: WardrobeItem;
  busy: boolean;
  hasTVPreferredFocus?: boolean;
  onPress?: () => void;
}

/**
 * One guardian in the wardrobe.
 *
 * The card only ever reports what the server said: a price it was handed and
 * an `owned` flag. Pressing an owned one re-states that rather than charging.
 */
const Card = React.forwardRef<View, CardProps>(function Card(
  {item, busy, hasTVPreferredFocus, onPress},
  ref,
) {
  const [focused, setFocused] = useState(false);
  const name = nameOf(item);
  const state = busy
    ? 'UNLOCKING…'
    : item.owned
      ? item.price === 0
        ? 'INCLUDED'
        : 'OWNED'
      : `${item.price} ECO-TOKENS`;

  return (
    <TouchableOpacity
      ref={ref}
      testID={`wardrobe-card-${item.itemKey}`}
      activeOpacity={1}
      accessibilityRole="button"
      accessibilityLabel={
        item.owned
          ? `${name}, owned`
          : `${name}, ${item.price} eco-tokens`
      }
      hasTVPreferredFocus={hasTVPreferredFocus}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[
        styles.card,
        {
          borderColor: focused ? color.accent : color.border,
          backgroundColor: focused ? color.surfaceRaise : color.surfaceInner,
        },
      ]}>
      {isMascotId(item.itemKey) ? (
        <MascotStage
          variant={item.itemKey}
          size={220}
          testID={`wardrobe-art-${item.itemKey}`}
        />
      ) : null}
      <Text
        style={[styles.cardName, {fontSize: scaleFontSize(typography.title)}]}
        numberOfLines={1}>
        {name}
      </Text>
      <Text
        testID={`wardrobe-state-${item.itemKey}`}
        style={[
          styles.cardState,
          {
            fontSize: scaleFontSize(typography.caption),
            color: item.owned ? color.accent : color.gold,
          },
        ]}
        numberOfLines={1}>
        {state}
      </Text>
    </TouchableOpacity>
  );
});

/**
 * The first thing eco-tokens buy: the other two guardians beside Yang Na.
 *
 * Ownership lives in the ledger on the server - this screen reads it and can
 * only ask to spend; the price never travels from here. The relay answers a
 * refusal with `insufficient_tokens`, which is the one failure worth wording
 * as a next step rather than an error.
 */
export const WardrobeScreen = ({relay, onBack}: WardrobeScreenProps) => {
  const relays = useMemo(
    () => relay ?? createTvRelayClient({getDeviceId: loadDeviceId}),
    [relay],
  );

  const [status, setStatus] = useState<Status>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [wardrobe, setWardrobe] = useState<EcoWardrobe | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const backRef = useRef<View | null>(null);
  const cardNodes = useRef<Map<string, View>>(new Map());

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
    let cancelled = false;
    const run = async () => {
      setStatus('loading');
      setErrorMessage('');
      try {
        const next = await relays.loadWardrobe();
        if (cancelled) {
          return;
        }
        setWardrobe(next);
        setStatus('ready');
      } catch (error) {
        if (cancelled) {
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : String(error));
        setStatus('error');
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [relays, reloadKey]);

  const items = useMemo(
    () => (wardrobe?.items ?? []).filter(item => isMascotId(item.itemKey)),
    [wardrobe],
  );

  useEffect(() => {
    if (status !== 'ready') {
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

    const chain = items
      .map(item => cardNodes.current.get(item.itemKey))
      .filter(Boolean) as View[];

    chain.forEach((node, index) => {
      link(node, backRef.current, 'up');
      link(node, chain[index - 1], 'left');
      link(node, chain[index + 1], 'right');
    });
    link(backRef.current, chain[0], 'down');
  }, [status, items]);

  const buy = useCallback(
    async (item: WardrobeItem) => {
      if (busy) {
        return;
      }
      if (item.owned) {
        setNotice(`${nameOf(item)} is already in the wardrobe.`);
        return;
      }
      setBusy(item.itemKey);
      setNotice(null);
      try {
        const result = await relays.spendTokens(item.itemKey);
        if (!result.available) {
          setNotice('The wardrobe is offline right now.');
          return;
        }
        setWardrobe(current =>
          current
            ? {
                balance: result.balance,
                available: current.available,
                items: current.items.map(entry =>
                  entry.itemKey === item.itemKey
                    ? {...entry, owned: result.owned}
                    : entry,
                ),
              }
            : current,
        );
        setNotice(
          result.spent > 0
            ? `${nameOf(item)} joined the grove.`
            : `${nameOf(item)} was already yours.`,
        );
      } catch (error) {
        if (
          error instanceof TvRelayError &&
          error.code === 'insufficient_tokens'
        ) {
          setNotice('Not enough eco-tokens for that yet.');
        } else {
          setNotice(
            error instanceof Error ? error.message : String(error),
          );
        }
      } finally {
        setBusy(null);
      }
    },
    [busy, relays],
  );

  return (
    <View style={styles.root} testID="wardrobe-screen">
      <View style={styles.header}>
        <BackButton ref={backRef} onPress={onBack} />
        <BrandMark />
        <Text
          testID="wardrobe-balance"
          style={[
            styles.balance,
            {fontSize: scaleFontSize(typography.caption)},
          ]}>
          {wardrobe && wardrobe.balance !== null
            ? `${formatCount(wardrobe.balance)} ECO-TOKENS`
            : ''}
        </Text>
      </View>

      <Text
        style={[styles.title, {fontSize: scaleFontSize(typography.headline)}]}>
        MASCOT WARDROBE
      </Text>
      <Text
        style={[styles.lede, {fontSize: scaleFontSize(typography.body)}]}>
        Every guardian already lives in the grove; an eco-token unlock puts
        them on your stage.
      </Text>

      {status === 'loading' ? (
        <StateView variant="loading" testID="wardrobe-loading" />
      ) : null}

      {status === 'error' ? (
        <StateView
          variant="error"
          message={errorMessage}
          onRetry={() => setReloadKey(key => key + 1)}
          testID="wardrobe-error"
        />
      ) : null}

      {status === 'ready' && wardrobe && !wardrobe.available ? (
        <Text
          testID="wardrobe-offline"
          style={[
            styles.offline,
            {fontSize: scaleFontSize(typography.body)},
          ]}>
          The wardrobe cannot be reached right now. Your eco-tokens are safe.
        </Text>
      ) : null}

      {status === 'ready' && wardrobe && wardrobe.available ? (
        <View style={styles.row}>
          {items.map((item, index) => (
            <Card
              key={item.itemKey}
              ref={node => {
                if (node) {
                  cardNodes.current.set(item.itemKey, node);
                } else {
                  cardNodes.current.delete(item.itemKey);
                }
              }}
              item={item}
              busy={busy === item.itemKey}
              hasTVPreferredFocus={index === 0}
              onPress={() => void buy(item)}
            />
          ))}
        </View>
      ) : null}

      <Text
        testID="wardrobe-notice"
        style={[styles.notice, {fontSize: scaleFontSize(typography.body)}]}>
        {notice ?? ' '}
      </Text>
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
    gap: scaleWidth(space.sm),
  },
  back: {
    minHeight: scaleHeight(focus.target),
    justifyContent: 'center',
    paddingHorizontal: scaleWidth(space.sm),
    borderRadius: scaleWidth(radius.pill),
    borderWidth: scaleWidth(2),
  },
  backLabel: {
    color: color.text,
    fontWeight: '700',
    letterSpacing: 1,
  },
  balance: {
    color: color.accent,
    fontWeight: '700',
    letterSpacing: 1,
    marginLeft: 'auto',
  },
  title: {
    color: color.text,
    fontWeight: '800',
    letterSpacing: 2,
    marginTop: scaleHeight(space.md),
  },
  lede: {
    color: color.textMuted,
    marginTop: scaleHeight(space.xxs),
    maxWidth: scaleWidth(1100),
  },
  offline: {
    color: color.textMuted,
    marginTop: scaleHeight(space.lg),
  },
  row: {
    flexDirection: 'row',
    gap: scaleWidth(space.lg),
    marginTop: scaleHeight(space.lg),
  },
  card: {
    width: scaleWidth(CARD_WIDTH),
    alignItems: 'center',
    paddingVertical: scaleHeight(space.sm),
    paddingHorizontal: scaleWidth(space.sm),
    borderRadius: scaleWidth(radius.md),
    borderWidth: scaleWidth(2),
  },
  cardName: {
    color: color.text,
    fontWeight: '800',
    marginTop: scaleHeight(space.xs),
  },
  cardState: {
    fontWeight: '700',
    letterSpacing: 1.4,
    marginTop: scaleHeight(space.xxs),
  },
  notice: {
    color: color.textMuted,
    marginTop: scaleHeight(space.lg),
  },
});
