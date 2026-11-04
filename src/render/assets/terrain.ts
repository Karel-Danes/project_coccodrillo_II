import fillUrl from '../../../graphics/sidescroller_starter_pack/terrain/ground_fill_96x32_derived.png?url';
import topUrl from '../../../graphics/sidescroller_starter_pack/terrain/ground_top_96x32_derived.png?url';

/** The terrain art is authored on a 32 px grid; the world uses 2x that. */
export const TERRAIN_TILE = 32;

export const TERRAIN_TEXTURES = {
  top: 'terrain-top',
  fill: 'terrain-fill',
} as const;

export const TERRAIN_STRIPS = {
  top: topUrl,
  fill: fillUrl,
} as const;
