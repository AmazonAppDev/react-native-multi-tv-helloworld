import React, {useEffect, useRef, useState} from 'react';
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
import {RewardBurst} from './games/RewardBurst';
import {MascotStage, useReducedMotion} from './home/MascotStage';
import {BrandMark} from './home/Brand';

export interface MissionScreenProps {
  /** SURVEY SPECIES: the field guide the mission feeds. */
  onOpenSpecies?: () => void;
  onBack?: () => void;
}

type FocusDirection = 'up' | 'down' | 'left' | 'right';

/** The web app the QR opens. Printed on screen so it can also be typed. */
const WEB_URL = 'https://globie.earth/';
const WEB_LABEL = 'globie.earth';

/**
 * The guided walkthrough walks these four cards in order, then pays out.
 * 0 is idle; 1..4 highlight objective, how-to, rewards and the QR.
 */
type GuideStep = 0 | 1 | 2 | 3 | 4;

const GUIDE_SUB: Record<GuideStep, string> = {
  0: 'Kae Na walks you through this mission, one step at a time.',
  1: 'Step 1 of 4 · what counts as a matching species.',
  2: 'Step 2 of 4 · how an approved photo reaches the guide.',
  3: 'Step 3 of 4 · what the badge pays you.',
  4: 'Step 4 of 4 · open the web app on your phone and start.',
};

const GUIDE_LABEL: Record<GuideStep, string> = {
  0: 'GUIDE ME THROUGH IT',
  1: 'NEXT STEP · 1/4',
  2: 'NEXT STEP · 2/4',
  3: 'NEXT STEP · 3/4',
  4: 'FINISH · CLAIM 300 XP',
};

const STEPS = [
  'Open the Field Guide and pick a species that matches the target.',
  'Photograph it clearly, with the species as the subject.',
  'Upload it from that species page.',
  'The community reviews it; it counts once approved.',
];

const REWARDS = [
  {label: 'POINTS', value: '+300 XP on approval', tint: color.gold},
  {label: 'BADGE', value: 'Biodiversity Keeper', tint: color.clay},
  {label: 'ECO TOKENS', value: '+700 with the badge', tint: color.accent},
  {
    label: 'RECOGNITION',
    value: 'Your verified contribution is credited on the species page.',
    tint: color.textMuted,
  },
];

const BackButton = React.forwardRef<View, {onPress?: () => void}>(
  function BackButton({onPress}, ref) {
    const [focused, setFocused] = useState(false);
    return (
      <TouchableOpacity
        ref={ref}
        testID="mission-back"
        activeOpacity={1}
        accessibilityRole="button"
        accessibilityLabel="Back to quests"
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
          ‹ QUESTS
        </Text>
      </TouchableOpacity>
    );
  },
);

interface GuideRowProps {
  step: GuideStep;
  hasTVPreferredFocus?: boolean;
  onPress?: () => void;
}

/** The pale call-to-action that pulses through the four explanation cards. */
const GuideRow = React.forwardRef<View, GuideRowProps>(function GuideRow(
  {step, hasTVPreferredFocus, onPress},
  ref,
) {
  const [focused, setFocused] = useState(false);
  return (
    <TouchableOpacity
      ref={ref}
      testID="mission-guide"
      activeOpacity={1}
      hasTVPreferredFocus={hasTVPreferredFocus}
      accessibilityRole="button"
      accessibilityLabel={`${GUIDE_LABEL[step]}. ${GUIDE_SUB[step]}`}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[
        styles.guide,
        {
          borderColor: focused ? color.clay : 'transparent',
          backgroundColor: focused ? '#eef4f1' : color.tileSurface,
        },
      ]}>
      <View style={styles.guideGlyph}>
        {[0.45, 0.7, 1].map(height => (
          <View
            key={height}
            style={[
              styles.guideBar,
              {height: scaleWidth(28) * height},
            ]}
          />
        ))}
      </View>
      <View style={styles.guideCopy}>
        <Text
          style={[
            styles.guideLabel,
            {fontSize: scaleFontSize(typography.title)},
          ]}>
          {GUIDE_LABEL[step]}
        </Text>
        <Text
          style={[
            styles.guideSub,
            {fontSize: scaleFontSize(typography.caption)},
          ]}
          numberOfLines={1}>
          {GUIDE_SUB[step]}
        </Text>
      </View>
      {/* Four pips are the walkthrough's progress bar; they fill as it runs. */}
      <View style={styles.pips} accessibilityElementsHidden importantForAccessibility="no">
        {[1, 2, 3, 4].map(index => (
          <View
            key={index}
            style={[
              styles.pip,
              {
                backgroundColor:
                  step >= index ? color.clay : 'rgba(11, 26, 20, 0.22)',
              },
            ]}
          />
        ))}
      </View>
      <Text
        style={[
          styles.guideArrow,
          {fontSize: scaleFontSize(40)},
        ]}>
        ›
      </Text>
    </TouchableOpacity>
  );
});

