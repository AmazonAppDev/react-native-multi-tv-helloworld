/*
 * Copyright (c) 2022 Amazon.com, Inc. or its affiliates.  All rights reserved.
 *
 * PROPRIETARY/CONFIDENTIAL.  USE IS SUBJECT TO LICENSE TERMS.
 */

import React from 'react';
import {StyleSheet, View} from 'react-native';
import {AppNavigator} from './navigation/AppNavigator';
import {RemoteOverlay} from './navigation/RemoteOverlay';
import {useRemoteSelect} from './navigation/useRemoteSelect';

export const App = () => {
  useRemoteSelect();

  return (
    <View style={styles.root}>
      <AppNavigator />
      <RemoteOverlay />
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
