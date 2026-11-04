import { describe, expect, it } from 'vitest';
import { parseLevel } from './level';
import {
  createPlayer,
  GRAVITY,
  PLAYER_WIDTH,
  stepPlayer,
  WALK_SPEED,
  type PlayerStepContext,
} from './player';
import type { InputState, Level, Player } from './types';

const DT_SECONDS = 1 / 60;

const IDLE: InputState = { left: false, right: false, jumpHeld: false };
const RIGHT: InputState = { left: false, right: true, jumpHeld: false };

function flatLevel(): Level {
  return parseLevel(
    ['.'.repeat(40), '.'.repeat(40), '#'.repeat(40)],
    { tileSize: 64, spawn: { x: 128, y: 40 } },
  );
}

function step(
  player: Player,
  level: Level,
  input: InputState,
  jumpPressed = false,
): Player {
  const context: PlayerStepContext = {
    level,
    input,
    jumpPressed,
    dtSeconds: DT_SECONDS,
  };
  return stepPlayer(player, context);
}

function settle(level: Level): Player {
  let player = createPlayer(level.spawn);
  for (let i = 0; i < 10; i += 1) {
    player = step(player, level, IDLE);
  }
  return player;
}

describe('player state machine', () => {
  it('cannot change direction mid-jump', () => {
    const level = flatLevel();
    const walking = step(settle(level), level, RIGHT);
    expect(walking.state).toBe('walk');
    expect(walking.velocity.x).toBeCloseTo(WALK_SPEED);

    const jumping = step(walking, level, RIGHT, true);
    expect(jumping.state).toBe('jump');
    expect(jumping.velocity.x).toBeCloseTo(WALK_SPEED);

    const takeoffX = jumping.position.x;
    const airborne = step(jumping, level, {
      left: true,
      right: false,
      jumpHeld: false,
    });

    expect(airborne.state).toBe('jump');
    expect(airborne.facing).toBe(1);
    expect(airborne.velocity.x).toBeCloseTo(WALK_SPEED);
    expect(airborne.position.x).toBeGreaterThan(takeoffX);
    expect(airborne.position.x).toBeGreaterThan(takeoffX + 1);
  });

  it('ignores a second jump press while airborne', () => {
    const level = flatLevel();
    const walking = step(settle(level), level, RIGHT);
    const jumping = step(walking, level, RIGHT, true);
    const firstVy = jumping.velocity.y;
    expect(firstVy).toBeLessThan(0);

    const afterPress = step(jumping, level, RIGHT, true);

    expect(afterPress.state).toBe('jump');
    expect(afterPress.velocity.y).toBeGreaterThan(firstVy);
    expect(afterPress.velocity.y).toBeCloseTo(firstVy + GRAVITY * DT_SECONDS);
  });

  it('resumes walking control on landing', () => {
    const level = flatLevel();
    const walking = step(settle(level), level, RIGHT);
    let player = step(walking, level, RIGHT, true);

    for (let i = 0; i < 120 && !player.grounded; i += 1) {
      player = step(player, level, RIGHT);
    }

    expect(player.grounded).toBe(true);
    expect(player.state).toBe('walk');
    expect(player.velocity.x).toBeCloseTo(WALK_SPEED);
  });

  it('switches to falling when walking off a ledge', () => {
    const level = parseLevel(
      ['.'.repeat(20), '.'.repeat(20), '#####'.padEnd(20, '.')],
      { tileSize: 64, spawn: { x: 64, y: 40 } },
    );

    let player = settle(level);
    let sawFall = false;
    for (let i = 0; i < 200; i += 1) {
      player = step(player, level, RIGHT);
      if (player.state === 'fall') {
        sawFall = true;
        break;
      }
    }

    expect(sawFall).toBe(true);
    expect(player.grounded).toBe(false);
  });

  it('jumps straight up from a standstill', () => {
    const level = flatLevel();
    const standing = settle(level);
    expect(standing.state).toBe('idle');

    const jumping = step(standing, level, IDLE, true);

    expect(jumping.state).toBe('jump');
    expect(jumping.velocity.x).toBe(0);
    expect(jumping.velocity.y).toBeLessThan(0);
  });

  it('stops at a wall instead of leaving the level', () => {
    const level = parseLevel(
      ['..........', '.........#', '##########'],
      { tileSize: 64, spawn: { x: 64, y: 40 } },
    );
    let player = settle(level);

    for (let i = 0; i < 300; i += 1) {
      player = step(player, level, RIGHT);
    }

    const wallX = 9 * level.tileSize;
    expect(player.position.x + PLAYER_WIDTH).toBeCloseTo(wallX);
    expect(player.grounded).toBe(true);
  });
});
