import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  color,
  createTvRelayClient,
  layout,
  loadDeviceId,
  radius,
  scaleFontSize,
  scaleHeight,
  scaleWidth,
  space,
  typography,
} from '@multitv/shared';
import type {TvPairing} from '@multitv/shared';
import {BrandMark} from './home/Brand';
import {useReducedMotion} from './home/MascotStage';
import type {SearchRelayClient} from './SearchScreen';

/** A relay that cannot be reached must not spin: pause between attempts. */
const RETRY_PAUSE_MS = 3_000;

/** Indigo ink for the sound-wave illustration: dark core, pale fringe. */
const WAVE_INK = ['#5b50c9', '#6f63dd', '#948bf0'] as const;
const WAVE_BAR_COUNT = 42;

/** Centre-weighted bell, so the wave peaks in the middle like the mock. */
const waveEnvelope = (index: number): number => {
  const half = (WAVE_BAR_COUNT - 1) / 2;
  const t = (index - half) / half;
  return Math.min(
    1,
    Math.exp(-(t * t) / 0.44) * 0.95 + Math.exp(-(t * t) / 0.02) * 0.34,
  );
};

const waveInk = (index: number): string => {
  const half = (WAVE_BAR_COUNT - 1) / 2;
  const distance = Math.abs(index - half) / half;
  if (distance < 0.34) {
    return WAVE_INK[0];
  }
  if (distance < 0.68) {
    return WAVE_INK[1];
  }
  return WAVE_INK[2];
};

