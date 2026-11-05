import { tileAt } from './level';
import type {
  AABB,
  Level,
  Projectile,
  ProjectileKind,
  Vec2,
} from './types';

export const PROJECTILE_SPEED = 420;
export const PROJECTILE_LIFETIME = 3.2;
export const PROJECTILE_SIZE = 28;

export const LIGHTNING_SPEED = 820;
export const LIGHTNING_LIFETIME = 1.5;
export const AXE_SPEED = 560;
export const AXE_GRAVITY = 1350;
export const AXE_LIFETIME = 2.4;

function projectile(
  from: Vec2,
  velocity: Vec2,
  kind: ProjectileKind,
  owner: 'player' | 'enemy',
  damage: number,
  lifetime: number,
  gravity = 0,
): Projectile {
  return {
    position: { x: from.x, y: from.y },
    velocity,
    lifetime,
    owner,
    kind,
    damage,
    gravity,
  };
}

function velocityToward(from: Vec2, target: Vec2, speed: number): Vec2 {
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  return {
    x: (dx / length) * speed,
    y: (dy / length) * speed,
  };
}

export function createGolemProjectile(from: Vec2, target: Vec2): Projectile {
  return projectile(
    from,
    velocityToward(from, target, PROJECTILE_SPEED),
    'golemOrb',
    'enemy',
    1,
    PROJECTILE_LIFETIME,
  );
}

/** Random bosses all shoot, but with different weight and paint. */
export function createBossProjectile(
  kind: 'golem' | 'darkKnight' | 'orcBrute',
  from: Vec2,
  target: Vec2,
): Projectile {
  if (kind === 'orcBrute') {
    return projectile(
      from,
      velocityToward(from, target, AXE_SPEED),
      'axe',
      'enemy',
      2,
      AXE_LIFETIME,
      AXE_GRAVITY,
    );
  }

  if (kind === 'darkKnight') {
    return projectile(
      from,
      velocityToward(from, target, PROJECTILE_SPEED * 1.2),
      'darkOrb',
      'enemy',
      1,
      PROJECTILE_LIFETIME,
    );
  }

  return createGolemProjectile(from, target);
}

/** Mage lightning or an Orc thrown axe, aimed along the hero's facing. */
export function createPlayerProjectile(
  kind: 'lightning' | 'axe',
  from: Vec2,
  facing: -1 | 1,
  damage: number,
): Projectile {
  if (kind === 'lightning') {
    return projectile(
      from,
      { x: facing * LIGHTNING_SPEED, y: 0 },
      'lightning',
      'player',
      damage,
      LIGHTNING_LIFETIME,
    );
  }

  return projectile(
    from,
    { x: facing * AXE_SPEED, y: -170 },
    'axe',
    'player',
    damage,
    AXE_LIFETIME,
    AXE_GRAVITY,
  );
}

/** Turns an enemy spell into a player-owned bolt aimed at a new target. */
export function reflectProjectile(
  source: Projectile,
  from: Vec2,
  target: Vec2,
  damage: number,
): Projectile {
  return projectile(
    from,
    velocityToward(from, target, PROJECTILE_SPEED * 1.5),
    'reflected',
    'player',
    damage,
    Math.max(1.8, source.lifetime),
  );
}

export function projectileBounds(projectile: Projectile): AABB {
  return {
    x: projectile.position.x - PROJECTILE_SIZE / 2,
    y: projectile.position.y - PROJECTILE_SIZE / 2,
    width: PROJECTILE_SIZE,
    height: PROJECTILE_SIZE,
  };
}

/** Advances the projectile; returns null when it expires or hits rock. */
export function stepProjectile(
  projectile: Projectile,
  level: Level,
  dtSeconds: number,
): Projectile | null {
  const lifetime = projectile.lifetime - dtSeconds;
  if (lifetime <= 0) {
    return null;
  }

  const velocity = {
    x: projectile.velocity.x,
    y:
      projectile.velocity.y +
      (projectile.gravity > 0 ? projectile.gravity * dtSeconds : 0),
  };
  const position = {
    x: projectile.position.x + velocity.x * dtSeconds,
    y: projectile.position.y + velocity.y * dtSeconds,
  };

  const col = Math.floor(position.x / level.tileSize);
  const row = Math.floor(position.y / level.tileSize);
  if (tileAt(level, col, row) === 'solid') {
    return null;
  }

  return {
    ...projectile,
    position,
    velocity,
    lifetime,
  };
}
