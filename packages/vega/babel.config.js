/*
 * Copyright (c) 2022 Amazon.com, Inc. or its affiliates.  All rights reserved.
 *
 * PROPRIETARY/CONFIDENTIAL.  USE IS SUBJECT TO LICENSE TERMS.
 */
module.exports = {
  presets: [
    [
      'module:@react-native/babel-preset',
    ],
    'module:@amazon-devices/kepler-module-resolver-preset', // Enables usage of VegaModuleResolverPreset
  ]
};
