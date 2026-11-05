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
  | 'golem'
  | 'darkKnight'
  | 'orcBrute';

export type EnemyState = 'idle' | 'walk' | 'attack' | 'hurt' | 'die';

export type GameMode = 'play' | 'cutscene' | 'victory';

export type CharacterKind = 'knight' | 'mage' | 'orcBrute';

export type WorldMode = 'campaign' | 'random';

export type Difficulty = 'low' | 'middle' | 'nightmare';

export type AttackKind = 'melee' | 'ranged';

export type CharacterDefinition = {
  kind: CharacterKind;
  name: string;
  epithet: string;
  maxHp: number;
  /** Damage per melee hit. Zero means the hero cannot melee. */
  meleeDamage: number;
  /** Damage per ranged hit. Zero means the hero cannot shoot. */
  rangedDamage: number;
  /** Only the Orc's rage unlocks his axe throw. */
  rangedRequiresBerserk: boolean;
  meleeName: string | null;
  rangedName: string | null;
  basicAbility: string;
  extraAbility: string;
  extraDetail: string;
  /** Short label for the earned relic button. */
  extraLabel: string;
  accent: number;
};

export type EnemySpawn = {
  kind: EnemyKind;
  /** Enemy top-left at spawn, in world pixels. */
  x: number;
  y: number;
  patrolMinX: number;
  patrolMaxX: number;
  /** Marks the single boss that must fall to clear the world. */
  boss?: boolean;
  /** Nightmare enemies can fire bolts as well as swing. */
  ranged?: boolean;
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
  maxHp: number;
  grounded: boolean;
  patrolMinX: number;
  patrolMaxX: number;
  /** Spawn anchor, used by flying enemies to hover. */
  homeX: number;
  homeY: number;
  /** Seconds until the enemy may swing again. */
  attackCooldown: number;
  /** True for the one boss that ends this world. */
  boss: boolean;
  /** Nightmare archers fire bolts between melee swings. */
  ranged: boolean;
  rangedCooldown: number;
  rangedDamage: number;
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

export type DecorationKind = 'tree' | 'rock';

export type DecorationSpawn = {
  kind: DecorationKind;
  /** Anchor x, and the ground line y. */
  x: number;
  y: number;
  scale: number;
  variant: number;
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
  /** Non-collidable scenery for random worlds. */
  decorations?: readonly DecorationSpawn[];
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
  /** The extra skill is found as an artefact before the boss. */
  guardUnlocked: boolean;
  character: CharacterKind;
  /** Whether the current committed swing is melee or ranged. */
  attackKind: AttackKind;
  /** Seconds until another ranged attack may start. */
  rangedCooldown: number;
  /** True for the one step on which a ranged shot left the hand. */
  rangedStarted: boolean;
  /** Orc berserk remaining time, in seconds. */
  berserkTime: number;
  berserkCooldown: number;
  /** True for the one step on which berserk was activated. */
  berserkStarted: boolean;
};

export type ProjectileKind =
  | 'golemOrb'
  | 'darkOrb'
  | 'enemyBolt'
  | 'lightning'
  | 'axe'
  | 'reflected';

export type ProjectileOwner = 'player' | 'enemy';

export type Projectile = {
  position: Vec2;
  velocity: Vec2;
  /** Seconds before the projectile fizzles out. */
  lifetime: number;
  owner: ProjectileOwner;
  kind: ProjectileKind;
  damage: number;
  /** Downward acceleration, used by thrown axes. */
  gravity: number;
};

export type InputState = {
  left: boolean;
  right: boolean;
  jumpHeld: boolean;
  attackHeld: boolean;
  guardHeld: boolean;
  /** Optional so existing keyboard-only tests stay concise. */
  rangedHeld?: boolean;
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
  character: CharacterKind;
  worldMode: WorldMode;
  difficulty: Difficulty;
  bossKind: EnemyKind | null;
};

/** Everything needed to start a run, passed from the menu to the world. */
export type GameConfig = {
  character: CharacterKind;
  worldMode: WorldMode;
  difficulty: Difficulty;
  seed?: number;
};
