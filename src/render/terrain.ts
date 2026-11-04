import grassFillUrl from '../../graphics/sidescroller_starter_pack/terrain/ground_fill_96x32_derived.png?url';
import grassTopUrl from '../../graphics/sidescroller_starter_pack/terrain/ground_top_96x32_derived.png?url';
import Phaser from 'phaser';
import { tileAt } from '../game/level';
import type { Level } from '../game/types';

const STONE_KEY = 'terrain-stone';
const GRASS_TOP = 'terrain-grass-top';
const GRASS_FILL = 'terrain-grass-fill';
const TILE = 32;
const VARIANTS = 3;

/**
 * The lush opening uses the starter pack's grass/dirt art; the ruin end uses
 * runtime night-stone. Both are drawn per tile, with the stone alpha ramping
 * up across the middle of the world.
 */
export function loadTerrainAssets(scene: Phaser.Scene): void {
  const frame = { frameWidth: TILE, frameHeight: TILE };
  if (!scene.textures.exists(GRASS_TOP)) {
    scene.load.spritesheet(GRASS_TOP, grassTopUrl, frame);
  }
  if (!scene.textures.exists(GRASS_FILL)) {
    scene.load.spritesheet(GRASS_FILL, grassFillUrl, frame);
  }
}

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

      context.fillStyle = '#1e2634';
      const cracks = variant === 0 ? 1 : 2;
      for (let i = 0; i < cracks; i += 1) {
        const x = ox + 4 + Math.floor(random() * 22);
        const y = 6 + Math.floor(random() * 20);
        context.fillRect(x, y, 1, 3 + Math.floor(random() * 5));
        context.fillRect(x + 1, y + 2, 2 + Math.floor(random() * 3), 1);
      }

      if (type === 0) {
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
 * on mobile GPUs. Columns 6-76 cross-fade from grass to night stone.
 */
export function createTerrainTexture(
  scene: Phaser.Scene,
  level: Level,
  layer?: Phaser.GameObjects.Layer,
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
    layer?.add(texture);

    for (let row = 0; row < level.rows; row += 1) {
      for (let localCol = 0; localCol < cols; localCol += 1) {
        const col = startCol + localCol;
        if (tileAt(level, col, row) !== 'solid') {
          continue;
        }

        const isSurface = tileAt(level, col, row - 1) !== 'solid';
        const variant = (col * 5 + row * 7) % VARIANTS;
        const raw = Math.min(1, Math.max(0, (col - 6) / (76 - 6)));
        const progress = raw * raw * (3 - 2 * raw);

        const grassKey = isSurface ? GRASS_TOP : GRASS_FILL;
        const stoneFrame = `${isSurface ? 'top' : 'fill'}-${variant}`;
        const x = localCol * TILE;
        const y = row * TILE;

        texture.drawFrame(grassKey, variant, x, y);
        if (progress > 0.01) {
          texture.drawFrame(STONE_KEY, stoneFrame, x, y, progress);
        }
      }
    }
  }
}
