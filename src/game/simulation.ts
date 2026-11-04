import {
  createEnemy,
  damageEnemy,
  enemyBounds,
  getEnemyAttackHitbox,
  keepPlayerOutOfEnemies,
  statsFor,
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
  EnemyKind,
  GameMode,
  GameState,
  GameStatus,
  InputState,
  Level,
  Player,
} from './types';

export type GameEvent =
  | { type: 'playerMoved'; player: Player }
  | { type: 'playerDied'; reason: DeathReason }
  | { type: 'enemyHit'; kind: EnemyKind }
  | { type: 'enemyDied'; kind: EnemyKind }
  | { type: 'attackBlocked' }
  | { type: 'bossIntro'; kind: 'golem' }
  | { type: 'bossDefeated' };

const NO_EVENTS: readonly GameEvent[] = [];

/** The player gets this close to the golem before the intro fires. */
export const BOSS_TRIGGER_RANGE = 560;

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
  private mode: GameMode = 'play';
  private deathReason: DeathReason | null = null;
  private bossIntroShown = false;

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
  /** A sustained guard against one swing should ping once. */
  private blockedThisAttack = false;

  constructor(readonly level: Level) {
    this.player = createPlayer(level.spawn);
    this.enemies = level.enemies.map(createEnemy);
  }

  get state(): GameState {
    return {
      player: this.player,
      status: this.status,
      mode: this.mode,
      deathReason: this.deathReason,
      enemies: this.enemies,
    };
  }

  setInput(input: InputState): void {
    this.input = { ...input };
  }

  /** Called by the render layer once the golem's speech is finished. */
  resumeFromCutscene(): void {
    if (this.mode === 'cutscene') {
      this.mode = 'play';
    }
  }

  /**
   * Advances one 60 Hz step and returns the domain events it produced.
   * A dead, cinematic, or won simulation is inert until restarted.
   */
  step(): readonly GameEvent[] {
    if (this.status === 'dead' || this.mode !== 'play') {
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

    // A standing enemy is a solid obstacle for the player's body.
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

    const events: GameEvent[] = [];

    // Sword hits resolve before the enemies can act.
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
          const damaged = damageEnemy(enemy, 1);
          events.push(
            damaged.state === 'die'
              ? { type: 'enemyDied', kind: enemy.kind }
              : { type: 'enemyHit', kind: enemy.kind },
          );
          return damaged;
        });
      }
    }

    // The golem's death ends the run in victory.
    const defeatedGolem = this.enemies.find(
      (enemy) => enemy.kind === 'golem' && enemy.state === 'die',
    );
    if (defeatedGolem) {
      this.player = player;
      this.mode = 'victory';
      events.push({ type: 'bossDefeated' });
      return [{ type: 'playerMoved', player }, ...events];
    }

    this.enemies = this.enemies.map((enemy) =>
      stepEnemy(enemy, {
        level: this.level,
        player,
        dtSeconds: FIXED_DT_SECONDS,
      }),
    );

    // Golem intro: freeze everything and hand control to the cutscene.
    if (!this.bossIntroShown) {
      const golem = this.enemies.find(
        (enemy) => enemy.kind === 'golem' && enemy.state !== 'die',
      );
      if (golem && player.state !== 'die') {
        const golemStats = statsFor('golem');
        const dx =
          player.position.x +
          PLAYER_WIDTH / 2 -
          (golem.position.x + golemStats.width / 2);
        const dy =
          player.position.y +
          PLAYER_HEIGHT / 2 -
          (golem.position.y + golemStats.height / 2);

        if (Math.abs(dx) < BOSS_TRIGGER_RANGE && Math.abs(dy) < 280) {
          this.bossIntroShown = true;
          this.mode = 'cutscene';
          this.enemies = this.enemies.map((enemy) =>
            enemy.kind === 'golem'
              ? {
                  ...enemy,
                  state: 'idle' as const,
                  stateTime: 0,
                  velocity: { x: 0, y: 0 },
                  facing:
                    player.position.x < enemy.position.x
                      ? (-1 as const)
                      : (1 as const),
                }
              : enemy,
          );
          this.player = player;
          return [
            { type: 'playerMoved', player },
            { type: 'bossIntro', kind: 'golem' },
            ...events,
          ];
        }
      }
    }

    // Enemy attacks: guard negates them, otherwise one hit is fatal.
    if (player.state !== 'die') {
      const playerBox = {
        x: player.position.x,
        y: player.position.y,
        width: PLAYER_WIDTH,
        height: PLAYER_HEIGHT,
      };
      let blocked = false;

      for (const enemy of this.enemies) {
        const hitbox = getEnemyAttackHitbox(enemy);
        if (hitbox !== null && overlaps(hitbox, playerBox)) {
          if (blocksDamage(player)) {
            blocked = true;
            if (!this.blockedThisAttack) {
              events.push({ type: 'attackBlocked' });
            }
          } else {
            player = killPlayer(player);
            this.status = 'dead';
            this.deathReason = 'sword';
          }
          break;
        }
      }

      this.blockedThisAttack = blocked;
    }

    this.player = player;

    if (this.status === 'dead') {
      events.push({ type: 'playerDied', reason: 'sword' });
    }

    return [{ type: 'playerMoved', player }, ...events];
  }
}
