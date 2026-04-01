import { Alert } from 'react-native';

function defaultAlert(title, message, buttons = [{ text: 'OK' }]) {
  Alert.alert(title, message || '', buttons);
}

let customAlert = null;

export function setGlobalAlert(fn) {
  customAlert = typeof fn === 'function' ? fn : null;
}

export function resetGlobalAlert() {
  customAlert = null;
}

export function showGlobalAlert(title, message, buttons) {
  const fn = customAlert || defaultAlert;
  fn(title || '', message ?? '', buttons && buttons.length ? buttons : [{ text: 'OK' }]);
}
