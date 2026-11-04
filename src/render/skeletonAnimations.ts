import Phaser from 'phaser';
import {
  SKELETON_FRAME_HEIGHT,
  SKELETON_FRAME_WIDTH,
  SKELETON_STRIPS,
  SKELETON_TEXTURES,
} from './assets/skeleton';

const FRAME_CONFIG = {
  frameWidth: SKELETON_FRAME_WIDTH,
  frameHeight: SKELETON_FRAME_HEIGHT,
};

export function loadSkeletonAssets(scene: Phaser.Scene): void {
  if (!scene.textures.exists(SKELETON_TEXTURES.idle)) {
    scene.load.spritesheet(
      SKELETON_TEXTURES.idle,
      SKELETON_STRIPS.idle,
      FRAME_CONFIG,
    );
  }
  if (!scene.textures.exists(SKELETON_TEXTURES.walk)) {
    scene.load.spritesheet(
      SKELETON_TEXTURES.walk,
      SKELETON_STRIPS.walk,
      FRAME_CONFIG,
    );
  }
  if (!scene.textures.exists(SKELETON_TEXTURES.attack)) {
    scene.load.spritesheet(
      SKELETON_TEXTURES.attack,
      SKELETON_STRIPS.attack,
      FRAME_CONFIG,
    );
  }
  if (!scene.textures.exists(SKELETON_TEXTURES.hurt)) {
    scene.load.spritesheet(
      SKELETON_TEXTURES.hurt,
      SKELETON_STRIPS.hurt,
      FRAME_CONFIG,
    );
  }
  if (!scene.textures.exists(SKELETON_TEXTURES.death)) {
    scene.load.spritesheet(
      SKELETON_TEXTURES.death,
      SKELETON_STRIPS.death,
      FRAME_CONFIG,
    );
  }
}

export function registerSkeletonAnimations(scene: Phaser.Scene): void {
  const animations: Phaser.Types.Animations.Animation[] = [
    {
      key: 'skeleton-idle',
      frames: scene.anims.generateFrameNumbers(SKELETON_TEXTURES.idle, {
        start: 0,
        end: 3,
      }),
      frameRate: 6,
      repeat: -1,
    },
    {
      key: 'skeleton-walk',
      frames: scene.anims.generateFrameNumbers(SKELETON_TEXTURES.walk, {
        start: 0,
        end: 5,
      }),
      frameRate: 10,
      repeat: -1,
    },
    {
      key: 'skeleton-attack',
      frames: scene.anims.generateFrameNumbers(SKELETON_TEXTURES.attack, {
        start: 0,
        end: 5,
      }),
      frameRate: 9,
      repeat: 0,
    },
    {
      key: 'skeleton-hurt',
      frames: scene.anims.generateFrameNumbers(SKELETON_TEXTURES.hurt, {
        start: 0,
        end: 3,
      }),
      frameRate: 10,
      repeat: 0,
    },
    {
      key: 'skeleton-death',
      frames: scene.anims.generateFrameNumbers(SKELETON_TEXTURES.death, {
        start: 0,
        end: 5,
      }),
      frameRate: 7,
      repeat: 0,
    },
  ];

  for (const animation of animations) {
    if (animation.key && !scene.anims.exists(animation.key)) {
      scene.anims.create(animation);
    }
  }
}
