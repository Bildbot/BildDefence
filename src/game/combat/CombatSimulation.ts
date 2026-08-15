import type { CombatDefinition } from '../../content/firstCombat';
import { ARENA_HEIGHT, ARENA_WIDTH } from '../../shared/constants';
import {
  GuardianProgression,
  getEnemyExperienceMultiplier,
} from '../progression/GuardianProgression';

export const GUARDIAN_X = ARENA_WIDTH / 2;
export const GUARDIAN_Y = ARENA_HEIGHT - 82;
export const ENEMY_RADIUS = 12;
export const PROJECTILE_RADIUS = 4;

export type CombatResult = 'victory' | 'defeat' | null;

export type EnemyState = {
  id: number;
  active: boolean;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  attackCooldown: number;
};

export type ProjectileState = {
  active: boolean;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  damage: number;
};

export type CombatSnapshot = Readonly<{
  arenaLevel: number;
  guardianHealth: number;
  guardianMaxHealth: number;
  guardianLevel: number;
  guardianExperience: number;
  guardianExperienceForNextLevel: number;
  guardianTotalExperience: number;
  guardianMaxLevel: number;
  elapsedSeconds: number;
  spawnedEnemies: number;
  totalEnemies: number;
  aliveEnemies: number;
  defeatedEnemies: number;
  result: CombatResult;
}>;

const MAX_PROJECTILES = 64;
const SPAWN_MARGIN = 28;
export const MAX_ARMOR_PERCENT = 0.75;

export class CombatSimulation {
  readonly enemies: EnemyState[];
  readonly projectiles: ProjectileState[];

  private guardianHealth: number;
  private readonly progression: GuardianProgression;
  private experienceRemainder = 0;
  private elapsedSeconds = 0;
  private spawnedEnemies = 0;
  private defeatedEnemies = 0;
  private nextSpawnAt = 0;
  private fireCooldown = 0;
  private result: CombatResult = null;
  private randomState: number;

  constructor(
    private readonly definition: CombatDefinition,
    seed: number,
    initialTotalExperience = 0,
  ) {
    this.guardianHealth = definition.guardian.maxHealth;
    this.progression = new GuardianProgression(initialTotalExperience);
    this.randomState = seed || 1;
    this.enemies = Array.from({ length: definition.wave.enemyCount }, (_, id) => ({
      id,
      active: false,
      x: 0,
      y: 0,
      health: 0,
      maxHealth: definition.enemy.maxHealth,
      attackCooldown: 0,
    }));
    this.projectiles = Array.from({ length: MAX_PROJECTILES }, () => ({
      active: false,
      x: 0,
      y: 0,
      velocityX: 0,
      velocityY: 0,
      damage: 0,
    }));
  }

  step(deltaSeconds: number): void {
    if (this.result !== null || deltaSeconds <= 0) return;

    this.elapsedSeconds += deltaSeconds;
    this.updateGuardianRecovery(deltaSeconds);
    this.spawnDueEnemies();
    this.updateEnemies(deltaSeconds);
    if (this.result !== null) return;
    this.updateGuardian(deltaSeconds);
    this.updateProjectiles(deltaSeconds);
    this.checkVictory();
  }

  getSnapshot(): CombatSnapshot {
    let aliveEnemies = 0;
    for (const enemy of this.enemies) if (enemy.active) aliveEnemies += 1;
    const progression = this.progression.getSnapshot();
    return {
      arenaLevel: this.definition.arenaLevel,
      guardianHealth: this.guardianHealth,
      guardianMaxHealth: this.definition.guardian.maxHealth,
      guardianLevel: progression.level,
      guardianExperience: progression.experience,
      guardianExperienceForNextLevel: progression.experienceForNextLevel,
      guardianTotalExperience: progression.totalExperience,
      guardianMaxLevel: progression.maxLevel,
      elapsedSeconds: this.elapsedSeconds,
      spawnedEnemies: this.spawnedEnemies,
      totalEnemies: this.definition.wave.enemyCount,
      aliveEnemies,
      defeatedEnemies: this.defeatedEnemies,
      result: this.result,
    };
  }

  private spawnDueEnemies(): void {
    while (
      this.spawnedEnemies < this.definition.wave.enemyCount &&
      this.elapsedSeconds >= this.nextSpawnAt
    ) {
      const enemy = this.enemies[this.spawnedEnemies];
      if (!enemy) break;
      enemy.active = true;
      enemy.x = SPAWN_MARGIN + this.random() * (ARENA_WIDTH - SPAWN_MARGIN * 2);
      enemy.y = 30;
      enemy.health = enemy.maxHealth;
      enemy.attackCooldown = this.definition.enemy.attackIntervalSeconds;
      this.spawnedEnemies += 1;
      this.nextSpawnAt += this.definition.wave.spawnIntervalSeconds;
    }
  }

