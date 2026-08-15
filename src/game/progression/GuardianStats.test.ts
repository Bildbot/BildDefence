import { describe, expect, it } from 'vitest';
import { FIRST_COMBAT } from '../../content/firstCombat';
import {
  DEFAULT_GUARDIAN_STAT_UPGRADES,
  applyGuardianStatUpgrades,
  canUpgradeGuardianStat,
} from './GuardianStats';

describe('GuardianStats', () => {
  it('applies the agreed value for one point in every stat', () => {
    const upgraded = applyGuardianStatUpgrades(FIRST_COMBAT.guardian, {
      maxHealth: 1,
      healthRegenPerSecond: 1,
      damage: 1,
      attacksPerSecond: 1,
      criticalChance: 1,
      criticalMultiplier: 1,
    });

    expect(upgraded).toMatchObject({
      maxHealth: 110,
      healthRegenPerSecond: 0.6,
      damage: 22,
      attacksPerSecond: 1.325,
      criticalChance: 0.08,
      criticalMultiplier: 1.65,
    });
    expect(upgraded.projectileSpeed).toBe(FIRST_COMBAT.guardian.projectileSpeed);
  });

  it('caps bounded stats at their configured maximums', () => {
    const manyUpgrades = {
      maxHealth: 0,
      healthRegenPerSecond: 100,
      damage: 0,
      attacksPerSecond: 100,
      criticalChance: 100,
      criticalMultiplier: 100,
    } as const;
    const upgraded = applyGuardianStatUpgrades(FIRST_COMBAT.guardian, manyUpgrades);

    expect(upgraded).toMatchObject({
      healthRegenPerSecond: 5,
      attacksPerSecond: 3,
      criticalChance: 0.5,
      criticalMultiplier: 3,
    });
    expect(canUpgradeGuardianStat(FIRST_COMBAT.guardian, manyUpgrades, 'damage')).toBe(true);
  });

  it('keeps the base guardian unchanged with zero upgrades', () => {
    expect(
      applyGuardianStatUpgrades(FIRST_COMBAT.guardian, DEFAULT_GUARDIAN_STAT_UPGRADES),
    ).toEqual(FIRST_COMBAT.guardian);
  });
});
