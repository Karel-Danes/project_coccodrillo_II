import { describe, expect, it } from 'vitest';
import { parseLevel } from './level';
import { Simulation } from './simulation';
import type { PickupSpawn } from './types';

function levelWith(pickups: PickupSpawn[]) {
  return parseLevel(
    ['.'.repeat(20), '.'.repeat(20), '#'.repeat(20)],
    {
      tileSize: 64,
      spawn: { x: 200, y: 40 },
      pickups,
    },
  );
}

const IDLE = {
  left: false,
  right: false,
  jumpHeld: false,
  attackHeld: false,
  guardHeld: false,
};

describe('pickups', () => {
  it('collects coins and counts them', () => {
    const simulation = new Simulation(
      levelWith([{ kind: 'coin', x: 200, y: 40 }]),
    );

    const events = simulation.step();

    expect(simulation.state.coins).toBe(1);
    expect(simulation.state.pickups[0]?.collected).toBe(true);
    expect(
      events.some(
        (event) => event.type === 'pickupCollected' && event.kind === 'coin',
      ),
    ).toBe(true);
  });

  it('leaves a heart for later at full health, then heals one heart', () => {
    const simulation = new Simulation(
      levelWith([{ kind: 'heart', x: 200, y: 40 }]),
    );

    simulation.step();
    expect(simulation.state.player.hp).toBe(3);
    expect(simulation.state.pickups[0]?.collected).toBe(false);

    simulation.state.player.hp = 2;
    simulation.setInput(IDLE);
    simulation.step();

    expect(simulation.state.player.hp).toBe(3);
    expect(simulation.state.pickups[0]?.collected).toBe(true);
  });

  it('a well refills all hearts', () => {
    const simulation = new Simulation(
      levelWith([{ kind: 'well', x: 200, y: 40 }]),
    );
    simulation.state.player.hp = 1;

    const events = simulation.step();

    expect(simulation.state.player.hp).toBe(3);
    expect(simulation.state.pickups[0]?.collected).toBe(true);
    expect(
      events.some(
        (event) => event.type === 'pickupCollected' && event.kind === 'well',
      ),
    ).toBe(true);
  });
});
