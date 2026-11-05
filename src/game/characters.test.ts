import { describe, expect, it } from 'vitest';
import { CHARACTERS } from './characters';
import { parseLevel } from './level';
import { createPlayer, PLAYER_HEIGHT } from './player';
import { Simulation } from './simulation';
import type { EnemySpawn, InputState, Level } from './types';

const NO_INPUT: InputState = {
  left: false,
  right: false,
  jumpHeld: false,
  attackHeld: false,
  guardHeld: false,
};

function flatLevel(
  enemies: EnemySpawn[] = [],
  spawn = { x: 128, y: 40 },
): Level {
  return parseLevel(
    ['.'.repeat(20), '.'.repeat(20), '#'.repeat(20)],
    { tileSize: 64, spawn, enemies },
  );
}

describe('character rulebook', () => {
  it('starts each hero with the menu heart count', () => {
    expect(createPlayer({ x: 0, y: 0 }, 'knight').maxHp).toBe(3);
    expect(createPlayer({ x: 0, y: 0 }, 'mage').maxHp).toBe(2);
    expect(createPlayer({ x: 0, y: 0 }, 'orcBrute').maxHp).toBe(6);
  });

  it('publishes the exact menu numbers for every hero', () => {
    expect(CHARACTERS.knight).toMatchObject({
      maxHp: 3,
      meleeDamage: 5,
      rangedDamage: 0,
    });
    expect(CHARACTERS.mage).toMatchObject({
      maxHp: 2,
      meleeDamage: 0,
      rangedDamage: 3,
    });
    expect(CHARACTERS.orcBrute).toMatchObject({
      maxHp: 6,
      meleeDamage: 8,
      rangedDamage: 5,
    });
  });

  it('launches a Mage lightning bolt with three damage', () => {
    const simulation = new Simulation(flatLevel(), { character: 'mage' });
    for (let i = 0; i < 10; i += 1) {
      simulation.step();
    }

    simulation.setInput({ ...NO_INPUT, rangedHeld: true });
    simulation.step();

    const projectile = simulation.state.projectiles[0];
    expect(projectile).toBeDefined();
    expect(projectile?.kind).toBe('lightning');
    expect(projectile?.owner).toBe('player');
    expect(projectile?.damage).toBe(3);
  });

  it('does not let the Orc throw axes outside berserk', () => {
    const simulation = new Simulation(flatLevel(), {
      character: 'orcBrute',
    });
    for (let i = 0; i < 10; i += 1) {
      simulation.step();
    }

    simulation.setInput({ ...NO_INPUT, rangedHeld: true });
    simulation.step();

    expect(simulation.state.projectiles).toHaveLength(0);
  });

  it('launches an Orc axe with five damage only while berserk', () => {
    const simulation = new Simulation(flatLevel(), {
      character: 'orcBrute',
    });
    for (let i = 0; i < 10; i += 1) {
      simulation.step();
    }

    simulation.state.player.berserkTime = 5;
    simulation.setInput({ ...NO_INPUT, rangedHeld: true });
    simulation.step();

    const projectile = simulation.state.projectiles[0];
    expect(projectile).toBeDefined();
    expect(projectile?.kind).toBe('axe');
    expect(projectile?.damage).toBe(5);
  });

  it('gives the Orc three extra hearts when the relic is collected', () => {
    const level = parseLevel(
      ['.'.repeat(20), '.'.repeat(20), '#'.repeat(20)],
      {
        tileSize: 64,
        spawn: { x: 128, y: 40 },
        pickups: [{ kind: 'artifact', x: 148, y: 40 + PLAYER_HEIGHT / 2 }],
      },
    );
    const simulation = new Simulation(level, { character: 'orcBrute' });
    simulation.step();

    expect(simulation.state.player.maxHp).toBe(9);
    expect(simulation.state.player.hp).toBe(9);
    expect(simulation.state.player.guardUnlocked).toBe(true);
  });

  it('ends in victory when a marked random boss falls', () => {
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
        spawn: { x: 200, y: 168 },
        enemies: [
          {
            kind: 'darkKnight',
            x: 300,
            y: 120,
            patrolMinX: 280,
            patrolMaxX: 330,
            boss: true,
          },
        ],
      },
    );
    const simulation = new Simulation(level);
    simulation.step();
    simulation.resumeFromCutscene();

    const boss = simulation.state.enemies[0]!;
    boss.hp = 1;
    simulation.state.player.position.x = 260;
    simulation.setInput({ ...NO_INPUT, attackHeld: true });

    let defeatedKind: string | null = null;
    for (let i = 0; i < 30 && simulation.state.mode === 'play'; i += 1) {
      for (const event of simulation.step()) {
        if (event.type === 'bossDefeated') {
          defeatedKind = event.kind;
        }
      }
    }

    expect(simulation.state.mode).toBe('victory');
    expect(defeatedKind).toBe('darkKnight');
  });

  it('lets the Mage bounce a boss spell without taking damage', () => {
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
        spawn: { x: 200, y: 168 },
        enemies: [
          {
            kind: 'golem',
            x: 650,
            y: 120,
            patrolMinX: 640,
            patrolMaxX: 700,
          },
        ],
      },
    );
    const simulation = new Simulation(level, { character: 'mage' });
    simulation.step();
    simulation.resumeFromCutscene();
    simulation.state.player.guardUnlocked = true;
    simulation.setInput({ ...NO_INPUT, guardHeld: true });

    let bounced = false;
    let sawReflected = false;
    for (let i = 0; i < 240 && simulation.state.mode === 'play'; i += 1) {
      const events = simulation.step();
      if (events.some((event) => event.type === 'spellBounced')) {
        bounced = true;
      }
      if (
        simulation.state.projectiles.some(
          (projectile) =>
            projectile.owner === 'player' &&
            projectile.kind === 'reflected',
        )
      ) {
        sawReflected = true;
      }
    }

    expect(bounced).toBe(true);
    expect(sawReflected).toBe(true);
    const boss = simulation.state.enemies[0]!;
    expect(boss.hp).toBeLessThan(boss.maxHp);
    expect(simulation.state.player.hp).toBe(2);
    expect(simulation.state.status).toBe('playing');
  });
});
