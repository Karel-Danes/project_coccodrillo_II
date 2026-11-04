import type {
  AABB,
  EnemySpawn,
  Level,
  PickupSpawn,
  TileType,
  Vec2,
} from './types';

/**
 * Tolerance used when a box edge sits exactly on a tile boundary. Without
 * it the tile on the far side of the boundary is reported as overlapping.
 */
export const BOUNDS_EPSILON = 1e-6;

const TILE_CHARS: Readonly<Record<string, TileType>> = {
  '.': 'empty',
  '#': 'solid',
  '^': 'spike',
};

export type TileRange = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type ParseLevelOptions = {
  tileSize: number;
  spawn: Vec2;
  enemies?: readonly EnemySpawn[];
  pickups?: readonly PickupSpawn[];
};

/**
 * Builds a level from an ASCII map. Every row must have the same length.
 *
 *   .  empty
 *   #  solid
 *   ^  spikes (deadly, not solid)
 */
export function parseLevel(
  rows: readonly string[],
  options: ParseLevelOptions,
): Level {
  if (rows.length === 0) {
    throw new Error('A level needs at least one row');
  }

  const first = rows[0];
  const cols = first?.length ?? 0;
  if (cols === 0) {
    throw new Error('A level needs at least one column');
  }

  const tiles: TileType[] = [];
  rows.forEach((row, rowIndex) => {
    if (row.length !== cols) {
      throw new Error(
        `Row ${rowIndex} has ${row.length} columns, expected ${cols}`,
      );
    }

    for (const [colIndex, char] of [...row].entries()) {
      const tile = TILE_CHARS[char];
      if (tile === undefined) {
        throw new Error(
          `Unknown tile "${char}" at row ${rowIndex}, column ${colIndex}`,
        );
      }
      tiles.push(tile);
    }
  });

  return {
    cols,
    rows: rows.length,
    tileSize: options.tileSize,
    tiles,
    spawn: options.spawn,
    enemies: options.enemies ?? [],
    pickups: options.pickups ?? [],
  };
}

/** Out-of-bounds tiles read as empty so the world has open edges. */
export function tileAt(level: Level, col: number, row: number): TileType {
  if (col < 0 || col >= level.cols || row < 0 || row >= level.rows) {
    return 'empty';
  }
  return level.tiles[row * level.cols + col] ?? 'empty';
}

export function isSolid(level: Level, col: number, row: number): boolean {
  return tileAt(level, col, row) === 'solid';
}

/** Inclusive tile indices touched by a box. */
export function tileRange(level: Level, box: AABB): TileRange {
  const { tileSize } = level;
  return {
    left: Math.floor(box.x / tileSize),
    right: Math.floor((box.x + box.width - BOUNDS_EPSILON) / tileSize),
    top: Math.floor(box.y / tileSize),
    bottom: Math.floor((box.y + box.height - BOUNDS_EPSILON) / tileSize),
  };
}

export function overlapsTile(level: Level, box: AABB, tile: TileType): boolean {
  const { left, right, top, bottom } = tileRange(level, box);
  for (let row = top; row <= bottom; row += 1) {
    for (let col = left; col <= right; col += 1) {
      if (tileAt(level, col, row) === tile) {
        return true;
      }
    }
  }
  return false;
}
