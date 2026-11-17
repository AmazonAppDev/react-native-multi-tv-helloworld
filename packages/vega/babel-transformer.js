const path = require('path');
const upstreamTransformer = require('@react-native/metro-babel-transformer');

const extendsBabelConfigPath = path.resolve(__dirname, 'babel.config.js');

module.exports = {
  ...upstreamTransformer,
  transform(transformOptions) {
    return upstreamTransformer.transform({
      ...transformOptions,
      options: {
        ...transformOptions.options,
        extendsBabelConfigPath,
      },
    });
  },
};
