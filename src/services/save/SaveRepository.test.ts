import { describe, expect, it } from 'vitest';
import { getTotalExperienceToReachGuardianLevel } from '../../game/progression/GuardianProgression';
import { SAVE_KEY } from '../../shared/constants';
import type { StorageAdapter } from '../storage/StorageAdapter';
import { DEFAULT_SAVE, SaveRepository } from './SaveRepository';
import { generateVictoryLoot } from '../../game/equipment/Equipment';

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
    await repository.settleRun({
      arenaLevel: 1,
      result: 'victory',
      guardianTotalExperience: 448,
    });
    await repository.saveSettings({
      ...DEFAULT_SAVE.settings,
      vibration: false,
    });
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
      repository.settleRun({
        arenaLevel: 1,
        result: 'victory',
        guardianTotalExperience: 500,
      }),
    ).resolves.toMatchObject({
      completedRuns: 1,
      unspentStatPoints: 2,
      guardianTotalExperience: 500,
    });
    await expect(
      repository.settleRun({
        arenaLevel: 2,
        result: 'victory',
        guardianTotalExperience: 600,
      }),
    ).resolves.toMatchObject({
      completedRuns: 2,
      unspentStatPoints: 2,
      guardianTotalExperience: 600,
    });
  });

  it('unlocks only the next arena after victory and does not unlock on defeat', async () => {
    const repository = new SaveRepository(new MemoryStorage());
    await expect(
      repository.settleRun({
        arenaLevel: 1,
        result: 'victory',
        guardianTotalExperience: 24,
      }),
    ).resolves.toMatchObject({ maxUnlockedArena: 2 });
    await expect(
      repository.settleRun({
        arenaLevel: 2,
        result: 'defeat',
        guardianTotalExperience: 30,
      }),
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
    await repository.settleRun({
      arenaLevel: 1,
      result: 'victory',
      guardianTotalExperience: 448,
    });
    const progression = await repository.spendGuardianStatPoint('damage');
    expect(progression.unspentStatPoints).toBe(1);
    expect(progression.guardianStatUpgrades.damage).toBe(1);
    expect(progression.guardianStatUpgrades.maxHealth).toBe(0);
  });

  it('persists victory loot and equipped items', async () => {
    const repository = new SaveRepository(new MemoryStorage());
    const rewards = generateVictoryLoot(1, 1);
    const withLoot = await repository.addVictoryLoot(rewards);
    expect(withLoot.equipment.items).toHaveLength(4);
    const reward = rewards[0];
    if (!reward) return;
    const equipped = await repository.equipItem(reward.id);
    expect(equipped.equipment.equipped[reward.slot]).toBe(reward.id);
  });

  it('restores real affixes for items saved by version 6', async () => {
    const storage = new MemoryStorage();
    const reward = generateVictoryLoot(21, 4).find((item) => item.affixCount > 0);
    if (!reward) return;
    const legacyReward = { ...reward } as Record<string, unknown>;
    delete legacyReward.affixes;
    storage.values.set(
      SAVE_KEY,
      JSON.stringify({
        ...DEFAULT_SAVE,
        version: 6,
        progression: {
          ...DEFAULT_SAVE.progression,
          equipment: {
            items: [legacyReward],
            equipped: { [reward.slot]: reward.id },
          },
        },
      }),
    );
    const migrated = await new SaveRepository(storage).load();
    expect(migrated.version).toBe(8);
    expect(migrated.progression.equipment.items[0]?.affixes).toHaveLength(reward.affixCount);
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
  it('migrates version 7 saves with a zero gold balance', async () => {
    const storage = new MemoryStorage();
    const legacy = {
      ...DEFAULT_SAVE,
      version: 7,
      progression: { ...DEFAULT_SAVE.progression },
    } as Record<string, unknown>;
    delete (legacy.progression as Record<string, unknown>).gold;
    storage.values.set(SAVE_KEY, JSON.stringify(legacy));
    const migrated = await new SaveRepository(storage).load();
    expect(migrated.version).toBe(8);
    expect(migrated.progression.gold).toBe(0);
  });

  it('sells unequipped loot and credits gold', async () => {
    const storage = new MemoryStorage();
    const repository = new SaveRepository(storage);
    const reward = generateVictoryLoot(21, 8)[0]!;
    await repository.addVictoryLoot([reward]);
    const sold = await repository.sellItem(reward.id);
    expect(sold.gold).toBeGreaterThan(0);
    expect(sold.equipment.items.some((item) => item.id === reward.id)).toBe(false);
  });

  it('spends gold to add and reroll affixes', async () => {
    const storage = new MemoryStorage();
    storage.values.set(
      SAVE_KEY,
      JSON.stringify({
        ...DEFAULT_SAVE,
        progression: { ...DEFAULT_SAVE.progression, gold: 5000 },
      }),
    );
    const repository = new SaveRepository(storage);
    const item = {
      ...DEFAULT_SAVE.progression.equipment.items[0]!,
      id: 'craft-save-test',
    };
    await repository.addVictoryLoot([item]);
    const added = await repository.addItemAffix(item.id);
    expect(added.gold).toBe(4900);
    expect(added.equipment.items.find((candidate) => candidate.id === item.id)?.affixCount).toBe(1);
    const affix = added.equipment.items.find((candidate) => candidate.id === item.id)?.affixes[0];
    expect(affix).toBeDefined();
    if (!affix) return;
    const rerolled = await repository.rerollItemAffix(item.id, affix.family);
    expect(rerolled.gold).toBe(4700);
    expect(
      rerolled.equipment.items.find((candidate) => candidate.id === item.id)?.rerollAttempts,
    ).toBe(1);
  });
});
