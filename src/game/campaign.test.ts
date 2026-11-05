import { describe, expect, it } from 'vitest';
import { CAMPAIGN_LEVEL } from './campaign';
import { LEVEL_01 } from './levels';
import { tileAt } from './level';

describe('campaign world', () => {
  it('keeps the original route, roster, and pickup design', () => {
    expect(CAMPAIGN_LEVEL.cols).toBe(LEVEL_01.cols);
    expect(CAMPAIGN_LEVEL.rows).toBe(LEVEL_01.rows);
    expect(CAMPAIGN_LEVEL.spawn).toEqual(LEVEL_01.spawn);
    expect(
      CAMPAIGN_LEVEL.enemies.slice(0, LEVEL_01.enemies.length),
    ).toEqual(LEVEL_01.enemies);

    const basePickups = CAMPAIGN_LEVEL.pickups.filter(
      (pickup) => pickup.kind !== 'skill' && pickup.kind !== 'mana',
    );
    expect(basePickups).toEqual(LEVEL_01.pickups);
    expect(
      CAMPAIGN_LEVEL.pickups.filter((pickup) => pickup.kind === 'mana')
        .length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('adds taxi islands, scenery, paired doors, and sky sigils', () => {
    expect((CAMPAIGN_LEVEL.islands ?? []).length).toBeGreaterThanOrEqual(5);
    expect((CAMPAIGN_LEVEL.decorations ?? []).length).toBeGreaterThan(5);

    const teleports = CAMPAIGN_LEVEL.teleports ?? [];
    expect(teleports).toHaveLength(4);
    expect(teleports[0]?.targetId).toBe(teleports[1]?.id);
    expect(teleports[1]?.targetId).toBe(teleports[0]?.id);
    expect(teleports[2]?.targetId).toBe(teleports[3]?.id);
    expect(teleports[3]?.targetId).toBe(teleports[2]?.id);

    const skills = CAMPAIGN_LEVEL.pickups.filter(
      (pickup) => pickup.kind === 'skill',
    );
    expect(skills.length).toBeGreaterThanOrEqual(4);
  });

  it('seals both sky rooms and keeps the ground door on solid floor', () => {
    const teleports = CAMPAIGN_LEVEL.teleports ?? [];
    const groundDoor = teleports.find((portal) => portal.y > 600)!;
    const skyDoors = teleports.filter((portal) => portal.y < 600);

    const groundCol = Math.floor(groundDoor.x / CAMPAIGN_LEVEL.tileSize);
    expect(tileAt(CAMPAIGN_LEVEL, groundCol, 16)).toBe('solid');

    for (const skyDoor of skyDoors) {
      const skyCol = Math.floor(skyDoor.x / CAMPAIGN_LEVEL.tileSize);
      const floorRow = Math.floor(
        skyDoor.y / CAMPAIGN_LEVEL.tileSize,
      );
      expect(tileAt(CAMPAIGN_LEVEL, skyCol, floorRow)).toBe('solid');
      expect(tileAt(CAMPAIGN_LEVEL, skyCol, 1)).toBe('solid');
    }
  });
});
