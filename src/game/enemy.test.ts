import { describe, expect, it } from 'vitest';
import {
  createEnemy,
  damageEnemy,
  getEnemyAttackHitbox,
  getEnemyAttackPhase,
  keepPlayerOutOfEnemies,
  stepEnemy,
} from './enemy';
import { parseLevel } from './level';
import { createPlayer, PLAYER_HEIGHT, PLAYER_WIDTH } from './player';
import { overlaps } from './physics';
import { Simulation } from './simulation';
import type {
  EnemySpawn,
  InputState,
  Level,
  Vec2,
} from './types';

const DT_SECONDS = 1 / 60;
const NO_INPUT: InputState = {
  left: false,
  right: false,
  jumpHeld: false,
  attackHeld: false,
  guardHeld: false,
};

function flatLevel(spawn: Vec2, enemies: EnemySpawn[] = []): Level {
  return parseLevel(
    ['.'.repeat(20), '.'.repeat(20), '#'.repeat(20)],
    { tileSize: 64, spawn, enemies },
  );
}

function skeletonAt(x: number, minX: number, maxX: number): EnemySpawn {
  return { kind: 'skeleton', x, y: 40, patrolMinX: minX, patrolMaxX: maxX };
}

describe('skeleton', () => {
  it('patrols within its bounds and turns around', () => {
    const level = flatLevel({ x: 800, y: 40 }, [skeletonAt(100, 64, 160)]);
    const player = createPlayer({ x: 800, y: 40 });
    let enemy = createEnemy(level.enemies[0]!);
    const facings = new Set<number>();

    for (let i = 0; i < 400; i += 1) {
      enemy = stepEnemy(enemy, { level, player, dtSeconds: DT_SECONDS });
      facings.add(enemy.facing);
      expect(enemy.position.x).toBeGreaterThanOrEqual(63);
      expect(enemy.position.x).toBeLessThanOrEqual(161);
    }

    expect(facings.has(-1)).toBe(true);
    expect(facings.has(1)).toBe(true);
  });

  it('attacks when the player is in range on the same footing', () => {
    const level = flatLevel({ x: 140, y: 40 });
    const player = createPlayer({ x: 140, y: 40 });
    let enemy = createEnemy(skeletonAt(200, 120, 260));

    enemy = stepEnemy(enemy, { level, player, dtSeconds: DT_SECONDS });
    expect(enemy.state).toBe('attack');
    expect(enemy.facing).toBe(-1);

    let sawActive = false;
    for (let i = 0; i < 60 && enemy.state === 'attack'; i += 1) {
      const phase = getEnemyAttackPhase(enemy);
      const hitbox = getEnemyAttackHitbox(enemy);
      if (phase === 'active' && hitbox !== null) {
        sawActive = true;
        expect(hitbox.x).toBeLessThan(enemy.position.x);
        expect(
          overlaps(hitbox, {
            x: player.position.x,
            y: player.position.y,
            width: PLAYER_WIDTH,
            height: PLAYER_HEIGHT,
          }),
        ).toBe(true);
      }
      enemy = stepEnemy(enemy, { level, player, dtSeconds: DT_SECONDS });
    }

    expect(sawActive).toBe(true);
  });

  it('takes three hits to kill and reacts to each non-fatal hit', () => {
    let enemy = createEnemy(skeletonAt(200, 120, 260));

    enemy = damageEnemy(enemy, 1);
    expect(enemy.hp).toBe(2);
    expect(enemy.state).toBe('hurt');

    enemy = damageEnemy(enemy, 1);
    expect(enemy.hp).toBe(1);

    enemy = damageEnemy(enemy, 1);
    expect(enemy.hp).toBe(0);
    expect(enemy.state).toBe('die');

    const dead = damageEnemy(enemy, 1);
    expect(dead).toBe(enemy);
  });

  it('keeps the player from walking through a standing skeleton', () => {
    const enemy = createEnemy(skeletonAt(260, 240, 320));
    const player = createPlayer({ x: 250, y: 40 });

    const resolved = keepPlayerOutOfEnemies(player, [enemy]);
    expect(resolved.position.x).toBeCloseTo(260 - PLAYER_WIDTH);

    const far = { ...player, position: { x: 100, y: 40 } };
    expect(keepPlayerOutOfEnemies(far, [enemy]).position.x).toBe(100);

    const dead = { ...enemy, state: 'die' as const };
    expect(keepPlayerOutOfEnemies(player, [dead]).position.x).toBe(250);
  });

  it('keeps a bat airborne and diving toward the player', () => {
    const level = flatLevel({ x: 400, y: 40 });
    const player = createPlayer({ x: 400, y: 40 });
    let bat = createEnemy({
      kind: 'bat',
      x: 300,
      y: 20,
      patrolMinX: 260,
      patrolMaxX: 340,
    });
    const startX = bat.position.x;
    const startY = bat.position.y;

    for (let i = 0; i < 40; i += 1) {
      bat = stepEnemy(bat, { level, player, dtSeconds: DT_SECONDS });
      expect(bat.grounded).toBe(false);
    }

    expect(bat.position.x).toBeGreaterThan(startX);
    expect(bat.position.y).toBeGreaterThan(startY);
    expect(bat.state).toBe('attack');
    expect(getEnemyAttackPhase(bat)).not.toBeNull();
  });

  it('lets one sword swing damage a nearby skeleton once', () => {
    const level = flatLevel({ x: 200, y: 40 }, [
      skeletonAt(260, 240, 320),
    ]);
    const simulation = new Simulation(level);
    for (let i = 0; i < 2; i += 1) {
      simulation.step();
    }

    simulation.setInput({ ...NO_INPUT, attackHeld: true });
    for (let i = 0; i < 16; i += 1) {
      simulation.step();
    }

    const enemy = simulation.state.enemies[0];
    expect(enemy).toBeDefined();
    expect(enemy!.hp).toBe(2);
    expect(enemy!.state).toBe('hurt');
  });

  it('blocks skeleton hits with guard, then dies once guard is dropped', () => {
    const level = flatLevel({ x: 200, y: 40 }, [
      skeletonAt(300, 220, 340),
    ]);
    const simulation = new Simulation(level);
    simulation.setInput({ ...NO_INPUT, guardHeld: true });

    for (let i = 0; i < 240; i += 1) {
      simulation.step();
    }

    expect(simulation.state.status).toBe('playing');
    expect(simulation.state.player.state).toBe('guard');
    expect(simulation.state.deathReason).toBeNull();

    // With one heart left, dropping guard during the next swing is fatal.
    simulation.state.player.hp = 1;
    simulation.setInput(NO_INPUT);
    for (let i = 0; i < 300 && simulation.state.status === 'playing'; i += 1) {
      simulation.step();
    }

    expect(simulation.state.status).toBe('dead');
    expect(simulation.state.deathReason).toBe('sword');
    expect(simulation.state.player.state).toBe('die');
  });
});
