import { describe, expect, it } from 'vitest';
import { parseLevel } from './level';
import { Simulation, type GameEvent } from './simulation';

function spikeLevel() {
  return parseLevel(
    ['..........', '....^.....', '##########'],
    { tileSize: 64, spawn: { x: 64, y: 40 } },
  );
}

describe('Simulation', () => {
  it('kills the player on spike contact and emits playerDied once', () => {
    const simulation = new Simulation(spikeLevel());
    simulation.setInput({ left: false, right: true, jumpHeld: false });

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
    simulation.setInput({ left: false, right: true, jumpHeld: false });
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
    const level = parseLevel(
      ['.'.repeat(20), '.'.repeat(20), '#'.repeat(20)],
      { tileSize: 64, spawn: { x: 128, y: 40 } },
    );
    const simulation = new Simulation(level);
    for (let i = 0; i < 10; i += 1) {
      simulation.step();
    }

    simulation.setInput({ left: false, right: false, jumpHeld: true });
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
    simulation.setInput({ left: false, right: false, jumpHeld: false });
    simulation.step();
    simulation.setInput({ left: false, right: false, jumpHeld: true });
    simulation.step();
    expect(simulation.state.player.state).toBe('jump');
  });
});
