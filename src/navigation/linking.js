/**
 * Deep links from the iOS keyboard extension (typeeasy://…) into React Navigation.
 */
export const appLinking = {
  prefixes: ['typeeasy://'],
  config: {
    screens: {
      Login: 'login',
      Register: 'register',
      Main: {
        screens: {
          /** Gear on custom keyboard → in-app Settings (languages, enable keyboard, etc.) */
          Settings: 'keyboard-settings',
          MainTabs: {
            screens: {
              HomeTab: 'home',
              SettingsTab: 'app-settings',
            },
          },
        },
      },
    },
  },
};
