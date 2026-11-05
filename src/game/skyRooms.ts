import { difficultyDefinition } from './difficulty';
import { statsFor } from './enemy';
import { TILE_SIZE } from './levels';
import type {
  Difficulty,
  EnemyKind,
  EnemySpawn,
  PickupSpawn,
  SkillKind,
  TeleportSpawn,
} from './types';

export type SkyRoomRng = () => number;

type Grid = string[][];

export type SkyRoomResult = {
  teleports: TeleportSpawn[];
  pickups: PickupSpawn[];
  enemies: EnemySpawn[];
  rooms: Array<{
    start: number;
    width: number;
    floorRow: number;
    ceilRow: number;
    shape: string;
  }>;
};

function setTile(grid: Grid, row: number, col: number, tile: string): void {
  if (grid[row] && col >= 0 && col < grid[row]!.length) {
    grid[row]![col] = tile;
  }
}

function shuffle<T>(rng: SkyRoomRng, values: readonly T[]): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    const a = result[index];
    const b = result[swap];
    result[index] = b!;
    result[swap] = a!;
  }
  return result;
}

function roomShape(
  grid: Grid,
  start: number,
  width: number,
  floorRow: number,
  ceilRow: number,
  shape: string,
): number[] {
  const center = start + Math.floor(width / 2);
  let blocked: number[] = [];

  if (shape === 'dais') {
    blocked = [center];
    setTile(grid, floorRow - 1, center, '#');
    setTile(grid, floorRow - 1, center + 1, '#');
  } else if (shape === 'steps') {
    blocked = [center - 1, center + 1];
    setTile(grid, floorRow - 1, center - 1, '#');
    setTile(grid, floorRow - 1, center + 1, '#');
  } else if (shape === 'pillars') {
    blocked = [center - 2, center + 2];
    for (const col of blocked) {
      setTile(grid, floorRow - 1, col, '#');
    }
  }

  // Keep the room sealed while leaving any internal blocks intact.
  for (let col = start - 1; col <= start + width; col += 1) {
    setTile(grid, ceilRow, col, '#');
    setTile(grid, floorRow, col, '#');
  }
  for (let row = ceilRow; row <= floorRow; row += 1) {
    setTile(grid, row, start - 1, '#');
    setTile(grid, row, start + width, '#');
  }

  return blocked;
}

function chooseCols(
  rng: SkyRoomRng,
  start: number,
  width: number,
  count: number,
  blocked: readonly number[],
): number[] {
  const blockedSet = new Set(blocked);
  const candidates: number[] = [];
  for (let col = start; col < start + width; col += 1) {
    if (!blockedSet.has(col)) {
      candidates.push(col);
    }
  }
  return shuffle(rng, candidates).slice(0, count);
}

/**
 * Carves two connected sky chambers into an existing character grid:
 * a broad skills room reachable from the ground, and a higher vault reached
 * from the first room. Returns the doors, sigils, and room creatures.
 */
