import Phaser from 'phaser';
import { MAX_ARENA_ENEMIES, createArenaCombatDefinition } from '../../content/arenaBalance';
import type { GuardianDefinition } from '../../content/firstCombat';
import { soundFX } from '../../services/audio/SoundFX';
import { ARENA_HEIGHT, ARENA_WIDTH } from '../../shared/constants';
import type { GameBridge } from '../../shared/GameBridge';
import {
  CombatSimulation,
  ENEMY_RADIUS,
  GUARDIAN_X,
  GUARDIAN_Y,
  PROJECTILE_RADIUS,
} from '../combat/CombatSimulation';
import type { GameSession } from '../session/GameSession';

const FIXED_STEP_SECONDS = 1 / 60;
const MAX_FRAME_SECONDS = 0.1;
const SNAPSHOT_INTERVAL_SECONDS = 0.1;

type EnemyView = {
  container: Phaser.GameObjects.Container;
  outerGlow: Phaser.GameObjects.Arc;
  body: Phaser.GameObjects.Arc;
  innerEye: Phaser.GameObjects.Arc;
  healthBack: Phaser.GameObjects.Rectangle;
  healthFill: Phaser.GameObjects.Rectangle;
  lastHealth: number;
  flashTimer: number;
};

type ProjectileView = {
  container: Phaser.GameObjects.Container;
  core: Phaser.GameObjects.Arc;
  glow: Phaser.GameObjects.Arc;
  trail: Phaser.GameObjects.Arc[];
};

type FloatingText = {
  text: Phaser.GameObjects.Text;
  startY: number;
  life: number;
  maxLife: number;
  isCrit: boolean;
};

type Particle = {
  arc: Phaser.GameObjects.Arc;
  vx: number;
  vy: number;
  alpha: number;
  decay: number;
};

export class ArenaScene extends Phaser.Scene {
  private readonly session: GameSession;
  private readonly bridge: GameBridge;
  private unsubscribeSession: (() => void) | undefined;

  // Guardian Visuals
  private guardianContainer?: Phaser.GameObjects.Container;
  private guardianCore?: Phaser.GameObjects.Arc;
  private guardianOuterRing?: Phaser.GameObjects.Graphics;
  private guardianShieldAura?: Phaser.GameObjects.Arc;
  private guardianSatellites: Phaser.GameObjects.Arc[] = [];
  private guardianMuzzleFlash?: Phaser.GameObjects.Arc;

  private simulation?: CombatSimulation;
  private readonly enemyViews: EnemyView[] = [];
  private readonly projectileViews: ProjectileView[] = [];
  private readonly floatingTexts: FloatingText[] = [];
  private readonly particles: Particle[] = [];
  private readonly starfield: Phaser.GameObjects.Arc[] = [];

  private fixedStepAccumulator = 0;
  private snapshotAccumulator = 0;
  private activeRunId = -1;
  private prevGuardianHealth = -1;
  private prevDefeatedEnemies = 0;
  private prevActiveProjectiles = 0;
  private muzzleFlashTimer = 0;
  private guardianShieldHitTimer = 0;

  constructor(session: GameSession, bridge: GameBridge) {
    super('arena');
    this.session = session;
    this.bridge = bridge;
  }

