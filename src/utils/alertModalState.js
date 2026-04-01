/**
 * Tracks whether the app-wide AlertModal (AlertContext) is visible so screens can
 * avoid resetting UI underneath while the user is in a popup (e.g. Voice Command).
 */

let globalAlertModalVisible = false;

export function setGlobalAlertModalVisible(visible) {
  globalAlertModalVisible = !!visible;
}

export function isGlobalAlertModalVisible() {
  return globalAlertModalVisible;
}
