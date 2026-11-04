import { isSolid, tileRange } from './level';
import type { AABB, Level, Vec2 } from './types';

export type Body = {
  position: Vec2;
  width: number;
  height: number;
};

export type Kinematics = {
  position: Vec2;
  velocity: Vec2;
  grounded: boolean;
};

/**
 * Finds the blocking tile column when moving horizontally.
 * Scans from the leading edge inward, so the nearest wall wins.
 */
function blockingColumn(
  level: Level,
  box: AABB,
  direction: 1 | -1,
): number | null {
  const { left, right, top, bottom } = tileRange(level, box);

  if (direction > 0) {
    for (let col = left; col <= right; col += 1) {
      for (let row = top; row <= bottom; row += 1) {
        if (isSolid(level, col, row)) {
          return col;
        }
      }
    }
  } else {
    for (let col = right; col >= left; col -= 1) {
      for (let row = top; row <= bottom; row += 1) {
        if (isSolid(level, col, row)) {
          return col;
        }
      }
    }
  }
  return null;
}

/** Same as `blockingColumn`, on the vertical axis. */
function blockingRow(
  level: Level,
  box: AABB,
  direction: 1 | -1,
): number | null {
  const { left, right, top, bottom } = tileRange(level, box);

  if (direction > 0) {
    for (let row = top; row <= bottom; row += 1) {
      for (let col = left; col <= right; col += 1) {
        if (isSolid(level, col, row)) {
          return row;
        }
      }
    }
  } else {
    for (let row = bottom; row >= top; row -= 1) {
      for (let col = left; col <= right; col += 1) {
        if (isSolid(level, col, row)) {
          return row;
        }
      }
    }
  }
  return null;
}

/**
 * True when two axis-aligned boxes overlap. Edge-touching is not overlap.
 */
export function overlaps(a: AABB, b: AABB): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/**
 * Moves a body by `velocity * dtSeconds`, resolving solid tiles one axis at
 * a time (horizontal first, then vertical). All speeds stay well below one
 * tile per step, so axis-separated resolution cannot tunnel.
 */
export function moveAndCollide(
  body: Body,
  velocity: Vec2,
  level: Level,
  dtSeconds: number,
): Kinematics {
  const { tileSize } = level;
  let x = body.position.x;
  let y = body.position.y;
  let vx = velocity.x;
  let vy = velocity.y;
  let grounded = false;

  if (vx !== 0) {
    const nextX = x + vx * dtSeconds;
    const column = blockingColumn(
      level,
      { x: nextX, y, width: body.width, height: body.height },
      vx > 0 ? 1 : -1,
    );

    if (column === null) {
      x = nextX;
    } else {
      // Clamp position but keep horizontal velocity. During a jump the
      // velocity is committed momentum: retaining it lets the player slide
      // up a ledge face and over the top instead of dead-stopping. On the
      // ground, the state machine rewrites velocity from input each step.
      x = vx > 0 ? column * tileSize - body.width : (column + 1) * tileSize;
    }
  }

  if (vy !== 0) {
    const nextY = y + vy * dtSeconds;
    const row = blockingRow(
      level,
      { x, y: nextY, width: body.width, height: body.height },
      vy > 0 ? 1 : -1,
    );

    if (row === null) {
      y = nextY;
    } else {
      if (vy > 0) {
        y = row * tileSize - body.height;
        grounded = true;
      } else {
        y = (row + 1) * tileSize;
      }
      vy = 0;
    }
  }

  return { position: { x, y }, velocity: { x: vx, y: vy }, grounded };
}