/** The one interactive chip in the objective card: jump to the field guide. */
const SurveyChip = React.forwardRef<View, {onPress?: () => void}>(
  function SurveyChip({onPress}, ref) {
    const [focused, setFocused] = useState(false);
    return (
      <TouchableOpacity
        ref={ref}
        testID="mission-survey"
        activeOpacity={1}
        accessibilityRole="button"
        accessibilityLabel="Survey species, open the field guide"
        onPress={onPress}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.chip,
          {
            borderColor: focused ? color.clay : color.accent,
            backgroundColor: focused ? color.accentSoft : 'transparent',
          },
        ]}>
        <View style={styles.chipGlyph}>
          <View style={styles.chipGlyphDot} />
        </View>
        <Text
          style={[
            styles.chipLabel,
            {fontSize: scaleFontSize(typography.body)},
          ]}>
          Survey species
        </Text>
      </TouchableOpacity>
    );
  },
);

interface QrPanelProps {
  active: boolean;
  onPress?: () => void;
}

/** The handoff to the phone: the live URL plus a scannable code. */
const QrPanel = React.forwardRef<View, QrPanelProps>(function QrPanel(
  {active, onPress},
  ref,
) {
  const reduced = useReducedMotion();
  const [focused, setFocused] = useState(false);
  const pop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active || reduced) {
      pop.setValue(0);
      return undefined;
    }
    const loop = Animated.sequence([
      Animated.timing(pop, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }),
      Animated.timing(pop, {
        toValue: 0,
        duration: 700,
        easing: Easing.in(Easing.quad),
        useNativeDriver: false,
      }),
    ]);
    const timer = setInterval(() => loop.start(), 1600);
    loop.start();
    return () => {
      clearInterval(timer);
      loop.stop();
    };
  }, [active, pop, reduced]);

  const scale = pop.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.03],
  });

  return (
    <Animated.View style={{transform: [{scale}]}}>
      <TouchableOpacity
        ref={ref}
        testID="mission-qr"
        activeOpacity={1}
        accessibilityRole="button"
        accessibilityLabel={`Scan the QR code or open ${WEB_URL} on your phone`}
        onPress={onPress}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.qrCard,
          {
            borderColor: focused
              ? color.clay
              : active
              ? color.clay
              : 'transparent',
          },
        ]}>
        <Text
          style={[
            styles.qrKicker,
            {fontSize: scaleFontSize(typography.label)},
          ]}>
          SCAN TO OPEN
        </Text>
        <View style={styles.qrFrame}>
          <Image
            source={require('../assets/brand/qr-globie-earth.png')}
            style={styles.qrImage}
            resizeMode="contain"
            accessible={false}
          />
        </View>
        <Text
          testID="mission-url"
          style={[
            styles.qrUrl,
            {fontSize: scaleFontSize(typography.body)},
          ]}>
          {WEB_URL}
        </Text>
        <Text
          style={[
            styles.qrHint,
            {fontSize: scaleFontSize(typography.label)},
          ]}>
          Point your phone camera here · {WEB_LABEL}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
});

const RowGlyph = ({tint}: {tint: string}) => (
  <View style={[styles.rowGlyph, {borderColor: tint}]}>
    <View style={[styles.rowGlyphDot, {backgroundColor: tint}]} />
  </View>
);

