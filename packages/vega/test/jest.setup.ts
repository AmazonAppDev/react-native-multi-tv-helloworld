/* global jest */
// The Kepler jest setup doesn't provide NativeDeviceInfo constants for stock react-native,
// so Dimensions.get() fails at import time in shared code. Provide a 1080p TV screen.
const dims = {width: 1920, height: 1080, scale: 1, fontScale: 1};
jest.mock('react-native/Libraries/Utilities/NativeDeviceInfo', () => ({
  __esModule: true,
  default: {
    getConstants: () => ({Dimensions: {window: dims, screen: dims}}),
  },
}));
