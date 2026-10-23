import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  BackHandler,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {FocusManager, findNodeHandle} from '@amazon-devices/react-native-kepler';
import {
  CoverArt,
  GLOBIE_RELAY_BASE_URL,
  StateView,
  color,
  createSpeciesClient,
  createWikiClient,
  focus,
  layout,
  loadDeviceId,
  radius,
  scaleFontSize,
  scaleHeight,
  scaleWidth,
  space,
  speciesPageUrl,
  speciesWebPath,
  typography,
} from '@multitv/shared';
import type {
  SpeciesClient,
  SpeciesRecord,
  SpeciesType,
  WikiClient,
  WikiImage,
  WikiSummary,
} from '@multitv/shared';

export interface SpeciesDetailScreenProps {
  type: SpeciesType;
  id: number;
  /** Injected in tests; both default to fetch-backed clients. */
  client?: SpeciesClient;
  wiki?: WikiClient;
  onBack?: () => void;
}

type Status = 'loading' | 'ready' | 'error';
type FocusDirection = 'up' | 'down' | 'left' | 'right';

/** Four tiles fill the 880-wide hero column, with one gap between each. */
const STRIP_TILES = 4;
const TILE_WIDTH = 200;
const TILE_HEIGHT = 150;
const TILE_GAP = 16;

const IUCN_WORDS: Record<string, string> = {
  LC: 'Least Concern',
  NT: 'Near Threatened',
  VU: 'Vulnerable',
  EN: 'Endangered',
  CR: 'Critically Endangered',
  EW: 'Extinct in the Wild',
  EX: 'Extinct',
  DD: 'Data Deficient',
};

const SEASON_WORDS: Record<string, string> = {
  V: 'Winter visitor',
  R: 'Resident',
  N: 'Passage migrant',
};

/** First sentence, hard-capped at 160 characters. */
const oneLiner = (extract: string): string => {
  const clean = extract.replace(/\s+/g, ' ').trim();
  const match = clean.match(/^.*?[.!?](\s|$)/);
  const sentence = match ? match[0].trim() : clean;
  return sentence.length > 160
    ? `${sentence.slice(0, 157).trimEnd()}…`
    : sentence;
};

/** Used when there is no Wikipedia article for the name. */
const composedLine = (record: SpeciesRecord): string => {
  const parts = [record.thai_name];
  if (record.family) {
    parts.push(record.family);
  }
  if (record.native_status) {
    parts.push(record.native_status);
  }
  if (record.protected_area) {
    parts.push(`recorded at ${record.protected_area}`);
  } else if (record.province) {
    parts.push(`recorded in ${record.province}`);
  }
  return parts.join(' · ');
};

const BackButton = React.forwardRef<View, {onPress?: () => void}>(
  function BackButton({onPress}, ref) {
    const [focused, setFocused] = useState(false);
    return (
      <TouchableOpacity
        ref={ref}
        testID="species-detail-back"
        activeOpacity={1}
        accessibilityRole="button"
        accessibilityLabel="Back to species"
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
          ‹ SPECIES
        </Text>
      </TouchableOpacity>
    );
  },
);

const MetaChip = ({label, filled}: {label: string; filled?: boolean}) => (
  <View style={[styles.chip, filled && styles.chipFilled]}>
    <Text
      style={[
        styles.chipLabel,
        {
          fontSize: scaleFontSize(typography.label),
          color: filled ? color.surface : color.accent,
        },
      ]}>
      {label}
    </Text>
  </View>
);

interface StripTileProps {
  image: string;
  label: string;
  /** A photo that is currently the hero, so its tile keeps a visible edge. */
  selected?: boolean;
  testID?: string;
  onPress?: () => void;
}

/**
 * One thumbnail in the strip. The focus ring is always drawn and only changes
 * colour, so a focused tile never resizes the row.
 */
