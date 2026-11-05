import batAttack from '../../../graphics/sidescroller_starter_pack/sheets/Bat_Attack_strip.png?url';
import batDeath from '../../../graphics/sidescroller_starter_pack/sheets/Bat_Death_strip.png?url';
import batHurt from '../../../graphics/sidescroller_starter_pack/sheets/Bat_Hurt_strip.png?url';
import batIdle from '../../../graphics/sidescroller_starter_pack/sheets/Bat_Idle_strip.png?url';
import batWalk from '../../../graphics/sidescroller_starter_pack/sheets/Bat_Walk_strip.png?url';
import darkKnightAttack from '../../../graphics/sidescroller_starter_pack/sheets/DarkKnight_Attack_strip.png?url';
import darkKnightDeath from '../../../graphics/sidescroller_starter_pack/sheets/DarkKnight_Death_strip.png?url';
import darkKnightHurt from '../../../graphics/sidescroller_starter_pack/sheets/DarkKnight_Hurt_strip.png?url';
import darkKnightIdle from '../../../graphics/sidescroller_starter_pack/sheets/DarkKnight_Idle_strip.png?url';
import darkKnightWalk from '../../../graphics/sidescroller_starter_pack/sheets/DarkKnight_Walk_strip.png?url';
import goblinAttack from '../../../graphics/sidescroller_starter_pack/sheets/Goblin_Attack_strip.png?url';
import goblinDeath from '../../../graphics/sidescroller_starter_pack/sheets/Goblin_Death_strip.png?url';
import goblinHurt from '../../../graphics/sidescroller_starter_pack/sheets/Goblin_Hurt_strip.png?url';
import goblinIdle from '../../../graphics/sidescroller_starter_pack/sheets/Goblin_Idle_strip.png?url';
import goblinWalk from '../../../graphics/sidescroller_starter_pack/sheets/Goblin_Walk_strip.png?url';
import golemAttack from '../../../graphics/sidescroller_starter_pack/sheets/Golem_Attack_strip.png?url';
import golemDeath from '../../../graphics/sidescroller_starter_pack/sheets/Golem_Death_strip.png?url';
import golemHurt from '../../../graphics/sidescroller_starter_pack/sheets/Golem_Hurt_strip.png?url';
import golemIdle from '../../../graphics/sidescroller_starter_pack/sheets/Golem_Idle_strip.png?url';
import golemWalk from '../../../graphics/sidescroller_starter_pack/sheets/Golem_Walk_strip.png?url';
import orcAttack from '../../../graphics/sidescroller_starter_pack/sheets/OrcBrute_Attack_strip.png?url';
import orcDeath from '../../../graphics/sidescroller_starter_pack/sheets/OrcBrute_Death_strip.png?url';
import orcHurt from '../../../graphics/sidescroller_starter_pack/sheets/OrcBrute_Hurt_strip.png?url';
import orcIdle from '../../../graphics/sidescroller_starter_pack/sheets/OrcBrute_Idle_strip.png?url';
import orcWalk from '../../../graphics/sidescroller_starter_pack/sheets/OrcBrute_Walk_strip.png?url';
import skeletonAttack from '../../../graphics/sidescroller_starter_pack/sheets/Skeleton_Attack_strip.png?url';
import skeletonDeath from '../../../graphics/sidescroller_starter_pack/sheets/Skeleton_Death_strip.png?url';
import skeletonHurt from '../../../graphics/sidescroller_starter_pack/sheets/Skeleton_Hurt_strip.png?url';
import skeletonIdle from '../../../graphics/sidescroller_starter_pack/sheets/Skeleton_Idle_strip.png?url';
import skeletonWalk from '../../../graphics/sidescroller_starter_pack/sheets/Skeleton_Walk_strip.png?url';
import slimeAttack from '../../../graphics/sidescroller_starter_pack/sheets/Slime_Attack_strip.png?url';
import slimeDeath from '../../../graphics/sidescroller_starter_pack/sheets/Slime_Death_strip.png?url';
import slimeHurt from '../../../graphics/sidescroller_starter_pack/sheets/Slime_Hurt_strip.png?url';
import slimeIdle from '../../../graphics/sidescroller_starter_pack/sheets/Slime_Idle_strip.png?url';
import slimeWalk from '../../../graphics/sidescroller_starter_pack/sheets/Slime_Walk_strip.png?url';
import type { EnemyKind, EnemyState } from '../../game/types';

