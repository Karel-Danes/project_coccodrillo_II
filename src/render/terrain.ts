import Phaser from 'phaser';
import { tileAt } from '../game/level';
import type { Level } from '../game/types';

const STONE_KEY = 'terrain-stone';
const TILE = 32;
const VARIANTS = 3;

/**
 * Draws three variants of a night-stone top tile and three fill tiles into
 * a canvas texture. Doing it at runtime keeps the palette matched to the
 * desert-ruins pack and avoids relying on WebGL-only tint paths.
 */
function ensureStoneTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(STONE_KEY)) {
    return;
  }

  const canvas = scene.textures.createCanvas(
    STONE_KEY,
    TILE * VARIANTS * 2,
    TILE,
  );
  if (!canvas) {
    return;
  }

  const context = canvas.getContext();
  let seed = 0x1a2b3c;
  const random = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  for (let type = 0; type < 2; type += 1) {
    for (let variant = 0; variant < VARIANTS; variant += 1) {
      const ox = (type * VARIANTS + variant) * TILE;

      context.fillStyle = type === 0 ? '#354154' : '#232b3b';
      context.fillRect(ox, 0, TILE, TILE);

      for (let i = 0; i < 30; i += 1) {
        const x = ox + Math.floor(random() * TILE);
        const y = Math.floor(random() * TILE);
        const size = 1 + Math.floor(random() * 2);
        context.fillStyle = random() > 0.5 ? '#2c3647' : '#45526a';
        context.fillRect(x, y, size, size);
      }

      // A few cracks so long walls do not read as flat noise.
      context.fillStyle = '#1e2634';
      const cracks = variant === 0 ? 1 : 2;
      for (let i = 0; i < cracks; i += 1) {
        const x = ox + 4 + Math.floor(random() * 22);
        const y = 6 + Math.floor(random() * 20);
        context.fillRect(x, y, 1, 3 + Math.floor(random() * 5));
        context.fillRect(x + 1, y + 2, 2 + Math.floor(random() * 3), 1);
      }

      if (type === 0) {
        // Moonlit rim on walkable surfaces.
        context.fillStyle = '#8090aa';
        context.fillRect(ox, 0, TILE, 2);
        context.fillStyle = '#596984';
        context.fillRect(ox, 2, TILE, 2);
        context.fillStyle = '#171d28';
        context.fillRect(ox, TILE - 1, TILE, 1);
      }
    }
  }

  canvas.refresh();

  for (let type = 0; type < 2; type += 1) {
    for (let variant = 0; variant < VARIANTS; variant += 1) {
      canvas.add(
        `${type === 0 ? 'top' : 'fill'}-${variant}`,
        0,
        (type * VARIANTS + variant) * TILE,
        0,
        TILE,
        TILE,
      );
    }
  }
}

/**
 * Bakes solid tiles into half-resolution render textures, displayed at 2x.
 * Terrain is split into 32-column chunks so no texture exceeds 1024 px wide
 * on mobile GPUs. Surface tiles get the lit rim; covered tiles the fill.
 */
export function createTerrainTexture(
  scene: Phaser.Scene,
  level: Level,
): void {
  ensureStoneTexture(scene);

  const scale = level.tileSize / TILE;
  const chunkCols = 32;

  for (let startCol = 0; startCol < level.cols; startCol += chunkCols) {
    const cols = Math.min(chunkCols, level.cols - startCol);
    const texture = scene.add
      .renderTexture(
        startCol * level.tileSize,
        0,
        cols * TILE,
        level.rows * TILE,
      )
      .setOrigin(0, 0)
      .setScale(scale)
      .setDepth(0);

    for (let row = 0; row < level.rows; row += 1) {
      for (let localCol = 0; localCol < cols; localCol += 1) {
        const col = startCol + localCol;
        if (tileAt(level, col, row) !== 'solid') {
          continue;
        }

        const isSurface = tileAt(level, col, row - 1) !== 'solid';
        const variant = (col * 5 + row * 7) % VARIANTS;
        const frame = `${isSurface ? 'top' : 'fill'}-${variant}`;

        texture.drawFrame(
          STONE_KEY,
          frame,
          localCol * TILE,
          row * TILE,
        );
      }
    }
  }
}
