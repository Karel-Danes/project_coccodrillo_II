import { parseLevel } from './level';
import type { Level } from './types';

export const TILE_SIZE = 64;

/**
 * World 01: 96 x 18 tiles (6144 x 1152 px), six screens wide.
 *
 * The original ruin route runs to the right staircase, then continues past
 * a spike pit and a second staircase into a flat boss arena. The camera
 * viewport is still 20 x 12 tiles.
 */
const WORLD_01_ASCII = [
  '################################################################################################',
  '#..............................................................................................#',
  '#..............................................................................................#',
  '#..............................................................................................#',
  '#..............................................................................................#',
  '#..............................................................................................#',
  '#..............................................................................................#',
  '#..............................................................................................#',
  '#..............................................................................................#',
  '#..............................................................................................#',
  '#..............................................................................................#',
  '#...........................###........................###.....................................#',
  '#.......................###........................###........................###..............#',
  '#...................###........................###........................###..................#',
  '#...............###........................###........................###......................#',
  '#....##......##..##.....................##....................##....##.........................#',
  '##########.#######################.###############################.#############################',
  '##########^#######################^###############################^#############################',
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
    {
      kind: 'bat',
      // Hovering above the middle of the map, a target for air attacks.
      x: 1900,
      y: 840,
      patrolMinX: 1750,
      patrolMaxX: 2050,
    },
    {
      kind: 'slime',
      // Ground patrol after the second staircase.
      x: 3860,
      y: 986,
      patrolMinX: 3790,
      patrolMaxX: 3960,
    },
    {
      kind: 'goblin',
      // Ground patrol on the approach to the boss arena.
      x: 4950,
      y: 944,
      patrolMinX: 4880,
      patrolMaxX: 5030,
    },
    {
      kind: 'golem',
      // The Mighty Jan Zátka, waiting in the arena.
      x: 5632,
      y: 888,
      patrolMinX: 5480,
      patrolMaxX: 5840,
      boss: true,
    },
  ],
  pickups: [
    // Opening stretch: one refresh well and a couple of coins.
    { kind: 'well', x: 300, y: 984 },
    { kind: 'coin', x: 230, y: 980 },
    { kind: 'coin', x: 384, y: 916 },

    // Left staircase — optional climbing rewards.
    { kind: 'coin', x: 1120, y: 852 },
    { kind: 'coin', x: 1376, y: 788 },
    { kind: 'coin', x: 1632, y: 724 },
    { kind: 'heart', x: 1888, y: 660 },

    // Bat and the high route down.
    { kind: 'coin', x: 2100, y: 980 },

    // Right staircase.
    { kind: 'coin', x: 2850, y: 852 },
    { kind: 'heart', x: 3105, y: 788 },
    { kind: 'coin', x: 3360, y: 724 },
    { kind: 'coin', x: 3616, y: 660 },

    // Extension: slime clearing and stair rewards.
    { kind: 'coin', x: 3950, y: 980 },
    { kind: 'coin', x: 4575, y: 852 },
    { kind: 'coin', x: 4830, y: 788 },

    // Goblin approach, the guard artefact, and the arena well.
    { kind: 'coin', x: 4850, y: 980 },
    { kind: 'coin', x: 5050, y: 980 },
    { kind: 'artifact', x: 5088, y: 724 },
    { kind: 'well', x: 5400, y: 984 },
  ],
});
