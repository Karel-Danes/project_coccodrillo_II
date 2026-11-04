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

export type PlayerState =
  | 'idle'
  | 'walk'
  | 'jump'
  | 'fall'
  | 'attack'
  | 'guard'
  | 'hurt'
  | 'die';

export type DeathReason = 'spikes' | 'fall' | 'sword';

export type TileType = 'empty' | 'solid' | 'spike';

export type EnemyKind =
  | 'skeleton'
  | 'goblin'
  | 'slime'
  | 'bat'
  | 'golem';

export type EnemyState = 'idle' | 'walk' | 'attack' | 'hurt' | 'die';

export type GameMode = 'play' | 'cutscene' | 'victory';

export type EnemySpawn = {
  kind: EnemyKind;
  /** Enemy top-left at spawn, in world pixels. */
  x: number;
  y: number;
  patrolMinX: number;
  patrolMaxX: number;
};

export type Enemy = {
  kind: EnemyKind;
  /** Top-left of the collision box. */
  position: Vec2;
  velocity: Vec2;
  facing: Facing;
  state: EnemyState;
  stateTime: number;
  hp: number;
  grounded: boolean;
  patrolMinX: number;
  patrolMaxX: number;
  /** Spawn anchor, used by flying enemies to hover. */
  homeX: number;
  homeY: number;
  /** Seconds until the enemy may swing again. */
  attackCooldown: number;
};

export type PickupKind = 'heart' | 'coin' | 'well' | 'artifact';

export type PickupSpawn = {
  kind: PickupKind;
  /** Centre of the pickup, in world pixels. */
  x: number;
  y: number;
};

export type Pickup = {
  kind: PickupKind;
  /** Centre of the pickup, in world pixels. */
  position: Vec2;
  collected: boolean;
};

export type Level = {
  cols: number;
  rows: number;
  tileSize: number;
  /** Row-major, `cols * rows` entries. */
  tiles: readonly TileType[];
  /** Player top-left position at spawn, in world pixels. */
  spawn: Vec2;
  enemies: readonly EnemySpawn[];
  pickups: readonly PickupSpawn[];
};

export type Player = {
  state: PlayerState;
  /** Top-left of the collision box. */
  position: Vec2;
  velocity: Vec2;
  facing: Facing;
  grounded: boolean;
  /** Seconds spent in the current state; drives the attack timing. */
  stateTime: number;
  hp: number;
  maxHp: number;
  /** Seconds of remaining post-hit invulnerability. */
  invulnerableTime: number;
  /** The guard skill is found as an artefact before the boss. */
  guardUnlocked: boolean;
};

export type Projectile = {
  position: Vec2;
  velocity: Vec2;
  /** Seconds before the orb fizzles out. */
  lifetime: number;
};

export type InputState = {
  left: boolean;
  right: boolean;
  jumpHeld: boolean;
  attackHeld: boolean;
  guardHeld: boolean;
};

export type GameStatus = 'playing' | 'dead';

export type GameState = {
  player: Player;
  status: GameStatus;
  mode: GameMode;
  deathReason: DeathReason | null;
  enemies: readonly Enemy[];
  pickups: readonly Pickup[];
  projectiles: readonly Projectile[];
  coins: number;
};
