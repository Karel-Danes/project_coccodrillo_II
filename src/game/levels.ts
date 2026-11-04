import { parseLevel } from './level';
import type { Level } from './types';

export const TILE_SIZE = 64;

/**
 * Milestone-1 room: 20 x 12 tiles.
 *
 * Route: climb the three platforms on the left (each one tile up and at
 * most one tile across), drop down on the right, jump the spike pit, and
 * either stop or walk into the hole that drops out of the world. Nothing
 * hangs over the spike pit, so the jump is physically possible.
 */
const LEVEL_01_ASCII = [
  '####################',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#........###.......#',
  '#....###...........#',
  '#..##..............#',
  '##############^##..#',
] as const;

export const LEVEL_01: Level = parseLevel(LEVEL_01_ASCII, {
  tileSize: TILE_SIZE,
  // Standing on the floor in the second column, horizontally centred.
  spawn: { x: 76, y: 616 },
});
