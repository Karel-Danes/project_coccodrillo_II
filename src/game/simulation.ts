import {
  DEFAULT_CHARACTER,
  DEFAULT_WORLD_MODE,
  isBossKind,
} from './characters';
import {
  DEFAULT_DIFFICULTY,
  difficultyDefinition,
} from './difficulty';
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
  createBossProjectile,
  createEnemyProjectile,
  createPlayerProjectile,
  projectileBounds,
  reflectProjectile,
  stepProjectile,
} from './projectile';
import {
  applyPlayerDamage,
  blocksDamage,
  canReflectSpells,
  createPlayer,
  getAttackHitbox,
  getMeleeDamage,
  getRangedDamage,
  getWardBounds,
  grantExtraLife,
  hasFallenOutOfWorld,
  healPlayer,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  stepPlayer,
  touchesSpikes,
} from './player';
import type {
  CharacterKind,
  DeathReason,
  Difficulty,
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
  ProjectileKind,
  Vec2,
  WorldMode,
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
  | { type: 'bossIntro'; kind: EnemyKind }
  | { type: 'bossShot' }
  | { type: 'bossDefeated'; kind: EnemyKind }
  | { type: 'playerRanged'; kind: ProjectileKind }
  | { type: 'enemyShot' }
  | { type: 'spellBounced' }
  | { type: 'berserkStarted' };

const NO_EVENTS: readonly GameEvent[] = [];

/** The player gets this close to the boss before the intro fires. */
export const BOSS_TRIGGER_RANGE = 560;

export type SimulationOptions = {
  character?: CharacterKind;
  worldMode?: WorldMode;
  difficulty?: Difficulty;
};

function killPlayer(player: Player): Player {
  return {
    ...player,
    state: 'die',
    velocity: { x: 0, y: 0 },
  };
}

function playerCentre(player: Player): Vec2 {
  return {
    x: player.position.x + PLAYER_WIDTH / 2,
    y: player.position.y + PLAYER_HEIGHT / 2,
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
  private readonly character: CharacterKind;
  private readonly worldMode: WorldMode;
  private readonly difficulty: Difficulty;
  private readonly bossKind: EnemyKind | null;

  private input: InputState = {
    left: false,
    right: false,
    jumpHeld: false,
    attackHeld: false,
    guardHeld: false,
    rangedHeld: false,
  };
  private jumpHeldPrevious = false;
  private attackHeldPrevious = false;
  private rangedHeldPrevious = false;
  private guardHeldPrevious = false;
  /** A single swing may only land once. */
  private attackHitApplied = false;
  /** A sustained guard against one swing should ping once. */
  private blockedThisAttack = false;

  constructor(
    readonly level: Level,
    options: SimulationOptions = {},
  ) {
    this.character = options.character ?? DEFAULT_CHARACTER;
    this.worldMode = options.worldMode ?? DEFAULT_WORLD_MODE;
    this.difficulty = options.difficulty ?? DEFAULT_DIFFICULTY;
    this.player = createPlayer(level.spawn, this.character);
    this.enemies = level.enemies.map((spawn) =>
      createEnemy(spawn, this.difficulty),
    );

    const markedBoss = level.enemies.find((spawn) => spawn.boss === true);
    this.bossKind =
      markedBoss?.kind ??
      (level.enemies.some((spawn) => spawn.kind === 'golem')
        ? 'golem'
        : null);

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
      character: this.character,
      worldMode: this.worldMode,
      difficulty: this.difficulty,
      bossKind: this.bossKind,
    };
  }

  setInput(input: InputState): void {
    this.input = { ...input };
  }

  /** Called by the render layer once the boss speech is finished. */
  resumeFromCutscene(): void {
    if (this.mode === 'cutscene') {
      this.mode = 'play';
    }
  }

  private boss(): Enemy | undefined {
    const marked = this.enemies.find((enemy) => enemy.boss);
    if (marked) {
      return marked;
    }
    return this.bossKind === null
      ? undefined
      : this.enemies.find((enemy) => enemy.kind === this.bossKind);
  }

  private nearestTarget(from: Vec2): Vec2 | undefined {
    let nearest: Enemy | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const enemy of this.enemies) {
      if (enemy.state === 'die') {
        continue;
      }
      const stats = statsFor(enemy.kind);
      const distance = Math.hypot(
        enemy.position.x + stats.width / 2 - from.x,
        enemy.position.y + stats.height / 2 - from.y,
      );
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = enemy;
      }
    }

    if (!nearest) {
      return undefined;
    }
    const stats = statsFor(nearest.kind);
    return {
      x: nearest.position.x + stats.width / 2,
      y: nearest.position.y + stats.height / 2,
    };
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

    // Edge detection keeps a held button from repeatedly firing.
    const jumpPressed = this.input.jumpHeld && !this.jumpHeldPrevious;
    this.jumpHeldPrevious = this.input.jumpHeld;
    const attackPressed = this.input.attackHeld && !this.attackHeldPrevious;
    this.attackHeldPrevious = this.input.attackHeld;
    const rangedHeld = this.input.rangedHeld === true;
    const rangedPressed = rangedHeld && !this.rangedHeldPrevious;
    this.rangedHeldPrevious = rangedHeld;
    const guardPressed = this.input.guardHeld && !this.guardHeldPrevious;
    this.guardHeldPrevious = this.input.guardHeld;

    let player = stepPlayer(this.player, {
      level: this.level,
      input: this.input,
      jumpPressed,
      attackPressed,
      rangedPressed,
      guardPressed,
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
    const tuning = difficultyDefinition(this.difficulty);
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
        if (player.character === 'orcBrute') {
          player = grantExtraLife(player, 3);
        }
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

    // Melee hits resolve before the enemies can act.
    if (player.state === 'attack' && !this.attackHitApplied) {
      const hitbox = getAttackHitbox(player);
      if (hitbox !== null) {
        const damage = getMeleeDamage(player);
        this.enemies = this.enemies.map((enemy) => {
          if (
            this.attackHitApplied ||
            enemy.state === 'die' ||
            !overlaps(hitbox, enemyBounds(enemy))
          ) {
            return enemy;
          }

          this.attackHitApplied = true;
          const damaged = damageEnemy(enemy, damage);
          events.push(
            damaged.state === 'die'
              ? { type: 'enemyDied', kind: enemy.kind }
              : { type: 'enemyHit', kind: enemy.kind },
          );
          return damaged;
        });
      }
    }

    // A ranged hero launches exactly one shot on the step the attack starts.
    if (player.rangedStarted) {
      const centre = playerCentre(player);
      const kind =
        player.character === 'mage' ? 'lightning' : 'axe';
      this.projectiles.push(
        createPlayerProjectile(
          kind,
          {
            x: centre.x + player.facing * 22,
            y: centre.y - 8,
          },
          player.facing,
          getRangedDamage(player),
        ),
      );
      events.push({ type: 'playerRanged', kind });
    }

    if (player.berserkStarted) {
      events.push({ type: 'berserkStarted' });
    }

    this.enemies = this.enemies.map((enemy) =>
      stepEnemy(enemy, {
        level: this.level,
        player,
        dtSeconds: FIXED_DT_SECONDS,
      }),
    );

    // Boss intro: freeze everything and hand control to the cutscene.
    if (!this.bossIntroShown) {
      const boss = this.boss();
      if (boss && boss.state !== 'die' && player.state !== 'die') {
        const bossStats = statsFor(boss.kind);
        const dx =
          player.position.x +
          PLAYER_WIDTH / 2 -
          (boss.position.x + bossStats.width / 2);
        const dy =
          player.position.y +
          PLAYER_HEIGHT / 2 -
          (boss.position.y + bossStats.height / 2);

        if (Math.abs(dx) < BOSS_TRIGGER_RANGE && Math.abs(dy) < 280) {
          this.bossIntroShown = true;
          this.mode = 'cutscene';
          this.enemies = this.enemies.map((enemy) =>
            enemy === boss
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
            { type: 'bossIntro', kind: boss.kind },
            ...events,
          ];
        }
      }
    }

    // Nightmare creatures fire between their melee swings.
    for (const enemy of this.enemies) {
      if (
        !enemy.ranged ||
        enemy.boss ||
        enemy.state === 'die' ||
        enemy.state === 'hurt' ||
        enemy.state === 'attack' ||
        enemy.rangedCooldown > 0
      ) {
        continue;
      }

      const stats = statsFor(enemy.kind);
      const ex = enemy.position.x + stats.width / 2;
      const ey = enemy.position.y + stats.height * 0.5;
      const px = player.position.x + PLAYER_WIDTH / 2;
      const py = player.position.y + PLAYER_HEIGHT * 0.5;

      if (Math.abs(px - ex) < 720 && Math.abs(py - ey) < 230) {
        this.projectiles.push(
          createEnemyProjectile(
            { x: ex, y: ey },
            { x: px, y: py },
            enemy.rangedDamage,
          ),
        );
        enemy.rangedCooldown = tuning.rangedCooldown;
        events.push({ type: 'enemyShot' });
      }
    }

    // Boss ranged attack, then existing projectiles advance and resolve.
    this.bossShotCooldown = Math.max(
      0,
      this.bossShotCooldown - FIXED_DT_SECONDS,
    );
    const boss = this.boss();
    if (
      this.bossIntroShown &&
      boss &&
      boss.state !== 'die' &&
      player.state !== 'die' &&
      this.bossKind !== null &&
      isBossKind(this.bossKind)
    ) {
      const bossStats = statsFor(boss.kind);
      const gx = boss.position.x + bossStats.width / 2;
      const gy = boss.position.y + bossStats.height * 0.55;
      const px = player.position.x + PLAYER_WIDTH / 2;
      const py = player.position.y + PLAYER_HEIGHT * 0.55;

      if (this.bossShotCooldown <= 0 && Math.abs(px - gx) < 1000) {
        const shot = createBossProjectile(
          this.bossKind,
          { x: gx, y: gy },
          { x: px, y: py },
        );
        shot.damage = Math.max(
          1,
          Math.round(shot.damage * tuning.enemyDamageMultiplier),
        );
        this.projectiles.push(shot);
        this.bossShotCooldown = this.bossKind === 'orcBrute' ? 2 : 2.4;
        events.push({ type: 'bossShot' });
      }
    }

    const nextProjectiles: Projectile[] = [];
    for (const projectile of this.projectiles) {
      const moved = stepProjectile(projectile, this.level, FIXED_DT_SECONDS);
      if (!moved) {
        continue;
      }

      if (moved.owner === 'player') {
        const hitIndex = this.enemies.findIndex(
          (enemy) =>
            enemy.state !== 'die' &&
            overlaps(projectileBounds(moved), enemyBounds(enemy)),
        );
        const hit = this.enemies[hitIndex];
        if (!hit) {
          nextProjectiles.push(moved);
          continue;
        }

        const damaged = damageEnemy(hit, moved.damage);
        this.enemies[hitIndex] = damaged;
        events.push(
          damaged.state === 'die'
            ? { type: 'enemyDied', kind: hit.kind }
            : { type: 'enemyHit', kind: hit.kind },
        );
        continue;
      }

      const ward = canReflectSpells(player)
        ? getWardBounds(player)
        : null;
      if (!overlaps(projectileBounds(moved), ward ?? playerBox)) {
        nextProjectiles.push(moved);
        continue;
      }

      if (ward !== null) {
        const from = playerCentre(player);
        const target =
          this.nearestTarget(from) ?? {
            x: from.x - moved.velocity.x,
            y: from.y - moved.velocity.y,
          };
        nextProjectiles.push(
          reflectProjectile(
            moved,
            from,
            target,
            Math.max(3, getRangedDamage(player) * 2),
          ),
        );
        events.push({ type: 'spellBounced' });
        continue;
      }

      if (blocksDamage(player)) {
        events.push({ type: 'attackBlocked' });
        continue;
      }

      if (player.invulnerableTime <= 0) {
        const hpBefore = player.hp;
        player = applyPlayerDamage(player, moved.damage, moved.position.x);
        if (player.state === 'die') {
          this.status = 'dead';
          this.deathReason = 'sword';
        } else if (player.hp < hpBefore) {
          events.push({ type: 'playerHurt', hp: player.hp });
        }
      }
    }
    this.projectiles = nextProjectiles;

    // The world is cleared when its marked boss falls.
    const defeatedBoss = this.enemies.find(
      (enemy) =>
        (enemy.boss || (this.bossKind !== null && enemy.kind === this.bossKind)) &&
        enemy.state === 'die',
    );
    if (defeatedBoss) {
      this.player = player;
      this.mode = 'victory';
      events.push({ type: 'bossDefeated', kind: defeatedBoss.kind });
      return [{ type: 'playerMoved', player }, ...events];
    }

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
            const damage = Math.max(
              1,
              Math.round(
                stats.damage * tuning.enemyDamageMultiplier,
              ),
            );
            const hpBefore = player.hp;
            player = applyPlayerDamage(
              player,
              damage,
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
