import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
  NativeModules,
  AppState,
  Image,
} from 'react-native';
import {
  check,
  request,
  checkMultiple,
  requestMultiple,
  PERMISSIONS,
  RESULTS,
  openSettings,
} from 'react-native-permissions';
import { Colors } from '../theme/Colors';
import PermissionModal from './PermissionModal';
import { PERMISSION_NAMES } from '../utils/AndroidPermissions';
import { getAndroidBootstrapPermissionList } from '../utils/androidRuntimePermissions';

const { FloatingMicModule } = NativeModules;

/**
 * Some devices omit keys in checkMultiple; UNAVAILABLE means "not applicable on this device".
 * Microphone must still be GRANTED/LIMITED — never treat RECORD_AUDIO UNAVAILABLE as OK.
 */
async function resolveAndroidBootstrapPermissions(permList, forceRequest) {
  const fillMissing = async (statuses) => {
    const next = { ...statuses };
    for (const p of permList) {
      if (next[p] === undefined) {
        try {
          next[p] = await check(p);
        } catch {
          next[p] = RESULTS.DENIED;
        }
      }
    }
    return next;
  };

  const satisfied = (perm, status) => {
    if (status === RESULTS.GRANTED || status === RESULTS.LIMITED) {
      return true;
    }
    if (status === RESULTS.UNAVAILABLE) {
      return perm !== PERMISSIONS.ANDROID.RECORD_AUDIO;
    }
    return false;
  };

  let statuses = await checkMultiple(permList);
  statuses = await fillMissing(statuses);
  let runtimeOk = permList.every((p) => satisfied(p, statuses[p]));

  if (!runtimeOk && forceRequest) {
    await requestMultiple(permList);
    statuses = await checkMultiple(permList);
    statuses = await fillMissing(statuses);
    runtimeOk = permList.every((p) => satisfied(p, statuses[p]));
  }

  const blocked = permList.some((p) => statuses[p] === RESULTS.BLOCKED);
  return { runtimeOk, blocked };
}

async function checkIosMicrophone() {
  const status = await check(PERMISSIONS.IOS.MICROPHONE);
  return status === RESULTS.GRANTED || status === RESULTS.LIMITED;
}

async function requestIosMicrophone() {
  const status = await request(PERMISSIONS.IOS.MICROPHONE);
  return status === RESULTS.GRANTED || status === RESULTS.LIMITED;
}

