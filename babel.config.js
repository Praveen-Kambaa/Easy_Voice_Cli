module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    // chrono-node (and other deps) use `export * as ns from "..."` in ESM builds
    '@babel/plugin-transform-export-namespace-from',
    'react-native-reanimated/plugin',
  ],
};
