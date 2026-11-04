import { tileAt } from './level';
import type { AABB, Level, Projectile, Vec2 } from './types';

export const PROJECTILE_SPEED = 420;
export const PROJECTILE_LIFETIME = 3.2;
export const PROJECTILE_SIZE = 28;

export function createGolemProjectile(from: Vec2, target: Vec2): Projectile {
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const length = Math.hypot(dx, dy) || 1;

  return {
    position: { x: from.x, y: from.y },
    velocity: {
      x: (dx / length) * PROJECTILE_SPEED,
      y: (dy / length) * PROJECTILE_SPEED,
    },
    lifetime: PROJECTILE_LIFETIME,
  };
}

export function projectileBounds(projectile: Projectile): AABB {
  return {
    x: projectile.position.x - PROJECTILE_SIZE / 2,
    y: projectile.position.y - PROJECTILE_SIZE / 2,
    width: PROJECTILE_SIZE,
    height: PROJECTILE_SIZE,
  };
}

/** Advances the orb; returns null when it expires or hits solid rock. */
export function stepProjectile(
  projectile: Projectile,
  level: Level,
  dtSeconds: number,
): Projectile | null {
  const lifetime = projectile.lifetime - dtSeconds;
  if (lifetime <= 0) {
    return null;
  }

  const position = {
    x: projectile.position.x + projectile.velocity.x * dtSeconds,
    y: projectile.position.y + projectile.velocity.y * dtSeconds,
  };

  const col = Math.floor(position.x / level.tileSize);
  const row = Math.floor(position.y / level.tileSize);
  if (tileAt(level, col, row) === 'solid') {
    return null;
  }

  return {
    position,
    velocity: projectile.velocity,
    lifetime,
  };
}
