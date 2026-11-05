import { describe, expect, it } from 'vitest';
import { createEnemy } from './enemy';
import {
  DEFAULT_DIFFICULTY,
  prepareCampaignLevel,
} from './difficulty';
import { parseLevel } from './level';
import { LEVEL_01 } from './levels';
import { Simulation } from './simulation';
import type { EnemySpawn, InputState } from './types';

const NO_INPUT: InputState = {
  left: false,
  right: false,
  jumpHeld: false,
  attackHeld: false,
  guardHeld: false,
};

const skeleton: EnemySpawn = {
  kind: 'skeleton',
  x: 200,
  y: 936,
  patrolMinX: 160,
  patrolMaxX: 240,
};

describe('difficulty', () => {
  it('defaults to middle and scales creature life pools', () => {
    expect(DEFAULT_DIFFICULTY).toBe('middle');
    expect(createEnemy(skeleton, 'low').maxHp).toBe(8);
    expect(createEnemy(skeleton, 'middle').maxHp).toBe(12);
    expect(createEnemy(skeleton, 'nightmare').maxHp).toBe(18);
  });

  it('keeps middle campaign spawns unchanged', () => {
    const prepared = prepareCampaignLevel(LEVEL_01, 'middle');
    expect(prepared.enemies).toHaveLength(LEVEL_01.enemies.length);
    expect(prepared.enemies.some((enemy) => enemy.ranged)).toBe(false);
  });

  it('adds reinforcements and ranged variants on nightmare', () => {
    const prepared = prepareCampaignLevel(LEVEL_01, 'nightmare');
    expect(prepared.enemies.length).toBeGreaterThan(
      LEVEL_01.enemies.length,
    );
    expect(prepared.enemies.some((enemy) => enemy.ranged === true)).toBe(
      true,
    );
    expect(prepared.enemies.filter((enemy) => enemy.boss === true)).toHaveLength(1);
  });

  it('lets a ranged nightmare creature fire a hostile bolt', () => {
    const level = parseLevel(
      ['.'.repeat(20), '.'.repeat(20), '#'.repeat(20)],
      {
        tileSize: 64,
        spawn: { x: 128, y: 40 },
        enemies: [
          {
            kind: 'skeleton',
            x: 420,
            y: 40,
            patrolMinX: 380,
            patrolMaxX: 460,
            ranged: true,
          },
        ],
      },
    );
    const simulation = new Simulation(level, {
      difficulty: 'nightmare',
    });
    simulation.setInput(NO_INPUT);

    let sawShot = false;
    for (let i = 0; i < 180; i += 1) {
      const events = simulation.step();
      if (events.some((event) => event.type === 'enemyShot')) {
        sawShot = true;
        break;
      }
    }

    expect(sawShot).toBe(true);
    expect(
      simulation.state.projectiles.some(
        (projectile) =>
          projectile.owner === 'enemy' &&
          projectile.kind === 'enemyBolt' &&
          projectile.damage === 2,
      ),
    ).toBe(true);
  });
});
