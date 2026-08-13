import Phaser from 'phaser';
import { ARENA_HEIGHT, ARENA_WIDTH } from '../shared/constants';
import type { GameBridge } from '../shared/GameBridge';
import { ArenaScene } from './scenes/ArenaScene';
import type { GameSession } from './session/GameSession';

export function createGame(
  parent: HTMLElement,
  session: GameSession,
  bridge: GameBridge,
): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: ARENA_WIDTH,
    height: ARENA_HEIGHT,
    backgroundColor: '#081019',
    antialias: true,
    render: {
      pixelArt: false,
      roundPixels: true,
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: ARENA_WIDTH,
      height: ARENA_HEIGHT,
    },
    scene: [new ArenaScene(session, bridge)],
  });
}
