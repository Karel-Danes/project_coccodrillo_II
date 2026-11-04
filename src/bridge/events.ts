import { EventEmitter } from 'eventemitter3';
import type { DeathReason, EnemyKind, PickupKind, Player } from '../game/types';

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
  /** The player's sword connected with an enemy. */
  enemyHit: (kind: EnemyKind) => void;
  /** An enemy's HP reached zero. */
  enemyDied: (kind: EnemyKind) => void;
  /** A guard absorbed an enemy swing. */
  attackBlocked: () => void;
  /** A coin, heart, or well was consumed. */
  pickupCollected: (kind: PickupKind, hp: number, coins: number) => void;
  /** The golem has seen the player; run the intro cutscene. */
  bossIntro: (kind: 'golem') => void;
  /** The golem has been defeated. */
  bossDefeated: () => void;
};

export class GameEventBus extends EventEmitter<GameEvents> {}
