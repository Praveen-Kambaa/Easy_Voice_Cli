import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildTypeEasyUrl, API_ENDPOINTS } from '../config/api';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';

const STORAGE_KEYS = {
  USER_DATA: '@auth_user_data',
};

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Configure Google Sign-In
  useEffect(() => {
    GoogleSignin.configure({
      webClientId: 'YOUR_WEB_CLIENT_ID', // Replace with your actual web client ID
      androidClientId: 'YOUR_ANDROID_CLIENT_ID', // Replace with your Android client ID
      offlineAccess: true,
    });
  }, []);

  useEffect(() => {
    restoreSession();
  }, []);

  const restoreSession = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.USER_DATA);
      if (stored) {
        setUser(JSON.parse(stored));
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

      if (response.ok && data.success) {
        const userData = {
          email: email.trim(),
          loginTime: new Date().toISOString(),
          displayName: data.user?.displayName || email.split('@')[0],
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