export default function RequiredPermissionsGate({ children }) {
  const [loading, setLoading] = useState(true);
  const [runtimeComplete, setRuntimeComplete] = useState(false);
  const [runtimeHasBlocked, setRuntimeHasBlocked] = useState(false);
  const [overlay, setOverlay] = useState(false);
  const [recordAudio, setRecordAudio] = useState(false);
  const [accessibility, setAccessibility] = useState(false);
  const [allGranted, setAllGranted] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [permModal, setPermModal] = useState(null);

  const runCheck = useCallback(async (options = {}) => {
    const showLoading = options.showLoading !== false;
    const forceRuntimeRequest = options.forceRuntimeRequest === true;

    if (showLoading) {
      setLoading(true);
    }

    if (Platform.OS === 'ios') {
      try {
        const ok = await checkIosMicrophone();
        setAllGranted(ok);
        setRecordAudio(ok);
        setOverlay(true);
        setAccessibility(true);
        setRuntimeComplete(true);
      } catch (e) {
        console.error('RequiredPermissionsGate iOS check:', e);
        setAllGranted(false);
      } finally {
        if (showLoading) {
          setLoading(false);
        }
      }
      return;
    }

    if (Platform.OS !== 'android') {
      setAllGranted(true);
      setRuntimeComplete(true);
      if (showLoading) {
        setLoading(false);
      }
      return;
    }

    const permList = getAndroidBootstrapPermissionList();
    let runtimeOk = true;

    try {
      if (permList.length > 0) {
        const { runtimeOk: ok, blocked } = await resolveAndroidBootstrapPermissions(
          permList,
          forceRuntimeRequest,
        );
        runtimeOk = ok;
        setRuntimeHasBlocked(blocked);
      } else {
        setRuntimeHasBlocked(false);
      }
      setRuntimeComplete(runtimeOk);
    } catch (e) {
      console.error('RequiredPermissionsGate runtime check:', e);
      setRuntimeComplete(false);
      setRuntimeHasBlocked(false);
      runtimeOk = false;
    }

    if (!runtimeOk) {
      setAllGranted(false);
      if (showLoading) {
        setLoading(false);
      }
      return;
    }

    if (typeof FloatingMicModule?.checkPermissions !== 'function') {
      setOverlay(true);
      setRecordAudio(true);
      setAccessibility(true);
      setAllGranted(true);
      if (showLoading) {
        setLoading(false);
      }
      return;
    }

    try {
      const perms = await FloatingMicModule.checkPermissions();
      setOverlay(!!perms.overlay);
      setRecordAudio(!!perms.recordAudio);
      setAccessibility(!!perms.accessibility);
      setAllGranted(!!perms.allGranted);
    } catch (e) {
      console.error('RequiredPermissionsGate Android check:', e);
      setAllGranted(false);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    runCheck({ showLoading: true, forceRuntimeRequest: true });
  }, [runCheck]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        return;
      }
      runCheck({ showLoading: !allGranted, forceRuntimeRequest: false });
    });
    return () => sub.remove();
  }, [runCheck, allGranted]);

  const retryRuntimeWithSystemDialogs = useCallback(async () => {
    setActionBusy(true);
    try {
      await runCheck({ showLoading: true, forceRuntimeRequest: true });
    } finally {
      setActionBusy(false);
    }
  }, [runCheck]);

  const openOverlayFromModal = async () => {
    if (typeof FloatingMicModule?.openOverlaySettings !== 'function') {
      return;
    }
    setActionBusy(true);
    try {
      await FloatingMicModule.openOverlaySettings();
    } finally {
      setActionBusy(false);
    }
  };

  const openAccessibilityFromModal = async () => {
    if (typeof FloatingMicModule?.openAccessibilitySettings !== 'function') {
      return;
    }
    setActionBusy(true);
    try {
      await FloatingMicModule.openAccessibilitySettings();
    } finally {
      setActionBusy(false);
    }
  };

  const requestIosMic = async () => {
    setActionBusy(true);
    try {
      await requestIosMicrophone();
      await runCheck({ showLoading: false, forceRuntimeRequest: false });
    } finally {
      setActionBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Image
          source={require('../assets/splashscreen.png')}
          style={styles.splashImage}
          resizeMode="contain"
        />
        <ActivityIndicator size="large" color={Colors.text.white} style={styles.loader} />
      </View>
    );
  }

  if (allGranted) {
    return children;
  }

  if (Platform.OS === 'ios') {
    return (
      <View style={styles.blockContainer}>
        <Image
          source={require('../assets/splashscreen.png')}
          style={styles.blockLogo}
          resizeMode="contain"
        />
        <Text style={styles.blockTitle}>Microphone required</Text>
        <Text style={styles.blockBody}>
          This app needs microphone access to continue. Tap below to allow, then you can use the app.
        </Text>
        <TouchableOpacity
          style={[styles.primaryBtn, actionBusy && styles.btnDisabled]}
          onPress={requestIosMic}
          disabled={actionBusy}
          activeOpacity={0.85}
        >
          {actionBusy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>Allow microphone</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  if (Platform.OS === 'android' && !runtimeComplete) {
    return (
      <View style={styles.blockContainer}>
        <Image
          source={require('../assets/splashscreen.png')}
          style={styles.blockLogo}
          resizeMode="contain"
        />
        <Text style={styles.blockTitle}>Microphone access needed</Text>
        <Text style={styles.blockBody}>
          The app needs microphone permission to continue. Tap Try again to open the system prompt, or open
          Settings if microphone access was denied for this app.
        </Text>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.primaryBtn, actionBusy && styles.btnDisabled]}
            onPress={retryRuntimeWithSystemDialogs}
            disabled={actionBusy}
            activeOpacity={0.85}
          >
            {actionBusy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Try again</Text>
            )}
          </TouchableOpacity>
          {runtimeHasBlocked && (
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => openSettings().catch(() => {})}
              disabled={actionBusy}
            >
              <Text style={styles.secondaryBtnText}>Open app settings</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.blockContainer}>
      <Image
        source={require('../assets/splashscreen.png')}
        style={styles.blockLogo}
        resizeMode="contain"
      />
      <Text style={styles.blockTitle}>Overlay and accessibility</Text>
      <Text style={styles.blockBody}>
        For display over other apps and accessibility, use the buttons below. After each change, return here —
        we recheck when you come back.
      </Text>

      <View style={styles.list}>
        <Row ok={overlay} label="Display over other apps" />
        <Row ok={accessibility} label="Accessibility service" />
        <Row ok={recordAudio} label="Microphone" />
      </View>

      <View style={styles.actions}>
        {!overlay && (
          <TouchableOpacity
            style={[styles.primaryBtn, actionBusy && styles.btnDisabled]}
            onPress={() => setPermModal('overlay')}
            disabled={actionBusy}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryBtnText}>Allow display over other apps</Text>
          </TouchableOpacity>
        )}
        {overlay && !accessibility && (
          <TouchableOpacity
            style={[styles.primaryBtn, actionBusy && styles.btnDisabled]}
            onPress={() => setPermModal('accessibility')}
            disabled={actionBusy}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryBtnText}>Allow accessibility service</Text>
          </TouchableOpacity>
        )}
        {overlay && accessibility && !recordAudio && (
          <>
            <TouchableOpacity
              style={[styles.primaryBtn, actionBusy && styles.btnDisabled]}
              onPress={retryRuntimeWithSystemDialogs}
              disabled={actionBusy}
              activeOpacity={0.85}
            >
              {actionBusy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Allow microphone</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => openSettings().catch(() => {})}
              disabled={actionBusy}
            >
              <Text style={styles.secondaryBtnText}>Open app settings (if mic was denied)</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <TouchableOpacity
        style={styles.secondaryBtn}
        onPress={async () => {
          setLoading(true);
          await runCheck({ showLoading: true, forceRuntimeRequest: false });
        }}
        disabled={actionBusy}
      >
        <Text style={styles.secondaryBtnText}>Check again</Text>
      </TouchableOpacity>

      <PermissionModal
        visible={permModal === 'overlay'}
        permissionType={PERMISSION_NAMES.OVERLAY}
        loading={actionBusy}
        onCancel={() => setPermModal(null)}
        onConfirm={async () => {
          await openOverlayFromModal();
          setPermModal(null);
        }}
      />
      <PermissionModal
        visible={permModal === 'accessibility'}
        permissionType={PERMISSION_NAMES.ACCESSIBILITY}
        loading={actionBusy}
        onCancel={() => setPermModal(null)}
        onConfirm={async () => {
          await openAccessibilityFromModal();
          setPermModal(null);
        }}
      />
    </View>
  );
}