export function carveSkyRoomChain(
  grid: Grid,
  options: {
    cols: number;
    groundPortalCol: number;
    groundY: number;
    rng: SkyRoomRng;
    difficulty: Difficulty;
  },
): SkyRoomResult {
  const { cols, groundPortalCol, groundY, rng } = options;
  const tuning = difficultyDefinition(options.difficulty);

  // Room A: broad, low sky chamber.
  const startA = 24 + Math.floor(rng() * 8);
  const widthA = 10 + Math.floor(rng() * 4);
  const floorA = 5;
  const ceilA = 1;
  const shapeA =
    (['hall', 'dais', 'steps', 'pillars'] as const)[
      Math.floor(rng() * 4)
    ] ?? 'hall';

  // Room B: smaller, higher vault beyond the first room.
  const startB = Math.min(
    cols - 13,
    startA + widthA + 8 + Math.floor(rng() * 6),
  );
  const widthB = 8 + Math.floor(rng() * 3);
  const floorB = 4;
  const ceilB = 1;

  const aReturnCol = startA + 2;
  const aDeepCol = startA + widthA - 3;
  const bReturnCol = startB + Math.floor(widthB / 2);

  const rawBlocksA = roomShape(
    grid,
    startA,
    widthA,
    floorA,
    ceilA,
    shapeA,
  );
  const blocksA = rawBlocksA.filter(
    (col) => col !== aReturnCol && col !== aDeepCol,
  );
  for (const col of rawBlocksA) {
    if (col === aReturnCol || col === aDeepCol) {
      setTile(grid, floorA - 1, col, '.');
    }
  }
  roomShape(grid, startB, widthB, floorB, ceilB, 'vault');

  const groundDoorX = groundPortalCol * TILE_SIZE + TILE_SIZE / 2;

  const floorAY = floorA * TILE_SIZE;
  const floorBY = floorB * TILE_SIZE;

  const teleports: TeleportSpawn[] = [
    { id: 0, targetId: 1, x: groundDoorX, y: groundY },
    {
      id: 1,
      targetId: 0,
      x: aReturnCol * TILE_SIZE + TILE_SIZE / 2,
      y: floorAY,
    },
    {
      id: 2,
      targetId: 3,
      x: aDeepCol * TILE_SIZE + TILE_SIZE / 2,
      y: floorAY,
    },
    {
      id: 3,
      targetId: 2,
      x: bReturnCol * TILE_SIZE + TILE_SIZE / 2,
      y: floorBY,
    },
  ];

  const portalCols = [
    aReturnCol,
    aDeepCol,
    bReturnCol,
  ];
  const skillKinds: SkillKind[] = ['melee', 'ranged', 'vitality', 'jump'];
  const pickups: PickupSpawn[] = [];

  const addSkills = (
    start: number,
    width: number,
    floorRow: number,
    blocked: readonly number[],
    count: number,
    allowDuplicates: boolean,
  ): number[] => {
    const cols = chooseCols(rng, start, width, count, [
      ...blocked,
      ...portalCols,
    ]);
    const pool = allowDuplicates
      ? Array.from({ length: count }, () => {
          const kind =
            skillKinds[Math.floor(rng() * skillKinds.length)] ?? 'melee';
          return kind;
        })
      : shuffle(rng, skillKinds).slice(0, count);

    cols.forEach((col, index) => {
      pickups.push({
        kind: 'skill',
        skill: pool[index] ?? 'melee',
        x: col * TILE_SIZE + TILE_SIZE / 2,
        y: floorRow * TILE_SIZE - 38,
      });
    });

    return cols;
  };

  const skillsA = 2 + (rng() < 0.55 ? 1 : 0);
  const skillColsA = addSkills(
    startA,
    widthA,
    floorA,
    blocksA,
    skillsA,
    false,
  );
  const skillsB = 2;
  const skillColsB = addSkills(
    startB,
    widthB,
    floorB,
    [],
    skillsB,
    true,
  );

  const enemyKinds: EnemyKind[] = ['skeleton', 'goblin', 'slime', 'bat'];
  const enemies: EnemySpawn[] = [];

  const addCreatures = (
    start: number,
    width: number,
    floorRow: number,
    blocked: readonly number[],
    count: number,
  ): void => {
    const cols = chooseCols(rng, start, width, count, [
      ...blocked,
      ...portalCols,
    ]);
    cols.forEach((col, index) => {
      const kind =
        enemyKinds[Math.floor(rng() * enemyKinds.length)] ?? 'skeleton';
      const stats = statsFor(kind);
      const x = col * TILE_SIZE + (TILE_SIZE - stats.width) / 2;
      const ranged =
        tuning.rangedChance > 0 && rng() < tuning.rangedChance;
      const floorY = floorRow * TILE_SIZE;
      const patrolMinX = start * TILE_SIZE + 8;
      const patrolMaxX =
        (start + width) * TILE_SIZE - stats.width - 8;

      if (kind === 'bat') {
        enemies.push({
          kind,
          x,
          y: floorY - 112 - (index % 2) * 24,
          patrolMinX,
          patrolMaxX,
          ranged,
        });
      } else {
        enemies.push({
          kind,
          x,
          y: floorY - stats.height,
          patrolMinX,
          patrolMaxX,
          ranged,
        });
      }
    });
  };

  const creaturesA =
    1 + (tuning.kind === 'nightmare' ? 1 : 0) + (rng() < 0.4 ? 1 : 0);
  const creaturesB = 1 + (tuning.kind === 'nightmare' ? 1 : 0);
  addCreatures(startA, widthA, floorA, [...blocksA, ...skillColsA], creaturesA);
  addCreatures(startB, widthB, floorB, skillColsB, creaturesB);

  return {
    teleports,
    pickups,
    enemies,
    rooms: [
      {
        start: startA,
        width: widthA,
        floorRow: floorA,
        ceilRow: ceilA,
        shape: shapeA,
      },
      {
        start: startB,
        width: widthB,
        floorRow: floorB,
        ceilRow: ceilB,
        shape: 'vault',
      },
    ],
  };
}
