import { EventEmitter } from 'eventemitter3';
import type { DeathReason, Player } from '../game/types';

/**
 * Events crossing the logic <-> render boundary.
 *
 * Gameplay events (`leverPulled`, ...) are added here as the corresponding
 * systems land. Keeping the map typed means adding an event is a
 * compile-time decision rather than a stringly-typed surprise.
 */
export type GameEvents = {
  /** Emitted once, after the render scene has finished creating. */
  sceneReady: () => void;
  /** Emitted every fixed simulation step with the latest player state. */
  playerMoved: (player: Player) => void;
  /** Emitted once per run, on the step the player dies. */
  playerDied: (reason: DeathReason) => void;
};

export class GameEventBus extends EventEmitter<GameEvents> {}
