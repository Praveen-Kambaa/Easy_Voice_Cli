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
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Mail, Eye, EyeOff, User, Lock, Phone, MapPin } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';

/** Match API contract; use `mobile` if your backend expects it. */
const REGISTRATION_SOURCE = 'web';

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const normalizePhone = (input) => {
  const t = input.trim();
  if (t.startsWith('+')) return t;
  const digits = t.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length >= 10) return `+${digits}`;
  return t;
};

const passwordMeetsRules = (password) =>
  password.length >= 8 && /[A-Z]/.test(password) && /\d/.test(password);

const RegisterScreen = ({ navigation }) => {
  const { sendRegistrationOtp, verifyRegistrationOtp, completeRegistration } = useAuth();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [stateRegion, setStateRegion] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const clearError = () => setError('');

  const handleSendOtp = async () => {
    if (!isValidEmail(email)) {
      setError('Please enter a valid email address.');
      return;
    }
    setError('');
    setIsLoading(true);
    const result = await sendRegistrationOtp(email);
    setIsLoading(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setStep(2);
    setOtp('');
  };

  const handleVerifyOtp = async () => {
    const code = otp.trim();
    if (code.length < 6) {
      setError('Enter the 6-digit OTP sent to your email.');
      return;
    }
    setError('');
    setIsLoading(true);
    const result = await verifyRegistrationOtp(email, code);
    setIsLoading(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setStep(3);
  };

  const handleCompleteRegistration = async () => {
    if (!name.trim()) {
      setError('Please enter your full name.');
      return;
    }
    if (!phone.trim()) {
      setError('Please enter your phone number.');
      return;
    }
    if (!city.trim()) {
      setError('Please enter your city.');
      return;
    }
    if (!stateRegion.trim()) {
      setError('Please enter your state.');
      return;
    }
    if (!passwordMeetsRules(password)) {
      setError('Password: min 8 characters, 1 uppercase letter, 1 number.');
      return;
    }

    setError('');
    setIsLoading(true);
    const result = await completeRegistration({
      email: email.trim(),
      name: name.trim(),
      phone: normalizePhone(phone),
      city: city.trim(),
      state: stateRegion.trim(),
      password,
      source: REGISTRATION_SOURCE,
    });
    setIsLoading(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    if (result.token) {
      return;
    }

    Alert.alert('Success', result.message || 'Registration completed. Please sign in.', [
      { text: 'OK', onPress: () => navigation.navigate('Login') },
    ]);
  };

  const goToDifferentEmail = () => {
    setStep(1);
    setOtp('');
    clearError();
  };

  const iconMuted = '#94a3b8';

  const renderHeader = () => (
    <View style={styles.headerBlock}>
      <View style={styles.badge}>
        <Text style={styles.badgeEmoji}>🚀</Text>
        <Text style={styles.badgeText}>REGISTER</Text>
      </View>
      <Text style={styles.title}>Create your account</Text>
      <Text style={styles.stepLabel}>Step {step} of 3</Text>
    </View>
  );

  const renderStep1 = () => (
    <>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Email Address</Text>
        <View style={[styles.inputWrapper, error && !email ? styles.inputError : null]}>
          <Mail size={18} color={iconMuted} strokeWidth={2} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Email Address"
            placeholderTextColor="#64748b"
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              clearError();
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            returnKeyType="done"
            onSubmitEditing={handleSendOtp}
          />
        </View>
      </View>
      <TouchableOpacity
        style={[styles.sendOtpBtn, isLoading && styles.btnDisabled]}
        onPress={handleSendOtp}
        disabled={isLoading}
        activeOpacity={0.85}
      >
        {isLoading ? (
          <ActivityIndicator color="#ffffff" size="small" />
        ) : (
          <Text style={styles.sendOtpBtnText}>Send OTP</Text>
        )}
      </TouchableOpacity>
      {!!error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>Or continue with</Text>
        <View style={styles.dividerLine} />
      </View>
    </>
  );

  const renderStep2 = () => (
    <>
      <Text style={styles.hintMuted}>We sent a code to</Text>
      <Text style={styles.hintEmail}>{email.trim()}</Text>
      <TouchableOpacity onPress={goToDifferentEmail} style={styles.changeEmail}>
        <Text style={styles.changeEmailText}>Use a different email</Text>
      </TouchableOpacity>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>One-time password</Text>
        <View style={[styles.inputWrapper, error && !otp ? styles.inputError : null]}>
          <TextInput
            style={[styles.input, styles.otpInput]}
            placeholder="Enter 6-digit OTP"
            placeholderTextColor="#64748b"
            value={otp}
            onChangeText={(t) => {
              setOtp(t.replace(/\D/g, '').slice(0, 8));
              clearError();
            }}
            keyboardType="number-pad"
            maxLength={6}
            returnKeyType="done"
            onSubmitEditing={handleVerifyOtp}
          />
        </View>
      </View>
      {!!error && (
        <View style={styles.errorBoxTight}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
      <TouchableOpacity
        style={[styles.verifyBtn, isLoading && styles.btnDisabled]}
        onPress={handleVerifyOtp}
        disabled={isLoading}
        activeOpacity={0.85}
      >
        {isLoading ? (
          <ActivityIndicator color="#000000" size="small" />
        ) : (
          <Text style={styles.verifyBtnText}>Verify OTP</Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.resendWrap}
        onPress={handleSendOtp}
        disabled={isLoading}
      >
        <Text style={styles.resendText}>Resend OTP</Text>
      </TouchableOpacity>
    </>
  );

  const renderStep3 = () => (
    <>
      <Text style={styles.registeringForLabel}>Registering for:</Text>
      <Text style={styles.registeringForEmail}>{email.trim()}</Text>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Full Name</Text>
        <View style={[styles.inputWrapper, error && !name ? styles.inputError : null]}>
          <User size={18} color={iconMuted} strokeWidth={2} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Full Name"
            placeholderTextColor="#64748b"
            value={name}
            onChangeText={(t) => {
              setName(t);
              clearError();
            }}
            autoCapitalize="words"
            returnKeyType="next"
          />
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Phone Number</Text>
        <View style={[styles.inputWrapper, error && !phone ? styles.inputError : null]}>
          <Phone size={18} color={iconMuted} strokeWidth={2} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Phone Number (10 digits)"
            placeholderTextColor="#64748b"
            value={phone}
            onChangeText={(t) => {
              setPhone(t);
              clearError();
            }}
            keyboardType="phone-pad"
            returnKeyType="next"
          />
        </View>
      </View>

      <View style={styles.row}>
        <View style={[styles.inputGroup, styles.rowHalf]}>
          <Text style={styles.label}>City</Text>
          <View style={[styles.inputWrapper, error && !city ? styles.inputError : null]}>
            <MapPin size={16} color={iconMuted} strokeWidth={2} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="City"
              placeholderTextColor="#64748b"
              value={city}
              onChangeText={(t) => {
                setCity(t);
                clearError();
              }}
              autoCapitalize="words"
            />
          </View>
        </View>
        <View style={[styles.inputGroup, styles.rowHalf]}>
          <Text style={styles.label}>State</Text>
          <View style={[styles.inputWrapper, error && !stateRegion ? styles.inputError : null]}>
            <MapPin size={16} color={iconMuted} strokeWidth={2} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="State"
              placeholderTextColor="#64748b"
              value={stateRegion}
              onChangeText={(t) => {
                setStateRegion(t);
                clearError();
              }}
              autoCapitalize="characters"
            />
          </View>
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Password</Text>
        <View style={[styles.inputWrapper, error && !password ? styles.inputError : null]}>
          <Lock size={18} color={iconMuted} strokeWidth={2} style={styles.inputIcon} />
          <TextInput
            style={styles.inputFlex}
            placeholder="Create Password (min 8, 1 uppercase, 1 number)"
            placeholderTextColor="#64748b"
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              clearError();
            }}
            secureTextEntry={!showPassword}
            returnKeyType="done"
            onSubmitEditing={handleCompleteRegistration}
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

      {!!error && (
        <View style={styles.errorBoxTight}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.completeBtn, isLoading && styles.btnDisabled]}
        onPress={handleCompleteRegistration}
        disabled={isLoading}
        activeOpacity={0.85}
      >
        {isLoading ? (
          <ActivityIndicator color="#0a0a0a" size="small" />
        ) : (
          <Text style={styles.completeBtnText}>Complete Registration</Text>
        )}
      </TouchableOpacity>
    </>
  );

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
          {renderHeader()}

          <View style={styles.card}>
            {step === 1 && renderStep1()}
            {step === 2 && renderStep2()}
            {step === 3 && renderStep3()}
          </View>

          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
              <Text style={styles.footerLink}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#14b8a6',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 14,
    gap: 6,
  },
  badgeEmoji: {
    fontSize: 14,
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
  stepLabel: {
    marginTop: 8,
    fontSize: 14,
    color: '#94a3b8',
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
  inputGroup: {
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  rowHalf: {
    flex: 1,
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
  inputError: {
    borderColor: '#f87171',
  },
  inputIcon: {
    marginRight: 8,
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
  otpInput: {
    letterSpacing: 6,
    fontSize: 20,
    fontWeight: '600',
  },
  eyeBtn: {
    paddingLeft: 8,
  },
  sendOtpBtn: {
    marginTop: 6,
    backgroundColor: '#000000',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#ffffff',
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendOtpBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  verifyBtn: {
    marginTop: 6,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyBtnText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '700',
  },
  completeBtn: {
    marginTop: 8,
    backgroundColor: '#00d16b',
    borderRadius: 10,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeBtnText: {
    color: '#0a0a0a',
    fontSize: 16,
    fontWeight: '800',
  },
  btnDisabled: {
    opacity: 0.65,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  dividerText: {
    marginHorizontal: 10,
    fontSize: 11,
    color: '#64748b',
  },
  hintMuted: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
  },
  hintEmail: {
    fontSize: 15,
    fontWeight: '600',
    color: '#f8fafc',
    textAlign: 'center',
    marginTop: 4,
  },
  changeEmail: {
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  changeEmailText: {
    fontSize: 13,
    color: '#2dd4bf',
    fontWeight: '600',
  },
  resendWrap: {
    alignItems: 'center',
    marginTop: 14,
  },
  resendText: {
    fontSize: 14,
    color: '#94a3b8',
    fontWeight: '600',
  },
  registeringForLabel: {
    fontSize: 13,
    color: '#94a3b8',
    marginBottom: 4,
  },
  registeringForEmail: {
    fontSize: 15,
    fontWeight: '600',
    color: '#f8fafc',
    marginBottom: 16,
  },
  errorBox: {
    backgroundColor: 'rgba(248,113,113,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.35)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 14,
  },
  errorBoxTight: {
    backgroundColor: 'rgba(248,113,113,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.35)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 13,
    color: '#fca5a5',
    fontWeight: '500',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 28,
  },
  footerText: {
    color: '#64748b',
    fontSize: 14,
  },
  footerLink: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
  },
});

export default RegisterScreen;
