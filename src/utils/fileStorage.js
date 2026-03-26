import { FileSystem, Dirs } from 'react-native-file-access';

const STORAGE_DIR = `${Dirs.DocumentDir}/app_kv_store`;

const safeName = (key) => key.replace(/[^a-zA-Z0-9_@-]/g, '_');
const filePath = (key) => `${STORAGE_DIR}/${safeName(key)}.json`;

const ensureDir = async () => {
  const exists = await FileSystem.exists(STORAGE_DIR);
  if (!exists) {
    await FileSystem.mkdir(STORAGE_DIR);
  }
};

export const FileStorage = {
  async setItem(key, value) {
    try {
      await ensureDir();
      await FileSystem.writeFile(filePath(key), JSON.stringify(value));
      return { success: true };
    } catch (error) {
      console.error('[FileStorage] setItem error:', error);
      return { success: false, error: error.message };
    }
  },

  async getItem(key) {
    try {
      const path = filePath(key);
      const exists = await FileSystem.exists(path);
      if (!exists) return null;
      const raw = await FileSystem.readFile(path);
      return JSON.parse(raw);
    } catch (error) {
      console.error('[FileStorage] getItem error:', error);
      return null;
    }
  },

  async removeItem(key) {
    try {
      const path = filePath(key);
      const exists = await FileSystem.exists(path);
      if (exists) {
        await FileSystem.unlink(path);
      }
      return { success: true };
    } catch (error) {
      console.error('[FileStorage] removeItem error:', error);
      return { success: false, error: error.message };
    }
  },
};
