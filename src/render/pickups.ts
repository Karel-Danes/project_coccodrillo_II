import Phaser from 'phaser';
import {
  COIN_KEYS,
  COIN_URLS,
  HEART_KEYS,
  HEART_URLS,
} from './assets/pickups';

export function loadPickupAssets(scene: Phaser.Scene): void {
  HEART_URLS.forEach((url, index) => {
    const key = HEART_KEYS[index];
    if (key && !scene.textures.exists(key)) {
      scene.load.image(key, url);
    }
  });
  COIN_URLS.forEach((url, index) => {
    const key = COIN_KEYS[index];
    if (key && !scene.textures.exists(key)) {
      scene.load.image(key, url);
    }
  });
}

export function registerPickupAnimations(scene: Phaser.Scene): void {
  if (!scene.anims.exists('heart-pulse')) {
    scene.anims.create({
      key: 'heart-pulse',
      frames: HEART_KEYS.map((key) => ({ key })),
      frameRate: 8,
      repeat: -1,
    });
  }

  if (!scene.anims.exists('coin-spin')) {
    scene.anims.create({
      key: 'coin-spin',
      frames: COIN_KEYS.map((key) => ({ key })),
      frameRate: 10,
      repeat: -1,
    });
  }
}
