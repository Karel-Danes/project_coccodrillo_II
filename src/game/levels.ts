import { parseLevel } from './level';
import type { Level } from './types';

export const TILE_SIZE = 64;

/**
 * World 01: 60 x 18 tiles (3840 x 1152 px). The camera viewport shows
 * 20 x 12 tiles, so the world scrolls three screens wide and roughly one
 * and a half screens tall.
 *
 * Route: ground start, first block, spike pit, left staircase up to a high
 * ledge, drop back down, mid platform, second spike pit, right staircase,
 * and a final high ledge. Every climb is one tile up with at most one tile
 * of horizontal gap.
 */
const WORLD_01_ASCII = [
  '############################################################',
  '#..........................................................#',
  '#..........................................................#',
  '#..........................................................#',
  '#..........................................................#',
  '#..........................................................#',
  '#..........................................................#',
  '#..........................................................#',
  '#..........................................................#',
  '#..........................................................#',
  '#..........................................................#',
  '#...........................###........................###.#',
  '#.......................###........................###.....#',
  '#...................###.............###........###.........#',
  '#...............###........................###.............#',
  '#....##......##.........................##.................#',
  '##########.#######################.#########################',
  '##########^#######################^#########################',
] as const;

export const LEVEL_01: Level = parseLevel(WORLD_01_ASCII, {
  tileSize: TILE_SIZE,
  // Standing on the ground in the third column.
  spawn: { x: 140, y: 936 },
  enemies: [
    {
      kind: 'skeleton',
      // The flat ground between the first block and the first spike pit.
      x: 520,
      y: 936,
      patrolMinX: 460,
      patrolMaxX: 590,
    },
  ],
});
