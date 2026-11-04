import { TILE_SIZE } from '../game/levels';

/** The camera viewport, in tiles and pixels. The world itself is bigger. */
export const VIEWPORT_COLS = 20;
export const VIEWPORT_ROWS = 12;
export const VIEWPORT_WIDTH = VIEWPORT_COLS * TILE_SIZE;
export const VIEWPORT_HEIGHT = VIEWPORT_ROWS * TILE_SIZE;
