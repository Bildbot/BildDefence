import Phaser from 'phaser';
import { FIRST_COMBAT, type GuardianDefinition } from '../../content/firstCombat';
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
  body: Phaser.GameObjects.Arc;
  healthBack: Phaser.GameObjects.Rectangle;
  healthFill: Phaser.GameObjects.Rectangle;
};

export class ArenaScene extends Phaser.Scene {
  private readonly session: GameSession;
  private readonly bridge: GameBridge;
  private unsubscribeSession: (() => void) | undefined;
  private guardian?: Phaser.GameObjects.Arc;
  private simulation?: CombatSimulation;
  private readonly enemyViews: EnemyView[] = [];
  private readonly projectileViews: Phaser.GameObjects.Arc[] = [];
  private fixedStepAccumulator = 0;
  private snapshotAccumulator = 0;
  private activeRunId = -1;

  constructor(session: GameSession, bridge: GameBridge) {
    super('arena');
    this.session = session;
    this.bridge = bridge;
  }

  create(): void {
    this.drawArena();
    this.guardian = this.add.circle(GUARDIAN_X, GUARDIAN_Y, 28, 0x56d8ff);
    this.guardian.setStrokeStyle(5, 0xdaf8ff, 0.9);

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
    if (!this.guardian || this.session.getSnapshot().phase !== 'running' || !this.simulation) {
      return;
    }

    const pulse = 1 + Math.sin(time / 240) * 0.035;
    this.guardian.setScale(pulse);
    this.fixedStepAccumulator += Math.min(deltaMilliseconds / 1000, MAX_FRAME_SECONDS);
    while (this.fixedStepAccumulator >= FIXED_STEP_SECONDS) {
      this.simulation.step(FIXED_STEP_SECONDS);
      this.fixedStepAccumulator -= FIXED_STEP_SECONDS;
      this.snapshotAccumulator += FIXED_STEP_SECONDS;
    }

    this.syncViews();
    if (this.snapshotAccumulator >= SNAPSHOT_INTERVAL_SECONDS) {
      this.emitSnapshot();
      this.snapshotAccumulator = 0;
    }

    const result = this.simulation.getSnapshot().result;
    if (result !== null) {
      this.emitSnapshot();
      this.session.finish(result);
    }
  }

  private syncSession(): void {
    const state = this.session.getSnapshot();
    if (state.phase === 'paused' && !this.scene.isPaused()) this.scene.pause();
    if (state.phase === 'running' && this.scene.isPaused()) this.scene.resume();
    if (state.phase === 'running' && state.guardian && state.runId !== this.activeRunId) {
      this.startCombat(state.runId, state.guardian, state.guardianTotalExperience);
    }
    if (state.phase === 'menu') this.hideCombatViews();
  }

  private startCombat(
    runId: number,
    guardian: GuardianDefinition,
    guardianTotalExperience: number,
  ): void {
    this.activeRunId = runId;
    this.fixedStepAccumulator = 0;
    this.snapshotAccumulator = 0;
    this.simulation = new CombatSimulation(
      { ...FIRST_COMBAT, guardian },
      runId,
      guardianTotalExperience,
    );
    this.syncViews();
    this.emitSnapshot();
    this.bridge.emit('guardianPulse', { intensity: 1 });
  }

  private createPools(): void {
    for (let index = 0; index < FIRST_COMBAT.wave.enemyCount; index += 1) {
      const body = this.add.circle(0, 0, ENEMY_RADIUS, 0xff6f68).setVisible(false);
      body.setStrokeStyle(3, 0xffc0b9, 0.75);
      const healthBack = this.add.rectangle(0, 0, 25, 4, 0x22090b).setVisible(false);
      const healthFill = this.add
        .rectangle(0, 0, 25, 4, 0x8effaa)
        .setOrigin(0, 0.5)
        .setVisible(false);
      this.enemyViews.push({ body, healthBack, healthFill });
    }

    for (let index = 0; index < 64; index += 1) {
      this.projectileViews.push(
        this.add.circle(0, 0, PROJECTILE_RADIUS, 0xe6fbff).setVisible(false),
      );
    }
  }

  private syncViews(): void {
    if (!this.simulation) return;
    for (let index = 0; index < this.enemyViews.length; index += 1) {
      const view = this.enemyViews[index];
      const enemy = this.simulation.enemies[index];
      if (!view || !enemy) continue;
      view.body.setVisible(enemy.active);
      view.healthBack.setVisible(enemy.active);
      view.healthFill.setVisible(enemy.active);
      if (!enemy.active) continue;
      view.body.setPosition(enemy.x, enemy.y);
      view.healthBack.setPosition(enemy.x, enemy.y - 19);
      view.healthFill.setPosition(enemy.x - 12.5, enemy.y - 19);
      view.healthFill.width = 25 * Math.max(0, enemy.health / FIRST_COMBAT.enemy.maxHealth);
    }

    for (let index = 0; index < this.projectileViews.length; index += 1) {
      const view = this.projectileViews[index];
      const projectile = this.simulation.projectiles[index];
      if (!view || !projectile) continue;
      view.setVisible(projectile.active);
      if (projectile.active) view.setPosition(projectile.x, projectile.y);
    }
  }

  private hideCombatViews(): void {
    this.enemyViews.forEach(({ body, healthBack, healthFill }) => {
      body.setVisible(false);
      healthBack.setVisible(false);
      healthFill.setVisible(false);
    });
    this.projectileViews.forEach((projectile) => projectile.setVisible(false));
    this.guardian?.setScale(1);
  }

  private emitSnapshot(): void {
    if (this.simulation) this.bridge.emit('combatSnapshot', this.simulation.getSnapshot());
  }

  private drawArena(): void {
    this.cameras.main.setBackgroundColor('#081019');
    const graphics = this.add.graphics();
    graphics.fillStyle(0x0d1d2a, 1);
    graphics.fillRoundedRect(12, 12, ARENA_WIDTH - 24, ARENA_HEIGHT - 24, 28);
    graphics.lineStyle(1, 0x24465b, 0.38);
    for (let x = 30; x < ARENA_WIDTH; x += 30) graphics.lineBetween(x, 20, x, ARENA_HEIGHT - 20);
    for (let y = 40; y < ARENA_HEIGHT; y += 30) graphics.lineBetween(20, y, ARENA_WIDTH - 20, y);
    graphics.lineStyle(2, 0x58cbe8, 0.2);
    graphics.lineBetween(24, GUARDIAN_Y, ARENA_WIDTH - 24, GUARDIAN_Y);
    graphics.fillStyle(0x122c3c, 0.85);
    graphics.fillCircle(GUARDIAN_X, GUARDIAN_Y, 48);

    this.add
      .text(ARENA_WIDTH / 2, 92, 'ВРАГИ НАСТУПАЮТ С СЕВЕРА', {
        color: '#779bad',
        fontFamily: 'system-ui, sans-serif',
        fontSize: '12px',
        letterSpacing: 1.5,
      })
      .setOrigin(0.5);
  }
}
