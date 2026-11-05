import { describe, expect, it } from 'vitest';
import { parseLevel } from './level';
import { blocksDamage } from './player';
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
    simulation.state.player.hp = simulation.state.player.maxHp;

    simulation.step();
    expect(simulation.state.player.hp).toBe(4);
    expect(simulation.state.pickups[0]?.collected).toBe(false);

    simulation.state.player.hp = 3;
    simulation.setInput(IDLE);
    simulation.step();

    expect(simulation.state.player.hp).toBe(4);
    expect(simulation.state.pickups[0]?.collected).toBe(true);
  });

  it('a well refills all hearts', () => {
    const simulation = new Simulation(
      levelWith([{ kind: 'well', x: 200, y: 40 }]),
    );
    simulation.state.player.hp = 1;

    const events = simulation.step();

    expect(simulation.state.player.hp).toBe(4);
    expect(simulation.state.pickups[0]?.collected).toBe(true);
    expect(
      events.some(
        (event) => event.type === 'pickupCollected' && event.kind === 'well',
      ),
    ).toBe(true);
  });

  it('unlocks guard when the artefact is collected', () => {
    const simulation = new Simulation(
      levelWith([{ kind: 'artifact', x: 200, y: 40 }]),
    );

    simulation.step();
    expect(simulation.state.player.guardUnlocked).toBe(true);
    expect(simulation.state.pickups[0]?.collected).toBe(true);

    simulation.setInput({ ...IDLE, guardHeld: true });
    simulation.step();

    expect(simulation.state.player.state).toBe('guard');
    expect(blocksDamage(simulation.state.player)).toBe(true);
  });
});