const StripTile = React.forwardRef<View, StripTileProps>(function StripTile(
  {image, label, selected, testID, onPress},
  ref,
) {
  const [focused, setFocused] = useState(false);
  return (
    <TouchableOpacity
      ref={ref}
      testID={testID}
      activeOpacity={1}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[
        styles.tile,
        {
          borderColor: focused
            ? color.text
            : selected
              ? color.accent
              : 'transparent',
        },
      ]}>
      <Image
        testID={testID ? `${testID}-image` : undefined}
        source={{uri: image}}
        style={styles.tileImage}
        resizeMode="cover"
      />
    </TouchableOpacity>
  );
});

/**
 * The same address as a square. The television ships no QR encoder, so the
 * relay draws the PNG - the pattern the join card already uses.
 */
const speciesQrUrlFor = (type: SpeciesType, id: number): string =>
  `${GLOBIE_RELAY_BASE_URL}/v1/species/${speciesWebPath(type)}/${id}/qr.png`;

interface LearnMoreCardProps {
  url: string;
  qrUrl: string;
}

/**
 * The phone hand-off.
 *
 * A television cannot open a web link, so the code is the deep link: it opens
 * the exact field-guide page a viewer is looking at, article, photos and
 * contribution box included. The address is printed under the square so it can
 * also be typed, and it stays legible if the image never arrives.
 *
 * It is pinned under the copy rather than placed inside it: the address must
 * be on screen for every record, however long its habitat text runs.
 */
const LearnMoreCard = ({url, qrUrl}: LearnMoreCardProps) => (
  <View
    style={styles.learn}
    testID="species-learn-more"
    accessible
    accessibilityRole="image"
    accessibilityLabel={`Learn more at ${url}. Scan the QR code with your phone camera.`}>
    <View style={styles.learnRow}>
      <View style={styles.learnQrFrame}>
        <Image
          testID="species-learn-qr"
          source={{uri: qrUrl}}
          resizeMode="contain"
          style={styles.learnQr}
          accessible={false}
        />
      </View>
      <View style={styles.learnCopy}>
        <Text
          style={[
            styles.learnKicker,
            {fontSize: scaleFontSize(typography.label)},
          ]}>
          LEARN MORE
        </Text>
        <Text
          style={[
            styles.learnHint,
            {fontSize: scaleFontSize(typography.caption)},
          ]}>
          Scan with your phone camera to open the full field-guide entry
        </Text>
      </View>
    </View>
    <Text
      testID="species-learn-url"
      style={[
        styles.learnUrl,
        {fontSize: scaleFontSize(typography.body)},
      ]}
      numberOfLines={1}>
      {url}
    </Text>
  </View>
);

/**
 * The Field Card. Structured DNP fields render immediately; the Wikipedia
 * summary and its lead image are layered in when they arrive, and a missing
 * article never blocks the card.
 */
