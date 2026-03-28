/**
 * Local history entries (translation history, speech history, activity log) older than this
 * are removed automatically. Saved translations (starred) are stored separately and never pruned.
 */
export const LOCAL_HISTORY_RETENTION_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * @param {Array<{ createdAt?: string }>} entries
 * @param {number} retentionMs
 * @param {string} [dateKey='createdAt']
 * @returns {any[]}
 */
export function filterEntriesWithinRetention(entries, retentionMs, dateKey = 'createdAt') {
  const cutoff = Date.now() - retentionMs;
  return entries.filter((e) => {
    const t = new Date(e[dateKey]).getTime();
    return Number.isFinite(t) && t >= cutoff;
  });
}
