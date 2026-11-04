import Phaser from 'phaser';
import { tileAt } from '../game/level';
import type { Level } from '../game/types';
import {
  TERRAIN_STRIPS,
  TERRAIN_TEXTURES,
  TERRAIN_TILE,
} from './assets/terrain';

const FRAME = {
  frameWidth: TERRAIN_TILE,
  frameHeight: TERRAIN_TILE,
};

export function loadTerrainAssets(scene: Phaser.Scene): void {
  if (!scene.textures.exists(TERRAIN_TEXTURES.top)) {
    scene.load.spritesheet(
      TERRAIN_TEXTURES.top,
      TERRAIN_STRIPS.top,
      FRAME,
    );
  }
  if (!scene.textures.exists(TERRAIN_TEXTURES.fill)) {
    scene.load.spritesheet(
      TERRAIN_TEXTURES.fill,
      TERRAIN_STRIPS.fill,
      FRAME,
    );
  }
}

/**
 * Bakes all solid tiles into one half-resolution render texture, displayed
 * at 2x. Surface tiles use the grass strip; covered tiles use dirt. Three
 * variants per strip are mixed by position so long walls do not look tiled.
 */
export function createTerrainTexture(
  scene: Phaser.Scene,
  level: Level,
): Phaser.GameObjects.RenderTexture {
  const scale = level.tileSize / TERRAIN_TILE;
  const texture = scene.add
    .renderTexture(
      0,
      0,
      (level.cols * level.tileSize) / scale,
      (level.rows * level.tileSize) / scale,
    )
    .setOrigin(0, 0)
    .setScale(scale)
    .setDepth(0);

  for (let row = 0; row < level.rows; row += 1) {
    for (let col = 0; col < level.cols; col += 1) {
      if (tileAt(level, col, row) !== 'solid') {
        continue;
      }

      const isSurface = tileAt(level, col, row - 1) !== 'solid';
      const key = isSurface ? TERRAIN_TEXTURES.top : TERRAIN_TEXTURES.fill;
      const variant = (col * 5 + row * 7) % 3;

      texture.drawFrame(
        key,
        variant,
        col * TERRAIN_TILE,
        row * TERRAIN_TILE,
      );
    }
  }

  return texture;
}
