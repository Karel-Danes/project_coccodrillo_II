import { statsFor } from './enemy';
import {
  DEFAULT_DIFFICULTY,
  difficultyDefinition,
} from './difficulty';
import { parseLevel } from './level';
import { TILE_SIZE } from './levels';
import { PLAYER_HEIGHT } from './player';
import { RANDOM_BOSSES, type BossKind } from './characters';
import { carveSkyRoomChain } from './skyRooms';
import type {
  DecorationSpawn,
  Difficulty,
  EnemyKind,
  EnemySpawn,
  FloatingIslandSpawn,
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
 * pits, stepped ledges, a three-step relic dais, scenery, and a flat boss
 * arena at the far right.
 */
export function generateRandomLevel(
  seed = randomSeed(),
  difficulty: Difficulty = DEFAULT_DIFFICULTY,
  bossKindOverride?: BossKind,
): Level {
  const rng = createSeededRandom(seed);
  const tuning = difficultyDefinition(difficulty);
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

  // Narrow pits. One tile keeps every hole a comfortable running jump.
  const pits: Array<{ col: number; width: number }> = [];
  let pitCursor = 12 + Math.floor(rng() * 4);
  while (pitCursor < 64) {
    const width = 1;
    pits.push({ col: pitCursor, width });
    for (let offset = 0; offset < width; offset += 1) {
      const col = pitCursor + offset;
      grid[GROUND_ROW]![col] = '.';
      grid[GROUND_ROW + 1]![col] = '^';
    }
    pitCursor += width + 6 + Math.floor(rng() * 5);
  }

  const overlapsPit = (col: number, width: number): boolean =>
    pits.some(
      (pit) =>
        col < pit.col + pit.width + 2 && col + width > pit.col - 2,
    );

  const fillBlock = (
    col: number,
    width: number,
    topRow: number,
  ): void => {
    for (let row = topRow; row < GROUND_ROW; row += 1) {
      for (let cell = col; cell < col + width; cell += 1) {
        grid[row]![cell] = '#';
      }
    }
  };

  // Dense ledges. Some are two storeys tall with an attached one-tile step,
  // so every ledge remains climbable. This makes random worlds much jumpier.
  const platforms: Platform[] = [];
  let platformCursor = 7 + Math.floor(rng() * 4);
  while (platformCursor < 67) {
    const width = 2 + Math.floor(rng() * 3);
    const stepped = rng() < 0.42;
    const totalWidth = width + (stepped ? 1 : 0);

    if (!overlapsPit(platformCursor, totalWidth)) {
      if (stepped) {
        fillBlock(platformCursor, 1, GROUND_ROW - 1);
        fillBlock(platformCursor + 1, width, GROUND_ROW - 2);
        platforms.push({
          col: platformCursor,
          width: 1,
          height: 1,
          topRow: GROUND_ROW - 1,
        });
        platforms.push({
          col: platformCursor + 1,
          width,
          height: 2,
          topRow: GROUND_ROW - 2,
        });
      } else {
        fillBlock(platformCursor, width, GROUND_ROW - 1);
        platforms.push({
          col: platformCursor,
          width,
          height: 1,
          topRow: GROUND_ROW - 1,
        });
      }
    }

    platformCursor += totalWidth + 2 + Math.floor(rng() * 4);
  }

  // A three-step dais carries the relic, so it is climbable one jump at a time.
  const daisCol = 68;
  const daisSteps = [
    { col: daisCol, width: 2, height: 1, topRow: GROUND_ROW - 1 },
    { col: daisCol + 2, width: 2, height: 2, topRow: GROUND_ROW - 2 },
    { col: daisCol + 4, width: 3, height: 3, topRow: GROUND_ROW - 3 },
  ] as const;
  for (const step of daisSteps) {
    fillBlock(step.col, step.width, step.topRow);
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

  const decorations: DecorationSpawn[] = [];
  for (let col = 6; col < 78; col += 1) {
    if (
      grid[GROUND_ROW]![col] !== '#' ||
      grid[GROUND_ROW - 1]![col] !== '.' ||
      overlapsPit(col, 1)
    ) {
      continue;
    }

    if (rng() < 0.2) {
      decorations.push({
        kind: 'tree',
        x: col * TILE_SIZE + TILE_SIZE / 2,
        y: groundY,
        scale: 0.32 + rng() * 0.2,
        variant: Math.floor(rng() * 3),
      });
    } else if (rng() < 0.28) {
      decorations.push({
        kind: 'rock',
        x: col * TILE_SIZE + TILE_SIZE / 2,
        y: groundY,
        scale: 0.65 + rng() * 0.55,
        variant: Math.floor(rng() * 3),
      });
    }
  }

  // A little scenery around the arena entrance, kept out of the fight lane.
  decorations.push({
    kind: 'tree',
    x: 79 * TILE_SIZE + TILE_SIZE / 2,
    y: groundY,
    scale: 0.4,
    variant: 1,
  });
  decorations.push({
    kind: 'rock',
    x: 81 * TILE_SIZE,
    y: groundY,
    scale: 0.9,
    variant: 2,
  });

  // Floating taxi islands. Their tops sit one jump above the floor and they
  // drift horizontally, carrying anyone standing on them. Candidate lanes
  // are rejected if the island body would pass through a solid ledge.
  const islands: FloatingIslandSpawn[] = [];
  const islandCount = 10 + Math.floor(rng() * 3);
  const islandMinX = 4 * TILE_SIZE;
  const islandMaxX = 78 * TILE_SIZE;
  const islandSlot = (islandMaxX - islandMinX) / islandCount;

  const islandLaneClear = (
    baseX: number,
    travel: number,
    width: number,
    y: number,
  ): boolean => {
    const leftCol = Math.floor((baseX - travel) / TILE_SIZE) - 1;
    const rightCol =
      Math.floor((baseX + travel + width) / TILE_SIZE) + 1;
    const topRow = Math.floor(y / TILE_SIZE);
    const bottomRow = Math.floor((y + 36) / TILE_SIZE);

    for (let row = topRow; row <= bottomRow; row += 1) {
      for (let col = leftCol; col <= rightCol; col += 1) {
        if (grid[row]?.[col] === '#') {
          return false;
        }
      }
    }
    return true;
  };

  for (let index = 0; index < islandCount; index += 1) {
    const slotCenter = islandMinX + islandSlot * (index + 0.5);
    let placed = false;

    for (let attempt = 0; attempt < 40; attempt += 1) {
      const width = 96 + Math.floor(rng() * 5) * 32;
      const heightOptions = [64, 64, 88, 88, 128, 128, 176, 224] as const;
      const height =
        heightOptions[Math.floor(rng() * heightOptions.length)] ?? 64;
      const high = height > 100;
      const travel = high
        ? 180 + Math.floor(rng() * 4) * 45
        : 90 + Math.floor(rng() * 4) * 30;
      const jitter = (rng() - 0.5) * islandSlot * 0.8;
      let baseX = slotCenter + jitter;
      baseX = Math.max(
        islandMinX + travel,
        Math.min(islandMaxX - width - travel, baseX),
      );
      const y = groundY - height;

      if (!islandLaneClear(baseX, travel, width, y)) {
        continue;
      }

      islands.push({
        baseX,
        y,
        width,
        travel,
        period: high ? 7 + rng() * 4 : 5 + rng() * 3,
        phase: rng(),
        shape: Math.floor(rng() * 3),
      });
      placed = true;
      break;
    }

    // Sky-lane fallback: a high island is reachable from two-storey ledges
    // and keeps the route populated even when the low lane is blocked.
    if (!placed) {
      const fallbackWidth = 128;
      const fallbackTravel = 160;
      const fallbackY = groundY - 176;
      for (const offset of [0, -160, 160, -320, 320]) {
        let baseX = slotCenter + offset;
        baseX = Math.max(
          islandMinX + fallbackTravel,
          Math.min(
            islandMaxX - fallbackWidth - fallbackTravel,
            baseX,
          ),
        );
        if (
          !islandLaneClear(
            baseX,
            fallbackTravel,
            fallbackWidth,
            fallbackY,
          )
        ) {
          continue;
        }
        islands.push({
          baseX,
          y: fallbackY,
          width: fallbackWidth,
          travel: fallbackTravel,
          period: 7 + rng() * 3,
          phase: rng(),
          shape: Math.floor(rng() * 3),
        });
        break;
      }
    }
  }

  const enemies: EnemySpawn[] = [];
  const groundKinds: EnemyKind[] = ['skeleton', 'goblin', 'slime'];
  const usedCols: number[] = [];
  const targetCount = Math.max(
    3,
    5 + Math.floor(rng() * 3) + tuning.enemyCountBonus,
  );
  let attempts = 0;

  while (enemies.length < targetCount && attempts < targetCount * 10) {
    attempts += 1;
    const flying = rng() < 0.24;
    const col = 10 + Math.floor(rng() * 58);
    if (usedCols.some((used) => Math.abs(used - col) < 5)) {
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
    const ranged = tuning.rangedChance > 0 && rng() < tuning.rangedChance;

    if (flying) {
      enemies.push({
        kind,
        x,
        y: groundY - 180 - Math.floor(rng() * 90),
        patrolMinX: x - 150,
        patrolMaxX: x + 150,
        ranged,
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
      ranged,
    });
  }

  const bossKind: BossKind =
    bossKindOverride ?? pick(rng, RANDOM_BOSSES);
  const bossStats = statsFor(bossKind);
  const bossX = 88 * TILE_SIZE + (TILE_SIZE - bossStats.width) / 2;
  enemies.push({
    kind: bossKind,
    x: bossX,
    y: topY(BOSS_ROW) - bossStats.height,
    patrolMinX: 78 * TILE_SIZE,
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

  // Two connected hidden sky rooms, reached through paired doors.
  const portalGroundCol = safeGroundCol(18 + Math.floor(rng() * 10));
  const sky = carveSkyRoomChain(grid, {
    cols: COLS,
    groundPortalCol: portalGroundCol,
    groundY,
    rng,
    difficulty,
  });
  pickups.push(...sky.pickups);
  enemies.push(...sky.enemies);
  const teleports = sky.teleports;

  const rows = grid.map((row) => row.join(''));
  const level = parseLevel(rows, {
    tileSize: TILE_SIZE,
    spawn: { x: 3 * TILE_SIZE, y: groundY - PLAYER_HEIGHT },
    enemies,
    pickups,
  });

  return { ...level, decorations, islands, teleports };
}