const SoundWave = () => {
  const reduced = useReducedMotion();
  const bars = useRef(
    Array.from({length: WAVE_BAR_COUNT}, (_, index) => ({
      id: `bar-${index}`,
      value: new Animated.Value(0),
    })),
  ).current;

  useEffect(() => {
    if (reduced) {
      bars.forEach((bar, index) => {
        bar.value.setValue(index % 5 === 0 ? 1 : 0.42);
      });
      return undefined;
    }
    const loops = bars.map((bar, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(bar.value, {
            toValue: 1,
            duration: 620 + (index % 7) * 55,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: false,
          }),
          Animated.timing(bar.value, {
            toValue: 0,
            duration: 620 + (index % 7) * 55,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: false,
          }),
        ]),
      ),
    );
    const timers = loops.map((loop, index) =>
      setTimeout(() => loop.start(), (index * 43) % 760),
    );
    return () => {
      timers.forEach(clearTimeout);
      loops.forEach(loop => loop.stop());
    };
  }, [bars, reduced]);

  return (
    <View style={styles.wave} testID="voice-control-wave" accessible={false}>
      {bars.map((bar, index) => (
        <Animated.View
          key={bar.id}
          style={[
            styles.waveBar,
            {
              height: scaleWidth(20 + waveEnvelope(index) * 132),
              backgroundColor: waveInk(index),
              opacity: bar.value.interpolate({
                inputRange: [0, 1],
                outputRange: [0.55, 1],
              }),
              transform: [
                {
                  scaleY: bar.value.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.34 + (index % 4) * 0.05, 1],
                  }),
                },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
};

const SPARK_ANGLES = [0, 120, 240];
const TREE_STAGE_WIDTH = 150;
const TREE_STAGE_HEIGHT = 164;
const TREE_GLOW_SIZE = 98;
const TREE_ORBIT_SIZE = 118;
const TREE_ART_WIDTH = 106;
const TREE_ART_HEIGHT = 136;

const FatherTree = () => {
  const reduced = useReducedMotion();
  const ambient = useRef(new Animated.Value(0)).current;
  const orbit = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) {
      ambient.setValue(0.5);
      orbit.setValue(0);
      return undefined;
    }
    const ambientLoop = Animated.loop(
      Animated.timing(ambient, {
        toValue: 1,
        duration: 7000,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    );
    const orbitLoop = Animated.loop(
      Animated.timing(orbit, {
        toValue: 1,
        duration: 11000,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    );
    ambientLoop.start();
    orbitLoop.start();
    return () => {
      ambientLoop.stop();
      orbitLoop.stop();
    };
  }, [ambient, orbit, reduced]);

  const stationWidth = scaleWidth(TREE_STAGE_WIDTH);
  const stationHeight = scaleHeight(TREE_STAGE_HEIGHT);
  const glowSize = scaleWidth(TREE_GLOW_SIZE);
  const orbitSize = scaleWidth(TREE_ORBIT_SIZE);
  const artWidth = scaleWidth(TREE_ART_WIDTH);
  const artHeight = scaleWidth(TREE_ART_HEIGHT);
  const dot = scaleWidth(7);

  const bob = ambient.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, -scaleWidth(8), 0],
  });
  const sway = ambient.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['-3deg', '3deg', '-3deg'],
  });
  const breathe = ambient.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.05, 1],
  });
  const glowOpacity = ambient.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.28, 0.62, 0.28],
  });
  const glowScale = ambient.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.9, 1.08, 0.9],
  });
  const orbitRotate = orbit.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const flicker = (angle: number) => {
    const phase = angle / 360;
    return ambient.interpolate({
      inputRange: [0, Math.max(0.02, phase), Math.min(0.98, phase + 0.35), 1],
      outputRange: [0.25, 0.95, 0.35, 0.25],
    });
  };

  return (
    <View
      style={styles.treeStage}
      testID="voice-control-tree"
      accessible
      accessibilityRole="image"
      accessibilityLabel="Father Tree, a guardian of the Globie Earth grove">
      <Animated.View
        style={[
          styles.treeGlow,
          {
            width: glowSize,
            height: glowSize,
            borderRadius: glowSize / 2,
            left: (stationWidth - glowSize) / 2,
            top: (stationHeight - glowSize) / 2,
            opacity: glowOpacity,
            transform: [{scale: glowScale}],
          },
        ]}
        pointerEvents="none"
        accessible={false}
      />
      <Animated.View
        style={[
          styles.treeOrbit,
          {
            width: orbitSize,
            height: orbitSize,
            left: (stationWidth - orbitSize) / 2,
            top: (stationHeight - orbitSize) / 2,
            transform: [{rotate: orbitRotate}],
          },
        ]}
        pointerEvents="none"
        accessible={false}>
        {SPARK_ANGLES.map(angle => {
          const radians = (angle * Math.PI) / 180;
          return (
            <Animated.View
              key={angle}
              style={[
                styles.spark,
                {
                  width: dot,
                  height: dot,
                  borderRadius: dot / 2,
                  left:
                    orbitSize / 2 -
                    dot / 2 +
                    Math.sin(radians) * orbitSize * 0.46,
                  top:
                    orbitSize / 2 -
                    dot / 2 -
                    Math.cos(radians) * orbitSize * 0.46,
                  opacity: flicker(angle),
                },
              ]}
            />
          );
        })}
      </Animated.View>
      <Animated.View
        style={[
          styles.treeArt,
          {
            width: artWidth,
            height: artHeight,
            left: (stationWidth - artWidth) / 2,
            top: (stationHeight - artHeight) / 2,
            transform: [{translateY: bob}, {rotate: sway}, {scale: breathe}],
          },
        ]}
        pointerEvents="none"
        accessible={false}>
        <Image
          source={require('../assets/brand/guardian-yang-na.png')}
          style={styles.treeImage}
          resizeMode="contain"
          accessible={false}
        />
      </Animated.View>
    </View>
  );
};

export interface VoiceControlScreenProps {
  /** Injected in tests; the app uses the device-id backed relay. */
  relay?: SearchRelayClient;
  /** Whether the app-wide command loop has seen a paired Alexa account. */
  paired?: boolean;
  /** Why that loop's last poll failed; shown instead of the generic hint. */
  relayError?: string;
  onBack?: () => void;
}

