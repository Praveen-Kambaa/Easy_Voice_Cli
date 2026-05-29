import React, { useState, useCallback, useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Mail, Eye, EyeOff, Lock } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import ForgotPasswordModal from '../../components/ForgotPasswordModal';
import { validateEmail } from '../../utils/authValidation';
import { isGlobalAlertModalVisible } from '../../utils/alertModalState';
import { useTheme } from '../../context/ThemeContext';
import { getAuthStyleDefs } from '../../theme/authStyleDefs';

const LoginScreen = ({ navigation }) => {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => StyleSheet.create(getAuthStyleDefs(colors, isDark)), [colors, isDark]);
  const iconMuted = colors.text.secondary;
  const { login, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let raf2;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          if (!isGlobalAlertModalVisible()) {
            setError('');
          }
        });
      });
      return () => {
        cancelAnimationFrame(raf1);
        if (raf2 != null) {
          cancelAnimationFrame(raf2);
        }
      };
    }, []),
  );

  const handleLogin = async () => {
    const emailCheck = validateEmail(email);
    if (!emailCheck.ok) {
      setError(emailCheck.message);
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }
    setError('');
    setIsLoading(true);
    const result = await login(emailCheck.value, password);
    setIsLoading(false);
    if (!result.success) {
      setError(result.error);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setIsGoogleLoading(true);
    const result = await signInWithGoogle();
    setIsGoogleLoading(false);
    if (!result.success) {
      setError(result.error);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <View style={styles.logoContainer}>
              <Image
                source={require('../../assets/splashscreen.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email</Text>
              <View style={[styles.inputWrapper, error && !email ? styles.inputError : null]}>
                <Mail size={18} color={iconMuted} strokeWidth={2} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Enter email"
                  placeholderTextColor={colors.text.light}
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    setError('');
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  returnKeyType="next"
                />
              </View>
            </View>

            {/* Password */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={[styles.inputWrapper, error && email && !password ? styles.inputError : null]}>
                <Lock size={18} color={iconMuted} strokeWidth={2} style={styles.inputIcon} />
                <TextInput
                  style={styles.inputFlex}
                  placeholder="Enter password"
                  placeholderTextColor={colors.text.light}
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    setError('');
                  }}
                  secureTextEntry={!showPassword}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword((v) => !v)}
                  style={styles.eyeBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  {showPassword ? (
                    <EyeOff size={20} color={iconMuted} strokeWidth={2} />
                  ) : (
                    <Eye size={20} color={iconMuted} strokeWidth={2} />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* Error message */}
            {!!error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Login button */}
            <TouchableOpacity
              style={[styles.primaryBtn, isLoading && styles.primaryBtnDisabled]}
              onPress={handleLogin}
              disabled={isLoading}
              activeOpacity={0.85}
            >
              {isLoading ? (
                <ActivityIndicator color={colors.text.white} size="small" />
              ) : (
                <Text style={styles.primaryBtnText}>Sign In</Text>
              )}
            </TouchableOpacity>

            {/* Forgot Password */}
            <TouchableOpacity
              style={styles.linkBtn}
              onPress={() => setShowForgotPassword(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.linkText}>Forgot Password?</Text>
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.dividerContainer}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Google Sign In */}
            <TouchableOpacity
              style={styles.googleBtn}
              onPress={handleGoogleSignIn}
              disabled={isGoogleLoading}
              activeOpacity={0.85}
            >
              <View style={styles.googleIconContainer}>
                {isGoogleLoading ? (
                  <ActivityIndicator size="small" color={colors.text.white} />
                ) : (
                  <Text style={styles.googleIcon}>G</Text>
                )}
              </View>
              <Text style={styles.googleBtnText}>
                {isGoogleLoading ? 'Connecting...' : 'Continue with Google'}
              </Text>
            </TouchableOpacity>

            {/* Register Link */}
            <View style={styles.footerRow}>
              <Text style={styles.footerText}>Don't have an account? </Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('Register')}
                activeOpacity={0.7}
              >
                <Text style={styles.footerLink}>Register</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Forgot Password Modal */}
      <ForgotPasswordModal
        visible={showForgotPassword}
        onClose={() => setShowForgotPassword(false)}
      />
    </SafeAreaView>
  );
};

export default LoginScreen;
