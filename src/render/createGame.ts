import Phaser from 'phaser';
import type { GameEventBus } from '../bridge/events';
import { LEVEL_01 } from '../game/levels';
import { GameScene } from './scenes/GameScene';

export function createGame(parent: string, bus: GameEventBus): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: LEVEL_01.cols * LEVEL_01.tileSize,
    height: LEVEL_01.rows * LEVEL_01.tileSize,
    backgroundColor: '#0b0d10',
    pixelArt: true,
    roundPixels: true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [new GameScene(bus)],
  });
}
