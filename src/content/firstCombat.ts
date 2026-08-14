export type GuardianDefinition = Readonly<{
  maxHealth: number;
  damage: number;
  fireIntervalSeconds: number;
  projectileSpeed: number;
}>;

export type EnemyDefinition = Readonly<{
  maxHealth: number;
  speed: number;
  attackDamage: number;
  attackIntervalSeconds: number;
  stopDistance: number;
}>;

export type WaveDefinition = Readonly<{
  enemyCount: number;
  spawnIntervalSeconds: number;
}>;

export type CombatDefinition = Readonly<{
  guardian: GuardianDefinition;
  enemy: EnemyDefinition;
  wave: WaveDefinition;
}>;

export const FIRST_COMBAT: CombatDefinition = {
  guardian: {
    maxHealth: 100,
    damage: 20,
    fireIntervalSeconds: 0.8,
    projectileSpeed: 430,
  },
  enemy: {
    maxHealth: 60,
    speed: 32,
    attackDamage: 8,
    attackIntervalSeconds: 1.2,
    stopDistance: 54,
  },
  wave: {
    enemyCount: 24,
    spawnIntervalSeconds: 2.2,
  },
};
