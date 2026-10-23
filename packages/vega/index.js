/*
 * Copyright (c) 2022 Amazon.com, Inc. or its affiliates.  All rights reserved.
 *
 * PROPRIETARY/CONFIDENTIAL.  USE IS SUBJECT TO LICENSE TERMS.
 */

import { AppRegistry, LogBox } from 'react-native';
import { App } from './src/App';
import { name as appName } from './app.json';

// Every other warning and error must reach the screen: a swallowed one is how
// the dead YouTube tiles went unnoticed. Only three known-benign complaints are
// muted here.
//
// The SafeAreaView one comes from Kepler's own LogBox UI, not from this app:
// LogBoxNotificationContainer builds a `Platform.select` object literal, so the
// `android` branch probes `UIManager.hasViewManagerConfig('RCTSafeAreaView')`
// even on `kepler`, where the bridgeless stub only warns that it is unimplemented.
LogBox.ignoreLogs([
  'Text strings must be rendered within a <Text> component',
  "hasViewManagerConfig('RCTSafeAreaView') is not implemented",
  // Kepler's InitializeCore announces every debug build this way. It is not an
  // app problem, but it holds a warning notification on screen for the whole
  // session (see setUpGlobals.js).
  '************** Running debug build of JavaScript **************',
]);

AppRegistry.registerComponent(appName, () => App);
