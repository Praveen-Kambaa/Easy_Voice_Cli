import { useState, useEffect } from 'react';
import { NativeModules, Platform } from 'react-native';
import { APP_VERSION_FALLBACK } from '../constants';

const { AndroidPermissionsModule } = NativeModules;

export const useAppVersion = () => {
  const [version, setVersion] = useState(APP_VERSION_FALLBACK);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        if (Platform.OS === 'android' && AndroidPermissionsModule?.getAppVersion) {
          const v = await AndroidPermissionsModule.getAppVersion();
          if (!cancelled && typeof v === 'string' && v.length > 0) {
            setVersion(v);
          }
        }
      } catch {
        // keep fallback
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { version, loading };
};
