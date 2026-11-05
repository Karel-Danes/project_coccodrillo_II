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

  it('vaults the Orc out of spikes for two lives instead of killing him', () => {
    const level = parseLevel(
      [
        '.'.repeat(20),
        '.'.repeat(20),
        '####.###############',
        '####^###############',
      ],
      { tileSize: 64, spawn: { x: 276, y: 0 } },
    );
    const simulation = new Simulation(level, { character: 'orcBrute' });

    let rescued = false;
    for (
      let i = 0;
      i < 180 && simulation.state.status === 'playing' && !rescued;
      i += 1
    ) {
      const events = simulation.step();
      if (events.some((event) => event.type === 'spikeRescue')) {
        rescued = true;
      }
    }

    expect(rescued).toBe(true);
    expect(simulation.state.status).toBe('playing');
    expect(simulation.state.player.hp).toBe(4);
    expect(simulation.state.player.state).toBe('jump');
    expect(simulation.state.player.velocity.y).toBeLessThan(0);
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

    simulation.state.player.guardUnlocked = true;
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

  it('only ends the run after every boss is dead', () => {
    const level = parseLevel(
      [
        '.'.repeat(30),
        '.'.repeat(30),
        '.'.repeat(30),
        '.'.repeat(30),
        '#'.repeat(30),
      ],
      {
        tileSize: 64,
        spawn: { x: 100, y: 168 },
        enemies: [
          {
            kind: 'golem',
            x: 900,
            y: 120,
            patrolMinX: 880,
            patrolMaxX: 1000,
            boss: true,
          },
          {
            kind: 'darkKnight',
            x: 1100,
            y: 120,
            patrolMinX: 1080,
            patrolMaxX: 1200,
            boss: true,
          },
        ],
      },
    );
    const simulation = new Simulation(level);
    simulation.step();

    simulation.state.enemies[0]!.state = 'die';
    simulation.state.enemies[0]!.hp = 0;
    const firstEvents = simulation.step();
    expect(simulation.state.mode).toBe('play');
    expect(
      firstEvents.some((event) => event.type === 'bossDefeated'),
    ).toBe(false);

    simulation.state.enemies[1]!.state = 'die';
    simulation.state.enemies[1]!.hp = 0;
    const finalEvents = simulation.step();
    expect(simulation.state.mode).toBe('victory');
    expect(
      finalEvents.some((event) => event.type === 'bossDefeated'),
    ).toBe(true);
  });

  it('carries progress into the next random level', () => {
    const simulation = new Simulation(flatLevel());
    simulation.applyProgress({
      hp: 4,
      maxHp: 6,
      bonusMelee: 4,
      bonusRanged: 2,
      jumpBonus: 90,
      guardUnlocked: true,
      berserkPermanent: true,
      coins: 7,
    });

    const state = simulation.state;
    expect(state.coins).toBe(7);
    expect(state.player.hp).toBe(4);
    expect(state.player.maxHp).toBe(5);
    expect(state.player.bonusMelee).toBe(4);
    expect(state.player.bonusRanged).toBe(2);
    expect(state.player.jumpBonus).toBe(90);
    expect(state.player.guardUnlocked).toBe(true);
    expect(state.player.berserkPermanent).toBe(true);
  });

  it('clamps carried progress to the next character hard cap', () => {
    const simulation = new Simulation(flatLevel(), {
      character: 'mage',
    });
    simulation.applyProgress({
      hp: 7,
      maxHp: 7,
      bonusMelee: 0,
      bonusRanged: 4,
      jumpBonus: 90,
      guardUnlocked: true,
      berserkPermanent: false,
      coins: 2,
    });

    expect(simulation.state.player.maxHp).toBe(3);
    expect(simulation.state.player.hp).toBe(3);
  });
});
