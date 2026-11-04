import { describe, expect, it } from 'vitest';
import { parseLevel, overlapsTile, tileAt } from './level';
import type { Level } from './types';

const OPTIONS = { tileSize: 64, spawn: { x: 0, y: 0 } };

describe('parseLevel', () => {
  it('turns ASCII rows into row-major tiles', () => {
    const level = parseLevel(['.#', '^.'], OPTIONS);

    expect(level.cols).toBe(2);
    expect(level.rows).toBe(2);
    expect(level.tiles).toEqual(['empty', 'solid', 'spike', 'empty']);
  });

  it('rejects ragged rows', () => {
    expect(() => parseLevel(['..', '.'], OPTIONS)).toThrow(/expected 2/);
  });

  it('rejects unknown tile characters', () => {
    expect(() => parseLevel(['.?'], OPTIONS)).toThrow(/Unknown tile/);
  });

  it('rejects empty levels', () => {
    expect(() => parseLevel([], OPTIONS)).toThrow(/at least one row/);
    expect(() => parseLevel([''], OPTIONS)).toThrow(/at least one column/);
  });
});

describe('tile queries', () => {
  const level: Level = parseLevel(
    ['..^', '.##', '###'],
    { tileSize: 64, spawn: { x: 0, y: 0 } },
  );

  it('reads out-of-bounds as empty', () => {
    expect(tileAt(level, -1, 0)).toBe('empty');
    expect(tileAt(level, 3, 0)).toBe('empty');
    expect(tileAt(level, 0, -1)).toBe('empty');
    expect(tileAt(level, 0, 3)).toBe('empty');
  });

  it('reports overlap with a tile type', () => {
    expect(overlapsTile(level, { x: 128, y: 0, width: 10, height: 10 }, 'spike')).toBe(true);
    expect(overlapsTile(level, { x: 0, y: 64, width: 10, height: 10 }, 'spike')).toBe(false);
  });
});
