import { describe, expect, it } from 'vitest';
import { getTotalExperienceToReachGuardianLevel } from '../../game/progression/GuardianProgression';
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
    await repository.settleRun({ arenaLevel: 1, result: 'victory', guardianTotalExperience: 448 });
    await repository.saveSettings({ ...DEFAULT_SAVE.settings, vibration: false });
    const stored = JSON.parse(storage.values.get(SAVE_KEY) ?? '{}') as typeof DEFAULT_SAVE;
    expect(stored.settings.vibration).toBe(false);
    expect(stored.progression.unspentStatPoints).toBe(2);
    expect(stored.progression.completedRuns).toBe(1);
    expect(stored.progression.maxUnlockedArena).toBe(2);
  });

  it('migrates the previous save schema and starts arena progression at one', async () => {
    const storage = new MemoryStorage();
    storage.values.set(
      SAVE_KEY,
      JSON.stringify({
        version: 3,
        settings: { ...DEFAULT_SAVE.settings, vibration: false },
        progression: {
          completedRuns: 7,
          unspentStatPoints: 2,
          guardianTotalExperience: 500,
          guardianStatUpgrades: {
            ...DEFAULT_SAVE.progression.guardianStatUpgrades,
            maxBarrier: 0,
            armorPercent: 0,
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
        unspentStatPoints: 2,
        guardianTotalExperience: 500,
      },
    });
    expect(JSON.parse(storage.values.get(SAVE_KEY) ?? '{}')).toEqual(migrated);
  });

  it('persists total experience and only awards points for newly reached levels', async () => {
    const repository = new SaveRepository(new MemoryStorage());
    await expect(
      repository.settleRun({ arenaLevel: 1, result: 'victory', guardianTotalExperience: 500 }),
    ).resolves.toMatchObject({
      completedRuns: 1,
      unspentStatPoints: 2,
      guardianTotalExperience: 500,
    });
    await expect(
      repository.settleRun({ arenaLevel: 2, result: 'victory', guardianTotalExperience: 600 }),
    ).resolves.toMatchObject({
      completedRuns: 2,
      unspentStatPoints: 2,
      guardianTotalExperience: 600,
    });
  });

  it('unlocks only the next arena after victory and does not unlock on defeat', async () => {
    const repository = new SaveRepository(new MemoryStorage());
    await expect(
      repository.settleRun({ arenaLevel: 1, result: 'victory', guardianTotalExperience: 24 }),
    ).resolves.toMatchObject({ maxUnlockedArena: 2 });
    await expect(
      repository.settleRun({ arenaLevel: 2, result: 'defeat', guardianTotalExperience: 30 }),
    ).resolves.toMatchObject({ maxUnlockedArena: 2 });
  });

  it('applies the death penalty after level 30 without dropping a level', async () => {
    const storage = new MemoryStorage();
    const level31Start = getTotalExperienceToReachGuardianLevel(31);
    storage.values.set(
      SAVE_KEY,
      JSON.stringify({
        ...DEFAULT_SAVE,
        progression: {
          ...DEFAULT_SAVE.progression,
          guardianTotalExperience: level31Start + 10000,
        },
      }),
    );
    const repository = new SaveRepository(storage);
    const finalExperience = level31Start + 12000;
    const progression = await repository.settleRun({
      arenaLevel: 1,
      result: 'defeat',
      guardianTotalExperience: finalExperience,
    });

    expect(progression.guardianTotalExperience).toBe(
      Math.max(level31Start, Math.floor(finalExperience * 0.9)),
    );
  });

  it('spends a point on the selected guardian stat', async () => {
    const repository = new SaveRepository(new MemoryStorage());
    await repository.settleRun({ arenaLevel: 1, result: 'victory', guardianTotalExperience: 448 });
    const progression = await repository.spendGuardianStatPoint('damage');
    expect(progression.unspentStatPoints).toBe(1);
    expect(progression.guardianStatUpgrades.damage).toBe(1);
    expect(progression.guardianStatUpgrades.maxHealth).toBe(0);
  });

  it('refunds points spent on removed barrier and armor stats during migration', async () => {
    const storage = new MemoryStorage();
    storage.values.set(
      SAVE_KEY,
      JSON.stringify({
        ...DEFAULT_SAVE,
        version: 4,
        progression: {
          ...DEFAULT_SAVE.progression,
          unspentStatPoints: 1,
          guardianStatUpgrades: {
            ...DEFAULT_SAVE.progression.guardianStatUpgrades,
            maxBarrier: 3,
            armorPercent: 20,
          },
        },
      }),
    );
    const repository = new SaveRepository(storage);
    const progression = (await repository.load()).progression;
    expect(progression.unspentStatPoints).toBe(24);
    expect(progression.guardianStatUpgrades).toEqual(DEFAULT_SAVE.progression.guardianStatUpgrades);
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
