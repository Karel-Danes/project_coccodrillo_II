import { describe, expect, it } from 'vitest';
import { parseLevel } from './level';
import { MANA_MAX } from './player';
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

  it('vitality sigils heal but never raise life above the character cap', () => {
    const level: Level = {
      ...flatLevel(),
      pickups: [
        { kind: 'skill', skill: 'vitality', x: 120, y: 84 },
      ],
    };
    const simulation = new Simulation(level, { character: 'mage' });
    const maxHp = simulation.state.player.maxHp;
    simulation.state.player.hp = 1;
    simulation.step();

    expect(maxHp).toBe(3);
    expect(simulation.state.player.maxHp).toBe(3);
    expect(simulation.state.player.hp).toBe(3);
  });

  it('wind sigils grant a higher jump', () => {
    const level: Level = {
      ...flatLevel(),
      pickups: [
        { kind: 'skill', skill: 'jump', x: 120, y: 84 },
      ],
    };
    const simulation = new Simulation(level);
    simulation.step();

    expect(simulation.state.player.jumpBonus).toBe(90);
  });

  it('mana wells restore three mana and are consumed', () => {
    const level: Level = {
      ...flatLevel(),
      pickups: [{ kind: 'mana', x: 120, y: 84 }],
    };
    const simulation = new Simulation(level, { character: 'mage' });
    simulation.state.player.mana = 0;
    simulation.step();

    expect(simulation.state.player.mana).toBeGreaterThanOrEqual(3);
    expect(simulation.state.player.mana).toBeLessThan(3.1);
    expect(simulation.state.pickups[0]?.collected).toBe(true);

    const after = simulation.state.player.mana;
    simulation.step();
    expect(simulation.state.player.mana).toBeGreaterThanOrEqual(after);
    expect(simulation.state.player.mana).toBeLessThan(3.2);
  });

  it('leaves a mana well untouched at full mana', () => {
    const level: Level = {
      ...flatLevel(),
      pickups: [{ kind: 'mana', x: 120, y: 84 }],
    };
    const simulation = new Simulation(level, { character: 'mage' });
    expect(simulation.state.player.mana).toBe(MANA_MAX);
    simulation.step();

    expect(simulation.state.player.mana).toBe(MANA_MAX);
    expect(simulation.state.pickups[0]?.collected).toBe(false);
  });
});
