import { FIXED_DT_SECONDS } from './loop';
import {
  createPlayer,
  hasFallenOutOfWorld,
  stepPlayer,
  touchesSpikes,
} from './player';
import type {
  DeathReason,
  GameState,
  GameStatus,
  InputState,
  Level,
  Player,
} from './types';

export type GameEvent =
  | { type: 'playerMoved'; player: Player }
  | { type: 'playerDied'; reason: DeathReason };

const NO_EVENTS: readonly GameEvent[] = [];

/**
 * Owns the mutable game state and advances it one fixed step at a time.
 * Pure TypeScript: the render scene feeds input and reads `state`.
 */
export class Simulation {
  private player: Player;
  private status: GameStatus = 'playing';
  private deathReason: DeathReason | null = null;

  private input: InputState = {
    left: false,
    right: false,
    jumpHeld: false,
    attackHeld: false,
    guardHeld: false,
  };
  private jumpHeldPrevious = false;
  private attackHeldPrevious = false;

  constructor(readonly level: Level) {
    this.player = createPlayer(level.spawn);
  }

  get state(): GameState {
    return {
      player: this.player,
      status: this.status,
      deathReason: this.deathReason,
    };
  }

  setInput(input: InputState): void {
    this.input = { ...input };
  }

  /**
   * Advances one 60 Hz step and returns the domain events it produced.
   * A dead simulation is inert until a new instance replaces it.
   */
  step(): readonly GameEvent[] {
    if (this.status === 'dead') {
      return NO_EVENTS;
    }

    // Edge detection keeps a held jump or attack from repeatedly firing.
    const jumpPressed = this.input.jumpHeld && !this.jumpHeldPrevious;
    this.jumpHeldPrevious = this.input.jumpHeld;
    const attackPressed = this.input.attackHeld && !this.attackHeldPrevious;
    this.attackHeldPrevious = this.input.attackHeld;

    let player = stepPlayer(this.player, {
      level: this.level,
      input: this.input,
      jumpPressed,
      attackPressed,
      dtSeconds: FIXED_DT_SECONDS,
    });

    let reason: DeathReason | null = null;
    if (touchesSpikes(this.level, player)) {
      reason = 'spikes';
    } else if (hasFallenOutOfWorld(this.level, player)) {
      reason = 'fall';
    }

    if (reason !== null) {
      player = {
        ...player,
        state: 'die',
        velocity: { x: 0, y: 0 },
      };
      this.status = 'dead';
      this.deathReason = reason;
    }

    this.player = player;

    if (reason !== null) {
      return [
        { type: 'playerMoved', player },
        { type: 'playerDied', reason },
      ];
    }

    return [{ type: 'playerMoved', player }];
  }
}
