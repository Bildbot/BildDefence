import { describe, expect, it } from 'vitest';
import { SAVE_KEY } from '../../shared/constants';
import type { StorageAdapter } from '../storage/StorageAdapter';
import { DEFAULT_SAVE, SaveRepository } from './SaveRepository';

class MemoryStorage implements StorageAdapter {
  readonly values = new Map<string, string>();
  readonly quarantined: Array<{ key: string; value: string }> = [];

  async read(key: string) {
    return this.values.get(key) ?? null;
  }
  async write(key: string, value: string) {
    this.values.set(key, value);
  }
  async remove(key: string) {
    this.values.delete(key);
  }
  async quarantine(key: string, value: string) {
    this.quarantined.push({ key, value });
  }
}

describe('SaveRepository', () => {
  it('returns a versioned default save when storage is empty', async () => {
    const repository = new SaveRepository(new MemoryStorage());
    await expect(repository.load()).resolves.toEqual(DEFAULT_SAVE);
  });

  it('persists settings without losing progression', async () => {
    const storage = new MemoryStorage();
    const repository = new SaveRepository(storage);
    await repository.saveSettings({ ...DEFAULT_SAVE.settings, vibration: false });
    const stored = JSON.parse(storage.values.get(SAVE_KEY) ?? '{}') as unknown;
    expect(stored).toEqual({
      ...DEFAULT_SAVE,
      settings: { ...DEFAULT_SAVE.settings, vibration: false },
    });
  });

  it('quarantines malformed data and safely recovers', async () => {
    const storage = new MemoryStorage();
    storage.values.set(SAVE_KEY, '{broken-json');
    const repository = new SaveRepository(storage);
    await expect(repository.load()).resolves.toEqual(DEFAULT_SAVE);
    expect(storage.quarantined).toEqual([{ key: SAVE_KEY, value: '{broken-json' }]);
    expect(storage.values.has(SAVE_KEY)).toBe(false);
  });
});
