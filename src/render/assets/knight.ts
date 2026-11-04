import deathUrl from '../../../graphics/sidescroller_starter_pack/sheets/Knight_Death_strip.png?url';
import idleUrl from '../../../graphics/sidescroller_starter_pack/sheets/Knight_Idle_strip.png?url';
import jumpUrl from '../../../graphics/sidescroller_starter_pack/sheets/Knight_Jump_strip.png?url';
import walkUrl from '../../../graphics/sidescroller_starter_pack/sheets/Knight_Walk_strip.png?url';

/**
 * Knight strip metadata, from graphics/sidescroller_starter_pack/metadata.json.
 * Every frame is 104 x 85 and the standing feet line sits at y = 80.
 */
export const KNIGHT_FRAME_WIDTH = 104;
export const KNIGHT_FRAME_HEIGHT = 85;
/** Bottom edge of the lowest opaque row, so the feet sit exactly on the floor. */
export const KNIGHT_FEET_Y = 81;

/**
 * The character's visible body is ~50 px tall inside the frame. At 2x it is
 * ~100 px, or about 1.5 tiles of the 64 px world, matching the pack's
 * intended side-scroller proportions.
 */
export const KNIGHT_SCALE = 2;

export const KNIGHT_TEXTURES = {
  idle: 'knight-idle',
  walk: 'knight-walk',
  jump: 'knight-jump',
  death: 'knight-death',
} as const;

export const KNIGHT_STRIPS = {
  idle: idleUrl,
  walk: walkUrl,
  jump: jumpUrl,
  death: deathUrl,
} as const;