function Row({ ok, label }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowIcon, ok ? styles.rowIconOk : styles.rowIconPending]}>
        {ok ? '✓' : '○'}
      </Text>
      <Text style={[styles.rowLabel, ok && styles.rowLabelOk]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  splashImage: {
    flex: 1,
    width: '100%',
  },
  loader: {
    position: 'absolute',
    bottom: 48,
    alignSelf: 'center',
  },
  blockContainer: {
    flex: 1,
    backgroundColor: '#000000',
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 32,
  },
  blockLogo: {
    width: '100%',
    height: 120,
    marginBottom: 24,
  },
  blockTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.text.white,
    marginBottom: 12,
    textAlign: 'center',
  },
  blockBody: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.75)',
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 28,
  },
  list: {
    marginBottom: 28,
    gap: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  rowIcon: {
    fontSize: 18,
    width: 24,
    textAlign: 'center',
  },
  rowIconOk: {
    color: Colors.status.granted,
  },
  rowIconPending: {
    color: 'rgba(255,255,255,0.35)',
  },
  rowLabel: {
    flex: 1,
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
  },
  rowLabelOk: {
    color: Colors.status.granted,
  },
  actions: {
    gap: 12,
    marginBottom: 16,
  },
  primaryBtn: {
    backgroundColor: Colors.primaryLight,
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    color: Colors.text.white,
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 15,
    fontWeight: '500',
  },
});