/**
 * BIODIVERSITY KEEPER mission detail.
 *
 * One screen, no scrolling: the manual, the objective and the submit steps
 * fill the left column while the phone handoff (live URL + QR) and the payout
 * sit in the right. The guide row is a focusable walkthrough that highlights
 * each card in turn and pays a 300 XP burst at the end.
 */
export const MissionScreen = ({onOpenSpecies, onBack}: MissionScreenProps) => {
  const backRef = useRef<View | null>(null);
  const guideRef = useRef<View | null>(null);
  const surveyRef = useRef<View | null>(null);
  const qrRef = useRef<View | null>(null);

  const [bootFocus, setBootFocus] = useState(true);
  const [step, setStep] = useState<GuideStep>(0);
  const [hopKey, setHopKey] = useState(0);
  const [burst, setBurst] = useState(false);

  useEffect(() => {
    // Cleared once, or every re-render re-requests focus on the guide row and
    // the ring can never walk to the survey chip or the QR.
    const timer = setTimeout(() => setBootFocus(false), 1500);
    return () => clearTimeout(timer);
  }, []);

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

    // Deferred: the cards attach a frame after mount, and setNextFocus
    // rejects tags that are not registered yet.
    const timer = setTimeout(() => {
      link(backRef.current, guideRef.current, 'down');
      link(backRef.current, qrRef.current, 'right');
      link(guideRef.current, backRef.current, 'up');
      link(guideRef.current, surveyRef.current, 'down');
      link(surveyRef.current, guideRef.current, 'up');
      link(surveyRef.current, qrRef.current, 'right');
      link(qrRef.current, backRef.current, 'up');
      link(qrRef.current, surveyRef.current, 'left');
    }, 300);

    return () => clearTimeout(timer);
  }, []);

  const advanceGuide = () => {
    setHopKey(value => value + 1);
    if (step >= 4) {
      setStep(0);
      setBurst(true);
      return;
    }
    setStep((step + 1) as GuideStep);
  };

  const objectiveActive = step === 1;
  const howToActive = step === 2;
  const rewardsActive = step === 3;
  const qrActive = step === 4;

  return (
    <View style={styles.root} testID="mission-screen">
      <View style={styles.header}>
        <BackButton ref={backRef} onPress={onBack} />
        <View style={styles.keeper}>
          <View style={styles.keeperStar} />
          <Text
            style={[
              styles.keeperLabel,
              {fontSize: scaleFontSize(typography.label)},
            ]}>
            KEEPER · BIODIVERSITY
          </Text>
        </View>
        <BrandMark />
      </View>

      <View style={styles.body}>
        <View style={styles.left}>
          <View style={styles.manual} testID="mission-manual">
            <View style={styles.manualGlow} pointerEvents="none" />
            <View style={styles.manualCopy}>
              <View style={styles.manualBadge}>
                <View style={styles.manualBadgeDot} />
                <Text
                  style={[
                    styles.manualBadgeLabel,
                    {fontSize: scaleFontSize(typography.label)},
                  ]}>
                  MISSION MANUAL
                </Text>
              </View>
              <Text
                style={[
                  styles.manualTitle,
                  {
                    fontSize: scaleFontSize(46),
                    lineHeight: scaleFontSize(54),
                  },
                ]}>
                Biodiversity Keeper
              </Text>
              <Text
                style={[
                  styles.manualBody,
                  {
                    fontSize: scaleFontSize(typography.body),
                    lineHeight: scaleFontSize(38),
                  },
                ]}>
                Fifteen species from any group in the survey table — the
                broadest sweep there is.
              </Text>
            </View>
            <MascotStage
              variant="kae-na"
              size={196}
              hopKey={hopKey}
              testID="mission-mascot"
            />
          </View>

          <GuideRow
            ref={guideRef}
            step={step}
            hasTVPreferredFocus={bootFocus}
            onPress={advanceGuide}
          />

          <View
            testID="mission-objective"
            style={[
              styles.objective,
              {borderColor: objectiveActive ? color.clay : 'rgba(252, 168, 103, 0.45)'},
            ]}>
            <View style={styles.cardHeading}>
              <View style={styles.leaf} />
              <Text
                style={[
                  styles.cardHeadingLabel,
                  {fontSize: scaleFontSize(typography.label)},
                ]}>
                YOUR OBJECTIVE
              </Text>
            </View>
            <Text
              style={[
                styles.objectiveBody,
                {
                  fontSize: scaleFontSize(typography.body),
                  lineHeight: scaleFontSize(36),
                },
              ]}>
              Document 15 matching species. Every approved photo moves this
              mission forward and closes a real gap in the field guide.
            </Text>
            <View style={styles.chipRow}>
              <SurveyChip ref={surveyRef} onPress={onOpenSpecies} />
              <View style={styles.chipStatic}>
                <View style={styles.cameraGlyph}>
                  <View style={styles.cameraLens} />
                </View>
                <Text
                  style={[
                    styles.chipStaticLabel,
                    {fontSize: scaleFontSize(typography.body)},
                  ]}>
                  Photo
                </Text>
              </View>
            </View>
          </View>

          <View
            testID="mission-howto"
            style={[
              styles.howTo,
              {borderColor: howToActive ? color.clay : 'transparent'},
            ]}>
            <View style={styles.cardHeading}>
              <View style={styles.clipboard} />
              <Text
                style={[
                  styles.cardHeadingLabel,
                  {fontSize: scaleFontSize(typography.label)},
                ]}>
                HOW TO SUBMIT
              </Text>
            </View>
            <View style={styles.stepRow}>
              {STEPS.map((text, index) => (
                <View key={text} style={styles.step}>
                  <View style={styles.stepNumber}>
                    <Text
                      style={[
                        styles.stepNumberText,
                        {fontSize: scaleFontSize(typography.caption)},
                      ]}>
                      {index + 1}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.stepText,
                      {
                        fontSize: scaleFontSize(typography.caption),
                        lineHeight: scaleFontSize(32),
                      },
                    ]}>
                    {text}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.right}>
          <QrPanel
            ref={qrRef}
            active={qrActive}
            onPress={() => setHopKey(value => value + 1)}
          />

          <View
            testID="mission-rewards"
            style={[
              styles.rewards,
              {borderColor: rewardsActive ? color.clay : 'transparent'},
            ]}>
            <View style={styles.cardHeading}>
              <View style={styles.medal} />
              <Text
                style={[
                  styles.cardHeadingLabel,
                  {fontSize: scaleFontSize(typography.label)},
                ]}>
                REWARDS
              </Text>
            </View>
            {REWARDS.map(reward => (
              <View key={reward.label} style={styles.rewardRow}>
                <RowGlyph tint={reward.tint} />
                <View style={styles.rewardCopy}>
                  <Text
                    style={[
                      styles.rewardLabel,
                      {fontSize: scaleFontSize(typography.caption)},
                    ]}>
                    {reward.label}
                  </Text>
                  <Text
                    style={[
                      styles.rewardValue,
                      {fontSize: scaleFontSize(typography.caption)},
                    ]}>
                    {reward.value}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </View>

      {burst ? (
        <RewardBurst
          variant="match"
          mascot="kae-na"
          amount={300}
          unitLabel="XP"
          label="MISSION READY"
          durationMs={2200}
          onDone={() => setBurst(false)}
          testID="mission-reward-burst"
        />
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
  keeper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleWidth(space.xxs),
    paddingHorizontal: scaleWidth(space.sm),
    paddingVertical: scaleHeight(space.xxs),
    borderRadius: scaleWidth(radius.pill),
    borderWidth: scaleWidth(2),
    borderColor: color.accent,
    backgroundColor: color.accentSoft,
  },
  /** A diamond stands in for the ranking star; the TV font has no medal. */
  keeperStar: {
    width: scaleWidth(14),
    height: scaleWidth(14),
    borderRadius: scaleWidth(3),
    backgroundColor: color.gold,
    transform: [{rotate: '45deg'}],
  },
  keeperLabel: {
    color: color.accent,
    fontWeight: '800',
    letterSpacing: 2,
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    gap: scaleWidth(28),
    marginTop: scaleHeight(space.sm),
  },
  left: {
    flex: 1,
    gap: scaleHeight(space.sm),
  },
  right: {
    width: scaleWidth(508),
    gap: scaleHeight(space.xs),
  },
  manual: {
    minHeight: scaleHeight(238),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: scaleWidth(space.md),
    paddingRight: scaleWidth(space.sm),
    borderRadius: scaleWidth(radius.lg),
    borderWidth: scaleWidth(2),
    borderColor: color.border,
    backgroundColor: color.surfaceInner,
    overflow: 'hidden',
  },
  manualGlow: {
    position: 'absolute',
    right: -scaleWidth(40),
    top: -scaleWidth(40),
    width: scaleWidth(300),
    height: scaleWidth(300),
    borderRadius: scaleWidth(150),
    backgroundColor: 'rgba(187, 221, 218, 0.06)',
  },
  manualCopy: {
    flexShrink: 1,
    paddingRight: scaleWidth(space.xs),
    gap: scaleHeight(space.xxs),
  },
  manualBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: scaleWidth(space.xxs),
    paddingHorizontal: scaleWidth(space.xs),
    paddingVertical: scaleHeight(4),
    borderRadius: scaleWidth(radius.pill),
    borderWidth: scaleWidth(2),
    borderColor: color.accent,
  },
  manualBadgeDot: {
    width: scaleWidth(10),
    height: scaleWidth(10),
    borderRadius: scaleWidth(5),
    backgroundColor: color.accent,
  },
  manualBadgeLabel: {
    color: color.accent,
    fontWeight: '800',
    letterSpacing: 2,
  },
  manualTitle: {
    color: color.text,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  manualBody: {
    color: color.textMuted,
  },
  guide: {
    minHeight: scaleHeight(96),
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleWidth(space.sm),
    paddingHorizontal: scaleWidth(space.md),
    borderRadius: scaleWidth(radius.md),
    borderWidth: scaleWidth(focus.ringWidth),
  },
  guideGlyph: {
    width: scaleWidth(56),
    height: scaleWidth(56),
    borderRadius: scaleWidth(28),
    backgroundColor: color.accentDeep,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scaleWidth(4),
  },
  guideBar: {
    width: scaleWidth(5),
    borderRadius: scaleWidth(3),
    backgroundColor: color.accent,
  },
  guideCopy: {
    flex: 1,
  },
  guideLabel: {
    color: color.tileInk,
    fontWeight: '800',
    letterSpacing: 1,
  },
  guideSub: {
    color: '#2f4a41',
    marginTop: scaleHeight(2),
  },
  guideArrow: {
    color: color.tileInk,
    fontWeight: '700',
  },
  pips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleWidth(8),
  },
  pip: {
    width: scaleWidth(12),
    height: scaleWidth(12),
    borderRadius: scaleWidth(6),
  },
  objective: {
    paddingHorizontal: scaleWidth(space.md),
    paddingVertical: scaleHeight(space.sm),
    borderRadius: scaleWidth(radius.md),
    borderWidth: scaleWidth(3),
    gap: scaleHeight(space.xxs),
  },
  cardHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleWidth(space.xxs),
  },
  cardHeadingLabel: {
    color: color.clay,
    fontWeight: '800',
    letterSpacing: 3,
  },
  /** Leaf drawn as two offset ellipses; no glyph font on the device. */
  leaf: {
    width: scaleWidth(22),
    height: scaleWidth(14),
    borderRadius: scaleWidth(11),
    backgroundColor: color.clay,
    transform: [{rotate: '-24deg'}],
  },
  clipboard: {
    width: scaleWidth(18),
    height: scaleWidth(22),
    borderRadius: scaleWidth(4),
    borderWidth: scaleWidth(3),
    borderColor: color.clay,
  },
  medal: {
    width: scaleWidth(20),
    height: scaleWidth(20),
    borderRadius: scaleWidth(10),
    borderWidth: scaleWidth(3),
    borderColor: color.clay,
  },
  objectiveBody: {
    color: color.text,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleWidth(space.xs),
    marginTop: scaleHeight(space.xxs),
  },
  chip: {
    minHeight: scaleHeight(52),
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleWidth(space.xxs),
    paddingHorizontal: scaleWidth(space.sm),
    borderRadius: scaleWidth(radius.pill),
    borderWidth: scaleWidth(3),
  },
  chipGlyph: {
    width: scaleWidth(20),
    height: scaleWidth(16),
    borderRadius: scaleWidth(3),
    borderWidth: scaleWidth(2),
    borderColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipGlyphDot: {
    width: scaleWidth(4),
    height: scaleWidth(4),
    borderRadius: scaleWidth(2),
    backgroundColor: color.accent,
  },
  chipLabel: {
    color: color.accent,
    fontWeight: '700',
  },
  chipStatic: {
    minHeight: scaleHeight(52),
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleWidth(space.xxs),
    paddingHorizontal: scaleWidth(space.sm),
    borderRadius: scaleWidth(radius.pill),
    borderWidth: scaleWidth(3),
    borderColor: 'rgba(187, 221, 218, 0.22)',
  },
  cameraGlyph: {
    width: scaleWidth(22),
    height: scaleWidth(17),
    borderRadius: scaleWidth(3),
    borderWidth: scaleWidth(2),
    borderColor: color.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraLens: {
    width: scaleWidth(7),
    height: scaleWidth(7),
    borderRadius: scaleWidth(4),
    backgroundColor: color.textMuted,
  },
  chipStaticLabel: {
    color: color.textMuted,
    fontWeight: '700',
  },
  howTo: {
    flex: 1,
    paddingHorizontal: scaleWidth(space.md),
    paddingVertical: scaleHeight(space.sm),
    borderRadius: scaleWidth(radius.md),
    borderWidth: scaleWidth(3),
    gap: scaleHeight(space.xs),
  },
  stepRow: {
    flexDirection: 'row',
    gap: scaleWidth(space.md),
  },
  step: {
    flex: 1,
    gap: scaleHeight(space.xxs),
  },
  stepNumber: {
    width: scaleWidth(34),
    height: scaleWidth(34),
    borderRadius: scaleWidth(17),
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    color: color.surface,
    fontWeight: '800',
  },
  stepText: {
    color: color.textMuted,
  },
  qrCard: {
    alignItems: 'center',
    paddingHorizontal: scaleWidth(space.sm),
    paddingVertical: scaleHeight(space.xs),
    borderRadius: scaleWidth(radius.lg),
    borderWidth: scaleWidth(focus.ringWidth),
    backgroundColor: '#eef4ee',
  },
  qrKicker: {
    color: '#2f4a41',
    fontWeight: '800',
    letterSpacing: 4,
  },
  qrFrame: {
    marginTop: scaleHeight(space.xxs),
    padding: scaleWidth(6),
    borderRadius: scaleWidth(radius.sm),
    backgroundColor: '#ffffff',
  },
  qrImage: {
    width: scaleWidth(250),
    height: scaleWidth(250),
  },
  qrUrl: {
    marginTop: scaleHeight(space.xxs),
    color: color.tileInk,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  qrHint: {
    marginTop: scaleHeight(2),
    color: '#3c5a50',
  },
  rewards: {
    flex: 1,
    paddingHorizontal: scaleWidth(space.sm),
    paddingVertical: scaleHeight(space.xs),
    borderRadius: scaleWidth(radius.lg),
    borderWidth: scaleWidth(3),
    backgroundColor: color.surfaceInner,
    gap: scaleHeight(space.xxs),
  },
  rewardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: scaleWidth(space.xs),
    paddingTop: scaleHeight(space.xxs),
    borderTopWidth: scaleWidth(1),
    borderTopColor: color.border,
  },
  rowGlyph: {
    width: scaleWidth(26),
    height: scaleWidth(26),
    borderRadius: scaleWidth(7),
    borderWidth: scaleWidth(2),
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowGlyphDot: {
    width: scaleWidth(7),
    height: scaleWidth(7),
    borderRadius: scaleWidth(4),
  },
  rewardCopy: {
    flex: 1,
  },
  rewardLabel: {
    color: color.textMuted,
    fontWeight: '800',
    letterSpacing: 2,
  },
  rewardValue: {
    color: color.text,
    fontWeight: '600',
    lineHeight: scaleFontSize(30),
  },
});
