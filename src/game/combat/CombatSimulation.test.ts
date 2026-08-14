import { describe, expect, it } from 'vitest';
import { FIRST_COMBAT, type CombatDefinition } from '../../content/firstCombat';
import { CombatSimulation } from './CombatSimulation';

const fastVictory: CombatDefinition = {
  guardian: { maxHealth: 100, damage: 100, fireIntervalSeconds: 0.1, projectileSpeed: 2000 },
  enemy: { maxHealth: 1, speed: 1, attackDamage: 1, attackIntervalSeconds: 1, stopDistance: 10 },
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

  it('finishes with defeat when a reached enemy drains guardian health', () => {
    const defeat: CombatDefinition = {
      guardian: { maxHealth: 10, damage: 0, fireIntervalSeconds: 1, projectileSpeed: 1 },
      enemy: {
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
  });
});
