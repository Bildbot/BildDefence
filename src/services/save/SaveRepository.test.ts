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
    await repository.completeRun(448);
    await repository.saveSettings({ ...DEFAULT_SAVE.settings, vibration: false });
    const stored = JSON.parse(storage.values.get(SAVE_KEY) ?? '{}') as typeof DEFAULT_SAVE;
    expect(stored.settings.vibration).toBe(false);
    expect(stored.progression.unspentStatPoints).toBe(2);
    expect(stored.progression.completedRuns).toBe(1);
    expect(stored.progression.guardianTotalExperience).toBe(448);
  });

  it('migrates the version 2 save schema and keeps previous progression', async () => {
    const storage = new MemoryStorage();
    storage.values.set(
      SAVE_KEY,
      JSON.stringify({
        version: 2,
        settings: { ...DEFAULT_SAVE.settings, vibration: false },
        progression: {
          completedRuns: 7,
          unspentStatPoints: 3,
          guardianStatUpgrades: {
            ...DEFAULT_SAVE.progression.guardianStatUpgrades,
            damage: 2,
          },
        },
      }),
    );
    const repository = new SaveRepository(storage);
    const migrated = await repository.load();

    expect(migrated).toEqual({
      ...DEFAULT_SAVE,
      settings: { ...DEFAULT_SAVE.settings, vibration: false },
      progression: {
        ...DEFAULT_SAVE.progression,
        completedRuns: 7,
        unspentStatPoints: 3,
        guardianStatUpgrades: {
          ...DEFAULT_SAVE.progression.guardianStatUpgrades,
          damage: 2,
        },
      },
    });
    expect(JSON.parse(storage.values.get(SAVE_KEY) ?? '{}')).toEqual(migrated);
  });

  it('migrates the version 1 save schema without losing settings or completed runs', async () => {
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

  it('stores total experience and only awards points for newly reached levels', async () => {
    const repository = new SaveRepository(new MemoryStorage());
    await expect(repository.completeRun(300)).resolves.toMatchObject({
      completedRuns: 1,
      guardianTotalExperience: 300,
      unspentStatPoints: 1,
    });
    await expect(repository.completeRun(540)).resolves.toMatchObject({
      completedRuns: 2,
      guardianTotalExperience: 540,
      unspentStatPoints: 2,
    });
  });

  it('never rolls saved experience backwards', async () => {
    const repository = new SaveRepository(new MemoryStorage());
    await repository.completeRun(540);
    await expect(repository.completeRun(300)).resolves.toMatchObject({
      completedRuns: 2,
      guardianTotalExperience: 540,
      unspentStatPoints: 2,
    });
  });

  it('spends a point on the selected guardian stat', async () => {
    const repository = new SaveRepository(new MemoryStorage());
    await repository.completeRun(448);
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
