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
  /** Life at the start of a run; the rest must be healed. */
  startHp: number;
  /** Damage per melee hit. Zero means the hero cannot melee. */
  meleeDamage: number;
  /** Damage per ranged hit. Zero means the hero cannot shoot. */
  rangedDamage: number;
  /** Only the Orc's rage unlocks his axe throw. */
  rangedRequiresBerserk: boolean;
  /** Melee hitbox dimensions. */
  meleeReach: number;
  meleeHeight: number;
  meleeOffsetY: number;
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

export type PickupKind =
  | 'heart'
  | 'coin'
  | 'well'
  | 'artifact'
  | 'skill'
  | 'mana';

export type SkillKind =
  | 'melee'
  | 'ranged'
  | 'vitality'
  | 'jump';

export type PickupSpawn = {
  kind: PickupKind;
  /** Centre of the pickup, in world pixels. */
  x: number;
  y: number;
  /** Only present for `skill` pickups. */
  skill?: SkillKind;
};

export type Pickup = {
  kind: PickupKind;
  /** Centre of the pickup, in world pixels. */
  position: Vec2;
  collected: boolean;
  skill?: SkillKind;
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

/** A one-way floating island that slides back and forth. */
export type FloatingIslandSpawn = {
  /** Left edge when the phase is zero. */
  baseX: number;
  /** Top surface in world pixels. */
  y: number;
  width: number;
  /** Peak horizontal travel from the base position, in pixels. */
  travel: number;
  /** Seconds for a full back-and-forth cycle. */
  period: number;
  /** 0-1 offset into the cycle. */
  phase: number;
  /** Visual silhouette variant. */
  shape?: number;
};

export type FloatingIsland = FloatingIslandSpawn & {
  id: number;
  x: number;
  previousX: number;
  velocityX: number;
};

export type TeleportSpawn = {
  id: number;
  /** The door this one leads to. */
  targetId: number;
  /** Centre x and floor line y. */
  x: number;
  y: number;
};

export type Teleport = TeleportSpawn;

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
  /** Moving one-way taxi islands. */
  islands?: readonly FloatingIslandSpawn[];
  /** Paired doors between the ground and hidden sky rooms. */
  teleports?: readonly TeleportSpawn[];
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
  /** Permanent sky-room sigil bonuses. */
  bonusMelee: number;
  bonusRanged: number;
  /** Extra upward speed from wind sigils. */
  jumpBonus: number;
  /** Orc berserk remaining time, in seconds. */
  berserkTime: number;
  berserkCooldown: number;
  /** Once the relic is found, the Orc's rage never ends. */
  berserkPermanent: boolean;
  /** True for the one step on which berserk was activated. */
  berserkStarted: boolean;
  /** Mage's charged power orb, in seconds. */
  powerCharge: number;
  /** True for the one step on which the charged orb is released. */
  powerShot: boolean;
  /** Charge held on the release step. */
  powerShotCharge: number;
  /** Orc-only i-frames after being vaulted out of spikes. */
  spikeGrace: number;
  /** Mage mana pool. */
  mana: number;
  /** Remaining seconds of the Mage's decay timer. */
  bounceTime: number;
};

export type ProjectileKind =
  | 'golemOrb'
  | 'darkOrb'
  | 'enemyBolt'
  | 'lightning'
  | 'chargedLightning'
  | 'axe'
  | 'reflected';

export type ProjectileOwner = 'player' | 'enemy';

export type DamageSource = EnemyKind | ProjectileKind;

export type EnemyHitAttack = 'melee' | 'ranged' | 'charged';

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
  /** 0-1 charge for the Mage's power orb. */
  charge?: number;
};

export type InputState = {
  left: boolean;
  right: boolean;
  jumpHeld: boolean;
  attackHeld: boolean;
  guardHeld: boolean;
  /** Optional so existing keyboard-only tests stay concise. */
  rangedHeld?: boolean;
  /** Mage's held power charge. */
  powerHeld?: boolean;
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
  islands: readonly FloatingIsland[];
  teleports: readonly Teleport[];
  coins: number;
  character: CharacterKind;
  worldMode: WorldMode;
  difficulty: Difficulty;
  bossKind: EnemyKind | null;
};

/** Persistent player growth carried between random-world levels. */
export type PlayerProgress = {
  hp: number;
  maxHp: number;
  bonusMelee: number;
  bonusRanged: number;
  jumpBonus: number;
  guardUnlocked: boolean;
  berserkPermanent: boolean;
  coins: number;
};

/** Everything needed to start a run, passed from the menu to the world. */
export type GameConfig = {
  character: CharacterKind;
  worldMode: WorldMode;
  difficulty: Difficulty;
  seed?: number;
  /** Chosen random boss, persisted so retries keep the same world. */
  bossKind?: EnemyKind;
  /** 1-based random-world level. Level N contains N bosses. */
  runLevel?: number;
  /** Abilities and stats kept from the previous level. */
  progress?: PlayerProgress;
  /** Play the menu-to-map fly-in when the scene first opens. */
  flyIn?: boolean;
};
