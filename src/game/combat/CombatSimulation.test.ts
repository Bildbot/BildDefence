import { describe, expect, it } from 'vitest';
import { FIRST_COMBAT, type CombatDefinition } from '../../content/firstCombat';
import { CombatSimulation } from './CombatSimulation';

const guardian = {
  maxHealth: 100,
  maxBarrier: 0,
  armorPercent: 0,
  healthRegenPerSecond: 0,
  damage: 100,
  attacksPerSecond: 10,
  criticalChance: 0,
  criticalMultiplier: 1.5,
  projectileSpeed: 2000,
};

const fastVictory: CombatDefinition = {
  guardian,
  enemy: {
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
      guardian,
      enemy: {
        maxHealth: 1,
        speed: 1,
        attackDamage: 1,
        attackIntervalSeconds: 1,
        stopDistance: 10,
        experienceReward: 60,
      },
      wave: { enemyCount: 2, spawnIntervalSeconds: 0.1 },
    };
    const simulation = new CombatSimulation(experienceCombat, 1);
    for (let index = 0; index < 180 && simulation.getSnapshot().result === null; index += 1) {
      simulation.step(1 / 60);
    }
    expect(simulation.getSnapshot()).toMatchObject({
      defeatedEnemies: 2,
      guardianLevel: 2,
      guardianExperience: 20,
      guardianExperienceForNextLevel: 348,
      guardianTotalExperience: 120,
      guardianMaxLevel: 50,
    });
  });

  it('continues combat progression from saved total experience', () => {
    const simulation = new CombatSimulation(fastVictory, 1, 300);
    for (let index = 0; index < 180 && simulation.getSnapshot().result === null; index += 1) {
      simulation.step(1 / 60);
    }
    expect(simulation.getSnapshot()).toMatchObject({
      guardianLevel: 2,
      guardianExperience: 220,
      guardianTotalExperience: 320,
    });
  });

  it('finishes with defeat when a reached enemy drains guardian health', () => {
    const defeat: CombatDefinition = {
      guardian: { ...guardian, maxHealth: 10, damage: 0, attacksPerSecond: 1, projectileSpeed: 1 },
      enemy: {
        maxHealth: 10,
        speed: 1000,
        attackDamage: 10,
        attackIntervalSeconds: 0.1,
        stopDistance: 80,
        experienceReward: 10,
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

  it('applies armor, barrier, health regeneration, and barrier recovery', () => {
    const defence: CombatDefinition = {
      guardian: {
        ...guardian,
        maxHealth: 100,
        maxBarrier: 10,
        armorPercent: 0.5,
        healthRegenPerSecond: 1,
        damage: 0,
      },
      enemy: {
        maxHealth: 10,
        speed: 1000,
        attackDamage: 40,
        attackIntervalSeconds: 0.1,
        stopDistance: 80,
        experienceReward: 10,
      },
      wave: { enemyCount: 1, spawnIntervalSeconds: 1 },
    };
    const simulation = new CombatSimulation(defence, 1);
    simulation.step(1);
    simulation.step(1);
    expect(simulation.getSnapshot()).toMatchObject({ guardianHealth: 90, guardianBarrier: 0 });
    if (simulation.enemies[0]) simulation.enemies[0].active = false;
    simulation.step(4);
    expect(simulation.getSnapshot()).toMatchObject({ guardianHealth: 94, guardianBarrier: 8 });
  });

  it('keeps the first balanced wave winnable and close to one minute', () => {
    const simulation = new CombatSimulation(FIRST_COMBAT, 1);
    for (let index = 0; index < 60 * 90 && simulation.getSnapshot().result === null; index += 1) {
      simulation.step(1 / 60);
    }
    const snapshot = simulation.getSnapshot();
    expect(snapshot.result).toBe('victory');
    expect(snapshot.guardianHealth).toBeGreaterThan(0);
    expect(snapshot.elapsedSeconds).toBeGreaterThanOrEqual(45);
    expect(snapshot.elapsedSeconds).toBeLessThanOrEqual(75);
    expect(snapshot.guardianLevel).toBe(2);
    expect(snapshot.guardianExperience).toBe(140);
    expect(snapshot.guardianTotalExperience).toBe(240);
  });
});
