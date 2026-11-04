import { describe, expect, it } from 'vitest';
import { parseLevel } from './level';
import { Simulation, type GameEvent } from './simulation';
import type { InputState } from './types';

function input(partial: Partial<InputState> = {}): InputState {
  return {
    left: false,
    right: false,
    jumpHeld: false,
    attackHeld: false,
    guardHeld: false,
    ...partial,
  };
}

function spikeLevel() {
  return parseLevel(
    ['..........', '....^.....', '##########'],
    { tileSize: 64, spawn: { x: 64, y: 40 } },
  );
}

function flatLevel() {
  return parseLevel(
    ['.'.repeat(20), '.'.repeat(20), '#'.repeat(20)],
    { tileSize: 64, spawn: { x: 128, y: 40 } },
  );
}

describe('Simulation', () => {
  it('kills the player on spike contact and emits playerDied once', () => {
    const simulation = new Simulation(spikeLevel());
    simulation.setInput(input({ right: true }));

    const events: GameEvent[] = [];
    for (let i = 0; i < 180 && simulation.state.status === 'playing'; i += 1) {
      events.push(...simulation.step());
    }

    expect(simulation.state.status).toBe('dead');
    expect(simulation.state.deathReason).toBe('spikes');
    expect(simulation.state.player.state).toBe('die');
    expect(simulation.state.player.velocity).toEqual({ x: 0, y: 0 });
    expect(events.filter((event) => event.type === 'playerDied')).toHaveLength(1);
  });

  it('becomes inert after death', () => {
    const simulation = new Simulation(spikeLevel());
    simulation.setInput(input({ right: true }));
    for (let i = 0; i < 180 && simulation.state.status === 'playing'; i += 1) {
      simulation.step();
    }
    const deadState = simulation.state;

    expect(simulation.step()).toHaveLength(0);
    expect(simulation.state).toEqual(deadState);
  });

  it('kills the player after falling out of the world', () => {
    const level = parseLevel(
      ['....', '....', '....', '....'],
      { tileSize: 64, spawn: { x: 0, y: 0 } },
    );
    const simulation = new Simulation(level);

    for (let i = 0; i < 180 && simulation.state.status === 'playing'; i += 1) {
      simulation.step();
    }

    expect(simulation.state.status).toBe('dead');
    expect(simulation.state.deathReason).toBe('fall');
    expect(simulation.state.player.state).toBe('die');
  });

  it('treats a held jump as a single jump', () => {
    const simulation = new Simulation(flatLevel());
    for (let i = 0; i < 10; i += 1) {
      simulation.step();
    }

    simulation.setInput(input({ jumpHeld: true }));
    simulation.step();
    const atTakeoff = simulation.state.player;
    expect(atTakeoff.state).toBe('jump');

    simulation.step();
    const stillHeld = simulation.state.player;
    expect(stillHeld.state).toBe('jump');
    expect(stillHeld.velocity.y).toBeGreaterThan(atTakeoff.velocity.y);

    let landed = false;
    for (let i = 0; i < 180; i += 1) {
      simulation.step();
      if (simulation.state.player.grounded) {
        landed = true;
        break;
      }
    }
    expect(landed).toBe(true);
    expect(simulation.state.player.state).toBe('idle');

    // Still holding jump on the ground must not bounce.
    simulation.step();
    expect(simulation.state.player.state).toBe('idle');

    // Releasing and pressing again does jump.
    simulation.setInput(input());
    simulation.step();
    simulation.setInput(input({ jumpHeld: true }));
    simulation.step();
    expect(simulation.state.player.state).toBe('jump');
  });

  it('turns a held attack into one committed swing', () => {
    const simulation = new Simulation(flatLevel());
    for (let i = 0; i < 10; i += 1) {
      simulation.step();
    }

    simulation.setInput(input({ attackHeld: true }));
    simulation.step();
    expect(simulation.state.player.state).toBe('attack');

    for (let i = 0; i < 60; i += 1) {
      simulation.step();
      if (simulation.state.player.state !== 'attack') {
        break;
      }
    }
    expect(simulation.state.player.state).toBe('idle');

    // Still holding attack on the ground must not chain another swing.
    simulation.step();
    expect(simulation.state.player.state).toBe('idle');

    simulation.setInput(input());
    simulation.step();
    simulation.setInput(input({ attackHeld: true }));
    simulation.step();
    expect(simulation.state.player.state).toBe('attack');
  });

  it('keeps guard active while held and releases it on input up', () => {
    const simulation = new Simulation(flatLevel());
    for (let i = 0; i < 10; i += 1) {
      simulation.step();
    }

    simulation.setInput(input({ guardHeld: true }));
    simulation.step();
    const guarding = simulation.state.player;
    expect(guarding.state).toBe('guard');
    const x = guarding.position.x;

    for (let i = 0; i < 10; i += 1) {
      simulation.step();
    }
    expect(simulation.state.player.state).toBe('guard');
    expect(simulation.state.player.position.x).toBeCloseTo(x);

    simulation.setInput(input());
    simulation.step();
    expect(simulation.state.player.state).toBe('idle');
  });
});
