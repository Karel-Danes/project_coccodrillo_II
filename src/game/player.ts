import { tileAt, tileRange } from './level';
import { moveAndCollide } from './physics';
import type {
  AABB,
  InputState,
  Level,
  Player,
  PlayerState,
  Vec2,
} from './types';

/** Placeholder collision box, sized for the ~85x94 px rotoscoped art. */
export const PLAYER_WIDTH = 40;
export const PLAYER_HEIGHT = 88;

export const WALK_SPEED = 220;
export const JUMP_SPEED = 640;
export const GRAVITY = 2000;
export const MAX_FALL_SPEED = 1400;

/** Committed sword swing timings, in seconds. */
export const ATTACK_STARTUP = 0.12;
export const ATTACK_ACTIVE = 0.12;
export const ATTACK_RECOVERY = 0.18;
export const ATTACK_DURATION =
  ATTACK_STARTUP + ATTACK_ACTIVE + ATTACK_RECOVERY;

export const ATTACK_REACH = 56;
export const ATTACK_HEIGHT = 52;
export const ATTACK_OFFSET_Y = 18;

export type PlayerStepContext = {
  level: Level;
  input: InputState;
  /** True only on the fixed step where jump was newly pressed. */
  jumpPressed: boolean;
  /** True only on the fixed step where attack was newly pressed. */
  attackPressed: boolean;
  dtSeconds: number;
};

export type AttackPhase = 'startup' | 'active' | 'recovery';

export function createPlayer(spawn: Vec2): Player {
  return {
    state: 'idle',
    position: { x: spawn.x, y: spawn.y },
    velocity: { x: 0, y: 0 },
    facing: 1,
    grounded: false,
    stateTime: 0,
  };
}

function horizontalIntent(input: InputState): -1 | 0 | 1 {
  const direction = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  return direction === 0 ? 0 : direction > 0 ? 1 : -1;
}

/** Which state to settle into when standing on the ground. */
function groundStateFor(input: InputState): PlayerState {
  if (input.guardHeld) {
    return 'guard';
  }
  return horizontalIntent(input) !== 0 ? 'walk' : 'idle';
}

function groundVelocityFor(state: PlayerState, input: InputState): number {
  return state === 'walk' ? horizontalIntent(input) * WALK_SPEED : 0;
}

/**
 * One fixed simulation step of the player state machine.
 *
 * Movement commitment:
 * - Horizontal steering only happens while grounded and not in combat.
 * - Jumping can only start from the ground.
 * - Jump horizontal momentum is frozen at takeoff; mid-air input is ignored.
 * - Sword swings and guard are ground-only, and a swing is committed for its
 *   full startup/active/recovery window. No combos.
 */
export function stepPlayer(player: Player, context: PlayerStepContext): Player {
  if (player.state === 'die') {
    return player;
  }

  const { input, level, dtSeconds } = context;
  const direction = horizontalIntent(input);

  let state: PlayerState = player.state;
  let stateTime = 0;
  let facing = player.facing;
  let vx = player.velocity.x;
  let vy = player.velocity.y;

  if (player.state === 'attack') {
    stateTime = player.stateTime + dtSeconds;
    vx = 0;

    if (stateTime >= ATTACK_DURATION) {
      if (direction !== 0) {
        facing = direction;
      }
      state = groundStateFor(input);
      stateTime = 0;
      vx = groundVelocityFor(state, input);
    }
  } else if (player.state === 'guard') {
    if (direction !== 0) {
      facing = direction;
    }
    vx = 0;

    if (context.attackPressed) {
      // Striking out of a guard is allowed; the swing is committed.
      state = 'attack';
      stateTime = 0;
    } else if (!input.guardHeld) {
      state = groundStateFor(input);
      stateTime = 0;
      vx = groundVelocityFor(state, input);
    } else {
      state = 'guard';
      stateTime = player.stateTime + dtSeconds;
    }
  } else if (player.grounded) {
    if (direction !== 0) {
      facing = direction;
    }

    if (context.attackPressed) {
      state = 'attack';
      stateTime = 0;
      vx = 0;
    } else if (input.guardHeld) {
      state = 'guard';
      stateTime = 0;
      vx = 0;
    } else if (context.jumpPressed) {
      state = 'jump';
      stateTime = 0;
      vx = direction * WALK_SPEED;
      vy = -JUMP_SPEED;
    } else {
      state = direction !== 0 ? 'walk' : 'idle';
      stateTime = 0;
      vx = direction * WALK_SPEED;
    }
  } else {
    // Airborne: horizontal velocity stays committed from takeoff.
    state = player.state === 'jump' ? 'jump' : 'fall';
    stateTime = 0;
  }

  vy = Math.min(vy + GRAVITY * dtSeconds, MAX_FALL_SPEED);

  const kinematics = moveAndCollide(
    {
      position: player.position,
      width: PLAYER_WIDTH,
      height: PLAYER_HEIGHT,
    },
    { x: vx, y: vy },
    level,
    dtSeconds,
  );

  let finalState = state;
  let finalTime = stateTime;

  if (!kinematics.grounded) {
    finalState = kinematics.velocity.y < 0 ? 'jump' : 'fall';
    finalTime = 0;
  } else if (state === 'attack' || state === 'guard') {
    finalState = state;
    finalTime = stateTime;
  } else if (state === 'walk' || state === 'idle') {
    finalState = state;
    finalTime = 0;
  } else {
    // Landed from a jump or fall.
    if (direction !== 0) {
      facing = direction;
    }
    finalState = groundStateFor(input);
    finalTime = 0;
  }

  return {
    state: finalState,
    position: kinematics.position,
    velocity: kinematics.velocity,
    facing,
    grounded: kinematics.grounded,
    stateTime: finalTime,
  };
}

/** Timing window of the sword swing, or null when not attacking. */
export function getAttackPhase(player: Player): AttackPhase | null {
  if (player.state !== 'attack') {
    return null;
  }
  if (player.stateTime < ATTACK_STARTUP) {
    return 'startup';
  }
  if (player.stateTime < ATTACK_STARTUP + ATTACK_ACTIVE) {
    return 'active';
  }
  if (player.stateTime < ATTACK_DURATION) {
    return 'recovery';
  }
  return null;
}

/** Sword hitbox, present only during the active window. */
export function getAttackHitbox(player: Player): AABB | null {
  if (getAttackPhase(player) !== 'active') {
    return null;
  }

  return {
    x:
      player.facing === 1
        ? player.position.x + PLAYER_WIDTH
        : player.position.x - ATTACK_REACH,
    y: player.position.y + ATTACK_OFFSET_Y,
    width: ATTACK_REACH,
    height: ATTACK_HEIGHT,
  };
}

/** Guard negates incoming damage; enemies can call this before applying it. */
export function blocksDamage(player: Player): boolean {
  return player.state === 'guard';
}

/** True when any part of the player overlaps a deadly tile. */
export function touchesSpikes(level: Level, player: Player): boolean {
  const box = {
    x: player.position.x,
    y: player.position.y,
    width: PLAYER_WIDTH,
    height: PLAYER_HEIGHT,
  };
  const { left, right, top, bottom } = tileRange(level, box);

  for (let row = top; row <= bottom; row += 1) {
    for (let col = left; col <= right; col += 1) {
      if (tileAt(level, col, row) === 'spike') {
        return true;
      }
    }
  }

  return false;
}

/** True once the player has dropped entirely below the level. */
export function hasFallenOutOfWorld(level: Level, player: Player): boolean {
  return player.position.y > level.rows * level.tileSize;
}