  create(): void {
    this.drawAtmosphere();
    this.createGuardian();
    this.createPools();

    this.unsubscribeSession = this.session.subscribe(() => this.syncSession());
    const cleanupSession = () => {
      this.unsubscribeSession?.();
      this.unsubscribeSession = undefined;
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanupSession);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanupSession);
    this.syncSession();
  }

  update(time: number, deltaMilliseconds: number): void {
    const deltaSeconds = Math.min(deltaMilliseconds / 1000, MAX_FRAME_SECONDS);

    // Update ambient starfield drift
    this.updateAtmosphere(deltaSeconds);

    if (
      !this.guardianContainer ||
      this.session.getSnapshot().phase !== 'running' ||
      !this.simulation
    ) {
      return;
    }

    // Animate guardian core & satellites
    this.animateGuardian(time, deltaSeconds);

    // Simulation stepping
    this.fixedStepAccumulator += deltaSeconds;
    while (this.fixedStepAccumulator >= FIXED_STEP_SECONDS) {
      this.simulation.step(FIXED_STEP_SECONDS);
      this.fixedStepAccumulator -= FIXED_STEP_SECONDS;
      this.snapshotAccumulator += FIXED_STEP_SECONDS;
    }

    this.syncViews(deltaSeconds);
    this.updateParticles(deltaSeconds);
    this.updateFloatingTexts(deltaSeconds);

    if (this.snapshotAccumulator >= SNAPSHOT_INTERVAL_SECONDS) {
      this.emitSnapshot();
      this.snapshotAccumulator = 0;
    }

    const snap = this.simulation.getSnapshot();

    // Check guardian health decrease for sound & screen shake
    if (this.prevGuardianHealth > 0 && snap.guardianHealth < this.prevGuardianHealth) {
      soundFX.playGuardianHurt();
      this.guardianShieldHitTimer = 0.2;
      this.cameras.main.shake(120, 0.008);
    }
    this.prevGuardianHealth = snap.guardianHealth;

    // Check enemy defeat count
    if (snap.defeatedEnemies > this.prevDefeatedEnemies) {
      const defeatedCount = snap.defeatedEnemies - this.prevDefeatedEnemies;
      for (let i = 0; i < defeatedCount; i++) {
        soundFX.playEnemyDefeat();
      }
      this.prevDefeatedEnemies = snap.defeatedEnemies;
    }

    const result = snap.result;
    if (result !== null) {
      this.emitSnapshot();
      if (result === 'victory') {
        soundFX.playVictory();
        this.spawnVictoryCelebration();
      } else {
        soundFX.playDefeat();
      }
      this.session.finish(result);
    }
  }

  private drawAtmosphere(): void {
    this.cameras.main.setBackgroundColor('#050811');

    // Starfield particles
    for (let i = 0; i < 48; i++) {
      const x = Phaser.Math.Between(15, ARENA_WIDTH - 15);
      const y = Phaser.Math.Between(15, ARENA_HEIGHT - 15);
      const radius = Phaser.Math.FloatBetween(0.7, 1.8);
      const alpha = Phaser.Math.FloatBetween(0.15, 0.65);
      const star = this.add.circle(x, y, radius, 0x38bdf8, alpha);
      this.starfield.push(star);
    }

    // Main Arena Card Background
    const arenaGraphics = this.add.graphics();

    // Deep obsidian-navy rounded backdrop
    arenaGraphics.fillStyle(0x0a101f, 0.95);
    arenaGraphics.fillRoundedRect(10, 10, ARENA_WIDTH - 20, ARENA_HEIGHT - 20, 24);

    // Subtle inner glowing border
    arenaGraphics.lineStyle(1.5, 0x0ea5e9, 0.35);
    arenaGraphics.strokeRoundedRect(10, 10, ARENA_WIDTH - 20, ARENA_HEIGHT - 20, 24);

    // High-tech matrix grid
    arenaGraphics.lineStyle(1, 0x1e293b, 0.4);
    for (let x = 32; x < ARENA_WIDTH - 15; x += 32) {
      arenaGraphics.lineBetween(x, 20, x, ARENA_HEIGHT - 20);
    }
    for (let y = 35; y < ARENA_HEIGHT - 20; y += 32) {
      arenaGraphics.lineBetween(20, y, ARENA_WIDTH - 20, y);
    }
  }

  private updateAtmosphere(deltaSeconds: number): void {
    for (const star of this.starfield) {
      star.y += 12 * deltaSeconds;
      if (star.y > ARENA_HEIGHT - 10) {
        star.y = 15;
        star.x = Phaser.Math.Between(15, ARENA_WIDTH - 15);
      }
    }
  }

  private createGuardian(): void {
    this.guardianContainer = this.add.container(GUARDIAN_X, GUARDIAN_Y);

    // Guardian Pedestal / Ring
    const basePlatform = this.add.graphics();
    basePlatform.fillStyle(0x0c4a6e, 0.45);
    basePlatform.fillCircle(0, 0, 48);
    basePlatform.lineStyle(2, 0x38bdf8, 0.4);
    basePlatform.strokeCircle(0, 0, 48);
    this.guardianContainer.add(basePlatform);

    // Guardian Outer Rune Ring
    this.guardianOuterRing = this.add.graphics();
    this.drawRuneRing(this.guardianOuterRing, 36);
    this.guardianContainer.add(this.guardianOuterRing);

    // Guardian Shield Aura (Flashes on hit)
    this.guardianShieldAura = this.add.circle(0, 0, 42, 0x00f0ff, 0.15);
    this.guardianShieldAura.setStrokeStyle(3, 0x38bdf8, 0.8);
    this.guardianContainer.add(this.guardianShieldAura);

    // Guardian Core Plasma
    const coreGlow = this.add.circle(0, 0, 26, 0x0284c7, 0.5);
    this.guardianCore = this.add.circle(0, 0, 22, 0x38bdf8);
    this.guardianCore.setStrokeStyle(3, 0xe0f2fe, 0.95);
    this.guardianContainer.add(coreGlow);
    this.guardianContainer.add(this.guardianCore);

    // Guardian Orbiting Satellites (3 power nodes)
    for (let i = 0; i < 3; i++) {
      const sat = this.add.circle(0, 0, 5, 0x00f0ff, 0.9);
      sat.setStrokeStyle(1.5, 0xffffff, 1);
      this.guardianContainer.add(sat);
      this.guardianSatellites.push(sat);
    }

    // Guardian Firing Muzzle Flash
    this.guardianMuzzleFlash = this.add.circle(0, -28, 14, 0xffffff, 0);
    this.guardianContainer.add(this.guardianMuzzleFlash);
  }

  private drawRuneRing(graphics: Phaser.GameObjects.Graphics, radius: number): void {
    graphics.clear();
    graphics.lineStyle(1.5, 0x7dd3fc, 0.7);
    graphics.strokeCircle(0, 0, radius);
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3;
      const x1 = Math.cos(angle) * (radius - 5);
      const y1 = Math.sin(angle) * (radius - 5);
      const x2 = Math.cos(angle) * (radius + 5);
      const y2 = Math.sin(angle) * (radius + 5);
      graphics.lineBetween(x1, y1, x2, y2);
    }
  }

  private animateGuardian(time: number, deltaSeconds: number): void {
    if (!this.guardianContainer || !this.guardianOuterRing || !this.guardianCore) return;

    // Pulse core
    const breathing = 1 + Math.sin(time / 280) * 0.05;
    this.guardianCore.setScale(breathing);

    // Rotate outer ring
    this.guardianOuterRing.rotation += 0.8 * deltaSeconds;

    // Rotate satellites
    for (let i = 0; i < this.guardianSatellites.length; i++) {
      const angle = time / 500 + (i * Math.PI * 2) / 3;
      const sat = this.guardianSatellites[i];
      if (sat) {
        sat.setPosition(Math.cos(angle) * 34, Math.sin(angle) * 34);
      }
    }

    // Handle muzzle flash fade
    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer -= deltaSeconds;
      if (this.guardianMuzzleFlash) {
        this.guardianMuzzleFlash.setAlpha(Math.max(0, this.muzzleFlashTimer / 0.1));
      }
    }

    // Handle shield flash
    if (this.guardianShieldHitTimer > 0) {
      this.guardianShieldHitTimer -= deltaSeconds;
      if (this.guardianShieldAura) {
        this.guardianShieldAura.setAlpha(0.65);
        this.guardianShieldAura.setScale(1.08);
      }
    } else if (this.guardianShieldAura) {
      this.guardianShieldAura.setAlpha(0.18 + Math.sin(time / 350) * 0.08);
      this.guardianShieldAura.setScale(1);
    }
  }

  private createPools(): void {
    // Enemies Pool
    for (let index = 0; index < MAX_ARENA_ENEMIES; index += 1) {
      const container = this.add.container(0, 0).setVisible(false);

      const outerGlow = this.add.circle(0, 0, ENEMY_RADIUS + 4, 0xef4444, 0.25);

      // Centered cyber-drone chassis
      const body = this.add.circle(0, 0, ENEMY_RADIUS, 0xef4444);
      body.setStrokeStyle(2, 0xfecaca, 0.95);

      // Inner armor ring
      const innerArmor = this.add.circle(0, 0, ENEMY_RADIUS * 0.5, 0x7f1d1d, 0.85);

      // Glowing central eye
      const innerEye = this.add.circle(0, 0, 3, 0xffffff, 0.95);

      // Futuristic Health Bar
      const healthBack = this.add.rectangle(0, -18, 28, 4, 0x090d16, 0.85);
      healthBack.setStrokeStyle(1, 0x334155, 0.6);

      const healthFill = this.add.rectangle(-14, -18, 28, 3, 0x10b981).setOrigin(0, 0.5);

      container.add([outerGlow, body, innerArmor, innerEye, healthBack, healthFill]);

      this.enemyViews.push({
        container,
        outerGlow,
        body,
        innerEye,
        healthBack,
        healthFill,
        lastHealth: 0,
        flashTimer: 0,
      });
    }

    // Projectiles Pool
    for (let index = 0; index < 64; index += 1) {
      const container = this.add.container(0, 0).setVisible(false);
      const glow = this.add.circle(0, 0, PROJECTILE_RADIUS + 4, 0x38bdf8, 0.4);
      const core = this.add.circle(0, 0, PROJECTILE_RADIUS, 0xffffff);
      core.setStrokeStyle(1.5, 0x7dd3fc, 0.9);

      // Trailing tail particles
      const trail: Phaser.GameObjects.Arc[] = [];
      for (let t = 0; t < 3; t++) {
        const tr = this.add.circle(0, 0, PROJECTILE_RADIUS - t, 0x00f0ff, 0.5 - t * 0.15);
        trail.push(tr);
      }

      container.add([glow, ...trail, core]);
      this.projectileViews.push({ container, core, glow, trail });
    }
  }

  private syncViews(deltaSeconds: number): void {
    if (!this.simulation) return;

    let activeProjectilesCount = 0;

    // Sync Enemies
    for (let index = 0; index < this.enemyViews.length; index += 1) {
      const view = this.enemyViews[index];
      const enemy = this.simulation.enemies[index];
      if (!view) continue;

      if (!enemy || !enemy.active) {
        if (view.container.visible) {
          // Enemy just died, spawn burst particles
          this.spawnEnemyDeathParticles(view.container.x, view.container.y);
        }
        view.container.setVisible(false);
        view.lastHealth = 0;
        continue;
      }

      if (!view.container.visible) {
        view.container.setVisible(true);
        view.container.setAlpha(0);
        this.tweens.add({
          targets: view.container,
          alpha: 1,
          duration: 400,
          ease: 'Sine.easeOut',
        });
      }

      view.container.setPosition(enemy.x, enemy.y);

      // Check hit damage for flash & damage number
      if (view.lastHealth > 0 && enemy.health < view.lastHealth) {
        const damage = view.lastHealth - enemy.health;
        const isCrit = damage > this.simulation.getSnapshot().guardianLevel * 2 + 10;
        this.spawnDamageNumber(enemy.x, enemy.y - 12, damage, isCrit);
        soundFX.playHit(isCrit);
        view.flashTimer = 0.12;
      }
      view.lastHealth = enemy.health;

      // Update flash timer
      if (view.flashTimer > 0) {
        view.flashTimer -= deltaSeconds;
        view.body.setFillStyle(0xffffff);
      } else {
        view.body.setFillStyle(0xef4444);
      }

      // Update health fill width and color
      const healthRatio = Math.max(0, enemy.health / enemy.maxHealth);
      view.healthFill.width = 30 * healthRatio;
      if (healthRatio > 0.5) {
        view.healthFill.setFillStyle(0x10b981);
      } else if (healthRatio > 0.25) {
        view.healthFill.setFillStyle(0xf59e0b);
      } else {
        view.healthFill.setFillStyle(0xef4444);
      }
    }

    // Sync Projectiles
    for (let index = 0; index < this.projectileViews.length; index += 1) {
      const view = this.projectileViews[index];
      const projectile = this.simulation.projectiles[index];
      if (!view || !projectile) continue;

      view.container.setVisible(projectile.active);
      if (projectile.active) {
        activeProjectilesCount += 1;
        view.container.setPosition(projectile.x, projectile.y);

        // Position trail behind velocity
        const angle = Math.atan2(projectile.velocityY, projectile.velocityX);
        for (let t = 0; t < view.trail.length; t++) {
          const offset = (t + 1) * 4;
          view.trail[t]?.setPosition(-Math.cos(angle) * offset, -Math.sin(angle) * offset);
        }
      }
    }

    // Check if new projectile was launched -> trigger muzzle flash & sound
    if (activeProjectilesCount > this.prevActiveProjectiles) {
      soundFX.playShot();
      this.muzzleFlashTimer = 0.08;
      if (this.guardianMuzzleFlash) {
        this.guardianMuzzleFlash.setAlpha(0.9);
      }
    }
    this.prevActiveProjectiles = activeProjectilesCount;
  }

  private spawnDamageNumber(x: number, y: number, damage: number, isCrit: boolean): void {
    const formatted = Math.ceil(damage);
    const textStr = isCrit ? `⚡ ${formatted}` : `${formatted}`;
    const color = isCrit ? '#fbbf24' : '#f8fafc';
    const stroke = isCrit ? '#78350f' : '#0f172a';
    const fontSize = isCrit ? '15px' : '12px';

    const textObj = this.add
      .text(x + Phaser.Math.Between(-8, 8), y, textStr, {
        fontFamily: 'Rajdhani, sans-serif',
        fontSize,
        fontStyle: 'bold',
        color,
        stroke,
        strokeThickness: 3,
      })
      .setOrigin(0.5);

    if (isCrit) {
      textObj.setScale(1.3);
      this.tweens.add({
        targets: textObj,
        scale: 1,
        duration: 150,
        ease: 'Back.easeOut',
      });
    }

    this.floatingTexts.push({
      text: textObj,
      startY: y,
      life: 0,
      maxLife: 0.65,
      isCrit,
    });
  }

  private updateFloatingTexts(deltaSeconds: number): void {
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const item = this.floatingTexts[i];
      if (!item) continue;
      item.life += deltaSeconds;
      const progress = item.life / item.maxLife;

      item.text.y = item.startY - progress * 32;
      item.text.setAlpha(1 - progress * progress);

      if (item.life >= item.maxLife) {
        item.text.destroy();
        this.floatingTexts.splice(i, 1);
      }
    }
  }

  private spawnEnemyDeathParticles(x: number, y: number): void {
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.2, 0.2);
      const speed = Phaser.Math.FloatBetween(40, 110);
      const radius = Phaser.Math.FloatBetween(2, 4);
      const arc = this.add.circle(x, y, radius, 0xf87171, 0.9);

      this.particles.push({
        arc,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        alpha: 1,
        decay: Phaser.Math.FloatBetween(2.2, 3.5),
      });
    }

    // Floating XP essence spark towards guardian
    const xpOrb = this.add.circle(x, y, 4, 0x38bdf8, 1);
    xpOrb.setStrokeStyle(1.5, 0xe0f2fe);
    this.tweens.add({
      targets: xpOrb,
      x: GUARDIAN_X,
      y: GUARDIAN_Y,
      duration: 500,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        xpOrb.destroy();
      },
    });
  }

  private spawnVictoryCelebration(): void {
    for (let i = 0; i < 35; i++) {
      const x = Phaser.Math.Between(40, ARENA_WIDTH - 40);
      const y = Phaser.Math.Between(80, ARENA_HEIGHT - 120);
      const color = Phaser.Utils.Array.GetRandom([0x38bdf8, 0xf59e0b, 0x10b981, 0xa855f7]);
      const arc = this.add.circle(x, y, Phaser.Math.FloatBetween(3, 6), color, 1);

      this.particles.push({
        arc,
        vx: Phaser.Math.FloatBetween(-50, 50),
        vy: Phaser.Math.FloatBetween(-90, -20),
        alpha: 1,
        decay: 1.2,
      });
    }
  }

  private updateParticles(deltaSeconds: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      if (!p) continue;
      p.arc.x += p.vx * deltaSeconds;
      p.arc.y += p.vy * deltaSeconds;
      p.alpha -= p.decay * deltaSeconds;
      p.arc.setAlpha(Math.max(0, p.alpha));

      if (p.alpha <= 0) {
        p.arc.destroy();
        this.particles.splice(i, 1);
      }
    }
  }

  private syncSession(): void {
    const state = this.session.getSnapshot();
    if (state.phase === 'paused' && !this.scene.isPaused()) this.scene.pause();
    if (state.phase === 'running' && this.scene.isPaused()) this.scene.resume();
    if (
      state.phase === 'running' &&
      state.guardian &&
      state.arenaLevel !== null &&
      state.runId !== this.activeRunId
    ) {
      this.startCombat(
        state.runId,
        state.guardian,
        state.guardianTotalExperience,
        state.arenaLevel,
      );
    }
    if (state.phase === 'menu') this.hideCombatViews();
  }

  private startCombat(
    runId: number,
    guardian: GuardianDefinition,
    guardianTotalExperience: number,
    arenaLevel: number,
  ): void {
    this.activeRunId = runId;
    this.fixedStepAccumulator = 0;
    this.snapshotAccumulator = 0;
    this.prevGuardianHealth = guardian.maxHealth;
    this.prevDefeatedEnemies = 0;
    this.prevActiveProjectiles = 0;

    this.simulation = new CombatSimulation(
      createArenaCombatDefinition(arenaLevel, guardian),
      runId,
      guardianTotalExperience,
    );
    this.syncViews(0);
    this.emitSnapshot();
    this.bridge.emit('guardianPulse', { intensity: 1 });
  }

  private hideCombatViews(): void {
    this.enemyViews.forEach(({ container }) => {
      container.setVisible(false);
    });
    this.projectileViews.forEach(({ container }) => {
      container.setVisible(false);
    });
    for (const text of this.floatingTexts) {
      text.text.destroy();
    }
    this.floatingTexts.length = 0;
  }

  private emitSnapshot(): void {
    if (this.simulation) this.bridge.emit('combatSnapshot', this.simulation.getSnapshot());
  }
}
