/** Shared, Phaser-free game types. */

export type Vec2 = { x: number; y: number };

export type AABB = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Every character faces right in the source art; -1 means mirrored. */
export type Facing = -1 | 1;

export type PlayerState = 'idle' | 'walk' | 'jump' | 'fall' | 'die';

export type DeathReason = 'spikes' | 'fall';

export type TileType = 'empty' | 'solid' | 'spike';

export type Level = {
  cols: number;
  rows: number;
  tileSize: number;
  /** Row-major, `cols * rows` entries. */
  tiles: readonly TileType[];
  /** Player top-left position at spawn, in world pixels. */
  spawn: Vec2;
};

export type Player = {
  state: PlayerState;
  /** Top-left of the collision box. */
  position: Vec2;
  velocity: Vec2;
  facing: Facing;
  grounded: boolean;
};

export type InputState = {
  left: boolean;
  right: boolean;
  jumpHeld: boolean;
};

export type GameStatus = 'playing' | 'dead';

export type GameState = {
  player: Player;
  status: GameStatus;
  deathReason: DeathReason | null;
};
