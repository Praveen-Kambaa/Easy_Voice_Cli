/**
 * Google Sign-In (iOS + Android)
 *
 * Option A — Firebase (recommended for iOS):
 *   1. https://console.firebase.google.com → your project → Project settings
 *   2. Add an iOS app with bundle ID: com.type.easy
 *   3. Download GoogleService-Info.plist → place at ios/evcli/GoogleService-Info.plist
 *   4. Open ios/evcli.xcworkspace in Xcode → drag the plist into the evcli target
 *   5. Copy CLIENT_ID values below from that file (or leave iosClientId empty if plist is in Xcode)
 *
 * Option B — Google Cloud Console only:
 *   1. https://console.cloud.google.com/apis/credentials
 *   2. Create OAuth client → Web application → paste as GOOGLE_WEB_CLIENT_ID
 *   3. Create OAuth client → iOS (bundle com.type.easy) → paste as GOOGLE_IOS_CLIENT_ID
 *   4. Add URL scheme to Info.plist: REVERSED_CLIENT_ID from the iOS client (see library docs)
 */

/** OAuth 2.0 Web client ID (ends with .apps.googleusercontent.com) — required for backend idToken */
export const GOOGLE_WEB_CLIENT_ID = '';

/** iOS OAuth client ID — required on iOS if GoogleService-Info.plist is not in the Xcode project */
export const GOOGLE_IOS_CLIENT_ID = '';

export function isGoogleSignInConfigured() {
  const hasWeb = Boolean(GOOGLE_WEB_CLIENT_ID && !GOOGLE_WEB_CLIENT_ID.includes('YOUR_'));
  const hasIos = Boolean(GOOGLE_IOS_CLIENT_ID && !GOOGLE_IOS_CLIENT_ID.includes('YOUR_'));
  return hasWeb || hasIos;
}
