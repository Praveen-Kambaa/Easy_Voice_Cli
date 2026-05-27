import { parse } from 'chrono-node';

const MIN_LEAD_MS = 10_000;

/**
 * Find a single reminder time in free-form English text (from voice transcription).
 * @param {string} text
 * @param {Date} [referenceDate]
 * @returns {{ date: Date | null, error: string | null, hint: string | null }}
 */
export function parseReminderFromTranscript(text, referenceDate = new Date()) {
  if (text == null || !String(text).trim()) {
    return { date: null, error: 'No text to read a date from.', hint: null };
  }

  const t = String(text).trim();
  const ref = referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime()) ? referenceDate : new Date();
  let results;
  try {
    results = parse(t, ref);
  } catch (e) {
    return { date: null, error: 'Could not understand the date in your message.', hint: e?.message };
  }

  if (!results.length) {
    return {
      date: null,
      error:
        'Could not find a time or date. Say it in your message, e.g. "tomorrow at 3 PM" or "April 30th at 5 in the morning".',
      hint: null,
    };
  }

  const dates = results
    .map((r) => (r.start ? r.start.date() : null))
    .filter((d) => d && !Number.isNaN(d.getTime()));

  if (!dates.length) {
    return { date: null, error: 'No valid date could be read from the text.', hint: null };
  }

  const now = ref.getTime();
  const future = dates
    .filter((d) => d.getTime() > now + MIN_LEAD_MS)
    .sort((a, b) => a - b);
  if (future.length) {
    return { date: future[0], error: null, hint: null };
  }

  // Times may be "today" but already past — nudge to tomorrow if the parse looks time-only
  const first = dates.sort((a, b) => a - b)[0];
  const bumped = new Date(first);
  bumped.setDate(bumped.getDate() + 1);
  if (bumped.getTime() > now + MIN_LEAD_MS) {
    return {
      date: bumped,
      error: null,
      hint: 'The time you said already passed today; we set it for the same time tomorrow.',
    };
  }

  return {
    date: null,
    error: 'The time in your message is already in the past. Change the text below or adjust the time.',
    hint: null,
  };
}
