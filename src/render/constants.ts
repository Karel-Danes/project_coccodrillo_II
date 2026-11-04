/**
 * Logical resolution and tile metrics for the game world.
 *
 * The canvas renders at this fixed logical size and is scaled to fit the
 * browser window, so world units never depend on the physical screen size.
 */

export const TILE_SIZE = 64;

/** A milestone-1 room is 20 x 12 tiles. */
export const ROOM_COLS = 20;
export const ROOM_ROWS = 12;

export const GAME_WIDTH = ROOM_COLS * TILE_SIZE;
export const GAME_HEIGHT = ROOM_ROWS * TILE_SIZE;
