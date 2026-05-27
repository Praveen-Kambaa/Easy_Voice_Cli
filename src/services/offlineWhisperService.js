import { FileSystem, Dirs } from 'react-native-file-access';
import { initWhisper } from 'whisper.rn';

const MODEL_DIR = `${Dirs.DocumentDir}/whisper_models`;
// Multilingual tiny model (works for Tamil, etc). English-only models end with `.en`.
const MODEL_NAME = 'ggml-tiny.bin';
const MODEL_PATH = `${MODEL_DIR}/${MODEL_NAME}`;

// Stable model source (77MB). Download once, then run fully offline.
const MODEL_URL =
  'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin?download=true';

/** @type {Promise<any> | null} */
let whisperContextPromise = null;

async function ensureModelPresent(onProgress) {
  const dirExists = await FileSystem.exists(MODEL_DIR);
  if (!dirExists) {
    await FileSystem.mkdir(MODEL_DIR);
  }

  const exists = await FileSystem.exists(MODEL_PATH);
  if (exists) return MODEL_PATH;

  const res = await FileSystem.fetch(
    MODEL_URL,
    { method: 'GET', path: MODEL_PATH },
    typeof onProgress === 'function' ? onProgress : undefined,
  );

  if (!res?.ok) {
    // Clean up partial file if any
    try {
      const stillThere = await FileSystem.exists(MODEL_PATH);
      if (stillThere) await FileSystem.unlink(MODEL_PATH);
    } catch {
      // ignore
    }
    throw new Error(`Failed to download offline model (HTTP ${res?.status || '?'})`);
  }

  return MODEL_PATH;
}

async function ensureWhisperContext(modelPath) {
  if (whisperContextPromise) return whisperContextPromise;

  whisperContextPromise = (async () => {
    const ctx = await initWhisper({ filePath: modelPath });
    return ctx;
  })();

  return whisperContextPromise;
}

export const offlineWhisperService = {
  /**
   * Offline Whisper transcription for a local file path or file:// URI.
   * Downloads and caches the model on first run, then works offline.
   *
   * @param {string} audioFilePathOrUri
   * @param {{ language?: string, onModelDownloadProgress?: (bytesRead:number, contentLength:number, done:boolean)=>void }} [opts]
   */
  async transcribeFile(audioFilePathOrUri, opts = {}) {
    if (!audioFilePathOrUri) {
      throw new Error('Audio file path is required');
    }

    const modelPath = await ensureModelPresent(opts.onModelDownloadProgress);
    const ctx = await ensureWhisperContext(modelPath);

    const { promise } = ctx.transcribe(audioFilePathOrUri, {
      // whisper.cpp language codes are ISO-639-1 (e.g. 'en', 'ta') or 'auto'
      language: opts.language || 'auto',
    });

    const { result } = await promise;
    return String(result ?? '').trim();
  },
};

