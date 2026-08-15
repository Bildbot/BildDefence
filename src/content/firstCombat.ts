export type GuardianDefinition = Readonly<{
  maxHealth: number;
  armorPercent: number;
  healthRegenPerSecond: number;
  damage: number;
  attacksPerSecond: number;
  criticalChance: number;
  criticalMultiplier: number;
  projectileSpeed: number;
}>;

export type EnemyDefinition = Readonly<{
  level: number;
  maxHealth: number;
  speed: number;
  attackDamage: number;
  attackIntervalSeconds: number;
  stopDistance: number;
  experienceReward: number;
}>;

export type WaveDefinition = Readonly<{
  enemyCount: number;
  spawnIntervalSeconds: number;
}>;

export type CombatDefinition = Readonly<{
  arenaLevel: number;
  guardian: GuardianDefinition;
  enemy: EnemyDefinition;
  wave: WaveDefinition;
}>;

export const FIRST_COMBAT: CombatDefinition = {
  arenaLevel: 1,
  guardian: {
    maxHealth: 100,
    armorPercent: 0,
    healthRegenPerSecond: 0.5,
    damage: 20,
    attacksPerSecond: 1.25,
    criticalChance: 0.05,
    criticalMultiplier: 1.5,
    projectileSpeed: 430,
  },
  enemy: {
    level: 1,
    maxHealth: 60,
    speed: 32,
    attackDamage: 8,
    attackIntervalSeconds: 1.2,
    stopDistance: 54,
    experienceReward: 1,
  },
  wave: {
    enemyCount: 24,
    spawnIntervalSeconds: 2.2,
  },
};
