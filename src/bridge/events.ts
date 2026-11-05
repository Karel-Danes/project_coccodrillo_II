import { EventEmitter } from 'eventemitter3';
import type {
  DeathReason,
  EnemyKind,
  PickupKind,
  Player,
  ProjectileKind,
  SkillKind,
} from '../game/types';

/**
 * Events crossing the logic <-> render boundary.
 *
 * Gameplay events are added here as their systems land. Keeping the map
 * typed means adding an event is a compile-time decision rather than a
 * stringly-typed surprise.
 */
export type GameEvents = {
  /** Emitted once, after the render scene has finished creating. */
  sceneReady: () => void;
  /** Emitted every fixed simulation step with the latest player state. */
  playerMoved: (player: Player) => void;
  /** Emitted once per run, on the step the player dies. */
  playerDied: (reason: DeathReason) => void;
  /** A combat hit cost the player health but was not fatal. */
  playerHurt: (hp: number) => void;
  /** The player's melee swing connected with an enemy. */
  enemyHit: (kind: EnemyKind) => void;
  /** An enemy's HP reached zero. */
  enemyDied: (kind: EnemyKind) => void;
  /** A guard absorbed an enemy swing or spell. */
  attackBlocked: () => void;
  /** A coin, heart, well, or sky sigil was consumed. */
  pickupCollected: (
    kind: PickupKind,
    hp: number,
    coins: number,
    skill?: SkillKind,
  ) => void;
  /** The world's boss has seen the player; run the intro cutscene. */
  bossIntro: (kind: EnemyKind) => void;
  /** The boss fired a projectile. */
  bossShot: () => void;
  /** A ranged nightmare creature fired a bolt. */
  enemyShot: () => void;
  /** The world's boss has been defeated. */
  bossDefeated: (kind: EnemyKind) => void;
  /** A ranged hero launched lightning or an axe. */
  playerRanged: (kind: ProjectileKind) => void;
  /** A Mage's ward bounced an enemy spell back. */
  spellBounced: () => void;
  /** The Orc's berserk mode started. */
  berserkStarted: () => void;
  /** The player used a teleport door. */
  teleported: (by: 'player' | 'enemy') => void;
};

export class GameEventBus extends EventEmitter<GameEvents> {}
