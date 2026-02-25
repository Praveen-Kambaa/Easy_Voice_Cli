// Simple in-memory storage for demo purposes
// In production, this would use proper persistent storage

let recordings = [];

export const AudioStorageService = {
  async saveRecording(recording) {
    try {
      const newRecording = {
        id: Date.now().toString(),
        name: `Recording ${recordings.length + 1}`,
        date: new Date().toISOString(),
        duration: recording.duration || 0,
        filePath: recording.filePath,
        createdAt: Date.now(),
      };
      
      recordings.push(newRecording);
      
      return { success: true, recording: newRecording };
    } catch (error) {
      console.error('Error saving recording:', error);
      return { success: false, error: error.message };
    }
  },

  async getRecordings() {
    try {
      return recordings;
    } catch (error) {
      console.error('Error getting recordings:', error);
      return [];
    }
  },

  async deleteRecording(recordingId) {
    try {
      recordings = recordings.filter(r => r.id !== recordingId);
      return { success: true };
    } catch (error) {
      console.error('Error deleting recording:', error);
      return { success: false, error: error.message };
    }
  },

  formatDate(dateString) {
    const date = new Date(dateString);
    const options = { day: '2-digit', month: 'short', year: 'numeric' };
    return date.toLocaleDateString('en-US', options);
  },

  formatDuration(durationMs) {
    const seconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  },
};
