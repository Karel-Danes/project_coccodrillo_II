import { describe, expect, it } from 'vitest';
import { parseLevel } from './level';
import { moveAndCollide } from './physics';

const DT_SECONDS = 1 / 60;

describe('moveAndCollide', () => {
  it('stops a body at a wall without pushing through it', () => {
    const level = parseLevel(
      ['....#', '....#', '....#'],
      { tileSize: 64, spawn: { x: 0, y: 0 } },
    );
    const wallX = 4 * level.tileSize;
    let x = 100;

    for (let i = 0; i < 60; i += 1) {
      const result = moveAndCollide(
        { position: { x, y: 0 }, width: 40, height: 40 },
        { x: 500, y: 0 },
        level,
        DT_SECONDS,
      );
      x = result.position.x;
    }

    expect(x + 40).toBeCloseTo(wallX);
  });

  it('keeps committed horizontal momentum when blocked by a ledge', () => {
    const level = parseLevel(
      ['....#', '....#', '....#'],
      { tileSize: 64, spawn: { x: 0, y: 0 } },
    );

    const result = moveAndCollide(
      { position: { x: 216, y: 0 }, width: 40, height: 40 },
      { x: 500, y: 0 },
      level,
      DT_SECONDS,
    );

    expect(result.velocity.x).toBe(500);
    expect(result.position.x).toBe(216);
  });

  it('lands a falling body on the floor and reports grounded', () => {
    const level = parseLevel(
      ['.....', '.....', '#####'],
      { tileSize: 64, spawn: { x: 0, y: 0 } },
    );
    const floorTop = 2 * level.tileSize;
    let position = { x: 64, y: 0 };
    let grounded = false;

    for (let i = 0; i < 120 && !grounded; i += 1) {
      const result = moveAndCollide(
        { position, width: 40, height: 40 },
        { x: 0, y: 900 },
        level,
        DT_SECONDS,
      );
      position = result.position;
      grounded = result.grounded;
      expect(result.velocity.y).toBeGreaterThanOrEqual(0);
    }

    expect(grounded).toBe(true);
    expect(position.y).toBeCloseTo(floorTop - 40);
  });

  it('stops a rising body at a ceiling', () => {
    const level = parseLevel(
      ['#####', '.....', '.....'],
      { tileSize: 64, spawn: { x: 0, y: 0 } },
    );
    let position = { x: 64, y: 100 };
    let vy = -600;

    for (let i = 0; i < 60 && vy !== 0; i += 1) {
      const result = moveAndCollide(
        { position, width: 40, height: 40 },
        { x: 0, y: vy },
        level,
        DT_SECONDS,
      );
      position = result.position;
      vy = result.velocity.y;
    }

    expect(vy).toBe(0);
    expect(position.y).toBeCloseTo(64);
  });
});
