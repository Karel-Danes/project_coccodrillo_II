import { moveAndCollide } from './physics';
import {
  GRAVITY,
  MAX_FALL_SPEED,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  type AttackPhase,
} from './player';
import type {
  AABB,
  Enemy,
  EnemyKind,
  EnemySpawn,
  Facing,
  Level,
  Player,
} from './types';

export type EnemyBehavior = 'ground' | 'flying';

export type EnemyStats = {
  behavior: EnemyBehavior;
  width: number;
  height: number;
  maxHp: number;
  walkSpeed: number;
  aggroRange: number;
  attackRange: number;
  attackStartup: number;
  attackActive: number;
  attackRecovery: number;
  attackCooldown: number;
  hurtDuration: number;
  attackReach: number;
  attackHeight: number;
  attackOffsetY: number;
};

export const ENEMY_STATS: Record<EnemyKind, EnemyStats> = {
  skeleton: {
    behavior: 'ground',
    width: 40,
    height: 88,
    maxHp: 3,
    walkSpeed: 80,
    aggroRange: 260,
    attackRange: 86,
    attackStartup: 0.26,
    attackActive: 0.14,
    attackRecovery: 0.36,
    attackCooldown: 0.65,
    hurtDuration: 0.32,
    attackReach: 64,
    attackHeight: 52,
    attackOffsetY: 18,
  },
  goblin: {
    behavior: 'ground',
    width: 40,
    height: 80,
    maxHp: 2,
    walkSpeed: 110,
    aggroRange: 300,
    attackRange: 80,
    attackStartup: 0.2,
    attackActive: 0.12,
    attackRecovery: 0.3,
    attackCooldown: 0.55,
    hurtDuration: 0.28,
    attackReach: 64,
    attackHeight: 48,
    attackOffsetY: 16,
  },
  slime: {
    behavior: 'ground',
    width: 42,
    height: 38,
    maxHp: 2,
    walkSpeed: 45,
    aggroRange: 220,
    attackRange: 60,
    attackStartup: 0.3,
    attackActive: 0.16,
    attackRecovery: 0.34,
    attackCooldown: 0.7,
    hurtDuration: 0.3,
    attackReach: 46,
    attackHeight: 32,
    attackOffsetY: 4,
  },
  bat: {
    behavior: 'flying',
    width: 40,
    height: 36,
    maxHp: 2,
    walkSpeed: 95,
    aggroRange: 300,
    attackRange: 60,
    attackStartup: 0.2,
    attackActive: 0.16,
    attackRecovery: 0.3,
    attackCooldown: 0.8,
    hurtDuration: 0.25,
    attackReach: 50,
    attackHeight: 32,
    attackOffsetY: 0,
  },
  golem: {
    behavior: 'ground',
    width: 80,
    height: 136,
    maxHp: 12,
    walkSpeed: 50,
    aggroRange: 460,
    attackRange: 130,
    attackStartup: 0.45,
    attackActive: 0.22,
    attackRecovery: 0.55,
    attackCooldown: 0.9,
    hurtDuration: 0.25,
    attackReach: 100,
    attackHeight: 80,
    attackOffsetY: 28,
  },
};

export function statsFor(kind: EnemyKind): EnemyStats {
  return ENEMY_STATS[kind];
}

export function enemyAttackDuration(stats: EnemyStats): number {
  return stats.attackStartup + stats.attackActive + stats.attackRecovery;
}

export type EnemyStepContext = {
  level: Level;
  player: Player;
  dtSeconds: number;
};

export function createEnemy(spawn: EnemySpawn): Enemy {
  const stats = statsFor(spawn.kind);
  return {
    kind: spawn.kind,
    position: { x: spawn.x, y: spawn.y },
    velocity: { x: 0, y: 0 },
    facing: -1,
    state: 'idle',
    stateTime: 0,
    hp: stats.maxHp,
    grounded: false,
    patrolMinX: spawn.patrolMinX,
    patrolMaxX: spawn.patrolMaxX,
    homeX: spawn.x,
    homeY: spawn.y,
    attackCooldown: 0,
  };
}

export function enemyBounds(enemy: Enemy): AABB {
  const stats = statsFor(enemy.kind);
  return {
    x: enemy.position.x,
    y: enemy.position.y,
    width: stats.width,
    height: stats.height,
  };
}

