import { EventEmitter } from 'eventemitter3';

/**
 * Events crossing the logic <-> render boundary.
 *
 * Gameplay events (`playerMoved`, `playerDied`, ...) are added here as the
 * corresponding game systems land. Keeping the map typed means adding an
 * event is a compile-time decision rather than a stringly-typed surprise.
 */
export type GameEvents = {
  /** Emitted once, after the render scene has finished creating. */
  sceneReady: () => void;
};

export class GameEventBus extends EventEmitter<GameEvents> {}
