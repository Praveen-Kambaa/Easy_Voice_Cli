/**
 * Shared auth / profile field validation (strict, user-facing messages).
 */

/** Letters (any script) and single spaces between words — no digits or punctuation. */
const NAME_OR_PLACE_REGEX = /^[\p{L}]+(?: [\p{L}]+)*$/u;

/** Typical email: ASCII local@domain.tld; allows + and % in local part (e.g. tags). */
const EMAIL_REGEX =
  /^[a-zA-Z0-9](?:[a-zA-Z0-9._%+-]*[a-zA-Z0-9])?@[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?)+$/;

const INDIAN_MOBILE_10 = /^[6789]\d{9}$/;
const VALID_FIRST_MOBILE_DIGITS = new Set(['6', '7', '8', '9']);

/**
 * Phone input: digits only, max 10. First digit must be 6–9 or the field stays empty / invalid prefix is dropped.
 * Paste like "254..." yields '' so invalid numbers never appear in the field.
 */
export function sanitizeIndianMobileInput(text) {
  const digits = String(text || '').replace(/\D/g, '').slice(0, 10);
  if (digits.length === 0) return '';
  if (!VALID_FIRST_MOBILE_DIGITS.has(digits[0])) return '';
  return digits;
}

export function validateEmail(value) {
  const t = (value || '').trim();
  if (!t) {
    return { ok: false, message: 'Please enter your email address.' };
  }
  if (t.includes(' ') || !EMAIL_REGEX.test(t)) {
    return {
      ok: false,
      message: 'Enter a valid email (e.g. name@example.com). No spaces or invalid characters.',
    };
  }
  return { ok: true, value: t };
}

/** 10 digits only; must start with 6, 7, 8, or 9. */
export function validateIndianMobile10Digits(digits) {
  const d = String(digits || '').replace(/\D/g, '');
  if (d.length !== 10) {
    return { ok: false, message: 'Phone number must be exactly 10 digits.' };
  }
  if (!INDIAN_MOBILE_10.test(d)) {
    return { ok: false, message: 'Phone must start with 6, 7, 8, or 9.' };
  }
  return { ok: true, digits: d };
}

export function normalizePhoneToE164India(digits10) {
  return `+91${digits10}`;
}

export function validatePersonName(value, fieldLabel = 'Name') {
  const t = (value || '').trim().replace(/\s+/g, ' ');
  if (!t) {
    return { ok: false, message: `Please enter your ${fieldLabel.toLowerCase()}.` };
  }
  if (t.length < 2) {
    return { ok: false, message: `${fieldLabel} must be at least 2 characters.` };
  }
  if (!NAME_OR_PLACE_REGEX.test(t)) {
    return {
      ok: false,
      message: `${fieldLabel} may only contain letters and spaces (no numbers or special characters).`,
    };
  }
  return { ok: true, value: t };
}

export function validateCityOrState(value, fieldLabel) {
  return validatePersonName(value, fieldLabel);
}

export function validateOtp6(value) {
  const code = String(value || '').replace(/\D/g, '');
  if (code.length !== 6) {
    return { ok: false, message: 'Enter the complete 6-digit OTP.' };
  }
  return { ok: true, value: code };
}

export function passwordMeetsRules(password) {
  const p = password || '';
  return p.length >= 8 && /[A-Z]/.test(p) && /\d/.test(p);
}

export function passwordRuleMessage() {
  return 'Password: at least 8 characters, 1 uppercase letter, and 1 number.';
}

/** Strip invalid characters while typing (letters + spaces only). */
export function sanitizeLettersAndSpaces(text) {
  return String(text || '')
    .replace(/[^\p{L}\s]/gu, '')
    .replace(/\s+/g, ' ');
}
