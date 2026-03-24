// Simple in-memory storage for demo purposes
// In production, this would use AsyncStorage or proper database

let memoryStorage = {};

export const StorageUtils = {
  async setItem(key, value) {
    try {
      memoryStorage[key] = JSON.stringify(value);
      return { success: true };
    } catch (error) {
      console.error('Storage setItem error:', error);
      return { success: false, error: error.message };
    }
  },

  async getItem(key) {
    try {
      const value = memoryStorage[key];
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Storage getItem error:', error);
      return null;
    }
  },

  async removeItem(key) {
    try {
      delete memoryStorage[key];
      return { success: true };
    } catch (error) {
      console.error('Storage removeItem error:', error);
      return { success: false, error: error.message };
    }
  },

  async clear() {
    try {
      memoryStorage = {};
      return { success: true };
    } catch (error) {
      console.error('Storage clear error:', error);
      return { success: false, error: error.message };
    }
  },
};
