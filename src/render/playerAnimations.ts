import Phaser from 'phaser';
import type { CharacterKind } from '../game/types';
import {
  PLAYER_ART,
  playerAnimationKey,
  playerTextureKey,
  type PlayerClip,
} from './assets/players';

const CLIPS: readonly PlayerClip[] = [
  'idle',
  'walk',
  'jump',
  'attack',
  'hurt',
  'death',
] as const;

function frameConfig(kind: CharacterKind) {
  const art = PLAYER_ART[kind];
  return { frameWidth: art.frameWidth, frameHeight: art.frameHeight };
}

export function loadPlayerAssets(scene: Phaser.Scene): void {
  for (const kind of Object.keys(PLAYER_ART) as CharacterKind[]) {
    const art = PLAYER_ART[kind];
    for (const clip of CLIPS) {
      const key = playerTextureKey(kind, clip);
      if (!scene.textures.exists(key)) {
        scene.load.spritesheet(key, art.strips[clip], frameConfig(kind));
      }
    }
  }
}

export function registerPlayerAnimations(scene: Phaser.Scene): void {
  for (const kind of Object.keys(PLAYER_ART) as CharacterKind[]) {
    const prefix = PLAYER_ART[kind].prefix;

    const create = (
      key: string,
      texture: string,
      start: number,
      end: number,
      frameRate: number,
      repeat: number,
    ): void => {
      if (scene.anims.exists(key)) {
        return;
      }
      scene.anims.create({
        key,
        frames: scene.anims.generateFrameNumbers(texture, { start, end }),
        frameRate,
        repeat,
      });
    };

    create(`${prefix}-idle`, playerTextureKey(kind, 'idle'), 0, 3, 6, -1);
    create(`${prefix}-walk`, playerTextureKey(kind, 'walk'), 0, 5, 12, -1);
    create(`${prefix}-jump`, playerTextureKey(kind, 'jump'), 0, 5, 9, 0);
    create(
      `${prefix}-jump-fall`,
      playerTextureKey(kind, 'jump'),
      3,
      5,
      8,
      0,
    );
    create(
      `${prefix}-attack`,
      playerTextureKey(kind, 'attack'),
      0,
      5,
      14,
      0,
    );
    create(
      `${prefix}-idle-guard`,
      playerTextureKey(kind, 'idle'),
      0,
      0,
      1,
      -1,
    );
    create(`${prefix}-hurt`, playerTextureKey(kind, 'hurt'), 0, 3, 10, 0);
    create(`${prefix}-death`, playerTextureKey(kind, 'death'), 0, 5, 7, 0);
  }
}

export function guardAnimationKey(kind: CharacterKind): string {
  return `${PLAYER_ART[kind].prefix}-idle-guard`;
}

export function animationKeyForState(
  kind: CharacterKind,
  state: Parameters<typeof playerAnimationKey>[1],
): string {
  return playerAnimationKey(kind, state);
}
