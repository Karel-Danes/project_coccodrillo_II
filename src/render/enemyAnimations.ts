import Phaser from 'phaser';
import type { EnemyKind } from '../game/types';
import {
  ENEMY_ART,
  enemyTextureKey,
  type EnemyArt,
} from './assets/enemies';

const CLIPS = ['idle', 'walk', 'attack', 'hurt', 'death'] as const;
const FRAME_COUNTS: Record<(typeof CLIPS)[number], number> = {
  idle: 4,
  walk: 6,
  attack: 6,
  hurt: 4,
  death: 6,
};

function frameConfig(art: EnemyArt) {
  return { frameWidth: art.frameWidth, frameHeight: art.frameHeight };
}

export function loadEnemyAssets(scene: Phaser.Scene): void {
  for (const kind of Object.keys(ENEMY_ART) as EnemyKind[]) {
    const art = ENEMY_ART[kind];
    for (const clip of CLIPS) {
      const key = enemyTextureKey(kind, clip);
      if (!scene.textures.exists(key)) {
        scene.load.spritesheet(key, art.strips[clip], frameConfig(art));
      }
    }
  }
}

export function registerEnemyAnimations(scene: Phaser.Scene): void {
  for (const kind of Object.keys(ENEMY_ART) as EnemyKind[]) {
    for (const clip of CLIPS) {
      const key = enemyTextureKey(kind, clip);
      if (scene.anims.exists(key)) {
        continue;
      }
      scene.anims.create({
        key,
        frames: scene.anims.generateFrameNumbers(key, {
          start: 0,
          end: FRAME_COUNTS[clip] - 1,
        }),
        frameRate: clip === 'walk' ? 10 : clip === 'idle' ? 6 : 8,
        repeat: clip === 'idle' || clip === 'walk' ? -1 : 0,
      });
    }
  }
}
