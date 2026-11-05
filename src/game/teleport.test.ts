import { describe, expect, it } from 'vitest';
import { parseLevel } from './level';
import { Simulation } from './simulation';
import type { InputState, Level } from './types';

const NO_INPUT: InputState = {
  left: false,
  right: false,
  jumpHeld: false,
  attackHeld: false,
  guardHeld: false,
};

function flatLevel(): Level {
  return parseLevel(
    ['.'.repeat(20), '.'.repeat(20), '#'.repeat(20)],
    { tileSize: 64, spawn: { x: 100, y: 40 } },
  );
}

describe('teleport doors', () => {
  it('moves the player to the paired door and locks until they step away', () => {
    const level: Level = {
      ...flatLevel(),
      teleports: [
        { id: 0, targetId: 1, x: 120, y: 128 },
        { id: 1, targetId: 0, x: 500, y: 600 },
      ],
    };
    const simulation = new Simulation(level);
    simulation.step();

    expect(simulation.state.player.position.x).toBeCloseTo(480);
    expect(simulation.state.player.position.y).toBeCloseTo(512);

    // Still standing in the destination portal: no bounce back.
    simulation.step();
    expect(simulation.state.player.position.x).toBeCloseTo(480);
  });

  it('does not let enemies use the doors', () => {
    const level: Level = {
      ...flatLevel(),
      spawn: { x: 900, y: 40 },
      enemies: [
        {
          kind: 'skeleton',
          x: 100,
          y: 40,
          patrolMinX: 90,
          patrolMaxX: 140,
        },
      ],
      teleports: [
        { id: 0, targetId: 1, x: 120, y: 128 },
        { id: 1, targetId: 0, x: 500, y: 600 },
      ],
    };
    const simulation = new Simulation(level);
    simulation.setInput(NO_INPUT);
    simulation.step();

    const enemy = simulation.state.enemies[0]!;
    expect(enemy.position.x).toBeLessThan(200);
    expect(enemy.position.y).toBeLessThan(200);
  });

  it('grants permanent sigil bonuses from the sky room', () => {
    const level: Level = {
      ...flatLevel(),
      pickups: [
        { kind: 'skill', skill: 'melee', x: 120, y: 84 },
      ],
    };
    const simulation = new Simulation(level);
    simulation.step();

    expect(simulation.state.player.bonusMelee).toBe(2);
  });

  it('vitality sigils raise the life cap', () => {
    const level: Level = {
      ...flatLevel(),
      pickups: [
        { kind: 'skill', skill: 'vitality', x: 120, y: 84 },
      ],
    };
    const simulation = new Simulation(level);
    const maxHp = simulation.state.player.maxHp;
    simulation.step();

    expect(simulation.state.player.maxHp).toBe(maxHp + 2);
  });
});
