import { API_CONFIG } from './config';

export const uploadAudio = async (filePath) => {
  try {
    const formData = new FormData();
    formData.append('audio', {
      uri: filePath,
      type: 'audio/m4a',
      name: `recording_${Date.now()}.m4a`,
    });

    const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.UPLOAD_AUDIO}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      body: formData,
      timeout: API_CONFIG.TIMEOUT,
    });

    if (!response.ok) {
      throw new Error(`Upload failed with status: ${response.status}`);
    }

    const result = await response.json();
    return { success: true, data: result };
  } catch (error) {
    console.error('Audio upload error:', error);
    return { success: false, error: error.message };
  }
};