/** Skeleton / goblin / slime / golem ground brain. */
function stepGroundEnemy(
  enemy: Enemy,
  stats: EnemyStats,
  context: EnemyStepContext,
): Enemy {
  const dt = context.dtSeconds;
  const player = context.player;
  const duration = enemyAttackDuration(stats);

  let state = enemy.state;
  let stateTime = enemy.stateTime + dt;
  let facing = enemy.facing;
  let vx = 0;
  let cooldown = Math.max(0, enemy.attackCooldown - dt);

  if (enemy.state === 'hurt') {
    if (stateTime >= stats.hurtDuration) {
      state = 'idle';
      stateTime = 0;
    }
  } else if (enemy.state === 'attack') {
    if (stateTime >= duration) {
      state = 'idle';
      stateTime = 0;
      cooldown = stats.attackCooldown;
    }
  } else {
    const dx =
      player.position.x +
      PLAYER_WIDTH / 2 -
      (enemy.position.x + stats.width / 2);
    const feetDelta = Math.abs(
      player.position.y +
        PLAYER_HEIGHT -
        (enemy.position.y + stats.height),
    );
    const playerAlive = player.state !== 'die';
    const sameLevel = feetDelta < 48;
    const engaged =
      playerAlive && sameLevel && Math.abs(dx) < stats.aggroRange;

    if (engaged) {
      if (dx !== 0) {
        facing = dx > 0 ? 1 : -1;
      }

      if (Math.abs(dx) <= stats.attackRange && cooldown <= 0) {
        state = 'attack';
        stateTime = 0;
      } else if (Math.abs(dx) > stats.attackRange * 0.9) {
        const direction = dx > 0 ? 1 : -1;
        const nextX = enemy.position.x + direction * stats.walkSpeed * dt;
        if (nextX >= enemy.patrolMinX && nextX <= enemy.patrolMaxX) {
          vx = direction * stats.walkSpeed;
          state = 'walk';
        } else {
          state = 'idle';
        }
      } else {
        state = 'idle';
      }
    } else {
      if (enemy.position.x <= enemy.patrolMinX && facing === -1) {
        facing = 1;
      } else if (enemy.position.x >= enemy.patrolMaxX && facing === 1) {
        facing = -1;
      }

      const nextX = enemy.position.x + facing * stats.walkSpeed * dt;
      if (nextX < enemy.patrolMinX || nextX > enemy.patrolMaxX) {
        facing = facing === 1 ? -1 : 1;
        state = 'idle';
      } else {
        vx = facing * stats.walkSpeed;
        state = 'walk';
      }
    }
  }

  const vy = Math.min(enemy.velocity.y + GRAVITY * dt, MAX_FALL_SPEED);
  const kinematics = moveAndCollide(
    {
      position: enemy.position,
      width: stats.width,
      height: stats.height,
    },
    { x: vx, y: vy },
    context.level,
    dt,
  );

  return {
    ...enemy,
    position: kinematics.position,
    velocity: kinematics.velocity,
    facing: facing as Facing,
    state,
    stateTime,
    grounded: kinematics.grounded,
    attackCooldown: cooldown,
  };
}

/** Bat brain: no gravity, hover/dive, bite when close. */
function stepFlyingEnemy(
  enemy: Enemy,
  stats: EnemyStats,
  context: EnemyStepContext,
): Enemy {
  const dt = context.dtSeconds;
  const player = context.player;
  const duration = enemyAttackDuration(stats);

  let state = enemy.state;
  let stateTime = enemy.stateTime + dt;
  let facing = enemy.facing;
  let vx = 0;
  let vy = 0;
  let cooldown = Math.max(0, enemy.attackCooldown - dt);

  if (enemy.state === 'hurt') {
    if (stateTime >= stats.hurtDuration) {
      state = 'idle';
      stateTime = 0;
    }
  } else if (enemy.state === 'attack') {
    if (stateTime >= duration) {
      state = 'idle';
      stateTime = 0;
      cooldown = stats.attackCooldown;
    }
  } else {
    const playerCenterX = player.position.x + PLAYER_WIDTH / 2;
    const playerCenterY = player.position.y + PLAYER_HEIGHT / 2;
    const centerX = enemy.position.x + stats.width / 2;
    const centerY = enemy.position.y + stats.height / 2;
    const dx = playerCenterX - centerX;
    const dy = playerCenterY - centerY;
    const engaged =
      player.state !== 'die' &&
      Math.abs(dx) < stats.aggroRange &&
      Math.abs(dy) < 240;

    if (engaged) {
      if (dx !== 0) {
        facing = dx > 0 ? 1 : -1;
      }

      if (
        Math.abs(dx) <= stats.attackRange &&
        Math.abs(dy) < 60 &&
        cooldown <= 0
      ) {
        state = 'attack';
        stateTime = 0;
      } else {
        if (Math.abs(dx) > stats.attackRange * 0.7) {
          vx = Math.sign(dx) * stats.walkSpeed;
        }
        if (Math.abs(dy) > 16) {
          vy = Math.sign(dy) * stats.walkSpeed * 0.7;
        }
        state = vx !== 0 || vy !== 0 ? 'walk' : 'idle';
      }
    } else {
      const bob = Math.sin(stateTime * 3) * 16;
      const targetX = enemy.homeX;
      const targetY = enemy.homeY + bob;
      const homeDx = targetX - enemy.position.x;
      const homeDy = targetY - enemy.position.y;

      if (Math.abs(homeDx) > 6) {
        vx = Math.sign(homeDx) * stats.walkSpeed * 0.5;
      }
      if (Math.abs(homeDy) > 4) {
        vy = Math.sign(homeDy) * stats.walkSpeed * 0.5;
      }
      state = vx !== 0 || vy !== 0 ? 'walk' : 'idle';
    }
  }

  const worldHeight = context.level.rows * context.level.tileSize;
  const nextX = enemy.position.x + vx * dt;
  const nextY = Math.max(
    0,
    Math.min(enemy.position.y + vy * dt, worldHeight - stats.height),
  );

  return {
    ...enemy,
    position: { x: nextX, y: nextY },
    velocity: { x: vx, y: vy },
    facing: facing as Facing,
    state,
    stateTime,
    grounded: false,
    attackCooldown: cooldown,
  };
}

