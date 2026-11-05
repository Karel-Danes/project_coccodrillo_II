import attackUrl from '../../../graphics/sidescroller_starter_pack/sheets/Knight_Attack_strip.png?url';
import deathUrl from '../../../graphics/sidescroller_starter_pack/sheets/Knight_Death_strip.png?url';
import hurtUrl from '../../../graphics/sidescroller_starter_pack/sheets/Knight_Hurt_strip.png?url';
import idleUrl from '../../../graphics/sidescroller_starter_pack/sheets/Knight_Idle_strip.png?url';
import jumpUrl from '../../../graphics/sidescroller_starter_pack/sheets/Knight_Jump_strip.png?url';
import walkUrl from '../../../graphics/sidescroller_starter_pack/sheets/Knight_Walk_strip.png?url';
import mageAttackUrl from '../../../graphics/sidescroller_starter_pack/sheets/Mage_Attack_strip.png?url';
import mageDeathUrl from '../../../graphics/sidescroller_starter_pack/sheets/Mage_Death_strip.png?url';
import mageHurtUrl from '../../../graphics/sidescroller_starter_pack/sheets/Mage_Hurt_strip.png?url';
import mageIdleUrl from '../../../graphics/sidescroller_starter_pack/sheets/Mage_Idle_strip.png?url';
import mageJumpUrl from '../../../graphics/sidescroller_starter_pack/sheets/Mage_Jump_strip.png?url';
import mageWalkUrl from '../../../graphics/sidescroller_starter_pack/sheets/Mage_Walk_strip.png?url';
import orcAttackUrl from '../../../graphics/sidescroller_starter_pack/sheets/OrcBrute_Attack_strip.png?url';
import orcDeathUrl from '../../../graphics/sidescroller_starter_pack/sheets/OrcBrute_Death_strip.png?url';
import orcHurtUrl from '../../../graphics/sidescroller_starter_pack/sheets/OrcBrute_Hurt_strip.png?url';
import orcIdleUrl from '../../../graphics/sidescroller_starter_pack/sheets/OrcBrute_Idle_strip.png?url';
import orcJumpUrl from '../../../graphics/sidescroller_starter_pack/sheets/OrcBrute_Jump_strip.png?url';
import orcWalkUrl from '../../../graphics/sidescroller_starter_pack/sheets/OrcBrute_Walk_strip.png?url';
import type { CharacterKind, PlayerState } from '../../game/types';

export type PlayerClip =
  | 'idle'
  | 'walk'
  | 'jump'
  | 'attack'
  | 'hurt'
  | 'death';

export type PlayerArt = {
  prefix: string;
  frameWidth: number;
  frameHeight: number;
  /** Bottom edge of the lowest opaque row, for feet-anchored sprites. */
  feetY: number;
  scale: number;
  menuScale: number;
  strips: Record<PlayerClip, string>;
};

export const PLAYER_ART: Record<CharacterKind, PlayerArt> = {
  knight: {
    prefix: 'player-knight',
    frameWidth: 104,
    frameHeight: 85,
    feetY: 81,
    scale: 2,
    menuScale: 2,
    strips: {
      idle: idleUrl,
      walk: walkUrl,
      jump: jumpUrl,
      attack: attackUrl,
      hurt: hurtUrl,
      death: deathUrl,
    },
  },
  mage: {
    prefix: 'player-mage',
    frameWidth: 98,
    frameHeight: 92,
    feetY: 88,
    scale: 1.85,
    menuScale: 1.8,
    strips: {
      idle: mageIdleUrl,
      walk: mageWalkUrl,
      jump: mageJumpUrl,
      attack: mageAttackUrl,
      hurt: mageHurtUrl,
      death: mageDeathUrl,
    },
  },
  orcBrute: {
    prefix: 'player-orcBrute',
    frameWidth: 118,
    frameHeight: 98,
    feetY: 94,
    scale: 1.9,
    menuScale: 1.65,
    strips: {
      idle: orcIdleUrl,
      walk: orcWalkUrl,
      jump: orcJumpUrl,
      attack: orcAttackUrl,
      hurt: orcHurtUrl,
      death: orcDeathUrl,
    },
  },
};

const STATE_CLIP: Record<Exclude<PlayerState, 'fall' | 'die'>, PlayerClip> = {
  idle: 'idle',
  walk: 'walk',
  jump: 'jump',
  attack: 'attack',
  guard: 'idle',
  hurt: 'hurt',
};

export function playerTextureKey(
  kind: CharacterKind,
  clip: PlayerClip,
): string {
  return `${PLAYER_ART[kind].prefix}-${clip}`;
}

export function playerAnimationKey(
  kind: CharacterKind,
  state: PlayerState,
): string {
  const clip = state === 'fall' ? 'jump' : state === 'die' ? 'death' : STATE_CLIP[state];
  const suffix = state === 'fall' ? '-fall' : state === 'guard' ? '-guard' : '';
  return `${PLAYER_ART[kind].prefix}-${clip}${suffix}`;
}
