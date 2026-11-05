import { tileAt } from './level';
import { parseLevel } from './level';
import { LEVEL_01, TILE_SIZE } from './levels';
import { createSeededRandom } from './randomLevel';
import { carveSkyRoomChain } from './skyRooms';
import type {
  DecorationSpawn,
  FloatingIslandSpawn,
  Level,
  TileType,
} from './types';

const GROUND_ROW = 16;
const GROUND_Y = GROUND_ROW * TILE_SIZE;

function tileToChar(tile: TileType): string {
  if (tile === 'solid') {
    return '#';
  }
  if (tile === 'spike') {
    return '^';
  }
  return '.';
}

function buildGrid(): string[][] {
  return Array.from({ length: LEVEL_01.rows }, (_, row) =>
    Array.from({ length: LEVEL_01.cols }, (_, col) =>
      tileToChar(
        LEVEL_01.tiles[row * LEVEL_01.cols + col] ?? 'empty',
      ),
    ),
  );
}

function findSafeGroundCol(grid: string[][], target: number): number {
  for (let distance = 0; distance < 10; distance += 1) {
    for (const col of [target + distance, target - distance]) {
      if (
        col > 2 &&
        col < LEVEL_01.cols - 2 &&
        grid[GROUND_ROW]?.[col] === '#' &&
        grid[GROUND_ROW - 1]?.[col] === '.'
      ) {
        return col;
      }
    }
  }
  return 27;
}

function buildCampaignLevel(): Level {
  const grid = buildGrid();
  const groundPortalCol = findSafeGroundCol(grid, 27);
  const rng = createSeededRandom(0xc0cc0d11);

  const sky = carveSkyRoomChain(grid, {
    cols: LEVEL_01.cols,
    groundPortalCol,
    groundY: GROUND_Y,
    rng,
    difficulty: 'middle',
  });

  const rows = grid.map((row) => row.join(''));
  const withTerrain = parseLevel(rows, {
    tileSize: TILE_SIZE,
    spawn: LEVEL_01.spawn,
    enemies: [...LEVEL_01.enemies, ...sky.enemies],
    pickups: [...LEVEL_01.pickups, ...sky.pickups],
  });

  const laneClear = (
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
        if (tileAt(withTerrain, col, row) === 'solid') {
          return false;
        }
      }
    }
    return true;
  };

  const islandCandidates: FloatingIslandSpawn[] = [
    {
      baseX: 1536,
      y: GROUND_Y - 64,
      width: 160,
      travel: 120,
      period: 6,
      phase: 0.2,
    },
    {
      baseX: 1650,
      y: GROUND_Y - 176,
      width: 192,
      travel: 220,
      period: 8,
      phase: 0.4,
    },
    {
      baseX: 3200,
      y: GROUND_Y - 64,
      width: 160,
      travel: 160,
      period: 7,
      phase: 0.4,
    },
    {
      baseX: 3150,
      y: GROUND_Y - 128,
      width: 160,
      travel: 190,
      period: 7.5,
      phase: 0.3,
    },
    {
      baseX: 3950,
      y: GROUND_Y - 64,
      width: 128,
      travel: 110,
      period: 5.5,
      phase: 0.7,
    },
    {
      baseX: 4864,
      y: GROUND_Y - 64,
      width: 160,
      travel: 120,
      period: 6,
      phase: 0.6,
    },
    {
      baseX: 5450,
      y: GROUND_Y - 128,
      width: 160,
      travel: 150,
      period: 7,
      phase: 0.2,
    },
  ];

  const islands: FloatingIslandSpawn[] = [];
  for (const candidate of islandCandidates) {
    if (
      laneClear(
        candidate.baseX,
        candidate.travel,
        candidate.width,
        candidate.y,
      )
    ) {
      islands.push({ ...candidate, shape: islands.length % 3 });
      continue;
    }

    const highY = 10 * TILE_SIZE;
    if (
      laneClear(
        candidate.baseX,
        candidate.travel,
        candidate.width,
        highY,
      )
    ) {
      islands.push({ ...candidate, y: highY, shape: islands.length % 3 });
    }
  }

  const decorationCols = [7, 12, 20, 28, 36, 45, 52, 60, 70, 78, 86];
  const decorations: DecorationSpawn[] = [];
  decorationCols.forEach((col, index) => {
    if (
      tileAt(withTerrain, col, GROUND_ROW) !== 'solid' ||
      tileAt(withTerrain, col, GROUND_ROW - 1) !== 'empty'
    ) {
      return;
    }
    decorations.push({
      kind: index % 2 === 0 ? 'tree' : 'rock',
      x: col * TILE_SIZE + TILE_SIZE / 2,
      y: GROUND_Y,
      scale: index % 2 === 0 ? 0.36 + (index % 3) * 0.06 : 0.75,
      variant: index % 3,
    });
  });

  return {
    ...withTerrain,
    islands,
    teleports: sky.teleports,
    decorations,
  };
}

/**
 * Campaign world: the original LEVEL_01 route and enemy design, extended with
 * taxi islands, scenery, and two hidden sky chambers reached through paired
 * doors.
 */
export const CAMPAIGN_LEVEL: Level = buildCampaignLevel();
