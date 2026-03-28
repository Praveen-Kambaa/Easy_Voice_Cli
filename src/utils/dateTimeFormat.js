/**
 * Central date/time formatting for the app. Use these helpers anywhere UI shows dates or times.
 */

export const DISPLAY_LOCALE = 'en-US';

const OPTIONS_DATE_TIME = {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

const OPTIONS_TIME = {
  hour: '2-digit',
  minute: '2-digit',
};

const OPTIONS_COMPACT = {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

const OPTIONS_DATE_ONLY = {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
};

function toDate(value) {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Full display: "28 Mar 2026, 1:18 PM" */
export function formatDateTime(value) {
  const d = toDate(value);
  if (!d) return '';
  return d.toLocaleString(DISPLAY_LOCALE, OPTIONS_DATE_TIME);
}

/** Time only: "01:18 PM" */
export function formatTime(value) {
  const d = toDate(value);
  if (!d) return '';
  return d.toLocaleTimeString(DISPLAY_LOCALE, OPTIONS_TIME);
}

/** Short line for lists: "Mar 28, 1:18 PM" (no year — good for recent items) */
export function formatCompactDateTime(value) {
  const d = toDate(value);
  if (!d) return '';
  return d.toLocaleString(DISPLAY_LOCALE, OPTIONS_COMPACT);
}

/** Date without time */
export function formatDateOnly(value) {
  const d = toDate(value);
  if (!d) return '';
  return d.toLocaleDateString(DISPLAY_LOCALE, OPTIONS_DATE_ONLY);
}

/** ISO timestamp for storage */
export function nowISO() {
  return new Date().toISOString();
}
