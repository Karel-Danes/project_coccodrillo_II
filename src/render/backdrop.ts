import Phaser from 'phaser';
import {
  DESERT_BG_HEIGHT,
  DESERT_BG_WIDTH,
  DESERT_IMAGES,
  DESERT_TEXTURES,
} from './assets/desert';

type ParallaxLayer = {
  sprite: Phaser.GameObjects.TileSprite;
  factor: number;
  tileScale: number;
};

export type Backdrop = {
  update(scrollX: number): void;
};

const LAYERS: ReadonlyArray<{
  key: string;
  texture: string;
  tint: number;
  factor: number;
  depth: number;
  alpha: number;
}> = [
  {
    key: 'sky',
    texture: DESERT_TEXTURES.sky,
    tint: 0x42568c,
    factor: 0.04,
    depth: -50,
    alpha: 1,
  },
  {
    key: 'mountains',
    texture: DESERT_TEXTURES.mountains,
    tint: 0x7184ad,
    factor: 0.1,
    depth: -49,
    alpha: 0.95,
  },
  {
    key: 'ruins',
    texture: DESERT_TEXTURES.ruins,
    tint: 0x56678d,
    factor: 0.18,
    depth: -48,
    alpha: 0.95,
  },
  {
    key: 'hills',
    texture: DESERT_TEXTURES.hills,
    tint: 0x394666,
    factor: 0.28,
    depth: -47,
    alpha: 0.95,
  },
  {
    key: 'forest',
    texture: DESERT_TEXTURES.forest,
    tint: 0x232b42,
    factor: 0.38,
    depth: -46,
    alpha: 0.95,
  },
];

const PALM_POSITIONS = [420, 1550, 2950, 4380, 5260, 5900];

export function loadDesertAssets(scene: Phaser.Scene): void {
  for (const [key, url] of Object.entries(DESERT_IMAGES)) {
    if (!scene.textures.exists(DESERT_TEXTURES[key as keyof typeof DESERT_TEXTURES])) {
      scene.load.image(
        DESERT_TEXTURES[key as keyof typeof DESERT_TEXTURES],
        url,
      );
    }
  }
}

export function createBackdrop(
  scene: Phaser.Scene,
  viewWidth: number,
  viewHeight: number,
  groundY: number,
  layer?: Phaser.GameObjects.Layer,
): Backdrop {
  const layers: ParallaxLayer[] = LAYERS.map((layerConfig) => {
    const tileScaleX = viewWidth / DESERT_BG_WIDTH;
    const tileScaleY = viewHeight / DESERT_BG_HEIGHT;

    const sprite = scene.add
      .tileSprite(0, 0, viewWidth, viewHeight, layerConfig.texture)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(layerConfig.depth)
      .setTint(layerConfig.tint)
      .setAlpha(layerConfig.alpha);

    sprite.tileScaleX = tileScaleX;
    sprite.tileScaleY = tileScaleY;
    layer?.add(sprite);

    return { sprite, factor: layerConfig.factor, tileScale: tileScaleX };
  });

  // Palms sit behind the gameplay layer and frame the ruined causeway.
  PALM_POSITIONS.forEach((x, index) => {
    const texture =
      index % 2 === 0 ? DESERT_TEXTURES.palm1 : DESERT_TEXTURES.palm2;
    const palm = scene.add
      .image(x, groundY, texture)
      .setOrigin(0.5, 1)
      .setScale(index % 3 === 0 ? 0.9 : 0.7)
      .setTint(0x7d91b4)
      .setDepth(-2);
    layer?.add(palm);
  });

  return {
    update(scrollX: number): void {
      for (const layer of layers) {
        layer.sprite.tilePositionX =
          (scrollX * layer.factor) / layer.tileScale;
      }
    },
  };
}
