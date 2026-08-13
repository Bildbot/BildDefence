import Phaser from 'phaser';
import { ARENA_HEIGHT, ARENA_WIDTH } from '../../shared/constants';
import type { GameBridge } from '../../shared/GameBridge';
import type { GameSession } from '../session/GameSession';

export class ArenaScene extends Phaser.Scene {
  private readonly session: GameSession;
  private readonly bridge: GameBridge;
  private unsubscribeSession?: () => void;
  private guardian?: Phaser.GameObjects.Arc;

  constructor(session: GameSession, bridge: GameBridge) {
    super('arena');
    this.session = session;
    this.bridge = bridge;
  }

  create(): void {
    this.drawArena();
    this.guardian = this.add.circle(ARENA_WIDTH / 2, ARENA_HEIGHT / 2 + 42, 28, 0x56d8ff);
    this.guardian.setStrokeStyle(5, 0xdaf8ff, 0.9);
    this.add
      .text(ARENA_WIDTH / 2, ARENA_HEIGHT / 2 + 96, 'СТРАЖ', {
        color: '#dff9ff',
        fontFamily: 'system-ui, sans-serif',
        fontSize: '14px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.unsubscribeSession = this.session.subscribe(() => this.syncSession());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubscribeSession?.());
    this.syncSession();
  }

  update(time: number): void {
    if (!this.guardian || this.session.getSnapshot().phase !== 'running') return;
    const pulse = 1 + Math.sin(time / 300) * 0.045;
    this.guardian.setScale(pulse);
  }

  private syncSession(): void {
    const phase = this.session.getSnapshot().phase;
    if (phase === 'paused' && !this.scene.isPaused()) this.scene.pause();
    if (phase === 'running' && this.scene.isPaused()) this.scene.resume();
    if (phase === 'running') this.bridge.emit('guardianPulse', { intensity: 1 });
  }

  private drawArena(): void {
    this.cameras.main.setBackgroundColor('#081019');
    const graphics = this.add.graphics();
    graphics.fillStyle(0x0d1d2a, 1);
    graphics.fillRoundedRect(12, 12, ARENA_WIDTH - 24, ARENA_HEIGHT - 24, 28);
    graphics.lineStyle(1, 0x24465b, 0.38);
    for (let x = 30; x < ARENA_WIDTH; x += 30) graphics.lineBetween(x, 20, x, ARENA_HEIGHT - 20);
    for (let y = 40; y < ARENA_HEIGHT; y += 30) graphics.lineBetween(20, y, ARENA_WIDTH - 20, y);
    graphics.lineStyle(2, 0x58cbe8, 0.24);
    graphics.strokeCircle(ARENA_WIDTH / 2, ARENA_HEIGHT / 2 + 42, 116);
    graphics.fillStyle(0x122c3c, 0.85);
    graphics.fillCircle(ARENA_WIDTH / 2, ARENA_HEIGHT / 2 + 42, 84);

    this.add
      .text(ARENA_WIDTH / 2, 76, 'АРЕНА НУЛЕВОГО СРЕЗА', {
        color: '#779bad',
        fontFamily: 'system-ui, sans-serif',
        fontSize: '13px',
        letterSpacing: 2,
      })
      .setOrigin(0.5);
  }
}
