import { describe, expect, it } from 'vitest';
import { parseLevel } from './level';
import { PLAYER_HEIGHT, PLAYER_WIDTH } from './player';
import { Simulation } from './simulation';
import type { Level } from './types';

function skyLevel(): Level {
  const base = parseLevel(
    [
      '.'.repeat(30),
      '.'.repeat(30),
      '.'.repeat(30),
      '.'.repeat(30),
      '.'.repeat(30),
    ],
    { tileSize: 64, spawn: { x: 200, y: 0 } },
  );

  return {
    ...base,
    islands: [
      {
        baseX: 150,
        y: 260,
        width: 180,
        travel: 60,
        period: 8,
        phase: 0.25,
      },
    ],
  };
}

describe('floating taxi islands', () => {
  it('catches the player from above and carries them while riding', () => {
    const simulation = new Simulation(skyLevel());

    let landed = false;
    for (let i = 0; i < 180 && !landed; i += 1) {
      simulation.step();
      landed = simulation.state.player.grounded;
    }

    expect(landed).toBe(true);
    const island = simulation.state.islands[0]!;
    const player = simulation.state.player;
    expect(player.position.y + PLAYER_HEIGHT).toBeCloseTo(island.y);

    const startPlayerX = player.position.x;
    const startIslandX = island.x;

    for (let i = 0; i < 12; i += 1) {
      simulation.step();
    }

    const movedIsland = simulation.state.islands[0]!;
    expect(movedIsland.x).not.toBeCloseTo(startIslandX);
    expect(simulation.state.player.position.x - startPlayerX).toBeCloseTo(
      movedIsland.x - startIslandX,
      1,
    );
    expect(simulation.state.player.grounded).toBe(true);
    expect(
      simulation.state.player.position.x + PLAYER_WIDTH,
    ).toBeGreaterThan(movedIsland.x);
  });
});
