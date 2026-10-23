import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  BackHandler,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  FocusManager,
  TVFocusGuideView,
  findNodeHandle,
} from '@amazon-devices/react-native-kepler';
import {
  Chip,
  SPECIES_TABS,
  StateView,
  color,
  createSpeciesClient,
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
  SpeciesClient,
  SpeciesRecord,
  SpeciesTabKey,
  SpeciesType,
} from '@multitv/shared';
import {BrandMark} from '../home/Brand';

export interface SpeciesScreenProps {
  /** Injected in tests; the app uses the default fetch-backed client. */
  client?: SpeciesClient;
  /** Names the screen this pill returns to: the hub or the mission briefing. */
  backLabel?: string;
  onBack?: () => void;
  onOpenDetail?: (type: SpeciesType, id: number) => void;
}

type Status = 'loading' | 'ready' | 'error';
type FocusDirection = 'up' | 'down' | 'left' | 'right';

/** Two rows of five fill the 1920-wide stage without scrolling. */
const PAGE_COLUMNS = 5;
const PAGE_ROWS = 2;
const PAGE_SIZE = PAGE_COLUMNS * PAGE_ROWS;

const CARD_WIDTH = 300;
const CARD_IMAGE_HEIGHT = 190;

const formatCount = (value: number): string =>
  String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** "VU · ANATIDAE" - status first, then whatever taxon label the table has. */
const cardMeta = (record: SpeciesRecord): string => {
  const status =
    record.iucn_status?.trim() ||
    record.onep_status?.trim() ||
    record.onep_2565?.trim() ||
    '';
  const taxon =
    record.family?.trim().toUpperCase() ||
    record.group_type?.trim() ||
    record.protected_area?.trim() ||
    '';
  return [status, taxon].filter(Boolean).join(' · ');
};

interface SpeciesCardProps {
  record: SpeciesRecord;
  testID?: string;
  onPress?: () => void;
}

const SpeciesCard = React.forwardRef<View, SpeciesCardProps>(
  function SpeciesCard({record, testID, onPress}, ref) {
    const [focused, setFocused] = useState(false);

    return (
      <TouchableOpacity
        ref={ref}
        testID={testID}
        activeOpacity={1}
        accessibilityRole="button"
        accessibilityLabel={record.thai_name}
        accessibilityHint="Opens the field card"
        onPress={onPress}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.card,
          {
            borderColor: focused ? color.text : 'transparent',
            backgroundColor: focused ? color.surfaceRaise : color.surfaceInner,
            zIndex: focused ? 2 : 0,
          },
        ]}>
        <View style={styles.cardImage}>
          {record.photo_url ? (
            <Image
              source={{uri: record.photo_url}}
              style={styles.photo}
              resizeMode="cover"
              accessible={false}
            />
          ) : (
            <Text
              style={[
                styles.monogram,
                {fontSize: scaleFontSize(typography.title)},
              ]}>
              {record.thai_name.slice(0, 1)}
            </Text>
          )}
        </View>
        <Text
          style={[
            styles.thaiName,
            {fontSize: scaleFontSize(typography.caption)},
          ]}
          numberOfLines={1}>
          {record.thai_name}
        </Text>
        <Text
          style={[
            styles.scientific,
            {fontSize: scaleFontSize(typography.label)},
          ]}
          numberOfLines={1}>
          {record.scientific_name ?? ' '}
        </Text>
        <Text
          style={[styles.meta, {fontSize: scaleFontSize(typography.label)}]}
          numberOfLines={1}>
          {cardMeta(record) || ' '}
        </Text>
      </TouchableOpacity>
    );
  },
);

const BackButton = React.forwardRef<View, {label: string; onPress?: () => void}>(
  function BackButton({label, onPress}, ref) {
    const [focused, setFocused] = useState(false);
    return (
      <TouchableOpacity
        ref={ref}
        testID="species-back"
        activeOpacity={1}
        accessibilityRole="button"
        accessibilityLabel={`Back to ${label.replace('‹ ', '').toLowerCase()}`}
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
          {label}
        </Text>
      </TouchableOpacity>
    );
  },
);

/**
 * The species catalogue. Tabs map one-to-one to the DNP tables; the All tab
 * interleaves the three named tables so one page always shows plants, birds
 * and park fauna together.
 */
