import { describe, expect, it } from 'vitest';
import { CAMPAIGN_LEVEL } from './campaign';
import { LEVEL_01 } from './levels';
import { tileAt } from './level';

describe('campaign world', () => {
  it('keeps the original route, roster, and pickup design', () => {
    expect(CAMPAIGN_LEVEL.cols).toBe(LEVEL_01.cols);
    expect(CAMPAIGN_LEVEL.rows).toBe(LEVEL_01.rows);
    expect(CAMPAIGN_LEVEL.spawn).toEqual(LEVEL_01.spawn);
    expect(CAMPAIGN_LEVEL.enemies).toEqual(LEVEL_01.enemies);

    const basePickups = CAMPAIGN_LEVEL.pickups.filter(
      (pickup) => pickup.kind !== 'skill',
    );
    expect(basePickups).toEqual(LEVEL_01.pickups);
  });

  it('adds taxi islands, scenery, paired doors, and sky sigils', () => {
    expect((CAMPAIGN_LEVEL.islands ?? []).length).toBeGreaterThanOrEqual(5);
    expect((CAMPAIGN_LEVEL.decorations ?? []).length).toBeGreaterThan(5);

    const teleports = CAMPAIGN_LEVEL.teleports ?? [];
    expect(teleports).toHaveLength(2);
    expect(teleports[0]?.targetId).toBe(teleports[1]?.id);
    expect(teleports[1]?.targetId).toBe(teleports[0]?.id);

    const skills = CAMPAIGN_LEVEL.pickups.filter(
      (pickup) => pickup.kind === 'skill',
    );
    expect(skills).toHaveLength(3);
  });

  it('seals the sky room and keeps the ground door on solid floor', () => {
    const teleports = CAMPAIGN_LEVEL.teleports ?? [];
    const groundDoor = teleports.find((portal) => portal.y > 600)!;
    const skyDoor = teleports.find((portal) => portal.y < 600)!;

    const groundCol = Math.floor(groundDoor.x / CAMPAIGN_LEVEL.tileSize);
    expect(tileAt(CAMPAIGN_LEVEL, groundCol, 16)).toBe('solid');

    const skyCol = Math.floor(skyDoor.x / CAMPAIGN_LEVEL.tileSize);
    expect(tileAt(CAMPAIGN_LEVEL, skyCol, 5)).toBe('solid');
    expect(tileAt(CAMPAIGN_LEVEL, skyCol, 2)).toBe('solid');
  });
});