export function stepEnemy(enemy: Enemy, context: EnemyStepContext): Enemy {
  const stats = statsFor(enemy.kind);

  if (enemy.state === 'die') {
    return {
      ...enemy,
      stateTime: enemy.stateTime + context.dtSeconds,
      velocity: { x: 0, y: 0 },
    };
  }

  if (stats.behavior === 'flying') {
    return stepFlyingEnemy(enemy, stats, context);
  }

  return stepGroundEnemy(enemy, stats, context);
}

export function getEnemyAttackPhase(enemy: Enemy): AttackPhase | null {
  if (enemy.state !== 'attack') {
    return null;
  }

  const stats = statsFor(enemy.kind);
  const activeStart = stats.attackStartup;
  const activeEnd = stats.attackStartup + stats.attackActive;

  if (enemy.stateTime < activeStart) {
    return 'startup';
  }
  if (enemy.stateTime < activeEnd) {
    return 'active';
  }
  if (enemy.stateTime < enemyAttackDuration(stats)) {
    return 'recovery';
  }
  return null;
}

export function getEnemyAttackHitbox(enemy: Enemy): AABB | null {
  if (getEnemyAttackPhase(enemy) !== 'active') {
    return null;
  }

  const stats = statsFor(enemy.kind);
  return {
    x:
      enemy.facing === 1
        ? enemy.position.x + stats.width
        : enemy.position.x - stats.attackReach,
    y: enemy.position.y + stats.attackOffsetY,
    width: stats.attackReach,
    height: stats.attackHeight,
  };
}

/** Applies one point of damage; a killing blow enters the death state. */
export function damageEnemy(enemy: Enemy, amount: number): Enemy {
  if (enemy.state === 'die') {
    return enemy;
  }

  const hp = Math.max(0, enemy.hp - amount);
  if (hp === 0) {
    return {
      ...enemy,
      hp,
      state: 'die',
      stateTime: 0,
      velocity: { x: 0, y: 0 },
    };
  }

  return {
    ...enemy,
    hp,
    state: 'hurt',
    stateTime: 0,
    velocity: { x: 0, y: 0 },
  };
}

/**
 * Prevents the player from walking through a standing enemy. Dead enemies
 * are ignored and only horizontal separation is applied.
 */
export function keepPlayerOutOfEnemies(
  player: Player,
  enemies: readonly Enemy[],
): Player {
  let x = player.position.x;

  for (const enemy of enemies) {
    if (enemy.state === 'die') {
      continue;
    }

    const stats = statsFor(enemy.kind);
    const verticalOverlap =
      player.position.y < enemy.position.y + stats.height &&
      player.position.y + PLAYER_HEIGHT > enemy.position.y;
    if (!verticalOverlap) {
      continue;
    }

    const playerCenter = x + PLAYER_WIDTH / 2;
    const enemyCenter = enemy.position.x + stats.width / 2;
    const halfSum = (PLAYER_WIDTH + stats.width) / 2;

    if (Math.abs(playerCenter - enemyCenter) < halfSum) {
      x =
        playerCenter < enemyCenter
          ? enemy.position.x - PLAYER_WIDTH
          : enemy.position.x + stats.width;
    }
  }

  return x === player.position.x
    ? player
    : { ...player, position: { x, y: player.position.y } };
}
