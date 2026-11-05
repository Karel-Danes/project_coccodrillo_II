import Phaser from 'phaser';
import type { GameEventBus } from '../bridge/events';
import { VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from './constants';
import { GameScene } from './scenes/GameScene';
import { MenuScene } from './scenes/MenuScene';

export function createGame(parent: string, bus: GameEventBus): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: VIEWPORT_WIDTH,
    height: VIEWPORT_HEIGHT,
    backgroundColor: '#0b0d10',
    pixelArt: true,
    roundPixels: true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [new MenuScene(), new GameScene(bus)],
  });
}
