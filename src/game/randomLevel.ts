import { statsFor } from './enemy';
import { parseLevel } from './level';
import { TILE_SIZE } from './levels';
import { PLAYER_HEIGHT } from './player';
import { RANDOM_BOSSES, type BossKind } from './characters';
import type {
  EnemyKind,
  EnemySpawn,
  Level,
  PickupSpawn,
} from './types';

const COLS = 96;
const ROWS = 18;
const GROUND_ROW = 16;
const BOSS_ROW = 16;

export type RandomSource = () => number;

/** Small deterministic LCG so a seed always rebuilds the same world. */
export function createSeededRandom(seed: number): RandomSource {
  let state = (seed >>> 0) || 0x9e3779b9;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff);
}

function pick<T>(rng: RandomSource, values: readonly T[]): T {
  return values[Math.floor(rng() * values.length)] ?? values[0]!;
}

type Platform = {
  col: number;
  width: number;
  height: number;
  topRow: number;
};

/**
 * Builds a traversable 96 x 18 ruin route: a solid floor with narrow spike
 * pits, one-tile jumpable ledges, a three-step relic dais, and a flat boss
 * arena at the far right.
 */
export function generateRandomLevel(seed = randomSeed()): Level {
  const rng = createSeededRandom(seed);
  const grid: string[][] = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => '.'),
  );

  for (let col = 0; col < COLS; col += 1) {
    grid[0]![col] = '#';
    grid[GROUND_ROW]![col] = '#';
    grid[ROWS - 1]![col] = '#';
  }
  for (let row = 0; row < ROWS; row += 1) {
    grid[row]![0] = '#';
    grid[row]![COLS - 1] = '#';
  }

  // Narrow pits. Two tiles is the widest that a running jump clears.
  const pits: Array<{ col: number; width: number }> = [];
  let pitCursor = 16 + Math.floor(rng() * 4);
  while (pitCursor < 64) {
    const width = rng() < 0.45 ? 2 : 1;
    pits.push({ col: pitCursor, width });
    for (let offset = 0; offset < width; offset += 1) {
      const col = pitCursor + offset;
      grid[GROUND_ROW]![col] = '.';
      grid[GROUND_ROW + 1]![col] = '^';
    }
    pitCursor += width + 7 + Math.floor(rng() * 6);
  }

  const overlapsPit = (col: number, width: number): boolean =>
    pits.some(
      (pit) =>
        col < pit.col + pit.width + 2 && col + width > pit.col - 2,
    );

  // One-tile ledges are always reachable from the floor.
  const platforms: Platform[] = [];
  let platformCursor = 8 + Math.floor(rng() * 4);
  while (platformCursor < 66) {
    const width = 2 + Math.floor(rng() * 3);
    if (!overlapsPit(platformCursor, width)) {
      const topRow = GROUND_ROW - 1;
      for (let row = topRow; row < GROUND_ROW; row += 1) {
        for (let col = platformCursor; col < platformCursor + width; col += 1) {
          grid[row]![col] = '#';
        }
      }
      platforms.push({ col: platformCursor, width, height: 1, topRow });
    }
    platformCursor += width + 4 + Math.floor(rng() * 5);
  }

  // A three-step dais carries the relic, so it is climbable one jump at a time.
  const daisCol = 68;
  const daisSteps = [
    { col: daisCol, width: 2, height: 1, topRow: GROUND_ROW - 1 },
    { col: daisCol + 2, width: 2, height: 2, topRow: GROUND_ROW - 2 },
    { col: daisCol + 4, width: 3, height: 3, topRow: GROUND_ROW - 3 },
  ] as const;
  for (const step of daisSteps) {
    for (let row = step.topRow; row < GROUND_ROW; row += 1) {
      for (let col = step.col; col < step.col + step.width; col += 1) {
        grid[row]![col] = '#';
      }
    }
  }

  const topY = (row: number): number => row * TILE_SIZE;
  const groundY = topY(GROUND_ROW);

  const safeGroundCol = (target: number): number => {
    for (let distance = 0; distance < 8; distance += 1) {
      for (const col of [target + distance, target - distance]) {
        if (
          col > 2 &&
          col < COLS - 2 &&
          grid[GROUND_ROW]![col] === '#' &&
          grid[GROUND_ROW - 1]![col] === '.'
        ) {
          return col;
        }
      }
    }
    return 4;
  };

  const enemies: EnemySpawn[] = [];
  const groundKinds: EnemyKind[] = ['skeleton', 'goblin', 'slime'];
  const usedCols: number[] = [];
  const enemyCount = 5 + Math.floor(rng() * 3);

  for (let index = 0; index < enemyCount; index += 1) {
    const flying = rng() < 0.24;
    const col = 10 + Math.floor(rng() * 56);
    if (usedCols.some((used) => Math.abs(used - col) < 7)) {
      continue;
    }
    if (
      !flying &&
      (grid[GROUND_ROW]![col] !== '#' || grid[GROUND_ROW - 1]![col] !== '.')
    ) {
      continue;
    }
    usedCols.push(col);

    const kind = flying ? 'bat' : pick(rng, groundKinds);
    const stats = statsFor(kind);
    const x = col * TILE_SIZE + (TILE_SIZE - stats.width) / 2;

    if (flying) {
      enemies.push({
        kind,
        x,
        y: groundY - 180 - Math.floor(rng() * 90),
        patrolMinX: x - 150,
        patrolMaxX: x + 150,
      });
      continue;
    }

    let left = col;
    let right = col;
    while (left > 1 && grid[GROUND_ROW]![left - 1] === '#') {
      left -= 1;
    }
    while (right < COLS - 2 && grid[GROUND_ROW]![right + 1] === '#') {
      right += 1;
    }

    enemies.push({
      kind,
      x,
      y: groundY - stats.height,
      patrolMinX: Math.max(left * TILE_SIZE + 8, x - 110),
      patrolMaxX: Math.min(
        (right + 1) * TILE_SIZE - stats.width - 8,
        x + 110,
      ),
    });
  }

  const bossKind: BossKind = pick(rng, RANDOM_BOSSES);
  const bossStats = statsFor(bossKind);
  const bossX = 88 * TILE_SIZE + (TILE_SIZE - bossStats.width) / 2;
  enemies.push({
    kind: bossKind,
    x: bossX,
    y: topY(BOSS_ROW) - bossStats.height,
    patrolMinX: 82 * TILE_SIZE,
    patrolMaxX: 94 * TILE_SIZE - bossStats.width,
    boss: true,
  });

  const pickups: PickupSpawn[] = [
    { kind: 'well', x: 7 * TILE_SIZE, y: groundY - 40 },
  ];

  for (const platform of platforms) {
    const center = (platform.col + platform.width / 2) * TILE_SIZE;
    pickups.push({
      kind: rng() < 0.22 ? 'heart' : 'coin',
      x: center,
      y: topY(platform.topRow) - 38,
    });
  }

  for (const distance of [28, 44, 58]) {
    const col = safeGroundCol(distance);
    pickups.push({
      kind: rng() < 0.3 ? 'heart' : 'coin',
      x: col * TILE_SIZE + TILE_SIZE / 2,
      y: groundY - 34,
    });
  }

  const daisTop = daisSteps[daisSteps.length - 1]!;
  pickups.push({
    kind: 'artifact',
    x: (daisTop.col + daisTop.width / 2) * TILE_SIZE,
    y: topY(daisTop.topRow) - 44,
  });
  pickups.push({
    kind: 'well',
    x: safeGroundCol(80) * TILE_SIZE + TILE_SIZE / 2,
    y: groundY - 40,
  });

  const rows = grid.map((row) => row.join(''));

  return parseLevel(rows, {
    tileSize: TILE_SIZE,
    spawn: { x: 3 * TILE_SIZE, y: groundY - PLAYER_HEIGHT },
    enemies,
    pickups,
  });
}
