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
  EnemySpawn,
  Facing,
  Level,
  Player,
} from './types';

export const ENEMY_WIDTH = 40;
export const ENEMY_HEIGHT = 88;
export const ENEMY_MAX_HP = 3;

export const ENEMY_WALK_SPEED = 80;
export const ENEMY_AGGRO_RANGE = 260;
export const ENEMY_ATTACK_RANGE = 86;

export const ENEMY_ATTACK_STARTUP = 0.26;
export const ENEMY_ATTACK_ACTIVE = 0.14;
export const ENEMY_ATTACK_RECOVERY = 0.36;
export const ENEMY_ATTACK_DURATION =
  ENEMY_ATTACK_STARTUP + ENEMY_ATTACK_ACTIVE + ENEMY_ATTACK_RECOVERY;
export const ENEMY_ATTACK_COOLDOWN = 0.65;
export const ENEMY_HURT_DURATION = 0.32;

export const ENEMY_ATTACK_REACH = 64;
export const ENEMY_ATTACK_HEIGHT = 52;
export const ENEMY_ATTACK_OFFSET_Y = 18;

export type EnemyStepContext = {
  level: Level;
  player: Player;
  dtSeconds: number;
};

export function createEnemy(spawn: EnemySpawn): Enemy {
  return {
    kind: spawn.kind,
    position: { x: spawn.x, y: spawn.y },
    velocity: { x: 0, y: 0 },
    facing: 1,
    state: 'idle',
    stateTime: 0,
    hp: ENEMY_MAX_HP,
    grounded: false,
    patrolMinX: spawn.patrolMinX,
    patrolMaxX: spawn.patrolMaxX,
    attackCooldown: 0,
  };
}

export function enemyBounds(enemy: Enemy): AABB {
  return {
    x: enemy.position.x,
    y: enemy.position.y,
    width: ENEMY_WIDTH,
    height: ENEMY_HEIGHT,
  };
}

/**
 * Skeleton brain: patrol the assigned stretch of ground, turn toward the
 * player when they share the same footing, advance, and swing with a
 * cooldown. Hits interrupt it; death is final.
 */
export function stepEnemy(enemy: Enemy, context: EnemyStepContext): Enemy {
  const dt = context.dtSeconds;

  if (enemy.state === 'die') {
    return {
      ...enemy,
      stateTime: enemy.stateTime + dt,
      velocity: { x: 0, y: 0 },
    };
  }

  const player = context.player;
  let state = enemy.state;
  let stateTime = enemy.stateTime + dt;
  let facing = enemy.facing;
  let vx = 0;
  let cooldown = Math.max(0, enemy.attackCooldown - dt);

  if (enemy.state === 'hurt') {
    if (stateTime >= ENEMY_HURT_DURATION) {
      state = 'idle';
      stateTime = 0;
    }
  } else if (enemy.state === 'attack') {
    if (stateTime >= ENEMY_ATTACK_DURATION) {
      state = 'idle';
      stateTime = 0;
      cooldown = ENEMY_ATTACK_COOLDOWN;
    }
  } else {
    const dx =
      player.position.x +
      PLAYER_WIDTH / 2 -
      (enemy.position.x + ENEMY_WIDTH / 2);
    const feetDelta = Math.abs(
      player.position.y +
        PLAYER_HEIGHT -
        (enemy.position.y + ENEMY_HEIGHT),
    );
    const playerAlive = player.state !== 'die';
    const sameLevel = feetDelta < 48;
    const engaged =
      playerAlive && sameLevel && Math.abs(dx) < ENEMY_AGGRO_RANGE;

    if (engaged) {
      if (dx !== 0) {
        facing = dx > 0 ? 1 : -1;
      }

      if (Math.abs(dx) <= ENEMY_ATTACK_RANGE && cooldown <= 0) {
        state = 'attack';
        stateTime = 0;
      } else if (Math.abs(dx) > ENEMY_ATTACK_RANGE * 0.9) {
        const direction = dx > 0 ? 1 : -1;
        const nextX = enemy.position.x + direction * ENEMY_WALK_SPEED * dt;
        if (nextX >= enemy.patrolMinX && nextX <= enemy.patrolMaxX) {
          vx = direction * ENEMY_WALK_SPEED;
          state = 'walk';
        } else {
          state = 'idle';
        }
      } else {
        state = 'idle';
      }
    } else {
      // Patrol between the assigned bounds.
      if (enemy.position.x <= enemy.patrolMinX && facing === -1) {
        facing = 1;
      } else if (enemy.position.x >= enemy.patrolMaxX && facing === 1) {
        facing = -1;
      }

      const nextX = enemy.position.x + facing * ENEMY_WALK_SPEED * dt;
      if (nextX < enemy.patrolMinX || nextX > enemy.patrolMaxX) {
        facing = facing === 1 ? -1 : 1;
        state = 'idle';
      } else {
        vx = facing * ENEMY_WALK_SPEED;
        state = 'walk';
      }
    }
  }

  const vy = Math.min(enemy.velocity.y + GRAVITY * dt, MAX_FALL_SPEED);
  const kinematics = moveAndCollide(
    {
      position: enemy.position,
      width: ENEMY_WIDTH,
      height: ENEMY_HEIGHT,
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

export function getEnemyAttackPhase(enemy: Enemy): AttackPhase | null {
  if (enemy.state !== 'attack') {
    return null;
  }
  if (enemy.stateTime < ENEMY_ATTACK_STARTUP) {
    return 'startup';
  }
  if (enemy.stateTime < ENEMY_ATTACK_STARTUP + ENEMY_ATTACK_ACTIVE) {
    return 'active';
  }
  if (enemy.stateTime < ENEMY_ATTACK_DURATION) {
    return 'recovery';
  }
  return null;
}

export function getEnemyAttackHitbox(enemy: Enemy): AABB | null {
  if (getEnemyAttackPhase(enemy) !== 'active') {
    return null;
  }

  return {
    x:
      enemy.facing === 1
        ? enemy.position.x + ENEMY_WIDTH
        : enemy.position.x - ENEMY_ATTACK_REACH,
    y: enemy.position.y + ENEMY_ATTACK_OFFSET_Y,
    width: ENEMY_ATTACK_REACH,
    height: ENEMY_ATTACK_HEIGHT,
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
 * Prevents the player from walking through a standing skeleton. Dead
 * skeletons are ignored and only horizontal separation is applied.
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

    const verticalOverlap =
      player.position.y < enemy.position.y + ENEMY_HEIGHT &&
      player.position.y + PLAYER_HEIGHT > enemy.position.y;
    if (!verticalOverlap) {
      continue;
    }

    const playerCenter = x + PLAYER_WIDTH / 2;
    const enemyCenter = enemy.position.x + ENEMY_WIDTH / 2;
    const halfSum = (PLAYER_WIDTH + ENEMY_WIDTH) / 2;

    if (Math.abs(playerCenter - enemyCenter) < halfSum) {
      x =
        playerCenter < enemyCenter
          ? enemy.position.x - PLAYER_WIDTH
          : enemy.position.x + ENEMY_WIDTH;
    }
  }

  return x === player.position.x
    ? player
    : { ...player, position: { x, y: player.position.y } };
}