export const VoiceControlScreen = ({
  relay,
  paired = false,
  relayError,
  onBack,
}: VoiceControlScreenProps) => {
  const link = useMemo(
    () => relay ?? createTvRelayClient({getDeviceId: loadDeviceId}),
    [relay],
  );

  const [pairing, setPairing] = useState<TvPairing | null>(null);
  const [pairingError, setPairingError] = useState('');

  useEffect(() => {
    if (paired) {
      setPairing(null);
      setPairingError('');
      return undefined;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const refresh = () => {
      link
        .requestPairing()
        .then(next => {
          if (cancelled) {
            return;
          }
          setPairing(next);
          setPairingError('');
          const expiresIn = Date.parse(next.expiresAt) - Date.now();
          if (Number.isFinite(expiresIn) && expiresIn > 0) {
            timer = setTimeout(refresh, Math.max(1_000, expiresIn - 30_000));
          }
        })
        .catch(error => {
          if (cancelled) {
            return;
          }
          setPairingError(
            error instanceof Error ? error.message : String(error),
          );
          timer = setTimeout(refresh, RETRY_PAUSE_MS);
        });
    };

    refresh();
    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [link, paired]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack?.();
      return true;
    });
    return () => subscription?.remove();
  }, [onBack]);

  const code = pairing?.code ?? '';
  const display = paired ? 'PAIRED' : code || '••••••';
  // Two steps, in the order Alexa takes them: the phrase pairs, then the code
  // above is what it asks for. The old hint stopped at the phrase, so a listener
  // who followed it exactly had nothing to say when the question came back.
  const hint = paired
    ? 'ALEXA IS LINKED TO THIS TV'
    : pairingError ||
      relayError ||
      'SAY TO ALEXA: “PAIR MY TV”, THEN READ THE SIX DIGITS';
  const hintFailed = Boolean(pairingError || relayError);

  return (
    <View style={styles.root} testID="voice-control-screen">
      <View style={styles.header}>
        <BrandMark />
      </View>

      <View style={styles.content}>
        <Text
          style={[
            styles.title,
            {
              fontSize: scaleFontSize(88),
              lineHeight: scaleFontSize(104),
            },
          ]}
          testID="voice-control-heading">
          {'VOICE CONTROL\nSETTING'}
        </Text>

        <View style={styles.waveStage}>
          <SoundWave />
        </View>

        <View style={styles.pill} testID="voice-control-pill">
          <Text
            accessibilityLabel={
              paired
                ? 'Alexa is paired with this TV'
                : code
                  ? `Pairing code ${code.split('').join(' ')}`
                  : 'Pairing code loading'
            }
            numberOfLines={1}
            style={[
              styles.code,
              {
                fontSize: scaleFontSize(
                  paired ? typography.headline : typography.display,
                ),
                letterSpacing: scaleWidth(5),
              },
            ]}
            testID="voice-control-code">
            {display}
          </Text>
          <FatherTree />
        </View>

        <Text
          style={[
            styles.hint,
            hintFailed ? styles.hintError : null,
            {fontSize: scaleFontSize(typography.caption)},
          ]}
          numberOfLines={2}>
          {hint}
        </Text>
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
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    marginTop: scaleHeight(space.md),
    color: color.text,
    fontWeight: '700',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  waveStage: {
    marginTop: scaleHeight(space.lg),
    alignItems: 'center',
    justifyContent: 'center',
  },
  wave: {
    height: scaleHeight(168),
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleWidth(7),
  },
  waveBar: {
    width: scaleWidth(4),
    borderRadius: scaleWidth(2),
  },
  pill: {
    marginTop: scaleHeight(space.xl),
    width: scaleWidth(760),
    height: scaleHeight(152),
    borderRadius: scaleWidth(radius.pill),
    backgroundColor: color.tileSurface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: scaleWidth(space.lg),
    paddingRight: scaleWidth(space.xs),
  },
  code: {
    flex: 1,
    color: color.tileInk,
    fontFamily: 'monospace',
    fontWeight: '700',
    textAlign: 'center',
  },
  hint: {
    marginTop: scaleHeight(space.md),
    color: color.textMuted,
    fontWeight: '800',
    letterSpacing: 2.4,
    textAlign: 'center',
  },
  hintError: {
    color: color.danger,
  },
  treeStage: {
    width: scaleWidth(TREE_STAGE_WIDTH),
    height: scaleHeight(TREE_STAGE_HEIGHT),
  },
  treeGlow: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 206, 77, 0.16)',
    borderWidth: scaleWidth(2),
    borderColor: 'rgba(255, 206, 77, 0.55)',
  },
  treeOrbit: {
    position: 'absolute',
  },
  spark: {
    position: 'absolute',
    backgroundColor: color.gold,
  },
  treeArt: {
    position: 'absolute',
  },
  treeImage: {
    width: '100%',
    height: '100%',
  },
});
