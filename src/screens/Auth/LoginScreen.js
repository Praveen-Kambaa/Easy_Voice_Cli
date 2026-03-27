import React, { useState } from 'react';
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

const iconMuted = '#94a3b8';

const LoginScreen = ({ navigation }) => {
  const { login, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  const handleLogin = async () => {
    if (!email.trim()) {
      setError('Please enter your email.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }
    setError('');
    setIsLoading(true);
    const result = await login(email, password);
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
                  placeholderTextColor="#64748b"
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
                  placeholderTextColor="#64748b"
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
              style={[styles.loginBtn, isLoading && styles.loginBtnDisabled]}
              onPress={handleLogin}
              disabled={isLoading}
              activeOpacity={0.85}
            >
              {isLoading ? (
                <ActivityIndicator color="#0a0a0a" size="small" />
              ) : (
                <Text style={styles.loginBtnText}>Sign In</Text>
              )}
            </TouchableOpacity>

            {/* Forgot Password */}
            <TouchableOpacity
              style={styles.forgotPasswordBtn}
              onPress={() => setShowForgotPassword(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
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
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.googleIcon}>G</Text>
                )}
              </View>
              <Text style={styles.googleBtnText}>
                {isGoogleLoading ? 'Connecting...' : 'Continue with Google'}
              </Text>
            </TouchableOpacity>

            {/* Register Link */}
            <View style={styles.registerContainer}>
              <Text style={styles.registerText}>Don't have an account? </Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('Register')}
                activeOpacity={0.7}
              >
                <Text style={styles.registerLink}>Register</Text>
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

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#050505',
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 28,
  },
  headerBlock: {
    alignItems: 'center',
    marginBottom: 22,
  },
  badge: {
    backgroundColor: '#14b8a6',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 14,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#f8fafc',
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#121212',
    borderRadius: 18,
    padding: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#14b8a6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 6,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  logoImage: {
    width: 240,
    height: 120,
    borderRadius: 12,
  },
  inputGroup: {
    marginBottom: 14,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#cbd5e1',
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    borderRadius: 10,
    backgroundColor: '#0a0a0a',
    paddingHorizontal: 12,
    minHeight: 50,
  },
  inputIcon: {
    marginRight: 8,
  },
  inputError: {
    borderColor: '#f87171',
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#f1f5f9',
    paddingVertical: 12,
  },
  inputFlex: {
    flex: 1,
    fontSize: 15,
    color: '#f1f5f9',
    paddingVertical: 12,
  },
  eyeBtn: {
    paddingLeft: 8,
  },
  errorBox: {
    backgroundColor: 'rgba(248,113,113,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.35)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  errorText: {
    fontSize: 13,
    color: '#fca5a5',
    fontWeight: '500',
  },
  loginBtn: {
    backgroundColor: '#00d16b',
    borderRadius: 10,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  loginBtnDisabled: {
    opacity: 0.65,
  },
  loginBtnText: {
    color: '#0a0a0a',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  forgotPasswordBtn: {
    alignSelf: 'center',
    marginTop: 16,
  },
  forgotPasswordText: {
    color: '#2dd4bf',
    fontSize: 14,
    fontWeight: '600',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 22,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    borderRadius: 10,
    height: 52,
    paddingHorizontal: 16,
  },
  googleIconContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#4285F4',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  googleIcon: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  googleBtnText: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '600',
  },
  registerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
  },
  registerText: {
    color: '#64748b',
    fontSize: 14,
  },
  registerLink: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
  },
});

export default LoginScreen;
