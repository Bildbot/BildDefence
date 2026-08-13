import type { StorageAdapter } from './StorageAdapter';

export class BrowserStorageAdapter implements StorageAdapter {
  async read(key: string): Promise<string | null> {
    return localStorage.getItem(key);
  }

  async write(key: string, value: string): Promise<void> {
    localStorage.setItem(key, value);
  }

  async remove(key: string): Promise<void> {
    localStorage.removeItem(key);
  }

  async quarantine(key: string, value: string): Promise<void> {
    localStorage.setItem(`${key}.corrupt.${Date.now()}`, value);
  }
}