export type EnemyArt = {
  frameWidth: number;
  frameHeight: number;
  /** Bottom edge of the lowest opaque row, for feet-anchored sprites. */
  feetY: number;
  scale: number;
  anchor: 'feet' | 'center';
  strips: Record<'idle' | 'walk' | 'attack' | 'hurt' | 'death', string>;
};

export const ENEMY_ART: Record<EnemyKind, EnemyArt> = {
  skeleton: {
    frameWidth: 102,
    frameHeight: 81,
    feetY: 77,
    scale: 2,
    anchor: 'feet',
    strips: {
      idle: skeletonIdle,
      walk: skeletonWalk,
      attack: skeletonAttack,
      hurt: skeletonHurt,
      death: skeletonDeath,
    },
  },
  goblin: {
    frameWidth: 102,
    frameHeight: 76,
    feetY: 72,
    scale: 2,
    anchor: 'feet',
    strips: {
      idle: goblinIdle,
      walk: goblinWalk,
      attack: goblinAttack,
      hurt: goblinHurt,
      death: goblinDeath,
    },
  },
  slime: {
    frameWidth: 93,
    frameHeight: 62,
    feetY: 58,
    scale: 2,
    anchor: 'feet',
    strips: {
      idle: slimeIdle,
      walk: slimeWalk,
      attack: slimeAttack,
      hurt: slimeHurt,
      death: slimeDeath,
    },
  },
  bat: {
    frameWidth: 89,
    frameHeight: 60,
    feetY: 55,
    scale: 2,
    anchor: 'center',
    strips: {
      idle: batIdle,
      walk: batWalk,
      attack: batAttack,
      hurt: batHurt,
      death: batDeath,
    },
  },
  golem: {
    frameWidth: 123,
    frameHeight: 118,
    feetY: 114,
    scale: 1.7,
    anchor: 'feet',
    strips: {
      idle: golemIdle,
      walk: golemWalk,
      attack: golemAttack,
      hurt: golemHurt,
      death: golemDeath,
    },
  },
  darkKnight: {
    frameWidth: 128,
    frameHeight: 102,
    feetY: 98,
    scale: 2.05,
    anchor: 'feet',
    strips: {
      idle: darkKnightIdle,
      walk: darkKnightWalk,
      attack: darkKnightAttack,
      hurt: darkKnightHurt,
      death: darkKnightDeath,
    },
  },
  orcBrute: {
    frameWidth: 118,
    frameHeight: 98,
    feetY: 94,
    scale: 2.1,
    anchor: 'feet',
    strips: {
      idle: orcIdle,
      walk: orcWalk,
      attack: orcAttack,
      hurt: orcHurt,
      death: orcDeath,
    },
  },
};

const STATE_CLIP: Record<Exclude<EnemyState, 'die'>, string> = {
  idle: 'idle',
  walk: 'walk',
  attack: 'attack',
  hurt: 'hurt',
};

export function enemyTextureKey(
  kind: EnemyKind,
  clip: 'idle' | 'walk' | 'attack' | 'hurt' | 'death',
): string {
  return `${kind}-${clip}`;
}

export function enemyAnimationKey(kind: EnemyKind, state: EnemyState): string {
  const clip = state === 'die' ? 'death' : STATE_CLIP[state];
  return `${kind}-${clip}`;
}

export function enemyClipForState(state: EnemyState): string {
  return state === 'die' ? 'death' : STATE_CLIP[state];
}