export const SpeciesScreen = ({
  client,
  backLabel = '‹ QUESTS',
  onBack,
  onOpenDetail,
}: SpeciesScreenProps) => {
  const species = useMemo(() => client ?? createSpeciesClient(), [client]);

  const [tab, setTab] = useState<SpeciesTabKey>('all');
  const [pageIndex, setPageIndex] = useState(0);
  const [queryDraft, setQueryDraft] = useState('');
  const [query, setQuery] = useState('');
  const [records, setRecords] = useState<SpeciesRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<Status>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const backRef = useRef<View | null>(null);
  const searchRef = useRef<TextInput | null>(null);
  const chipNodes = useRef<Array<View | null>>([]);
  const cardNodes = useRef<Map<string, View>>(new Map());
  const prevRef = useRef<View | null>(null);
  const nextRef = useRef<View | null>(null);
  /**
   * Where the ring should land once the next page of results is on screen.
   * Cleared after each claim so a tab change (which leaves the chip focused)
   * never yanks focus.
   */
  const claimTarget = useRef<'tabs' | 'pager' | null>('tabs');

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasNext = pageIndex + 1 < totalPages;
  const showPager = status === 'ready' && totalPages > 1;

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setStatus('loading');
      setErrorMessage('');
      try {
        const page = await species.list(tab, {
          search: query || undefined,
          limit: PAGE_SIZE,
          offset: pageIndex * PAGE_SIZE,
        });
        if (cancelled) {
          return;
        }
        setRecords(page.items);
        setTotal(page.total);
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
  }, [species, tab, query, pageIndex, reloadKey]);

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

  const selectTab = useCallback((next: SpeciesTabKey) => {
    // Re-selecting the active tab must be a no-op: clearing the page without a
    // dependency change would strand the grid on "no records" with no refetch.
    if (next === tab) {
      return;
    }
    setStatus('loading');
    setTab(next);
    setPageIndex(0);
    setRecords([]);
  }, [tab]);

  const submitSearch = useCallback((value: string) => {
    setQuery(value.trim());
    setPageIndex(0);
    setRecords([]);
  }, []);

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

    const keyOf = (record: SpeciesRecord): string =>
      `${record.type ?? tab}-${record.id}`;

    // Grid lookups: cards[row][column].
    const grid: Array<Array<View | undefined>> = [];
    for (let row = 0; row < PAGE_ROWS; row += 1) {
      grid.push(
        Array.from({length: PAGE_COLUMNS}, (_, column) => {
          const record = records[row * PAGE_COLUMNS + column];
          return record ? cardNodes.current.get(keyOf(record)) : undefined;
        }),
      );
    }

    const firstCard = grid[0][0];
    const firstTab = chipNodes.current[0];
    const searchNode = searchRef.current as unknown as View | null;

    link(backRef.current, firstTab, 'down');
    chipNodes.current.forEach((node, index) => {
      link(node, backRef.current, 'up');
      link(node, firstCard, 'down');
      if (index > 0) {
        link(node, chipNodes.current[index - 1], 'left');
      }
      if (index < chipNodes.current.length - 1) {
        link(node, chipNodes.current[index + 1], 'right');
      }
    });
    link(chipNodes.current[chipNodes.current.length - 1], searchNode, 'right');
    link(searchNode, chipNodes.current[chipNodes.current.length - 1], 'left');
    link(searchNode, backRef.current, 'up');
    link(searchNode, firstCard, 'down');

    grid.forEach((rowNodes, row) => {
      rowNodes.forEach((node, column) => {
        if (!node) {
          return;
        }
        // Only the top row steps up into the tab bar; every lower row must go
        // back to the row above, otherwise the ring skips a whole row.
        link(
          node,
          row === 0
            ? chipNodes.current[Math.min(column, chipNodes.current.length - 1)]
            : grid[row - 1]?.[column],
          'up',
        );
        link(node, rowNodes[column - 1], 'left');
        link(node, rowNodes[column + 1], 'right');
        link(node, grid[row + 1]?.[column], 'down');
      });
    });

    if (showPager) {
      grid.forEach((rowNodes, row) => {
        if (row !== PAGE_ROWS - 1) {
          return;
        }
        rowNodes.forEach(node => {
          if (!node) {
            return;
          }
          if (hasNext) {
            link(node, nextRef.current, 'down');
          } else {
            link(node, prevRef.current, 'down');
          }
        });
      });
      link(prevRef.current, grid[PAGE_ROWS - 1][0], 'up');
      link(nextRef.current, grid[PAGE_ROWS - 1][PAGE_COLUMNS - 1], 'up');
      link(prevRef.current, nextRef.current, 'right');
      link(nextRef.current, prevRef.current, 'left');
    }

    const claim = claimTarget.current;
    if (!claim) {
      return;
    }
    claimTarget.current = null;
    const target =
      claim === 'pager'
        ? (hasNext ? nextRef.current : prevRef.current) ?? nextRef.current
        : chipNodes.current[0];
    if (!target) {
      return;
    }
    // New cards register with the native focus manager a frame or two after
    // they mount, so the claim has to be deferred.
    const timer = setTimeout(() => {
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
  }, [status, records, tab, showPager, hasNext]);

  const goToPage = useCallback(
    (next: number) => {
      claimTarget.current = 'pager';
      setPageIndex(Math.max(0, next));
    },
    [],
  );

  return (
    <View style={styles.root} testID="species-screen">
      <View style={styles.header}>
        <BackButton ref={backRef} label={backLabel} onPress={onBack} />
        <BrandMark />
        <Text
          style={[
            styles.count,
            {fontSize: scaleFontSize(typography.caption)},
          ]}>
          {status === 'ready' ? `${formatCount(total)} RESULTS` : ''}
        </Text>
      </View>

      <View style={styles.toolbar}>
        <View style={styles.tabs}>
          {SPECIES_TABS.map((entry, index) => (
            <Chip
              key={entry.key}
              ref={node => {
                chipNodes.current[index] = node;
              }}
              testID={`species-tab-${entry.key}`}
              label={entry.label}
              selected={tab === entry.key}
              onPress={() => selectTab(entry.key)}
            />
          ))}
        </View>
        <TextInput
          ref={searchRef}
          testID="species-search"
          value={queryDraft}
          onChangeText={setQueryDraft}
          onSubmitEditing={event => submitSearch(event.nativeEvent.text)}
          onBlur={() => {
            if (queryDraft.trim() !== query) {
              submitSearch(queryDraft);
            }
          }}
          placeholder="Search Thai or scientific name"
          placeholderTextColor={color.textMuted}
          selectionColor={color.accent}
          returnKeyType="search"
          style={[
            styles.search,
            {fontSize: scaleFontSize(typography.label)},
          ]}
        />
      </View>

      {status === 'loading' && records.length === 0 ? (
        <StateView variant="loading" testID="species-loading" />
      ) : status === 'error' ? (
        <StateView
          variant="error"
          message={errorMessage}
          onRetry={() => setReloadKey(key => key + 1)}
          testID="species-error"
        />
      ) : records.length === 0 ? (
        <StateView
          variant="empty"
          note={
            query
              ? `No species matched "${query}".`
              : 'No records in this table yet.'
          }
          testID="species-empty"
        />
      ) : (
        <>
          <TVFocusGuideView enabled style={styles.gridGuide}>
            {Array.from({length: PAGE_ROWS}, (_, row) => (
              <View key={row} style={styles.gridRow}>
                {Array.from({length: PAGE_COLUMNS}, (_, column) => {
                  const record = records[row * PAGE_COLUMNS + column];
                  if (!record) {
                    return <View key={column} style={styles.cardSlot} />;
                  }
                  const key = `${record.type ?? tab}-${record.id}`;
                  return (
                    <SpeciesCard
                      key={key}
                      ref={node => {
                        if (node) {
                          cardNodes.current.set(key, node);
                        } else {
                          cardNodes.current.delete(key);
                        }
                      }}
                      record={record}
                      testID={`species-card-${key}`}
                      onPress={() =>
                        record.type && onOpenDetail?.(record.type, record.id)
                      }
                    />
                  );
                })}
              </View>
            ))}
          </TVFocusGuideView>

          {showPager ? (
            <View style={styles.pager}>
              <Chip
                ref={prevRef}
                testID="species-prev"
                label="‹ PREVIOUS"
                disabled={pageIndex === 0}
                onPress={() => goToPage(pageIndex - 1)}
              />
              <Text
                style={[
                  styles.pageLabel,
                  {fontSize: scaleFontSize(typography.label)},
                ]}>
                {`${pageIndex + 1} / ${totalPages}`}
              </Text>
              <Chip
                ref={nextRef}
                testID="species-next"
                label="NEXT ›"
                disabled={!hasNext}
                onPress={() => goToPage(pageIndex + 1)}
              />
            </View>
          ) : null}
        </>
      )}
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
  count: {
    color: color.accent,
    fontWeight: '700',
    letterSpacing: 1,
    marginLeft: 'auto',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleWidth(space.md),
    marginTop: scaleHeight(space.xs),
  },
  tabs: {
    flexDirection: 'row',
    gap: scaleWidth(space.xs),
  },
  search: {
    flex: 1,
    maxWidth: scaleWidth(560),
    minHeight: scaleHeight(focus.target),
    marginLeft: 'auto',
    paddingHorizontal: scaleWidth(space.sm),
    borderRadius: scaleWidth(radius.pill),
    borderWidth: scaleWidth(2),
    borderColor: color.border,
    backgroundColor: color.surfaceInner,
    color: color.text,
  },
  gridGuide: {
    marginTop: scaleHeight(space.md),
    gap: scaleHeight(28),
  },
  gridRow: {
    flexDirection: 'row',
    gap: scaleWidth(45),
  },
  cardSlot: {
    width: scaleWidth(CARD_WIDTH),
  },
  card: {
    width: scaleWidth(CARD_WIDTH),
    borderRadius: scaleWidth(radius.sm),
    borderWidth: scaleWidth(focus.ringWidth / 2),
    padding: scaleWidth(12),
  },
  cardImage: {
    height: scaleWidth(CARD_IMAGE_HEIGHT),
    borderRadius: scaleWidth(radius.sm) - scaleWidth(6),
    backgroundColor: color.surfaceRaise,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  monogram: {
    color: color.accent,
    fontWeight: '800',
  },
  thaiName: {
    color: color.text,
    fontWeight: '700',
    marginTop: scaleHeight(space.xxs),
  },
  scientific: {
    color: color.textMuted,
    fontStyle: 'italic',
    marginTop: scaleHeight(2),
  },
  meta: {
    color: color.accent,
    letterSpacing: 0.5,
    marginTop: scaleHeight(2),
  },
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scaleWidth(space.md),
    marginTop: scaleHeight(28),
  },
  pageLabel: {
    color: color.textMuted,
    fontWeight: '600',
  },
});
