import { describe, expect, it } from 'vitest';
import { parseLevel } from './level';
import { Simulation } from './simulation';
import type { EnemySpawn, InputState, Level } from './types';

const NO_INPUT: InputState = {
  left: false,
  right: false,
  jumpHeld: false,
  attackHeld: false,
  guardHeld: false,
};

function arenaLevel(): Level {
  return parseLevel(
    [
      '.'.repeat(20),
      '.'.repeat(20),
      '.'.repeat(20),
      '.'.repeat(20),
      '#'.repeat(20),
    ],
    {
      tileSize: 64,
      spawn: { x: 200, y: 168 },
      enemies: [
        {
          kind: 'golem',
          x: 300,
          y: 120,
          patrolMinX: 280,
          patrolMaxX: 330,
        } satisfies EnemySpawn,
      ],
    },
  );
}

function rangedArenaLevel(): Level {
  return parseLevel(
    [
      '.'.repeat(20),
      '.'.repeat(20),
      '.'.repeat(20),
      '.'.repeat(20),
      '#'.repeat(20),
    ],
    {
      tileSize: 64,
      spawn: { x: 200, y: 168 },
      enemies: [
        {
          kind: 'golem',
          x: 650,
          y: 120,
          patrolMinX: 640,
          patrolMaxX: 700,
        } satisfies EnemySpawn,
      ],
    },
  );
}

describe('golem boss', () => {
  it('freezes the game for the intro, then resumes on request', () => {
    const simulation = new Simulation(arenaLevel());

    const introEvents = simulation.step();

    expect(simulation.state.mode).toBe('cutscene');
    expect(
      introEvents.some((event) => event.type === 'bossIntro'),
    ).toBe(true);
    expect(simulation.state.enemies[0]?.state).toBe('idle');
    expect(simulation.step()).toHaveLength(0);

    simulation.resumeFromCutscene();

    expect(simulation.state.mode).toBe('play');
    simulation.step();
    expect(simulation.state.mode).toBe('play');
  });

  it('ends in victory when the golem dies', () => {
    const simulation = new Simulation(arenaLevel());
    simulation.step();
    simulation.resumeFromCutscene();

    const golem = simulation.state.enemies[0];
    expect(golem).toBeDefined();
    if (!golem) {
      throw new Error('Arena should contain a golem');
    }
    golem.hp = 1;
    simulation.state.player.position.x = 260;

    simulation.setInput({
      left: false,
      right: false,
      jumpHeld: false,
      attackHeld: true,
      guardHeld: false,
    });

    const events = [];
    for (let i = 0; i < 20 && simulation.state.mode === 'play'; i += 1) {
      events.push(...simulation.step());
    }

    expect(simulation.state.mode).toBe('victory');
    expect(simulation.state.enemies[0]?.state).toBe('die');
    expect(
      events.some((event) => event.type === 'bossDefeated'),
    ).toBe(true);
    expect(simulation.step()).toHaveLength(0);
  });

  it('fires a projectile after the intro', () => {
    const simulation = new Simulation(rangedArenaLevel());
    simulation.step();
    simulation.resumeFromCutscene();

    let sawShot = false;
    for (
      let i = 0;
      i < 160 && simulation.state.mode === 'play';
      i += 1
    ) {
      const events = simulation.step();
      if (events.some((event) => event.type === 'bossShot')) {
        sawShot = true;
        break;
      }
    }

    expect(sawShot).toBe(true);
    expect(simulation.state.projectiles.length).toBeGreaterThan(0);
  });

  it('lets Grakka chase the player instead of only throwing axes', () => {
    const level = parseLevel(
      [
        '.'.repeat(20),
        '.'.repeat(20),
        '.'.repeat(20),
        '.'.repeat(20),
        '#'.repeat(20),
      ],
      {
        tileSize: 64,
        spawn: { x: 100, y: 168 },
        enemies: [
          {
            kind: 'orcBrute',
            x: 500,
            y: 118,
            patrolMinX: 80,
            patrolMaxX: 900,
            boss: true,
          },
        ],
      },
    );
    const simulation = new Simulation(level);
    simulation.step();
    simulation.resumeFromCutscene();

    const startX = simulation.state.enemies[0]?.position.x ?? 0;
    for (let i = 0; i < 120; i += 1) {
      simulation.step();
    }

    const boss = simulation.state.enemies[0]!;
    expect(boss.position.x).toBeLessThan(startX - 40);
  });

  it('lets an unlocked guard block golem orbs', () => {
    const simulation = new Simulation(rangedArenaLevel());
    simulation.step();
    simulation.resumeFromCutscene();
    simulation.state.player.guardUnlocked = true;
    simulation.setInput({ ...NO_INPUT, guardHeld: true });

    let sawShot = false;
    let sawBlocked = false;
    for (
      let i = 0;
      i < 200 && simulation.state.mode === 'play';
      i += 1
    ) {
      const events = simulation.step();
      if (events.some((event) => event.type === 'bossShot')) {
        sawShot = true;
      }
      if (events.some((event) => event.type === 'attackBlocked')) {
        sawBlocked = true;
      }
    }

    expect(sawShot).toBe(true);
    expect(sawBlocked).toBe(true);
    expect(simulation.state.player.hp).toBe(4);
    expect(simulation.state.status).toBe('playing');
  });
});
