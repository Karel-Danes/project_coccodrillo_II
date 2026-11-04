import Phaser from 'phaser';
import type { GameEventBus } from '../bridge/events';
import { GAME_HEIGHT, GAME_WIDTH } from './constants';
import { GameScene } from './scenes/GameScene';

export function createGame(parent: string, bus: GameEventBus): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: '#0d0f12',
    pixelArt: true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [new GameScene(bus)],
  });
}
