/**
 * The on-screen remote for the Vega Virtual Device.
 *
 * This AVD has no remote widget and the emulator's TV-remote pane refuses to
 * open (`hw.dPad = false`), so a demo has no way to move the focus ring except
 * the host keyboard. The panel below does what the keyboard does, through the
 * same code paths: the arrows walk the graph `useRemoteSelect` mirrors, OK
 * presses the focused control, and HOME / BACK / MENU ask the navigator.
 *
 * It stays out of the focus graph (`focusable={false}`), so the ring can never
 * land on it, and it only reacts to touch.
 */

import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {color, radius, scaleFontSize, scaleWidth} from '@multitv/shared';
import type {RemoteDirection} from './useRemoteSelect';
import {activateRemoteFocus, moveRemoteFocus} from './useRemoteSelect';
import {remoteBack, remoteHome, remoteMenu} from './remoteActions';

/** Panel geometry in design units; the 1920-wide canvas scales it down. */
const PANEL_WIDTH = 200;
const KEY = 56;
const SMALL_KEY = 56;
const GAP = 8;

interface RemoteKeyProps {
  label: string;
  onPress: () => void;
  /** OK carries the accent fill; the pill row is shorter than the D-pad. */
  accent?: boolean;
  small?: boolean;
}

const RemoteKey = ({label, onPress, accent, small}: RemoteKeyProps) => (
  <Pressable
    focusable={false}
    onPress={onPress}
    style={({pressed}) => [
      styles.key,
      small && styles.keySmall,
      accent && styles.keyAccent,
      pressed && styles.keyPressed,
    ]}>
    <Text
      numberOfLines={1}
      style={[styles.keyLabel, small && styles.keyLabelSmall, accent && styles.keyLabelAccent]}>
      {label}
    </Text>
  </Pressable>
);

const move = (direction: RemoteDirection) => () => moveRemoteFocus(direction);

export const RemoteOverlay = () => (
  <View pointerEvents="box-none" style={styles.container}>
    <View style={styles.panel}>
      <View style={styles.row}>
        <View style={styles.spacer} />
        <RemoteKey label="▲" onPress={move('up')} />
        <View style={styles.spacer} />
      </View>
      <View style={[styles.row, styles.rowGap]}>
        <RemoteKey label="◀" onPress={move('left')} />
        <RemoteKey label="OK" onPress={activateRemoteFocus} accent />
        <RemoteKey label="▶" onPress={move('right')} />
      </View>
      <View style={[styles.row, styles.rowGap]}>
        <View style={styles.spacer} />
        <RemoteKey label="▼" onPress={move('down')} />
        <View style={styles.spacer} />
      </View>
      <View style={[styles.row, styles.rowGap, styles.pillRow]}>
        <RemoteKey label="BACK" onPress={remoteBack} small />
        <RemoteKey label="HOME" onPress={remoteHome} small />
        <RemoteKey label="MENU" onPress={remoteMenu} small />
      </View>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
  },
  panel: {
    width: scaleWidth(PANEL_WIDTH),
    marginBottom: scaleWidth(20),
    paddingVertical: scaleWidth(GAP * 2),
    paddingHorizontal: scaleWidth(GAP),
    backgroundColor: 'rgba(0, 31, 22, 0.92)',
    borderLeftWidth: scaleWidth(2),
    borderLeftColor: color.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowGap: {
    marginTop: scaleWidth(GAP),
  },
  spacer: {
    width: scaleWidth(KEY),
  },
  key: {
    width: scaleWidth(KEY),
    height: scaleWidth(KEY),
    borderRadius: scaleWidth(radius.sm),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.surfaceInner,
    borderWidth: scaleWidth(2),
    borderColor: color.border,
  },
  keySmall: {
    width: scaleWidth(SMALL_KEY),
    height: scaleWidth(38),
  },
  keyAccent: {
    backgroundColor: color.accentSoft,
    borderColor: color.accent,
  },
  keyPressed: {
    backgroundColor: color.surfaceRaise,
  },
  keyLabel: {
    color: color.text,
    fontSize: scaleFontSize(24),
    fontWeight: '600',
  },
  keyLabelSmall: {
    fontSize: scaleFontSize(15),
  },
  keyLabelAccent: {
    color: color.accent,
  },
  pillRow: {
    marginTop: scaleWidth(GAP * 2),
  },
});
