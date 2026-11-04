import {
  createEnemy,
  damageEnemy,
  enemyBounds,
  getEnemyAttackHitbox,
  keepPlayerOutOfEnemies,
  stepEnemy,
} from './enemy';
import { FIXED_DT_SECONDS } from './loop';
import { overlaps } from './physics';
import {
  blocksDamage,
  createPlayer,
  getAttackHitbox,
  hasFallenOutOfWorld,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  stepPlayer,
  touchesSpikes,
} from './player';
import type {
  DeathReason,
  Enemy,
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

function killPlayer(player: Player): Player {
  return {
    ...player,
    state: 'die',
    velocity: { x: 0, y: 0 },
  };
}

/**
 * Owns the mutable game state and advances it one fixed step at a time.
 * Pure TypeScript: the render scene feeds input and reads `state`.
 */
export class Simulation {
  private player: Player;
  private enemies: Enemy[];
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
  /** A single swing may only land once. */
  private attackHitApplied = false;

  constructor(readonly level: Level) {
    this.player = createPlayer(level.spawn);
    this.enemies = level.enemies.map(createEnemy);
  }

  get state(): GameState {
    return {
      player: this.player,
      status: this.status,
      deathReason: this.deathReason,
      enemies: this.enemies,
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

    // A new swing can land again; a continuing swing cannot.
    if (this.player.state !== 'attack') {
      this.attackHitApplied = false;
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

    // A standing skeleton is a solid obstacle for the player's body.
    player = keepPlayerOutOfEnemies(player, this.enemies);

    let reason: DeathReason | null = null;
    if (touchesSpikes(this.level, player)) {
      reason = 'spikes';
    } else if (hasFallenOutOfWorld(this.level, player)) {
      reason = 'fall';
    }

    if (reason !== null) {
      player = killPlayer(player);
      this.player = player;
      this.status = 'dead';
      this.deathReason = reason;
      return [
        { type: 'playerMoved', player },
        { type: 'playerDied', reason },
      ];
    }

    // Sword hits resolve before the skeletons can act.
    if (player.state === 'attack' && !this.attackHitApplied) {
      const hitbox = getAttackHitbox(player);
      if (hitbox !== null) {
        this.enemies = this.enemies.map((enemy) => {
          if (
            this.attackHitApplied ||
            enemy.state === 'die' ||
            !overlaps(hitbox, enemyBounds(enemy))
          ) {
            return enemy;
          }
          this.attackHitApplied = true;
          return damageEnemy(enemy, 1);
        });
      }
    }

    this.enemies = this.enemies.map((enemy) =>
      stepEnemy(enemy, {
        level: this.level,
        player,
        dtSeconds: FIXED_DT_SECONDS,
      }),
    );

    // Skeleton attacks: guard negates them, otherwise one hit is fatal.
    if (player.state !== 'die') {
      const playerBox = {
        x: player.position.x,
        y: player.position.y,
        width: PLAYER_WIDTH,
        height: PLAYER_HEIGHT,
      };

      for (const enemy of this.enemies) {
        const hitbox = getEnemyAttackHitbox(enemy);
        if (hitbox !== null && overlaps(hitbox, playerBox)) {
          if (!blocksDamage(player)) {
            player = killPlayer(player);
            this.status = 'dead';
            this.deathReason = 'sword';
          }
          break;
        }
      }
    }

    this.player = player;

    if (this.status === 'dead' && this.deathReason === 'sword') {
      return [
        { type: 'playerMoved', player },
        { type: 'playerDied', reason: 'sword' },
      ];
    }

    return [{ type: 'playerMoved', player }];
  }
}
