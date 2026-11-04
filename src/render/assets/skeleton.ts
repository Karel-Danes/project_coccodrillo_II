import attackUrl from '../../../graphics/sidescroller_starter_pack/sheets/Skeleton_Attack_strip.png?url';
import deathUrl from '../../../graphics/sidescroller_starter_pack/sheets/Skeleton_Death_strip.png?url';
import hurtUrl from '../../../graphics/sidescroller_starter_pack/sheets/Skeleton_Hurt_strip.png?url';
import idleUrl from '../../../graphics/sidescroller_starter_pack/sheets/Skeleton_Idle_strip.png?url';
import walkUrl from '../../../graphics/sidescroller_starter_pack/sheets/Skeleton_Walk_strip.png?url';

/** Skeleton strip metadata from the starter pack. */
export const SKELETON_FRAME_WIDTH = 102;
export const SKELETON_FRAME_HEIGHT = 81;
/** Bottom edge of the lowest opaque row (feet line). */
export const SKELETON_FEET_Y = 77;
export const SKELETON_SCALE = 2;

export const SKELETON_TEXTURES = {
  idle: 'skeleton-idle',
  walk: 'skeleton-walk',
  attack: 'skeleton-attack',
  hurt: 'skeleton-hurt',
  death: 'skeleton-death',
} as const;

export const SKELETON_STRIPS = {
  idle: idleUrl,
  walk: walkUrl,
  attack: attackUrl,
  hurt: hurtUrl,
  death: deathUrl,
} as const;
