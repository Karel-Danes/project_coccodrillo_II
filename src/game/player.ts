import { tileAt, tileRange } from './level';
import { moveAndCollide } from './physics';
import type { Facing, InputState, Level, Player, PlayerState, Vec2 } from './types';

/** Placeholder collision box, sized for the ~85x94 px rotoscoped art. */
export const PLAYER_WIDTH = 40;
export const PLAYER_HEIGHT = 88;

export const WALK_SPEED = 220;
export const JUMP_SPEED = 640;
export const GRAVITY = 2000;
export const MAX_FALL_SPEED = 1400;

export type PlayerStepContext = {
  level: Level;
  input: InputState;
  /** True only on the fixed step where jump was newly pressed. */
  jumpPressed: boolean;
  dtSeconds: number;
};

export function createPlayer(spawn: Vec2): Player {
  return {
    state: 'idle',
    position: { x: spawn.x, y: spawn.y },
    velocity: { x: 0, y: 0 },
    facing: 1,
    grounded: false,
  };
}

function horizontalIntent(input: InputState): -1 | 0 | 1 {
  const direction = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  return direction === 0 ? 0 : direction > 0 ? 1 : -1;
}

/**
 * One fixed simulation step of the player state machine.
 *
 * Commitment rules:
 * - Horizontal steering only happens while grounded.
 * - Jumping can only start from the ground.
 * - Jump horizontal momentum is frozen at takeoff; mid-air input is ignored.
 * - Once landed, control resumes immediately.
 */
export function stepPlayer(player: Player, context: PlayerStepContext): Player {
  if (player.state === 'die') {
    return player;
  }

  const { input, level, dtSeconds } = context;

  let facing: Facing = player.facing;
  let velocityX = player.velocity.x;

  if (player.grounded) {
    const direction = horizontalIntent(input);
    if (direction !== 0) {
      facing = direction;
      velocityX = direction * WALK_SPEED;
    } else {
      velocityX = 0;
    }
  }

  let velocityY = player.velocity.y;
  let grounded = player.grounded;

  if (context.jumpPressed && grounded) {
    velocityY = -JUMP_SPEED;
    grounded = false;
    // velocityX is left untouched: a running jump keeps its speed, a
    // standing jump goes straight up.
  }

  velocityY = Math.min(velocityY + GRAVITY * dtSeconds, MAX_FALL_SPEED);

  const kinematics = moveAndCollide(
    {
      position: player.position,
      width: PLAYER_WIDTH,
      height: PLAYER_HEIGHT,
    },
    { x: velocityX, y: velocityY },
    level,
    dtSeconds,
  );

  let state: PlayerState;
  if (!kinematics.grounded) {
    state = kinematics.velocity.y < 0 ? 'jump' : 'fall';
  } else if (horizontalIntent(input) !== 0) {
    state = 'walk';
  } else {
    state = 'idle';
  }

  return {
    state,
    position: kinematics.position,
    velocity: kinematics.velocity,
    facing,
    grounded: kinematics.grounded,
  };
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
