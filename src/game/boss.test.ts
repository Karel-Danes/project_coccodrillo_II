import { describe, expect, it } from 'vitest';
import { parseLevel } from './level';
import { Simulation } from './simulation';
import type { EnemySpawn, Level } from './types';

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
});
