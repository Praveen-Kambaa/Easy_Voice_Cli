const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  // Allow physical devices on Wi‑Fi to reach Metro (USB uses adb reverse → localhost).
  server: {
    host: '0.0.0.0',
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