  private updateEnemies(deltaSeconds: number): void {
    const stopDistanceSquared = this.definition.enemy.stopDistance ** 2;
    for (const enemy of this.enemies) {
      if (!enemy.active) continue;
      const dx = GUARDIAN_X - enemy.x;
      const dy = GUARDIAN_Y - enemy.y;
      const distanceSquared = dx * dx + dy * dy;

      if (distanceSquared > stopDistanceSquared) {
        const distance = Math.sqrt(distanceSquared);
        const movement = Math.min(this.definition.enemy.speed * deltaSeconds, distance);
        enemy.x += (dx / distance) * movement;
        enemy.y += (dy / distance) * movement;
        continue;
      }

      enemy.attackCooldown -= deltaSeconds;
      if (enemy.attackCooldown <= 0) {
        this.receiveDamage(this.definition.enemy.attackDamage);
        enemy.attackCooldown += this.definition.enemy.attackIntervalSeconds;
        if (this.guardianHealth === 0) {
          this.result = 'defeat';
          return;
        }
      }
    }
  }

  private updateGuardian(deltaSeconds: number): void {
    this.fireCooldown -= deltaSeconds;
    if (this.fireCooldown > 0) return;
    const target = this.findPriorityTarget();
    if (!target) return;

    const projectile = this.projectiles.find((candidate) => !candidate.active);
    if (!projectile) return;
    const dx = target.x - GUARDIAN_X;
    const dy = target.y - GUARDIAN_Y;
    const distance = Math.hypot(dx, dy) || 1;
    projectile.active = true;
    projectile.x = GUARDIAN_X;
    projectile.y = GUARDIAN_Y - 28;
    projectile.velocityX = (dx / distance) * this.definition.guardian.projectileSpeed;
    projectile.velocityY = (dy / distance) * this.definition.guardian.projectileSpeed;
    projectile.damage =
      this.definition.guardian.damage *
      (this.random() < this.definition.guardian.criticalChance
        ? this.definition.guardian.criticalMultiplier
        : 1);
    this.fireCooldown += 1 / this.definition.guardian.attacksPerSecond;
  }

  private findPriorityTarget(): EnemyState | null {
    let target: EnemyState | null = null;
    for (const enemy of this.enemies) {
      if (!enemy.active) continue;
      if (target === null || enemy.y > target.y || (enemy.y === target.y && enemy.id < target.id)) {
        target = enemy;
      }
    }
    return target;
  }

  private updateGuardianRecovery(deltaSeconds: number): void {
    this.guardianHealth = Math.min(
      this.definition.guardian.maxHealth,
      this.guardianHealth + this.definition.guardian.healthRegenPerSecond * deltaSeconds,
    );
  }

  private receiveDamage(physicalDamage: number): void {
    const armorPercent = Math.min(
      MAX_ARMOR_PERCENT,
      Math.max(0, this.definition.guardian.armorPercent),
    );
    const damage = physicalDamage * (1 - armorPercent);
    this.guardianHealth = Math.max(0, this.guardianHealth - damage);
  }

  private updateProjectiles(deltaSeconds: number): void {
    const collisionDistanceSquared = (ENEMY_RADIUS + PROJECTILE_RADIUS) ** 2;
    for (const projectile of this.projectiles) {
      if (!projectile.active) continue;
      projectile.x += projectile.velocityX * deltaSeconds;
      projectile.y += projectile.velocityY * deltaSeconds;

      if (
        projectile.x < -10 ||
        projectile.x > ARENA_WIDTH + 10 ||
        projectile.y < -10 ||
        projectile.y > ARENA_HEIGHT + 10
      ) {
        projectile.active = false;
        continue;
      }

      for (const enemy of this.enemies) {
        if (!enemy.active) continue;
        const dx = enemy.x - projectile.x;
        const dy = enemy.y - projectile.y;
        if (dx * dx + dy * dy > collisionDistanceSquared) continue;
        projectile.active = false;
        enemy.health -= projectile.damage;
        if (enemy.health <= 0) {
          enemy.active = false;
          this.defeatedEnemies += 1;
          this.awardEnemyExperience();
        }
        break;
      }
    }
  }

  private awardEnemyExperience(): void {
    const guardianLevel = this.progression.getSnapshot().level;
    const multiplier = getEnemyExperienceMultiplier(guardianLevel, this.definition.enemy.level);
    const exactReward =
      this.definition.enemy.experienceReward * multiplier + this.experienceRemainder;
    const wholeReward = Math.floor(exactReward + Number.EPSILON);
    this.experienceRemainder = exactReward - wholeReward;
    this.progression.addExperience(wholeReward);
  }

  private checkVictory(): void {
    if (this.spawnedEnemies !== this.definition.wave.enemyCount) return;
    for (const enemy of this.enemies) if (enemy.active) return;
    this.result = 'victory';
  }

  private random(): number {
    this.randomState = (Math.imul(this.randomState, 1664525) + 1013904223) >>> 0;
    return this.randomState / 0x1_0000_0000;
  }
}
