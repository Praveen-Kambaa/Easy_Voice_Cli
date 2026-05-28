import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildTypeEasyUrl, API_ENDPOINTS } from '../config/api';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { syncKeyboardSettingsToNative } from '../services/floatingMicConfig';

const STORAGE_KEYS = {
  USER_DATA: '@auth_user_data',
  LAST_LOGIN_RESPONSE: '@auth_last_login_response',
};

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Configure Google Sign-In
  useEffect(() => {
    GoogleSignin.configure({
      webClientId: 'YOUR_WEB_CLIENT_ID', // Replace with your actual web client ID
      // NOTE: `androidClientId` is not a valid config option on Android for this library.
      // Use `webClientId` (OAuth client type "Web application") instead.
      offlineAccess: true,
    });
  }, []);

  useEffect(() => {
    restoreSession();
  }, []);

  useEffect(() => {
    syncKeyboardSettingsToNative(user?.userId || '');
  }, [user?.userId]);

  const restoreSession = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.USER_DATA);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Backfill displayName from last login response if missing/legacy.
        let patched = parsed;
        if (!parsed?.name && (!parsed?.displayName || parsed?.displayName === parsed?.email?.split('@')?.[0])) {
          try {
            const last = await AsyncStorage.getItem(STORAGE_KEYS.LAST_LOGIN_RESPONSE);
            const lastObj = last ? JSON.parse(last) : null;
            const apiName = lastObj?.data?.data?.name || lastObj?.data?.data?.user?.name;
            if (apiName) {
              patched = {
                ...parsed,
                name: apiName,
                displayName: apiName,
              };
              await AsyncStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(patched));
            }
          } catch {
            // ignore
          }
        }
        setUser(patched);
      }
    } catch (error) {
      console.error('Failed to restore session:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      const response = await fetch(buildTypeEasyUrl(API_ENDPOINTS.AUTH.LOGIN), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.trim(),
          password: password,
        }),
      });

      const data = await response.json();
      try {
        console.log('[Auth] login response', { ok: response.ok, status: response.status, data });
        await AsyncStorage.setItem(
          STORAGE_KEYS.LAST_LOGIN_RESPONSE,
          JSON.stringify({
            at: new Date().toISOString(),
            ok: response.ok,
            status: response.status,
            data,
          }),
        );
      } catch {
        // ignore
      }

      if (response.ok && data.success) {
        const userData = {
          email: (data.email || data.user?.email || email.trim()).trim(),
          loginTime: new Date().toISOString(),
          displayName:
            data.user?.displayName ||
            data.user?.name ||
            data.name ||
            email.split('@')[0],
          name: data.user?.name || data.name,
          userId: data.userId || data.user?.id,
          token: data.token,
        };
        
        await AsyncStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(userData));
        setUser(userData);
        return { success: true };
      } else {
        return { success: false, error: data.message || 'Login failed' };
      }
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  };

  const parseJsonSafe = async (response) => {
    try {
      return await response.json();
    } catch {
      return {};
    }
  };

  const sendRegistrationOtp = async (email) => {
    try {
      const response = await fetch(buildTypeEasyUrl(API_ENDPOINTS.AUTH.SEND_OTP), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await parseJsonSafe(response);
      if (response.ok && data.success) {
        return { success: true, message: data.message };
      }
      return { success: false, error: data.message || 'Could not send OTP' };
    } catch (error) {
      console.error('sendRegistrationOtp error:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  };

  const verifyRegistrationOtp = async (email, otp) => {
    try {
      const response = await fetch(buildTypeEasyUrl(API_ENDPOINTS.AUTH.VERIFY_OTP), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), otp: String(otp).trim() }),
      });
      const data = await parseJsonSafe(response);
      if (response.ok && data.success) {
        return { success: true, message: data.message };
      }
      return { success: false, error: data.message || 'Invalid or expired OTP' };
    } catch (error) {
      console.error('verifyRegistrationOtp error:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  };

  const completeRegistration = async (payload) => {
    try {
      const response = await fetch(buildTypeEasyUrl(API_ENDPOINTS.AUTH.COMPLETE_REGISTRATION), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await parseJsonSafe(response);
      if (response.ok && data.success) {
        if (data.token) {
          const userData = {
            email: payload.email.trim(),
            loginTime: new Date().toISOString(),
            displayName: data.user?.name || payload.name,
            token: data.token,
          };
          await AsyncStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(userData));
          setUser(userData);
        }
        return {
          success: true,
          message: data.message || 'Registration completed',
          user: data.user,
          token: data.token,
        };
      }
      return { success: false, error: data.message || 'Registration failed' };
    } catch (error) {
      console.error('completeRegistration error:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  };

  const requestPasswordReset = async (email) => {
    try {
      const response = await fetch(buildTypeEasyUrl(API_ENDPOINTS.AUTH.REQUEST_RESET), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.trim(),
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        return { success: true, message: data.message || 'If the email exists, reset instructions have been sent' };
      } else {
        return { success: false, error: data.message || 'Failed to send reset instructions' };
      }
    } catch (error) {
      console.error('Password reset error:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  };

  const signInWithGoogle = async () => {
    try {
      // Check if device supports Google Play Services
      await GoogleSignin.hasPlayServices({
        showPlayServicesUpdateDialog: true,
      });

      // Sign in with Google
      const userInfo = await GoogleSignin.signIn();
      
      // Send Google token to your backend for verification
      const response = await fetch(buildTypeEasyUrl('/auth/google-signin'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          idToken: userInfo.idToken,
          email: userInfo.user.email,
          name: userInfo.user.name,
          photo: userInfo.user.photo,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        const userData = {
          email: userInfo.user.email,
          displayName: userInfo.user.name,
          photo: userInfo.user.photo,
          loginTime: new Date().toISOString(),
          token: data.token,
          isGoogleUser: true,
        };
        
        await AsyncStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(userData));
        setUser(userData);
        return { success: true };
      } else {
        // Sign out from Google if backend verification fails
        await GoogleSignin.signOut();
        return { success: false, error: data.message || 'Google sign-in verification failed' };
      }
    } catch (error) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        return { success: false, error: 'Sign-in cancelled' };
      } else if (error.code === statusCodes.IN_PROGRESS) {
        return { success: false, error: 'Sign-in is already in progress' };
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        return { success: false, error: 'Google Play Services not available' };
      } else {
        console.error('Google Sign-In error:', error);
        return { success: false, error: 'Google sign-in failed' };
      }
    }
  };

  const logout = async () => {
    try {
      // Sign out from Google if it's a Google user
      if (user?.isGoogleUser) {
        await GoogleSignin.signOut();
      }
      await AsyncStorage.removeItem(STORAGE_KEYS.USER_DATA);
    } catch (error) {
      console.error('Failed to clear session:', error);
    } finally {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        sendRegistrationOtp,
        verifyRegistrationOtp,
        completeRegistration,
        requestPasswordReset,
        signInWithGoogle,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
