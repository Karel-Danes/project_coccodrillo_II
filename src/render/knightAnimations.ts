import Phaser from 'phaser';
import {
  KNIGHT_FRAME_HEIGHT,
  KNIGHT_FRAME_WIDTH,
  KNIGHT_STRIPS,
  KNIGHT_TEXTURES,
} from './assets/knight';

const FRAME_CONFIG = {
  frameWidth: KNIGHT_FRAME_WIDTH,
  frameHeight: KNIGHT_FRAME_HEIGHT,
};

export function loadKnightAssets(scene: Phaser.Scene): void {
  if (!scene.textures.exists(KNIGHT_TEXTURES.idle)) {
    scene.load.spritesheet(KNIGHT_TEXTURES.idle, KNIGHT_STRIPS.idle, FRAME_CONFIG);
  }
  if (!scene.textures.exists(KNIGHT_TEXTURES.walk)) {
    scene.load.spritesheet(KNIGHT_TEXTURES.walk, KNIGHT_STRIPS.walk, FRAME_CONFIG);
  }
  if (!scene.textures.exists(KNIGHT_TEXTURES.jump)) {
    scene.load.spritesheet(KNIGHT_TEXTURES.jump, KNIGHT_STRIPS.jump, FRAME_CONFIG);
  }
  if (!scene.textures.exists(KNIGHT_TEXTURES.attack)) {
    scene.load.spritesheet(
      KNIGHT_TEXTURES.attack,
      KNIGHT_STRIPS.attack,
      FRAME_CONFIG,
    );
  }
  if (!scene.textures.exists(KNIGHT_TEXTURES.death)) {
    scene.load.spritesheet(KNIGHT_TEXTURES.death, KNIGHT_STRIPS.death, FRAME_CONFIG);
  }
}

export function registerKnightAnimations(scene: Phaser.Scene): void {
  const animations: Phaser.Types.Animations.Animation[] = [
    {
      key: 'knight-idle',
      frames: scene.anims.generateFrameNumbers(KNIGHT_TEXTURES.idle, {
        start: 0,
        end: 3,
      }),
      frameRate: 6,
      repeat: -1,
    },
    {
      key: 'knight-walk',
      frames: scene.anims.generateFrameNumbers(KNIGHT_TEXTURES.walk, {
        start: 0,
        end: 5,
      }),
      frameRate: 12,
      repeat: -1,
    },
    {
      key: 'knight-jump',
      frames: scene.anims.generateFrameNumbers(KNIGHT_TEXTURES.jump, {
        start: 0,
        end: 5,
      }),
      frameRate: 9,
      repeat: 0,
    },
    {
      // Frames 3-5 of the jump strip read as the descending/landing arc.
      key: 'knight-fall',
      frames: scene.anims.generateFrameNumbers(KNIGHT_TEXTURES.jump, {
        start: 3,
        end: 5,
      }),
      frameRate: 8,
      repeat: 0,
    },
    {
      key: 'knight-attack',
      frames: scene.anims.generateFrameNumbers(KNIGHT_TEXTURES.attack, {
        start: 0,
        end: 5,
      }),
      // Six frames over ~0.43s, matching the 0.42s combat window.
      frameRate: 14,
      repeat: 0,
    },
    {
      // A held shield pose derived from the idle strip while the aura is on.
      key: 'knight-guard',
      frames: scene.anims.generateFrameNumbers(KNIGHT_TEXTURES.idle, {
        start: 0,
        end: 0,
      }),
      frameRate: 1,
      repeat: -1,
    },
    {
      key: 'knight-death',
      frames: scene.anims.generateFrameNumbers(KNIGHT_TEXTURES.death, {
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
