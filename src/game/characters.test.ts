import { describe, expect, it } from 'vitest';
import { CHARACTERS } from './characters';
import { parseLevel } from './level';
import {
  ATTACK_STARTUP,
  createPlayer,
  getAttackHitbox,
  PLAYER_HEIGHT,
} from './player';
import { Simulation } from './simulation';
import type { EnemySpawn, InputState, Level, Projectile } from './types';

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
  it('starts each hero below full health', () => {
    expect(createPlayer({ x: 0, y: 0 }, 'knight')).toMatchObject({
      hp: 3,
      maxHp: 5,
    });
    expect(createPlayer({ x: 0, y: 0 }, 'mage')).toMatchObject({
      hp: 2,
      maxHp: 3,
    });
    expect(createPlayer({ x: 0, y: 0 }, 'orcBrute')).toMatchObject({
      hp: 6,
      maxHp: 7,
    });
  });

  it('publishes the exact menu numbers for every hero', () => {
    expect(CHARACTERS.knight).toMatchObject({
      maxHp: 5,
      startHp: 3,
      meleeDamage: 5,
      rangedDamage: 0,
    });
    expect(CHARACTERS.mage).toMatchObject({
      maxHp: 3,
      startHp: 2,
      meleeDamage: 0,
      rangedDamage: 3,
    });
    expect(CHARACTERS.orcBrute).toMatchObject({
      maxHp: 7,
      startHp: 6,
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

  it('aims the Mage bolt down far enough to hit a slime', () => {
    const level = flatLevel([
      {
        kind: 'slime',
        x: 420,
        y: 40,
        patrolMinX: 400,
        patrolMaxX: 460,
      },
    ]);
    const simulation = new Simulation(level, { character: 'mage' });
    for (let i = 0; i < 12; i += 1) {
      simulation.step();
    }

    simulation.setInput({ ...NO_INPUT, rangedHeld: true });
    for (let i = 0; i < 90; i += 1) {
      simulation.step();
    }

    const slime = simulation.state.enemies[0]!;
    expect(slime.hp).toBeLessThan(slime.maxHp);
  });

  it('gives the Orc a tall vertical slash hitbox', () => {
    const orc = {
      ...createPlayer({ x: 0, y: 0 }, 'orcBrute'),
      state: 'attack' as const,
      attackKind: 'melee' as const,
      stateTime: ATTACK_STARTUP + 0.01,
    };
    const hitbox = getAttackHitbox(orc);
    expect(hitbox).not.toBeNull();
    expect(hitbox!.height).toBeGreaterThanOrEqual(100);
    expect(hitbox!.height).toBeGreaterThan(hitbox!.width);
  });

  it('charges a stronger Mage power orb while POWER is held', () => {
    const simulation = new Simulation(flatLevel(), { character: 'mage' });
    for (let i = 0; i < 10; i += 1) {
      simulation.step();
    }

    simulation.state.player.guardUnlocked = true;
    simulation.setInput({ ...NO_INPUT, powerHeld: true });
    for (let i = 0; i < 60; i += 1) {
      simulation.step();
    }
    expect(simulation.state.player.powerCharge).toBeGreaterThan(0.5);

    simulation.setInput(NO_INPUT);
    simulation.step();

    const shot = simulation.state.projectiles.find(
      (projectile) => projectile.kind === 'chargedLightning',
    );
    expect(shot).toBeDefined();
    expect(shot?.damage).toBeGreaterThan(3);
    expect(shot?.charge).toBeGreaterThan(0.5);
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

    expect(simulation.state.player.maxHp).toBe(7);
    expect(simulation.state.player.hp).toBe(7);
    expect(simulation.state.player.guardUnlocked).toBe(true);
    expect(simulation.state.player.berserkPermanent).toBe(true);

    simulation.setInput({ ...NO_INPUT, rangedHeld: true });
    simulation.step();
    expect(
      simulation.state.projectiles.some(
        (projectile) => projectile.kind === 'axe',
      ),
    ).toBe(true);
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

  it('blocks close combat during the three-second Mage bubble', () => {
    const level = flatLevel([
      {
        kind: 'skeleton',
        x: 260,
        y: 40,
        patrolMinX: 100,
        patrolMaxX: 320,
      },
    ]);
    const simulation = new Simulation(level, { character: 'mage' });
    simulation.state.player.guardUnlocked = true;
    simulation.setInput({ ...NO_INPUT, guardHeld: true });

    let blocked = false;
    let sawBubble = false;
    for (let i = 0; i < 150; i += 1) {
      const events = simulation.step();
      if (simulation.state.player.bounceTime > 0) {
        sawBubble = true;
      }
      if (events.some((event) => event.type === 'attackBlocked')) {
        blocked = true;
      }
    }

    expect(sawBubble).toBe(true);
    expect(blocked).toBe(true);
    expect(simulation.state.player.mana).toBeLessThan(1);
    expect(simulation.state.player.hp).toBe(2);
    expect(simulation.state.status).toBe('playing');
  });

  it('blocks an axe that only clips the edge of the Mage bubble', () => {
    const simulation = new Simulation(flatLevel(), { character: 'mage' });
    simulation.state.player.guardUnlocked = true;
    simulation.setInput({ ...NO_INPUT, guardHeld: true });
    simulation.step();
    simulation.step();

    const player = simulation.state.player;
    const axe: Projectile = {
      position: { x: player.position.x - 80, y: 10 },
      velocity: { x: 420, y: 0 },
      lifetime: 3,
      owner: 'enemy',
      kind: 'axe',
      damage: 2,
      gravity: 0,
    };
    (simulation.state.projectiles as Projectile[]).push(axe);

    let bounced = false;
    for (let i = 0; i < 20; i += 1) {
      const events = simulation.step();
      if (events.some((event) => event.type === 'spellBounced')) {
        bounced = true;
      }
    }

    expect(bounced).toBe(true);
    expect(simulation.state.player.hp).toBe(2);
  });

  it('lets the Mage bounce a boss spell without taking damage', () => {
    const simulation = new Simulation(flatLevel(), { character: 'mage' });
    simulation.state.player.guardUnlocked = true;
    simulation.setInput({ ...NO_INPUT, guardHeld: true });
    simulation.step();

    const player = simulation.state.player;
    expect(player.bounceTime).toBeGreaterThan(0);
    const orb: Projectile = {
      position: {
        x: player.position.x + 180,
        y: player.position.y + 20,
      },
      velocity: { x: -420, y: 0 },
      lifetime: 3,
      owner: 'enemy',
      kind: 'golemOrb',
      damage: 2,
      gravity: 0,
    };
    (simulation.state.projectiles as Projectile[]).push(orb);

    let bounced = false;
    let sawReflected = false;
    for (let i = 0; i < 30; i += 1) {
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
    expect(simulation.state.player.hp).toBe(2);
    expect(simulation.state.status).toBe('playing');
  });
});
