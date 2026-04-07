import { Platform } from 'react-native';
import { PERMISSIONS } from 'react-native-permissions';

/**
 * Permissions required only to pass RequiredPermissionsGate and use core voice features.
 * Keep this list small — OS quirks or partial grants on SMS/media/notifications should not lock users out.
 */
export function getAndroidBootstrapPermissionList() {
  if (Platform.OS !== 'android') {
    return [];
  }
  return [PERMISSIONS.ANDROID.RECORD_AUDIO];
}

/**
 * Full set for phone/call features (Call Logs screen). Requested when using Calls, not at cold start.
 */
export function getAndroidFeaturePermissionSpecs() {
  if (Platform.OS !== 'android') {
    return [];
  }

  const v = Platform.Version;
  const specs = [
    { perm: PERMISSIONS.ANDROID.READ_CALL_LOG, label: 'Call logs' },
    { perm: PERMISSIONS.ANDROID.READ_CONTACTS, label: 'Contacts' },
    { perm: PERMISSIONS.ANDROID.READ_PHONE_STATE, label: 'Phone' },
  ];

  if (v >= 26) {
    specs.push({ perm: PERMISSIONS.ANDROID.READ_PHONE_NUMBERS, label: 'Phone' });
  }

  specs.push(
    { perm: PERMISSIONS.ANDROID.READ_SMS, label: 'SMS' },
    { perm: PERMISSIONS.ANDROID.RECEIVE_SMS, label: 'SMS' },
    { perm: PERMISSIONS.ANDROID.SEND_SMS, label: 'SMS' },
    { perm: PERMISSIONS.ANDROID.RECORD_AUDIO, label: 'Microphone' },
  );

  if (v >= 33) {
    specs.push(
      { perm: 'android.permission.POST_NOTIFICATIONS', label: 'Notifications' },
      { perm: PERMISSIONS.ANDROID.READ_MEDIA_AUDIO, label: 'Files and media' },
      { perm: PERMISSIONS.ANDROID.READ_MEDIA_IMAGES, label: 'Files and media' },
      { perm: PERMISSIONS.ANDROID.READ_MEDIA_VIDEO, label: 'Files and media' },
    );
  } else {
    specs.push({ perm: PERMISSIONS.ANDROID.READ_EXTERNAL_STORAGE, label: 'Files and media' });
    if (v <= 28) {
      specs.push({
        perm: PERMISSIONS.ANDROID.WRITE_EXTERNAL_STORAGE,
        label: 'Files and media',
      });
    }
  }

  const seen = new Set();
  return specs.filter((s) => {
    if (seen.has(s.perm)) {
      return false;
    }
    seen.add(s.perm);
    return true;
  });
}

export function getAndroidFeaturePermissionList() {
  return getAndroidFeaturePermissionSpecs().map((s) => s.perm);
}

/** @deprecated Use getAndroidFeaturePermissionList — kept for any external imports */
export function getAndroidRuntimePermissionList() {
  return getAndroidFeaturePermissionList();
}

/**
 * UI rows: one per category (matches system permission groups users expect).
 */
export function getAndroidRuntimeCategories() {
  if (Platform.OS !== 'android') {
    return [];
  }

  const v = Platform.Version;
  const A = PERMISSIONS.ANDROID;

  const phonePerms = [A.READ_PHONE_STATE];
  if (v >= 26) {
    phonePerms.push(A.READ_PHONE_NUMBERS);
  }

  const mediaPerms =
    v >= 33
      ? [A.READ_MEDIA_AUDIO, A.READ_MEDIA_IMAGES, A.READ_MEDIA_VIDEO]
      : [A.READ_EXTERNAL_STORAGE, ...(v <= 28 ? [A.WRITE_EXTERNAL_STORAGE] : [])];

  const notifPerms = v >= 33 ? ['android.permission.POST_NOTIFICATIONS'] : [];

  return [
    ...(notifPerms.length
      ? [{ label: 'Notifications', perms: notifPerms }]
      : []),
    { label: 'Call logs', perms: [A.READ_CALL_LOG] },
    { label: 'Contacts', perms: [A.READ_CONTACTS] },
    { label: 'Phone', perms: phonePerms },
    { label: 'SMS', perms: [A.READ_SMS, A.RECEIVE_SMS, A.SEND_SMS] },
    { label: 'Microphone', perms: [A.RECORD_AUDIO] },
    { label: 'Files and media', perms: mediaPerms },
  ];
}
