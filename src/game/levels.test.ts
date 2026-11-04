import { describe, expect, it } from 'vitest';
import { LEVEL_01, TILE_SIZE } from './levels';
import { createPlayer, PLAYER_HEIGHT, stepPlayer } from './player';
import { Simulation } from './simulation';
import type { InputState, Level, Player, Vec2 } from './types';

const DT_SECONDS = 1 / 60;
const NO_INPUT: InputState = {
  left: false,
  right: false,
  jumpHeld: false,
  attackHeld: false,
  guardHeld: false,
};
const RUN_JUMP: InputState = { ...NO_INPUT, right: true, jumpHeld: true };

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
    attackPressed: false,
    dtSeconds: DT_SECONDS,
  });
}

function settleOn(level: Level, spawn: Vec2): Player {
  let player = createPlayer(spawn);
  for (let i = 0; i < 10; i += 1) {
    player = step(player, level, NO_INPUT);
  }
  return player;
}

describe('world 01', () => {
  it('is a 96 x 18 tile world with a valid spawn and roster', () => {
    expect(LEVEL_01.cols).toBe(96);
    expect(LEVEL_01.rows).toBe(18);
    expect(LEVEL_01.tileSize).toBe(TILE_SIZE);

    const spawnTile = LEVEL_01.tiles[16 * LEVEL_01.cols + 2] ?? 'empty';
    expect(spawnTile).toBe('solid');

    const pitTile = LEVEL_01.tiles[17 * LEVEL_01.cols + 10] ?? 'empty';
    expect(pitTile).toBe('spike');

    expect(LEVEL_01.enemies.map((enemy) => enemy.kind)).toEqual([
      'skeleton',
      'bat',
      'slime',
      'goblin',
      'golem',
    ]);

    for (const enemy of LEVEL_01.enemies) {
      const groundTile =
        LEVEL_01.tiles[
          16 * LEVEL_01.cols + Math.floor(enemy.x / TILE_SIZE)
        ] ?? 'empty';
      expect(groundTile).toBe('solid');
    }
  });

  it('lets the player mount the first block with a running jump', () => {
    // Stand on the ground touching the left face of the block at columns 5-6.
    const standing = settleOn(LEVEL_01, { x: 280, y: 936 });
    expect(standing.grounded).toBe(true);

    let player = step(standing, LEVEL_01, RUN_JUMP, true);
    for (let i = 0; i < 120 && !player.grounded; i += 1) {
      player = step(player, LEVEL_01, RUN_JUMP);
    }

    expect(player.grounded).toBe(true);
    expect(player.position.y).toBeCloseTo(15 * TILE_SIZE - PLAYER_HEIGHT);
  });

  it('clears the first spike pit with a running jump', () => {
    const level: Level = {
      ...LEVEL_01,
      spawn: { x: 600, y: 936 },
      enemies: [],
    };
    const simulation = new Simulation(level);
    for (let i = 0; i < 10; i += 1) {
      simulation.step();
    }

    simulation.setInput(RUN_JUMP);
    let sawAir = false;
    for (let i = 0; i < 180 && simulation.state.status === 'playing'; i += 1) {
      simulation.step();
      const player = simulation.state.player;
      if (!player.grounded) {
        sawAir = true;
      } else if (sawAir) {
        break;
      }
    }

    expect(sawAir).toBe(true);
    expect(simulation.state.status).toBe('playing');
    expect(simulation.state.deathReason).toBeNull();
    expect(simulation.state.player.grounded).toBe(true);
    expect(simulation.state.player.position.x).toBeGreaterThan(11 * TILE_SIZE);
  });
});
