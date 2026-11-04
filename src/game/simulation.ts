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
import { pickupBounds } from './pickup';
import {
  createGolemProjectile,
  projectileBounds,
  stepProjectile,
} from './projectile';
import {
  applyPlayerDamage,
  blocksDamage,
  createPlayer,
  getAttackHitbox,
  hasFallenOutOfWorld,
  healPlayer,
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
  Pickup,
  PickupKind,
  Player,
  Projectile,
} from './types';

export type GameEvent =
  | { type: 'playerMoved'; player: Player }
  | { type: 'playerDied'; reason: DeathReason }
  | { type: 'playerHurt'; hp: number }
  | { type: 'enemyHit'; kind: EnemyKind }
  | { type: 'enemyDied'; kind: EnemyKind }
  | { type: 'attackBlocked' }
  | {
      type: 'pickupCollected';
      kind: PickupKind;
      hp: number;
      coins: number;
    }
  | { type: 'bossIntro'; kind: 'golem' }
  | { type: 'bossShot' }
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
  private pickups: Pickup[];
  private projectiles: Projectile[] = [];
  private coins = 0;
  private status: GameStatus = 'playing';
  private mode: GameMode = 'play';
  private deathReason: DeathReason | null = null;
  private bossIntroShown = false;
  private bossShotCooldown = 1.5;

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
    this.pickups = level.pickups.map((spawn) => ({
      kind: spawn.kind,
      position: { x: spawn.x, y: spawn.y },
      collected: false,
    }));
  }

  get state(): GameState {
    return {
      player: this.player,
      status: this.status,
      mode: this.mode,
      deathReason: this.deathReason,
      enemies: this.enemies,
      pickups: this.pickups,
      projectiles: this.projectiles,
      coins: this.coins,
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
    const playerBox = {
      x: player.position.x,
      y: player.position.y,
      width: PLAYER_WIDTH,
      height: PLAYER_HEIGHT,
    };

    // Hearts and coins are only consumed when they can do something.
    for (const pickup of this.pickups) {
      if (pickup.collected || !overlaps(playerBox, pickupBounds(pickup))) {
        continue;
      }

      if (pickup.kind === 'coin') {
        pickup.collected = true;
        this.coins += 1;
        events.push({
          type: 'pickupCollected',
          kind: 'coin',
          hp: player.hp,
          coins: this.coins,
        });
        continue;
      }

      if (pickup.kind === 'artifact') {
        pickup.collected = true;
        player = { ...player, guardUnlocked: true };
        events.push({
          type: 'pickupCollected',
          kind: 'artifact',
          hp: player.hp,
          coins: this.coins,
        });
        continue;
      }

      if (player.hp >= player.maxHp) {
        continue;
      }

      pickup.collected = true;
      player = healPlayer(
        player,
        pickup.kind === 'well' ? player.maxHp : 1,
      );
      events.push({
        type: 'pickupCollected',
        kind: pickup.kind,
        hp: player.hp,
        coins: this.coins,
      });
    }

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

    // Zatka's ranged attack, then existing orbs advance and resolve.
    this.bossShotCooldown = Math.max(
      0,
      this.bossShotCooldown - FIXED_DT_SECONDS,
    );
    const golem = this.enemies.find(
      (enemy) => enemy.kind === 'golem' && enemy.state !== 'die',
    );
    if (this.bossIntroShown && golem && player.state !== 'die') {
      const golemStats = statsFor('golem');
      const gx = golem.position.x + golemStats.width / 2;
      const gy = golem.position.y + golemStats.height * 0.55;
      const px = player.position.x + PLAYER_WIDTH / 2;
      const py = player.position.y + PLAYER_HEIGHT * 0.55;

      if (this.bossShotCooldown <= 0 && Math.abs(px - gx) < 1000) {
        this.projectiles.push(
          createGolemProjectile({ x: gx, y: gy }, { x: px, y: py }),
        );
        this.bossShotCooldown = 2.4;
        events.push({ type: 'bossShot' });
      }
    }

    const nextProjectiles: Projectile[] = [];
    for (const projectile of this.projectiles) {
      const moved = stepProjectile(projectile, this.level, FIXED_DT_SECONDS);
      if (!moved) {
        continue;
      }

      if (!overlaps(projectileBounds(moved), playerBox)) {
        nextProjectiles.push(moved);
        continue;
      }

      if (blocksDamage(player)) {
        events.push({ type: 'attackBlocked' });
        continue;
      }

      if (player.invulnerableTime <= 0) {
        const hpBefore = player.hp;
        player = applyPlayerDamage(player, 1, moved.position.x);
        if (player.state === 'die') {
          this.status = 'dead';
          this.deathReason = 'sword';
        } else if (player.hp < hpBefore) {
          events.push({ type: 'playerHurt', hp: player.hp });
        }
      }
    }
    this.projectiles = nextProjectiles;

    // Enemy attacks: guard negates them, i-frames absorb them, otherwise
    // they cost health. Only zero health is fatal.
    if (player.state !== 'die') {
      let blocked = false;

      for (const enemy of this.enemies) {
        const hitbox = getEnemyAttackHitbox(enemy);
        if (hitbox !== null && overlaps(hitbox, playerBox)) {
          if (blocksDamage(player)) {
            blocked = true;
            if (!this.blockedThisAttack) {
              events.push({ type: 'attackBlocked' });
            }
          } else if (player.invulnerableTime <= 0) {
            const stats = statsFor(enemy.kind);
            const hpBefore = player.hp;
            player = applyPlayerDamage(
              player,
              stats.damage,
              enemy.position.x + stats.width / 2,
            );

            if (player.state === 'die') {
              this.status = 'dead';
              this.deathReason = 'sword';
            } else if (player.hp < hpBefore) {
              events.push({ type: 'playerHurt', hp: player.hp });
            }
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
