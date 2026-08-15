import { describe, expect, it } from 'vitest';
import { FIRST_COMBAT, type CombatDefinition } from '../../content/firstCombat';
import { CombatSimulation } from './CombatSimulation';

const guardian = {
  maxHealth: 100,
  armorPercent: 0,
  healthRegenPerSecond: 0,
  minimumDamage: 100,
  maximumDamage: 100,
  attacksPerSecond: 10,
  criticalChance: 0,
  criticalMultiplier: 1.5,
  projectileSpeed: 2000,
};

const fastVictory: CombatDefinition = {
  arenaLevel: 1,
  guardian,
  enemy: {
    level: 1,
    maxHealth: 1,
    speed: 1,
    attackDamage: 1,
    attackIntervalSeconds: 1,
    stopDistance: 10,
    experienceReward: 10,
  },
  wave: { enemyCount: 2, spawnIntervalSeconds: 0.1 },
};

describe('CombatSimulation', () => {
  it('is reproducible for the same run seed', () => {
    const first = new CombatSimulation(fastVictory, 42);
    const second = new CombatSimulation(fastVictory, 42);
    first.step(1 / 60);
    second.step(1 / 60);
    expect(first.enemies[0]?.x).toBe(second.enemies[0]?.x);
  });

  it('automatically fires visible projectiles upward', () => {
    const simulation = new CombatSimulation(fastVictory, 7);
    simulation.step(1 / 60);
    const projectile = simulation.projectiles.find((candidate) => candidate.active);
    expect(projectile).toBeDefined();
    expect(projectile?.velocityY).toBeLessThan(0);
  });

  it('finishes with victory after every spawned enemy is defeated', () => {
    const simulation = new CombatSimulation(fastVictory, 1);
    for (let index = 0; index < 180 && simulation.getSnapshot().result === null; index += 1) {
      simulation.step(1 / 60);
    }
    expect(simulation.getSnapshot().result).toBe('victory');
    expect(simulation.getSnapshot().defeatedEnemies).toBe(2);
  });

  it('awards experience for defeated enemies and levels the guardian', () => {
    const experienceCombat: CombatDefinition = {
      ...fastVictory,
      enemy: { ...fastVictory.enemy, experienceReward: 60 },
    };
    const simulation = new CombatSimulation(experienceCombat, 1);
    for (let index = 0; index < 180 && simulation.getSnapshot().result === null; index += 1) {
      simulation.step(1 / 60);
    }
    expect(simulation.getSnapshot()).toMatchObject({
      arenaLevel: 1,
      defeatedEnemies: 2,
      guardianLevel: 2,
      guardianExperience: 20,
      guardianExperienceForNextLevel: 348,
      guardianTotalExperience: 120,
      guardianMaxLevel: 100,
    });
  });

  it('starts from persistent experience and applies the lower-level enemy penalty', () => {
    const lowArena: CombatDefinition = {
      ...fastVictory,
      enemy: { ...fastVictory.enemy, level: 1, experienceReward: 10 },
    };
    const simulation = new CombatSimulation(lowArena, 1, 500);
    for (let index = 0; index < 180 && simulation.getSnapshot().result === null; index += 1) {
      simulation.step(1 / 60);
    }
    expect(simulation.getSnapshot()).toMatchObject({
      guardianLevel: 3,
      guardianTotalExperience: 516,
    });
  });

  it('finishes with defeat when a reached enemy drains guardian health', () => {
    const defeat: CombatDefinition = {
      ...fastVictory,
      guardian: {
        ...guardian,
        maxHealth: 10,
        minimumDamage: 0,
        maximumDamage: 0,
        attacksPerSecond: 1,
        projectileSpeed: 1,
      },
      enemy: {
        ...fastVictory.enemy,
        maxHealth: 10,
        speed: 1000,
        attackDamage: 10,
        attackIntervalSeconds: 0.1,
        stopDistance: 80,
      },
      wave: { enemyCount: 1, spawnIntervalSeconds: 1 },
    };
    const simulation = new CombatSimulation(defeat, 1);
    for (let index = 0; index < 120 && simulation.getSnapshot().result === null; index += 1) {
      simulation.step(1 / 60);
    }
    expect(simulation.getSnapshot().result).toBe('defeat');
    expect(simulation.getSnapshot().guardianHealth).toBe(0);
  });

  it('applies percentage armor and health regeneration', () => {
    const defence: CombatDefinition = {
      ...fastVictory,
      guardian: {
        ...guardian,
        maxHealth: 100,
        armorPercent: 0.5,
        healthRegenPerSecond: 1,
        minimumDamage: 0,
        maximumDamage: 0,
      },
      enemy: {
        ...fastVictory.enemy,
        maxHealth: 10,
        speed: 1000,
        attackDamage: 40,
        attackIntervalSeconds: 0.1,
        stopDistance: 80,
      },
      wave: { enemyCount: 1, spawnIntervalSeconds: 1 },
    };
    const simulation = new CombatSimulation(defence, 1);
    simulation.step(1);
    simulation.step(1);
    expect(simulation.getSnapshot()).toMatchObject({ guardianHealth: 80 });
    if (simulation.enemies[0]) simulation.enemies[0].active = false;
    simulation.step(4);
    expect(simulation.getSnapshot()).toMatchObject({ guardianHealth: 84 });
  });

  it('caps physical damage reduction from armor at 75%', () => {
    const defence: CombatDefinition = {
      ...fastVictory,
      guardian: { ...guardian, armorPercent: 1, minimumDamage: 0, maximumDamage: 0 },
      enemy: {
        ...fastVictory.enemy,
        speed: 1000,
        attackDamage: 40,
        attackIntervalSeconds: 1,
        stopDistance: 80,
      },
      wave: { enemyCount: 1, spawnIntervalSeconds: 1 },
    };
    const simulation = new CombatSimulation(defence, 1);
    simulation.step(1);
    simulation.step(1);
    expect(simulation.getSnapshot().guardianHealth).toBe(90);
  });

  it('keeps the first balanced arena winnable and close to one minute', () => {
    const simulation = new CombatSimulation(FIRST_COMBAT, 1);
    for (let index = 0; index < 60 * 90 && simulation.getSnapshot().result === null; index += 1) {
      simulation.step(1 / 60);
    }
    const snapshot = simulation.getSnapshot();
    expect(snapshot.result).toBe('victory');
    expect(snapshot.guardianHealth).toBeGreaterThan(0);
    expect(snapshot.elapsedSeconds).toBeGreaterThanOrEqual(45);
    expect(snapshot.elapsedSeconds).toBeLessThanOrEqual(75);
    expect(snapshot.guardianLevel).toBe(1);
    expect(snapshot.guardianExperience).toBe(24);
    expect(snapshot.guardianTotalExperience).toBe(24);
  });
});
