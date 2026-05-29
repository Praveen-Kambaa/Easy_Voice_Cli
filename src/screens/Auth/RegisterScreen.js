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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Mail, Eye, EyeOff, User, Lock, Phone, MapPin } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { useAlert } from '../../context/AlertContext';
import {
  validateEmail,
  validateIndianMobile10Digits,
  normalizePhoneToE164India,
  validatePersonName,
  validateCityOrState,
  validateOtp6,
  passwordMeetsRules,
  passwordRuleMessage,
  sanitizeLettersAndSpaces,
  sanitizeIndianMobileInput,
} from '../../utils/authValidation';
import { isGlobalAlertModalVisible } from '../../utils/alertModalState';
import { useTheme } from '../../context/ThemeContext';
import { getRegisterStyleDefs } from '../../theme/authStyleDefs';

/** Match API contract; use `mobile` if your backend expects it. */
const REGISTRATION_SOURCE = 'web';

const RegisterScreen = ({ navigation }) => {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => StyleSheet.create(getRegisterStyleDefs(colors, isDark)), [colors, isDark]);
  const showAlert = useAlert();
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

  const clearError = () => setError('');

  const handleSendOtp = async () => {
    const emailCheck = validateEmail(email);
    if (!emailCheck.ok) {
      setError(emailCheck.message);
      return;
    }
    setError('');
    setIsLoading(true);
    const result = await sendRegistrationOtp(emailCheck.value);
    setIsLoading(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setEmail(emailCheck.value);
    setStep(2);
    setOtp('');
  };

  const handleVerifyOtp = async () => {
    const otpCheck = validateOtp6(otp);
    if (!otpCheck.ok) {
      setError(otpCheck.message);
      return;
    }
    const code = otpCheck.value;
    setError('');
    setIsLoading(true);
    const result = await verifyRegistrationOtp(email.trim(), code);
    setIsLoading(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setStep(3);
  };

  const handleCompleteRegistration = async () => {
    const nameCheck = validatePersonName(name, 'Full name');
    if (!nameCheck.ok) {
      setError(nameCheck.message);
      return;
    }
    const phoneCheck = validateIndianMobile10Digits(phone);
    if (!phoneCheck.ok) {
      setError(phoneCheck.message);
      return;
    }
    const cityCheck = validateCityOrState(city, 'City');
    if (!cityCheck.ok) {
      setError(cityCheck.message);
      return;
    }
    const stateCheck = validateCityOrState(stateRegion, 'State');
    if (!stateCheck.ok) {
      setError(stateCheck.message);
      return;
    }
    if (!passwordMeetsRules(password)) {
      setError(passwordRuleMessage());
      return;
    }

    setError('');
    setIsLoading(true);
    const result = await completeRegistration({
      email: email.trim(),
      name: nameCheck.value,
      phone: normalizePhoneToE164India(phoneCheck.digits),
      city: cityCheck.value,
      state: stateCheck.value,
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

    showAlert('Success', result.message || 'Registration completed. Please sign in.', [
      { text: 'OK', onPress: () => navigation.navigate('Login') },
    ]);
  };

  const goToDifferentEmail = () => {
    setStep(1);
    setOtp('');
    clearError();
  };

  const iconMuted = colors.text.secondary;

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
            placeholderTextColor={colors.text.light}
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
          <ActivityIndicator color={colors.text.white} size="small" />
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
            placeholderTextColor={colors.text.light}
            value={otp}
            onChangeText={(t) => {
              setOtp(t.replace(/\D/g, '').slice(0, 6));
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
          <ActivityIndicator color={colors.text.primary} size="small" />
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
            placeholderTextColor={colors.text.light}
            value={name}
            onChangeText={(t) => {
              setName(sanitizeLettersAndSpaces(t));
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
            placeholder="10 digits, starts with 6–9"
            placeholderTextColor={colors.text.light}
            value={phone}
            onChangeText={(t) => {
              setPhone(sanitizeIndianMobileInput(t));
              clearError();
            }}
            keyboardType="number-pad"
            maxLength={10}
            textContentType="telephoneNumber"
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
              placeholderTextColor={colors.text.light}
              value={city}
              onChangeText={(t) => {
                setCity(sanitizeLettersAndSpaces(t));
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
              placeholderTextColor={colors.text.light}
              value={stateRegion}
              onChangeText={(t) => {
                setStateRegion(sanitizeLettersAndSpaces(t));
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
            placeholderTextColor={colors.text.light}
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
          <ActivityIndicator color={colors.text.white} size="small" />
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

export default RegisterScreen;
