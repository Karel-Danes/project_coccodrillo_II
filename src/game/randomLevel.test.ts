import { describe, expect, it } from 'vitest';
import { RANDOM_BOSSES } from './characters';
import { statsFor } from './enemy';
import { tileAt } from './level';
import { generateRandomLevel, createSeededRandom } from './randomLevel';
import { PLAYER_HEIGHT } from './player';

describe('random world generator', () => {
  it('is deterministic for a seed', () => {
    const a = generateRandomLevel(12345);
    const b = generateRandomLevel(12345);

    expect(a.tiles).toEqual(b.tiles);
    expect(a.enemies).toEqual(b.enemies);
    expect(a.pickups).toEqual(b.pickups);
  });

  it('creates a valid 96 x 18 route with a solid spawn', () => {
    const level = generateRandomLevel(42);

    expect(level.cols).toBe(96);
    expect(level.rows).toBe(18);
    expect(level.spawn.y).toBeCloseTo(16 * level.tileSize - PLAYER_HEIGHT);

    const spawnCol = Math.floor(level.spawn.x / level.tileSize);
    expect(tileAt(level, spawnCol, 16)).toBe('solid');
    expect(tileAt(level, spawnCol, 15)).toBe('empty');
  });

  it('always ends with exactly one random boss', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const level = generateRandomLevel(seed);
      const bosses = level.enemies.filter((enemy) => enemy.boss === true);
      expect(bosses).toHaveLength(1);
      expect(RANDOM_BOSSES).toContain(bosses[0]?.kind);
      expect(bosses[0]?.kind).toBe(
        level.enemies[level.enemies.length - 1]?.kind,
      );
    }
  });

  it('keeps ground enemies on solid floor and pits narrow enough to jump', () => {
    const level = generateRandomLevel(2026);

    for (const enemy of level.enemies) {
      if (enemy.kind === 'bat') {
        continue;
      }
      const stats = statsFor(enemy.kind);
      const col = Math.floor((enemy.x + stats.width / 2) / level.tileSize);
      expect(tileAt(level, col, 16)).toBe('solid');
      expect(enemy.y).toBeCloseTo(16 * level.tileSize - stats.height);
    }

    let pitRun = 0;
    for (let col = 0; col < level.cols; col += 1) {
      if (tileAt(level, col, 16) === 'empty') {
        pitRun += 1;
        expect(tileAt(level, col, 17)).toBe('spike');
      } else {
        pitRun = 0;
      }
      expect(pitRun).toBeLessThanOrEqual(2);
    }
  });

  it('places one reachable relic before the boss arena', () => {
    const level = generateRandomLevel(7);
    const artifacts = level.pickups.filter(
      (pickup) => pickup.kind === 'artifact',
    );
    expect(artifacts).toHaveLength(1);

    const artifact = artifacts[0]!;
    const col = Math.floor(artifact.x / level.tileSize);
    expect(tileAt(level, col, 15)).toBe('solid');
    expect(tileAt(level, col, 14)).toBe('solid');
    expect(tileAt(level, col, 13)).toBe('solid');
  });

  it('uses the LCG values in [0, 1)', () => {
    const rng = createSeededRandom(99);
    for (let i = 0; i < 50; i += 1) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
