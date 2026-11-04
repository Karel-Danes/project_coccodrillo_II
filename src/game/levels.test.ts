import { describe, expect, it } from 'vitest';
import { LEVEL_01, TILE_SIZE } from './levels';
import { createPlayer, PLAYER_HEIGHT, stepPlayer } from './player';
import { Simulation } from './simulation';
import type { InputState, Level, Player, Vec2 } from './types';

const DT_SECONDS = 1 / 60;
const IDLE: InputState = { left: false, right: false, jumpHeld: false };
const RUN_JUMP: InputState = { left: false, right: true, jumpHeld: true };

function step(
  player: Player,
  level: Level,
  input: InputState,
  jumpPressed = false,
): Player {
  return stepPlayer(player, {
    level,
    input,
    jumpPressed,
    dtSeconds: DT_SECONDS,
  });
}

function settleOn(level: Level, spawn: { x: number; y: number }): Player {
  let player = createPlayer(spawn);
  for (let i = 0; i < 10; i += 1) {
    player = step(player, level, IDLE);
  }
  return player;
}

function hopRight(level: Level, spawn: Vec2): Player {
  let player = settleOn(level, spawn);
  player = step(player, level, RUN_JUMP, true);
  for (let i = 0; i < 120 && !player.grounded; i += 1) {
    player = step(player, level, RUN_JUMP);
  }
  return player;
}

describe('level 01', () => {
  it('is a 20 x 12 room with a valid spawn', () => {
    expect(LEVEL_01.cols).toBe(20);
    expect(LEVEL_01.rows).toBe(12);
    expect(LEVEL_01.tileSize).toBe(TILE_SIZE);

    const spawnTile =
      LEVEL_01.tiles[11 * LEVEL_01.cols + 1] ?? 'empty';
    expect(spawnTile).toBe('solid');
  });

  it('lets the player mount the first platform with a running jump', () => {
    // Stand on the floor touching the left face of the first platform.
    const standing = settleOn(LEVEL_01, { x: 152, y: 616 });
    expect(standing.grounded).toBe(true);

    let player = step(standing, LEVEL_01, RUN_JUMP, true);
    for (let i = 0; i < 120 && !player.grounded; i += 1) {
      player = step(player, LEVEL_01, RUN_JUMP);
    }

    expect(player.grounded).toBe(true);
    expect(player.position.y).toBeCloseTo(10 * TILE_SIZE - PLAYER_HEIGHT);
  });

  it('chains the platform hops up to the high ledge', () => {
    // From the top of the first block onto the second platform.
    const onSecond = hopRight(LEVEL_01, { x: 280, y: 552 });
    expect(onSecond.grounded).toBe(true);
    expect(onSecond.position.y).toBeCloseTo(9 * TILE_SIZE - PLAYER_HEIGHT);

    // From the second platform onto the high ledge.
    const onThird = hopRight(LEVEL_01, { x: 472, y: 488 });
    expect(onThird.grounded).toBe(true);
    expect(onThird.position.y).toBeCloseTo(8 * TILE_SIZE - PLAYER_HEIGHT);
  });

  it('clears the spike pit with a running jump', () => {
    const level: Level = {
      ...LEVEL_01,
      spawn: { x: 832, y: 616 },
    };
    const simulation = new Simulation(level);
    for (let i = 0; i < 10; i += 1) {
      simulation.step();
    }

    simulation.setInput(RUN_JUMP);
    let sawAir = false;
    for (let i = 0; i < 120 && simulation.state.status === 'playing'; i += 1) {
      simulation.step();
      if (!simulation.state.player.grounded) {
        sawAir = true;
      } else if (sawAir) {
        break;
      }
    }

    expect(sawAir).toBe(true);
    expect(simulation.state.status).toBe('playing');
    expect(simulation.state.deathReason).toBeNull();
    expect(simulation.state.player.grounded).toBe(true);
    expect(simulation.state.player.position.x).toBeGreaterThan(896);
  });
});
