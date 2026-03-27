/**
 * Standard shape for voiceApi and similar callers: { success, data, error }.
 */
export function createResponse(success, data, error = null) {
  return { success, data, error };
}
