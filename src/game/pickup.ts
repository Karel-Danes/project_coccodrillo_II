import type { AABB, Pickup } from './types';

export const PICKUP_SIZE = 40;
export const WELL_SIZE = 80;

export function pickupBounds(pickup: Pickup): AABB {
  const size = pickup.kind === 'well' ? WELL_SIZE : PICKUP_SIZE;
  return {
    x: pickup.position.x - size / 2,
    y: pickup.position.y - size / 2,
    width: size,
    height: size,
  };
}
