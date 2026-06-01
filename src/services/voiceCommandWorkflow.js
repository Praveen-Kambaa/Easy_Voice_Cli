/**
 * Voice command always uses Easy Voice cloud APIs (needs voiceAssetId for execute).
 * Internal Transcribe toggle applies to general recorder / mic — not voice command.
 */
import { transcribeAudio, updateTranscript, executeVoiceCommand } from '../api/voiceApi';
import logger from '../utils/logger';

/**
 * @param {string} fileUri
 * @param {object} [options]
 * @returns {Promise<{ success: boolean, transcript?: string, voiceAssetId?: string|null, error?: string }>}
 */
export async function transcribeForVoiceCommand(fileUri, options = {}) {
  logger.info('Voice command: cloud transcribe', fileUri);
  const result = await transcribeAudio(fileUri, {
    language: 'en-US',
    enablePunctuation: true,
    enableTimestamps: false,
    ...options,
  });
  if (!result.success) {
    logger.error('Voice command transcribe failed', result.error);
    return { success: false, error: result.error || 'Transcription failed' };
  }
  const transcript =
    result.data?.refinedTranscript?.trim() ||
    result.data?.rawTranscript?.trim() ||
    '';
  if (!transcript) {
    return { success: false, error: 'No speech detected in recording.' };
  }
  logger.info('Voice command transcribe OK', {
    voiceAssetId: result.data?.voiceAssetId,
    length: transcript.length,
  });
  return {
    success: true,
    transcript,
    voiceAssetId: result.data?.voiceAssetId ?? null,
  };
}

/**
 * @param {string} voiceAssetId
 * @param {string} editedText
 * @param {string} originalTranscript
 * @param {string} [fileUri] - re-upload if asset id missing
 */
export async function executeEditedVoiceCommand(
  voiceAssetId,
  editedText,
  originalTranscript,
  fileUri,
) {
  let assetId = voiceAssetId;
  if (!assetId && fileUri) {
    logger.info('Voice command: registering recording with server (no asset id)');
    const reg = await transcribeAudio(fileUri, {
      language: 'en-US',
      enablePunctuation: true,
      enableTimestamps: false,
    });
    if (!reg.success) {
      return {
        success: false,
        error: reg.error || 'Could not register your recording for command execution.',
      };
    }
    assetId = reg.data?.voiceAssetId ?? null;
  }

  if (!assetId) {
    return { success: false, error: 'Voice asset ID is required. Check voice server URL in Settings.' };
  }

  const trimmed = (editedText ?? '').trim();
  if (!trimmed) {
    return { success: false, error: 'Transcript text cannot be empty' };
  }

  if (trimmed !== (originalTranscript ?? '').trim()) {
    logger.info('Voice command: updating transcript before execute');
    const updateResult = await updateTranscript(assetId, trimmed);
    if (!updateResult.success) {
      return { success: false, error: updateResult.error || 'Failed to update transcript' };
    }
    assetId = updateResult.data?.voiceAssetId || assetId;
  }

  logger.info('Voice command: execute', { voiceAssetId: assetId });
  const executeResult = await executeVoiceCommand(assetId, {
    executeAt: new Date().toISOString(),
  });
  if (!executeResult.success) {
    logger.error('Voice command execute failed', executeResult.error);
    return { success: false, error: executeResult.error || 'Execution failed' };
  }

  const display =
    executeResult.data?.result?.trim() ||
    executeResult.data?.status?.trim() ||
    'Command executed successfully';

  logger.info('Voice command execute OK', display.slice(0, 120));
  return { success: true, result: display, data: executeResult.data };
}
