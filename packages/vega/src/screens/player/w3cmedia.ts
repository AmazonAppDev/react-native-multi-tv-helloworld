/**
 * Deep imports on purpose. The w3cmedia package root also pulls in its
 * media-controls UI, and that UI's `SliderMetaData` calls `forwardRef` with a
 * one-parameter render function. React 19 reports that as an error, so the dev
 * LogBox lands on top of the TV screen the moment this player is imported. We
 * build our own transport and never render those controls, so import only the
 * player and its enums.
 */
export {AudioPlayer} from '@amazon-devices/react-native-w3cmedia/dist/interface/AudioPlayer';
export {
  AudioContentType,
  AudioUsageType,
} from '@amazon-devices/react-native-w3cmedia/dist/interface/MediaTypes';
