import {
  FIRST_COMBAT,
  type CombatDefinition,
  type GuardianDefinition,
} from './firstCombat';
import {
  MAX_GUARDIAN_LEVEL,
  getExperienceForNextGuardianLevel,
} from '../game/progression/GuardianProgression';

export const MAX_ARENA_LEVEL = 100;
export const MAX_ARENA_ENEMIES = 200;

const TARGET_SPAWN_WINDOW_SECONDS = 52;
const TARGET_RUNS_PER_LEVEL = 5;
const ENEMY_COUNT_GROWTH_EXPONENT = 1.2;

export type ArenaBalance = Readonly<{
  level: number;
  enemyLevel: number;
  enemyCount: number;
  enemyMaxHealth: number;
  enemyAttackDamage: number;
  enemyExperienceReward: number;
  spawnIntervalSeconds: number;
}>;

export function getArenaBalance(level: number): ArenaBalance {
  assertArenaLevel(level);
  return {
    level,
    enemyLevel: level,
    enemyCount: getArenaEnemyCount(level),
    enemyMaxHealth: getArenaEnemyMaxHealth(level),
    enemyAttackDamage: getArenaEnemyAttackDamage(level),
    enemyExperienceReward: getArenaExperiencePerEnemy(level),
    spawnIntervalSeconds: getArenaSpawnIntervalSeconds(level),
  };
}

export function createArenaCombatDefinition(
  level: number,
  guardian: GuardianDefinition,
): CombatDefinition {
  const balance = getArenaBalance(level);
  return {
    ...FIRST_COMBAT,
    arenaLevel: balance.level,
    guardian,
    enemy: {
      ...FIRST_COMBAT.enemy,
      level: balance.enemyLevel,
      maxHealth: balance.enemyMaxHealth,
      attackDamage: balance.enemyAttackDamage,
      experienceReward: balance.enemyExperienceReward,
    },
    wave: {
      enemyCount: balance.enemyCount,
      spawnIntervalSeconds: balance.spawnIntervalSeconds,
    },
  };
}

export function getArenaEnemyCount(level: number): number {
  assertArenaLevel(level);
  const progress = (level - 1) / (MAX_ARENA_LEVEL - 1);
  return Math.round(
    FIRST_COMBAT.wave.enemyCount +
      (MAX_ARENA_ENEMIES - FIRST_COMBAT.wave.enemyCount) *
        progress ** ENEMY_COUNT_GROWTH_EXPONENT,
  );
}

export function getArenaEnemyMaxHealth(level: number): number {
  assertArenaLevel(level);
  return Math.round(
    FIRST_COMBAT.enemy.maxHealth * getPiecewiseGrowthMultiplier(level, 0.012, 0.022, 0.03),
  );
}

export function getArenaEnemyAttackDamage(level: number): number {
  assertArenaLevel(level);
  return roundToTenth(
    FIRST_COMBAT.enemy.attackDamage *
      getPiecewiseGrowthMultiplier(level, 0.008, 0.012, 0.015),
  );
}

export function getArenaSpawnIntervalSeconds(level: number): number {
  const enemyCount = getArenaEnemyCount(level);
  return roundToThousandth(
    Math.min(
      FIRST_COMBAT.wave.spawnIntervalSeconds,
      TARGET_SPAWN_WINDOW_SECONDS / Math.max(1, enemyCount - 1),
    ),
  );
}

export function getArenaExperiencePerEnemy(level: number): number {
  const enemyCount = getArenaEnemyCount(level);
  const referenceLevel = Math.min(level, MAX_GUARDIAN_LEVEL - 1);
  const targetArenaExperience =
    getExperienceForNextGuardianLevel(referenceLevel) / TARGET_RUNS_PER_LEVEL;
  return Math.max(1, Math.round(targetArenaExperience / enemyCount));
}

function getPiecewiseGrowthMultiplier(
  level: number,
  earlyGrowth: number,
  middleGrowth: number,
  lateGrowth: number,
): number {
  const earlyLevels = Math.min(Math.max(level - 1, 0), 29);
  const middleLevels = Math.min(Math.max(level - 30, 0), 30);
  const lateLevels = Math.max(level - 60, 0);
  return (
    (1 + earlyGrowth) ** earlyLevels *
    (1 + middleGrowth) ** middleLevels *
    (1 + lateGrowth) ** lateLevels
  );
}

function assertArenaLevel(level: number): void {
  if (!Number.isInteger(level) || level < 1 || level > MAX_ARENA_LEVEL) {
    throw new RangeError(`Arena level must be between 1 and ${MAX_ARENA_LEVEL}`);
  }
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function roundToThousandth(value: number): number {
  return Math.round(value * 1000) / 1000;
}