export const SpeciesDetailScreen = ({
  type,
  id,
  client,
  wiki,
  onBack,
}: SpeciesDetailScreenProps) => {
  const species = useMemo(() => client ?? createSpeciesClient(), [client]);
  const wikiClient = useMemo(
    () => wiki ?? createWikiClient({getDeviceId: loadDeviceId}),
    [wiki],
  );

  const [status, setStatus] = useState<Status>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [record, setRecord] = useState<SpeciesRecord | null>(null);
  const [summary, setSummary] = useState<WikiSummary | null>(null);
  const [gallery, setGallery] = useState<WikiImage[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<WikiImage | null>(null);
  const backRef = useRef<View | null>(null);
  const tileNodes = useRef<Array<View | null>>([]);
  /** One-shot: the page claims the ring once, then leaves the viewer alone. */
  const claimed = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setStatus('loading');
      setErrorMessage('');
      setGallery([]);
      setSelectedPhoto(null);
      try {
        const result = await species.get(type, id);
        if (cancelled) {
          return;
        }
        setRecord(result);
        setStatus('ready');

        // The article is optional: a 404 resolves to null, and any transport
        // failure simply leaves the composed line in place. The gallery rides
        // along with it so the strip costs one round trip, not two.
        const name = result.scientific_name?.trim() || result.thai_name;
        wikiClient
          .summary(name, {images: STRIP_TILES})
          .then(value => {
            if (!cancelled) {
              setSummary(value);
              setGallery(value?.images ?? []);
            }
          })
          .catch(() => undefined);
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
  }, [species, wikiClient, type, id, reloadKey]);

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

  // The strip is a single row of the first gallery images.
  const photoItems = gallery.slice(0, STRIP_TILES);
  const hasStrip = photoItems.length > 0;

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

    const count = photoItems.length;
    if (count > 0) {
      link(backRef.current, tileNodes.current[0], 'down');
      for (let index = 0; index < count; index += 1) {
        const node = tileNodes.current[index];
        link(node, backRef.current, 'up');
        link(node, tileNodes.current[index - 1], 'left');
        link(node, tileNodes.current[index + 1], 'right');
      }
    }

    // Without a strip the back pill is the only focusable control, so the page
    // must claim it or the D-pad has no ring to move.
    if (claimed.current) {
      return;
    }
    const target = count > 0 ? tileNodes.current[0] : backRef.current;
    const timer = setTimeout(() => {
      claimed.current = true;
      const tag = tagOf(target);
      if (tag === null) {
        return;
      }
      try {
        FocusManager.focus(tag);
      } catch {
        // Same stub limitation as setNextFocus.
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [status, hasStrip, photoItems.length]);

  if (status === 'loading') {
    return (
      <View style={styles.root}>
        <StateView variant="loading" testID="species-detail-loading" />
      </View>
    );
  }

  if (status === 'error' || !record) {
    return (
      <View style={styles.root}>
        <StateView
          variant="error"
          message={errorMessage || 'That species could not be loaded.'}
          onRetry={() => setReloadKey(key => key + 1)}
          testID="species-detail-error"
        />
      </View>
    );
  }

  // A chosen thumbnail becomes the hero: the gallery is browsed in place,
  // which needs no browser hand-off on a TV.
  const heroImage =
    selectedPhoto?.url ?? record.photo_url ?? summary?.image?.url ?? null;
  const heroCredit = selectedPhoto
    ? [selectedPhoto.credit, selectedPhoto.license].filter(Boolean).join(' · ')
    : record.photo_url
      ? [record.photo_credit, record.photo_license].filter(Boolean).join(' · ')
      : [summary?.image?.credit, summary?.image?.license]
          .filter(Boolean)
          .join(' · ');

  const chips: Array<{label: string; filled?: boolean}> = [];
  if (record.iucn_status) {
    const code = record.iucn_status.trim().toUpperCase();
    const word = IUCN_WORDS[code];
    chips.push({label: word ? `${code} ${word}` : code, filled: true});
  } else if (record.onep_2565) {
    chips.push({label: `ONEP ${record.onep_2565.trim()}`, filled: true});
  } else if (record.onep_status) {
    chips.push({label: `ONEP ${record.onep_status.trim()}`, filled: true});
  }
  if (record.is_protected) {
    chips.push({label: 'Protected by law'});
  }
  const season = record.seasonal_status?.trim().charAt(0).toUpperCase();
  if (season && SEASON_WORDS[season]) {
    chips.push({label: SEASON_WORDS[season]});
  }
  if (record.native_status) {
    const native = record.native_status.trim();
    chips.push({label: native.charAt(0).toUpperCase() + native.slice(1)});
  }
  if (record.th_record_count) {
    chips.push({label: `${record.th_record_count} records in Thailand`});
  }
  if (record.survey_year_be) {
    chips.push({label: `Surveyed ${record.survey_year_be}`});
  }
  if (record.forest_type) {
    chips.push({label: record.forest_type});
  }

  const place =
    record.protected_area ??
    record.province ??
    (record.th_provinces ? record.th_provinces.split(',')[0] : null);

  const lines = [composedLine(record)];
  if (record.habitat) {
    lines.push(record.habitat);
  }

  const attribution = [
    'Data: DNP Open Data Common',
    summary ? 'Text: Wikipedia · CC BY-SA 4.0' : null,
    heroCredit ? `Photo: ${heroCredit}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.root} testID="species-detail-screen">
      <View style={styles.header}>
        <BackButton ref={backRef} onPress={onBack} />
        <Text
          style={[
            styles.family,
            {fontSize: scaleFontSize(typography.label)},
          ]}>
          {record.family ? record.family.toUpperCase() : ''}
        </Text>
      </View>

      <View style={styles.body}>
        <View style={styles.heroColumn}>
          <CoverArt
            seed={record.scientific_name ?? record.thai_name}
            title={record.thai_name}
            size={600}
            image={heroImage}
            style={styles.hero}
            testID="species-detail-hero"
          />
          <Text
            style={[
              styles.heroCredit,
              {fontSize: scaleFontSize(typography.caption)},
            ]}
            numberOfLines={1}>
            {heroCredit || ' '}
          </Text>

          {hasStrip ? (
            <View style={styles.strip} testID="species-detail-strip">
              <View style={styles.stripHeader}>
                <Text
                  style={[
                    styles.stripLabel,
                    {fontSize: scaleFontSize(typography.label)},
                  ]}>
                  PHOTOS · {photoItems.length}
                </Text>
              </View>

              <View style={styles.stripRow}>
                {photoItems.map((photo, index) => (
                  <StripTile
                    key={photo.descriptionUrl ?? photo.url}
                    ref={node => {
                      tileNodes.current[index] = node;
                    }}
                    testID={`species-photo-${index}`}
                    image={photo.url}
                    label={photo.credit ? `Photo: ${photo.credit}` : 'Photo'}
                    selected={selectedPhoto?.url === photo.url}
                    onPress={() => setSelectedPhoto(photo)}
                  />
                ))}
              </View>
            </View>
          ) : null}
        </View>

        <View style={styles.copyColumn}>
          <ScrollView style={styles.copy} showsVerticalScrollIndicator={false}>
            <Text
            style={[
              styles.thaiName,
              {
                fontSize: scaleFontSize(typography.display),
                lineHeight: scaleFontSize(82),
              },
            ]}>
            {record.thai_name}
          </Text>
          <Text
            style={[
              styles.scientific,
              {fontSize: scaleFontSize(typography.title)},
            ]}>
            {record.scientific_name ?? ''}
          </Text>
          {record.english_name ? (
            <Text
              style={[
                styles.english,
                {fontSize: scaleFontSize(typography.body)},
              ]}>
              {record.english_name}
            </Text>
          ) : null}

          <View style={styles.chips}>
            {chips.map(chip => (
              <MetaChip key={chip.label} label={chip.label} filled={chip.filled} />
            ))}
          </View>

          <Text
            style={[
              styles.description,
              {
                fontSize: scaleFontSize(typography.body),
                lineHeight: scaleFontSize(40),
              },
            ]}
            numberOfLines={3}>
            {summary ? oneLiner(summary.extract) : composedLine(record)}
          </Text>

          <Text
            style={[
              styles.sectionLabel,
              {fontSize: scaleFontSize(typography.label)},
            ]}>
            {place ? 'RECORDED AT' : 'HABITAT'}
          </Text>
          {place ? (
            <Text
              style={[
                styles.sectionValue,
                {fontSize: scaleFontSize(typography.body)},
              ]}
              numberOfLines={2}>
              {place}
            </Text>
          ) : null}
          {record.habitat ? (
            <Text
              style={[
                styles.sectionValue,
                {fontSize: scaleFontSize(typography.body)},
              ]}
              numberOfLines={2}>
              {record.habitat}
            </Text>
          ) : lines.length > 0 && !place ? (
            <Text
              style={[
                styles.sectionValue,
                {fontSize: scaleFontSize(typography.body)},
              ]}
              numberOfLines={2}>
              {lines[0]}
            </Text>
          ) : null}

          <Text
            style={[
              styles.attribution,
              {fontSize: scaleFontSize(typography.caption)},
            ]}>
            {attribution}
          </Text>
          </ScrollView>
          <LearnMoreCard
            url={speciesPageUrl(record.type ?? type, record.id)}
            qrUrl={speciesQrUrlFor(record.type ?? type, record.id)}
          />
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
  family: {
    color: color.textMuted,
    fontWeight: '700',
    letterSpacing: 2,
    marginLeft: 'auto',
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    gap: scaleWidth(64),
    marginTop: scaleHeight(space.md),
  },
  heroColumn: {
    width: scaleWidth(880),
  },
  hero: {
    width: scaleWidth(880),
    height: scaleHeight(600),
    borderRadius: scaleWidth(radius.md),
  },
  heroCredit: {
    color: color.textMuted,
    marginTop: scaleHeight(space.xs),
  },
  strip: {
    marginTop: scaleHeight(space.sm),
  },
  stripHeader: {
    height: scaleHeight(56),
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleWidth(space.xs),
  },
  stripLabel: {
    color: color.textMuted,
    fontWeight: '800',
    letterSpacing: 2,
  },
  stripRow: {
    flexDirection: 'row',
    gap: scaleWidth(TILE_GAP),
    marginTop: scaleHeight(space.xs),
  },
  tile: {
    width: scaleWidth(TILE_WIDTH),
    height: scaleHeight(TILE_HEIGHT),
    borderRadius: scaleWidth(radius.sm),
    borderWidth: scaleWidth(4),
    overflow: 'hidden',
    backgroundColor: color.surfaceInner,
  },
  tileImage: {
    width: '100%',
    height: '100%',
  },
  /** The copy scrolls; the phone hand-off stays pinned beneath it. */
  copyColumn: {
    flex: 1,
  },
  copy: {
    flex: 1,
  },
  learn: {
    marginTop: scaleHeight(space.md),
    padding: scaleWidth(space.sm),
    borderRadius: scaleWidth(radius.md),
    borderWidth: scaleWidth(2),
    borderColor: color.border,
    backgroundColor: color.surfaceInner,
  },
  learnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleWidth(space.sm),
  },
  /** A white frame keeps the modules crisp against the forest surface. */
  learnQrFrame: {
    padding: scaleWidth(6),
    borderRadius: scaleWidth(radius.sm),
    backgroundColor: '#ffffff',
  },
  learnQr: {
    width: scaleWidth(190),
    height: scaleWidth(190),
  },
  learnCopy: {
    flex: 1,
  },
  learnKicker: {
    color: color.accent,
    fontWeight: '800',
    letterSpacing: 2,
  },
  learnHint: {
    color: color.textMuted,
    marginTop: scaleHeight(space.xxs),
    maxWidth: scaleWidth(400),
  },
  learnUrl: {
    color: color.text,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: scaleHeight(space.xs),
  },
  thaiName: {
    color: color.text,
    fontWeight: '700',
  },
  scientific: {
    color: color.textMuted,
    fontStyle: 'italic',
    marginTop: scaleHeight(space.xxs),
  },
  english: {
    color: color.text,
    marginTop: scaleHeight(4),
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: scaleWidth(space.xs),
    marginTop: scaleHeight(space.sm),
  },
  chip: {
    minHeight: scaleHeight(56),
    justifyContent: 'center',
    paddingHorizontal: scaleWidth(space.sm),
    borderRadius: scaleWidth(radius.pill),
    borderWidth: scaleWidth(2),
    borderColor: color.border,
  },
  chipFilled: {
    backgroundColor: color.accent,
    borderColor: color.accent,
  },
  chipLabel: {
    fontWeight: '600',
  },
  description: {
    color: color.text,
    marginTop: scaleHeight(space.md),
    maxWidth: scaleWidth(700),
  },
  sectionLabel: {
    color: color.accent,
    fontWeight: '800',
    letterSpacing: 2,
    marginTop: scaleHeight(space.lg),
  },
  sectionValue: {
    color: color.textMuted,
    marginTop: scaleHeight(space.xxs),
  },
  attribution: {
    color: color.textMuted,
    marginTop: scaleHeight(space.xl),
  },
});
