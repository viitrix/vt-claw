import fs from 'fs/promises';

export interface TokenStoreData {
  token: string;
  userId: string;
  accountId?: string;
  baseUrl?: string;
  savedAt: number;
}

/**
 * Simple file-based token store for persisting auth credentials.
 * Uses a JSON file on disk to cache tokens between sessions.
 */
export class FileTokenStore {
  constructor(private filePath: string) {}

  /**
   * Load saved auth data from disk.
   * Returns null if the file doesn't exist or is corrupted.
   */
  async load(): Promise<TokenStoreData | null> {
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');
      return JSON.parse(content) as TokenStoreData;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      // Corrupted file, return null silently
      return null;
    }
  }

  /**
   * Save auth data to disk.
   */
  async save(data: TokenStoreData): Promise<void> {
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * Delete the saved auth file.
   * No-op if the file doesn't exist.
   */
  async clear(): Promise<void> {
    await fs.unlink(this.filePath).catch((error) => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    });
  }
}
