import React from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import {
  Chip,
  focus,
  scaleHeight,
  scaleWidth,
  space,
} from '@multitv/shared';
import type {PodcastTheme} from '@multitv/shared';

export interface ThemeChipsProps {
  themes: PodcastTheme[];
  selectedTheme: string | null;
  onSelect: (theme: PodcastTheme) => void;
  onChipRef?: (index: number, node: View | null) => void;
  testID?: string;
}

/** Server-ordered theme rows. The app never re-sorts this list. */
export const ThemeChips = ({
  themes,
  selectedTheme,
  onSelect,
  onChipRef,
  testID = 'theme-chips',
}: ThemeChipsProps) => (
  <ScrollView
    horizontal
    showsHorizontalScrollIndicator={false}
    testID={testID}
    style={styles.root}
    contentContainerStyle={styles.row}>
    {themes.map((theme, index) => (
      <Chip
        key={theme.theme}
        ref={node => onChipRef?.(index, node)}
        label={theme.label}
        selected={theme.theme === selectedTheme}
        testID={`chip-${theme.theme}`}
        onPress={() => onSelect(theme)}
      />
    ))}
  </ScrollView>
);

const styles = StyleSheet.create({
  root: {
    height: scaleHeight(focus.target),
    flexGrow: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleWidth(space.xs),
    paddingRight: scaleWidth(space.md),
  },
});
