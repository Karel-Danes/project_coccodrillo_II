import Phaser from 'phaser';
import type { Level } from '../game/types';
import tree1Url from '../../graphics/Cozy Ancient Desert Nigth Ruins – 2D Pixel Art Platformer Asset Pack/Prop/tree/tree1.png?url';
import tree4Url from '../../graphics/Cozy Ancient Desert Nigth Ruins – 2D Pixel Art Platformer Asset Pack/Prop/tree/tree4.png?url';
import tree8Url from '../../graphics/Cozy Ancient Desert Nigth Ruins – 2D Pixel Art Platformer Asset Pack/Prop/tree/tree8.png?url';

const TREE_URLS = [tree1Url, tree4Url, tree8Url] as const;
const TREE_KEYS = TREE_URLS.map((_, index) => `decor-tree-${index}`);
const ROCK_TEXTURE = 'decor-rock';

export function loadDecorationAssets(scene: Phaser.Scene): void {
  TREE_URLS.forEach((url, index) => {
    const key = TREE_KEYS[index];
    if (key && !scene.textures.exists(key)) {
      scene.load.image(key, url);
    }
  });
}

function ensureRockTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(ROCK_TEXTURE)) {
    return;
  }

  const width = 64;
  const height = 48;
  const canvas = scene.textures.createCanvas(ROCK_TEXTURE, width, height);
  if (!canvas) {
    return;
  }

  const context = canvas.getContext();
  context.clearRect(0, 0, width, height);
  context.save();
  context.translate(width / 2, height);

  context.fillStyle = '#4a566b';
  context.beginPath();
  context.moveTo(-28, 0);
  context.lineTo(-24, -18);
  context.lineTo(-12, -30);
  context.lineTo(4, -32);
  context.lineTo(19, -22);
  context.lineTo(27, -8);
  context.lineTo(22, 0);
  context.closePath();
  context.fill();

  context.fillStyle = '#6f7d93';
  context.beginPath();
  context.moveTo(-20, -12);
  context.lineTo(-11, -27);
  context.lineTo(2, -28);
  context.lineTo(12, -20);
  context.lineTo(4, -14);
  context.lineTo(-8, -10);
  context.closePath();
  context.fill();

  context.strokeStyle = '#2c3444';
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(-24, -18);
  context.lineTo(-12, -30);
  context.lineTo(4, -32);
  context.lineTo(19, -22);
  context.lineTo(27, -8);
  context.stroke();

  context.restore();
  canvas.refresh();
}

/** Draws non-collidable palm and rock scenery behind pickups and the hero. */
export function createDecorations(
  scene: Phaser.Scene,
  level: Level,
): void {
  if (!level.decorations || level.decorations.length === 0) {
    return;
  }

  ensureRockTexture(scene);

  for (const decoration of level.decorations) {
    if (decoration.kind === 'tree') {
      const key =
        TREE_KEYS[decoration.variant % TREE_KEYS.length] ?? TREE_KEYS[0]!;
      scene.add
        .image(decoration.x, decoration.y, key)
        .setOrigin(0.5, 1)
        .setScale(decoration.scale)
        .setFlipX(decoration.variant % 2 === 0)
        .setTint(0xa7bdcc)
        .setDepth(2);
      continue;
    }

    scene.add
      .image(decoration.x, decoration.y, ROCK_TEXTURE)
      .setOrigin(0.5, 1)
      .setScale(decoration.scale)
      .setFlipX(decoration.variant % 2 === 1)
      .setTint(0x9aa8ba)
      .setDepth(3);
  }
}
