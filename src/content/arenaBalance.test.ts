import { describe, expect, it } from 'vitest';
import { FIRST_COMBAT } from './firstCombat';
import {
  MAX_ARENA_ENEMIES,
  MAX_ARENA_LEVEL,
  createArenaCombatDefinition,
  getArenaBalance,
} from './arenaBalance';

describe('arenaBalance', () => {
  it('matches the agreed control points across 100 arenas', () => {
    expect(getArenaBalance(1)).toEqual({
      level: 1,
      enemyLevel: 1,
      enemyCount: 24,
      enemyMaxHealth: 60,
      enemyAttackDamage: 8,
      enemyExperienceReward: 1,
      spawnIntervalSeconds: 2.2,
    });
    expect(getArenaBalance(10)).toMatchObject({
      enemyCount: 34,
      enemyMaxHealth: 67,
      enemyAttackDamage: 8.6,
      enemyExperienceReward: 37,
      spawnIntervalSeconds: 1.576,
    });
    expect(getArenaBalance(30)).toMatchObject({
      enemyCount: 64,
      enemyMaxHealth: 85,
      enemyAttackDamage: 10.1,
      enemyExperienceReward: 142,
      spawnIntervalSeconds: 0.825,
    });
    expect(getArenaBalance(50)).toMatchObject({
      enemyCount: 100,
      enemyMaxHealth: 131,
      enemyAttackDamage: 12.8,
      enemyExperienceReward: 229,
      spawnIntervalSeconds: 0.525,
    });
    expect(getArenaBalance(75)).toMatchObject({
      enemyCount: 148,
      enemyMaxHealth: 254,
      enemyAttackDamage: 18,
      enemyExperienceReward: 321,
      spawnIntervalSeconds: 0.354,
    });
    expect(getArenaBalance(100)).toMatchObject({
      enemyCount: MAX_ARENA_ENEMIES,
      enemyMaxHealth: 531,
      enemyAttackDamage: 26.2,
      enemyExperienceReward: 391,
      spawnIntervalSeconds: 0.261,
    });
  });

  it('keeps movement and attack cadence constant while scaling the arena', () => {
    const arena = createArenaCombatDefinition(MAX_ARENA_LEVEL, FIRST_COMBAT.guardian);
    expect(arena.enemy.speed).toBe(FIRST_COMBAT.enemy.speed);
    expect(arena.enemy.attackIntervalSeconds).toBe(FIRST_COMBAT.enemy.attackIntervalSeconds);
    expect(arena.enemy.stopDistance).toBe(FIRST_COMBAT.enemy.stopDistance);
    expect(arena.enemy.level).toBe(MAX_ARENA_LEVEL);
  });

  it('rejects arena levels outside the supported range', () => {
    expect(() => getArenaBalance(0)).toThrow(RangeError);
    expect(() => getArenaBalance(MAX_ARENA_LEVEL + 1)).toThrow(RangeError);
  });
});
