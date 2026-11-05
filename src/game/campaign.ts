import { tileAt } from './level';
import { LEVEL_01, TILE_SIZE } from './levels';
import type {
  DecorationSpawn,
  FloatingIslandSpawn,
  Level,
  PickupSpawn,
  SkillKind,
  TeleportSpawn,
  TileType,
} from './types';

const ROOM_START = 54;
const ROOM_WIDTH = 12;
const ROOM_CEIL_ROW = 2;
const ROOM_FLOOR_ROW = 5;
const GROUND_ROW = 16;
const ROOM_FLOOR_Y = ROOM_FLOOR_ROW * TILE_SIZE;
const GROUND_Y = GROUND_ROW * TILE_SIZE;

function buildCampaignLevel(): Level {
  const tiles: TileType[] = [...LEVEL_01.tiles];
  const setTile = (col: number, row: number, tile: TileType): void => {
    tiles[row * LEVEL_01.cols + col] = tile;
  };

  // Carve a hidden sky room high above the existing route.
  for (
    let col = ROOM_START - 1;
    col <= ROOM_START + ROOM_WIDTH;
    col += 1
  ) {
    setTile(col, ROOM_CEIL_ROW, 'solid');
    setTile(col, ROOM_FLOOR_ROW, 'solid');
  }
  for (
    let row = ROOM_CEIL_ROW;
    row <= ROOM_FLOOR_ROW;
    row += 1
  ) {
    setTile(ROOM_START - 1, row, 'solid');
    setTile(ROOM_START + ROOM_WIDTH, row, 'solid');
  }

  const withTerrain: Level = { ...LEVEL_01, tiles };

  const findSafeGroundCol = (target: number): number => {
    for (let distance = 0; distance < 10; distance += 1) {
      for (const col of [target + distance, target - distance]) {
        if (
          col > 2 &&
          col < LEVEL_01.cols - 2 &&
          tileAt(withTerrain, col, GROUND_ROW) === 'solid' &&
          tileAt(withTerrain, col, GROUND_ROW - 1) === 'empty'
        ) {
          return col;
        }
      }
    }
    return 27;
  };

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
      islands.push(candidate);
      continue;
    }

    // The stair tops sit at row 11. A sky lane at row 10 is always clear and
    // still reachable from those ledges.
    const highY = 10 * TILE_SIZE;
    if (
      laneClear(
        candidate.baseX,
        candidate.travel,
        candidate.width,
        highY,
      )
    ) {
      islands.push({ ...candidate, y: highY });
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

  const groundPortalCol = findSafeGroundCol(27);
  const groundDoorX =
    groundPortalCol * TILE_SIZE + TILE_SIZE / 2;
  const skyDoorX =
    (ROOM_START + Math.floor(ROOM_WIDTH / 2)) * TILE_SIZE +
    TILE_SIZE / 2;

  const teleports: TeleportSpawn[] = [
    { id: 0, targetId: 1, x: groundDoorX, y: GROUND_Y },
    { id: 1, targetId: 0, x: skyDoorX, y: ROOM_FLOOR_Y },
  ];

  const skills: SkillKind[] = ['melee', 'ranged', 'vitality'];
  const skillCols = [
    ROOM_START + 1,
    ROOM_START + 4,
    ROOM_START + ROOM_WIDTH - 2,
  ];
  const skillPickups: PickupSpawn[] = skills.map((skill, index) => ({
    kind: 'skill',
    skill,
    x: (skillCols[index] ?? ROOM_START + 4) * TILE_SIZE,
    y: ROOM_FLOOR_Y - 38,
  }));

  return {
    ...withTerrain,
    pickups: [...LEVEL_01.pickups, ...skillPickups],
    islands,
    teleports,
    decorations,
  };
}

/**
 * Campaign world: the original LEVEL_01 route and enemy design, extended with
 * taxi islands, scenery, and a hidden sky room reached through paired doors.
 */
export const CAMPAIGN_LEVEL: Level = buildCampaignLevel();
