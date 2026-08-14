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
    await repository.completeRun(2);
    await repository.saveSettings({ ...DEFAULT_SAVE.settings, vibration: false });
    const stored = JSON.parse(storage.values.get(SAVE_KEY) ?? '{}') as typeof DEFAULT_SAVE;
    expect(stored.settings.vibration).toBe(false);
    expect(stored.progression.unspentStatPoints).toBe(2);
    expect(stored.progression.completedRuns).toBe(1);
  });

  it('migrates the previous save schema without losing settings or completed runs', async () => {
    const storage = new MemoryStorage();
    storage.values.set(
      SAVE_KEY,
      JSON.stringify({
        version: 1,
        settings: { ...DEFAULT_SAVE.settings, vibration: false },
        progression: { completedRuns: 7 },
      }),
    );
    const repository = new SaveRepository(storage);
    const migrated = await repository.load();

    expect(migrated).toEqual({
      ...DEFAULT_SAVE,
      settings: { ...DEFAULT_SAVE.settings, vibration: false },
      progression: { ...DEFAULT_SAVE.progression, completedRuns: 7 },
    });
    expect(JSON.parse(storage.values.get(SAVE_KEY) ?? '{}')).toEqual(migrated);
  });

  it('adds one unspent stat point for every level gained in a completed run', async () => {
    const repository = new SaveRepository(new MemoryStorage());
    await expect(repository.completeRun(2)).resolves.toMatchObject({
      completedRuns: 1,
      unspentStatPoints: 2,
    });
    await expect(repository.completeRun(1)).resolves.toMatchObject({
      completedRuns: 2,
      unspentStatPoints: 3,
    });
  });

  it('spends a point on the selected guardian stat', async () => {
    const repository = new SaveRepository(new MemoryStorage());
    await repository.completeRun(2);
    const progression = await repository.spendGuardianStatPoint('damage');
    expect(progression.unspentStatPoints).toBe(1);
    expect(progression.guardianStatUpgrades.damage).toBe(1);
    expect(progression.guardianStatUpgrades.maxHealth).toBe(0);
  });

  it('does not spend points on a stat that already reached its cap', async () => {
    const storage = new MemoryStorage();
    storage.values.set(
      SAVE_KEY,
      JSON.stringify({
        ...DEFAULT_SAVE,
        progression: {
          ...DEFAULT_SAVE.progression,
          unspentStatPoints: 1,
          guardianStatUpgrades: {
            ...DEFAULT_SAVE.progression.guardianStatUpgrades,
            armorPercent: 20,
          },
        },
      }),
    );
    const repository = new SaveRepository(storage);
    const progression = await repository.spendGuardianStatPoint('armorPercent');
    expect(progression.unspentStatPoints).toBe(1);
    expect(progression.guardianStatUpgrades.armorPercent).toBe(20);
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
