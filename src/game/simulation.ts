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
import { tileAt } from './level';
import { FIXED_DT_SECONDS } from './loop';
import { moveAndCollide, overlaps } from './physics';
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
  JUMP_SPEED,
  MAX_POWER_CHARGE,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  stepPlayer,
  touchesSpikes,
  WALK_SPEED,
} from './player';
import type {
  AABB,
  CharacterKind,
  DamageSource,
  DeathReason,
  Difficulty,
  Enemy,
  EnemyHitAttack,
  EnemyKind,
  FloatingIsland,
  FloatingIslandSpawn,
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
  SkillKind,
  Teleport,
  Vec2,
  WorldMode,
} from './types';

export type GameEvent =
  | { type: 'playerMoved'; player: Player }
  | { type: 'playerDied'; reason: DeathReason }
  | { type: 'playerHurt'; hp: number; damage: number; source: DamageSource }
  | {
      type: 'enemyHit';
      kind: EnemyKind;
      damage: number;
      attack: EnemyHitAttack;
    }
  | {
      type: 'enemyDied';
      kind: EnemyKind;
      damage: number;
      attack: EnemyHitAttack;
    }
  | { type: 'attackBlocked' }
  | {
      type: 'pickupCollected';
      kind: PickupKind;
      hp: number;
      coins: number;
      skill?: SkillKind;
    }
  | { type: 'bossIntro'; kind: EnemyKind }
  | { type: 'bossShot' }
  | { type: 'bossDefeated'; kind: EnemyKind }
  | { type: 'playerRanged'; kind: ProjectileKind }
  | { type: 'playerPowerShot'; damage: number; charge: number }
  | { type: 'enemyShot' }
  | { type: 'spellBounced' }
  | { type: 'berserkStarted' }
  | { type: 'spikeRescue'; damage: number; hp: number }
  | { type: 'teleported'; by: 'player' | 'enemy' };

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

function islandX(island: FloatingIslandSpawn, phase: number): number {
  const wave = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
  return island.baseX + island.travel * wave;
}

function spikeEscapeDirection(
  level: Level,
  player: Player,
): -1 | 1 {
  const col = Math.floor(
    (player.position.x + PLAYER_WIDTH / 2) / level.tileSize,
  );
  const groundRow = level.rows - 2;

  for (let distance = 1; distance <= 8; distance += 1) {
    for (const direction of [-1, 1] as const) {
      const target = col + direction * distance;
      if (
        tileAt(level, target, groundRow) === 'solid' ||
        tileAt(level, target, groundRow + 1) === 'solid'
      ) {
        return direction;
      }
    }
  }

  return player.facing === 1 ? -1 : 1;
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
  private islands: FloatingIsland[];
  private teleports: Teleport[];
  private islandClock = 0;
  private playerIslandId: number | null = null;
  private playerPortalLocked = false;
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
      skill: spawn.skill,
    }));

    this.teleports = (level.teleports ?? []).map((spawn) => ({
      ...spawn,
    }));

    this.islands = (level.islands ?? []).map((spawn, id) => {
      const x = islandX(spawn, spawn.phase);
      return {
        ...spawn,
        id,
        x,
        previousX: x,
        velocityX: 0,
      };
    });
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
      islands: this.islands,
      teleports: this.teleports,
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

  private updateIslands(): void {
    this.islandClock += FIXED_DT_SECONDS;
    for (const island of this.islands) {
      island.previousX = island.x;
      const phase = island.phase + this.islandClock / island.period;
      island.x = islandX(island, phase);
      island.velocityX =
        (island.x - island.previousX) / FIXED_DT_SECONDS;
    }
  }

  /**
   * One-way floating islands: land from above, ride their horizontal drift,
   * and jump up through them from below.
   */
  private resolveIslands(
    player: Player,
    previousPlayer: Player,
  ): Player {
    this.updateIslands();

    let x = player.position.x;
    let y = player.position.y;
    let vy = player.velocity.y;
    let grounded = player.grounded;
    let state = player.state;

    const riding =
      this.playerIslandId === null
        ? undefined
        : this.islands.find(
            (island) => island.id === this.playerIslandId,
          );

    if (riding && vy >= 0) {
      const carry = riding.x - riding.previousX;
      if (carry !== 0) {
        const moved = moveAndCollide(
          {
            position: { x, y },
            width: PLAYER_WIDTH,
            height: PLAYER_HEIGHT,
          },
          { x: carry, y: 0 },
          this.level,
          1,
        );
        x = moved.position.x;
      }
    }

    if (vy < 0) {
      this.playerIslandId = null;
    }

    const feet = y + PLAYER_HEIGHT;
    const previousFeet = previousPlayer.position.y + PLAYER_HEIGHT;

    if (this.playerIslandId !== null) {
      const island = this.islands.find(
        (item) => item.id === this.playerIslandId,
      );
      const over =
        island !== undefined &&
        x + PLAYER_WIDTH > island.x + 2 &&
        x < island.x + island.width - 2;
      const nearTop =
        island !== undefined &&
        feet >= island.y - 6 &&
        feet <= island.y + 14;

      if (island && over && nearTop && vy >= 0) {
        y = island.y - PLAYER_HEIGHT;
        vy = 0;
        grounded = true;
        if (state === 'jump' || state === 'fall') {
          state = Math.abs(player.velocity.x) > 1 ? 'walk' : 'idle';
        }
      } else {
        this.playerIslandId = null;
      }
    }

    if (this.playerIslandId === null && vy >= 0) {
      for (const island of this.islands) {
        const over =
          x + PLAYER_WIDTH > island.x + 2 &&
          x < island.x + island.width - 2;
        if (!over) {
          continue;
        }

        const top = island.y;
        const crossed = previousFeet <= top + 4 && feet >= top;
        const close =
          feet >= top - 4 && feet <= top + 16;
        if (!crossed && !close) {
          continue;
        }

        y = top - PLAYER_HEIGHT;
        vy = 0;
        grounded = true;
        this.playerIslandId = island.id;
        if (state === 'jump' || state === 'fall') {
          state = Math.abs(player.velocity.x) > 1 ? 'walk' : 'idle';
        }
        break;
      }
    }

    return {
      ...player,
      position: { x, y },
      velocity: { x: player.velocity.x, y: vy },
      grounded,
      state,
    };
  }

  private teleportBounds(portal: Teleport): AABB {
    return {
      x: portal.x - 30,
      y: portal.y - 76,
      width: 60,
      height: 76,
    };
  }

  private portalFor(box: AABB): Teleport | undefined {
    return this.teleports.find((portal) =>
      overlaps(box, this.teleportBounds(portal)),
    );
  }

  private resolvePlayerTeleport(player: Player): {
    player: Player;
    used: boolean;
  } {
    const playerBox = {
      x: player.position.x,
      y: player.position.y,
      width: PLAYER_WIDTH,
      height: PLAYER_HEIGHT,
    };
    const here = this.portalFor(playerBox);

    if (this.playerPortalLocked) {
      if (!here) {
        this.playerPortalLocked = false;
      }
      return { player, used: false };
    }

    if (!here) {
      return { player, used: false };
    }

    const destination = this.teleports.find(
      (portal) => portal.id === here.targetId,
    );
    if (!destination) {
      return { player, used: false };
    }

    this.playerPortalLocked = true;
    this.playerIslandId = null;
    return {
      player: {
        ...player,
        position: {
          x: destination.x - PLAYER_WIDTH / 2,
          y: destination.y - PLAYER_HEIGHT,
        },
        velocity: { x: 0, y: 0 },
        grounded: true,
        state: 'idle',
        stateTime: 0,
        powerCharge: 0,
        powerShot: false,
        powerShotCharge: 0,
      },
      used: true,
    };
  }

  private rangedTargetFor(player: Player): Vec2 | undefined {
    if (player.character !== 'mage') {
      return undefined;
    }

    const origin = playerCentre(player);
    let best: Vec2 | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const enemy of this.enemies) {
      if (enemy.state === 'die') {
        continue;
      }
      const stats = statsFor(enemy.kind);
      const x = enemy.position.x + stats.width / 2;
      const y = enemy.position.y + stats.height / 2;
      const dx = (x - origin.x) * player.facing;
      const dy = y - origin.y;
      if (dx < -12 || dx > 620 || Math.abs(dy) > 220) {
        continue;
      }
      const distance = Math.hypot(dx, dy);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { x, y };
      }
    }

    return best;
  }

  private nearestEnemyTarget(from: Vec2): Vec2 | undefined {
    let best: Vec2 | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const enemy of this.enemies) {
      if (enemy.state === 'die') {
        continue;
      }
      const stats = statsFor(enemy.kind);
      const x = enemy.position.x + stats.width / 2;
      const y = enemy.position.y + stats.height / 2;
      const distance = Math.hypot(x - from.x, y - from.y);
      if (distance > 900 || Math.abs(y - from.y) > 420) {
        continue;
      }
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { x, y };
      }
    }

    return best;
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

    const previousPlayer = this.player;
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
    player = this.resolveIslands(player, previousPlayer);
    const teleportResult = this.resolvePlayerTeleport(player);
    player = teleportResult.player;
    const playerTeleported = teleportResult.used;

    let reason: DeathReason | null = null;
    let spikeRescue: { damage: number; hp: number } | null = null;
    if (touchesSpikes(this.level, player)) {
      if (player.character === 'orcBrute' && player.spikeGrace <= 0) {
        const direction = spikeEscapeDirection(this.level, player);
        const damage = Math.min(2, Math.max(0, player.hp - 1));
        player = {
          ...player,
          hp: player.hp - damage,
          facing: direction,
          state: 'jump',
          stateTime: 0,
          grounded: false,
          velocity: {
            x: direction * WALK_SPEED * 1.35,
            y: -JUMP_SPEED * 1.15,
          },
          invulnerableTime: Math.max(
            player.invulnerableTime,
            0.8,
          ),
          spikeGrace: 1.35,
          powerCharge: 0,
          powerShot: false,
          powerShotCharge: 0,
        };
        spikeRescue = { damage, hp: player.hp };
      } else if (
        player.character !== 'orcBrute' ||
        player.spikeGrace <= 0
      ) {
        reason = 'spikes';
      }
    }

    if (reason === null && hasFallenOutOfWorld(this.level, player)) {
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
    if (spikeRescue) {
      events.push({
        type: 'spikeRescue',
        damage: spikeRescue.damage,
        hp: spikeRescue.hp,
      });
    }
    if (playerTeleported) {
      events.push({ type: 'teleported', by: 'player' });
    }
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
        player = {
          ...player,
          guardUnlocked: true,
          berserkPermanent:
            player.character === 'orcBrute'
              ? true
              : player.berserkPermanent,
        };
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

      if (pickup.kind === 'skill') {
        pickup.collected = true;
        const skill = pickup.skill ?? 'melee';
        if (skill === 'melee') {
          player = { ...player, bonusMelee: player.bonusMelee + 2 };
        } else if (skill === 'ranged') {
          player = { ...player, bonusRanged: player.bonusRanged + 2 };
        } else if (skill === 'jump') {
          player = { ...player, jumpBonus: player.jumpBonus + 90 };
        } else {
          player = grantExtraLife(player, 2);
        }
        events.push({
          type: 'pickupCollected',
          kind: 'skill',
          skill,
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
              ? {
                  type: 'enemyDied',
                  kind: enemy.kind,
                  damage,
                  attack: 'melee',
                }
              : {
                  type: 'enemyHit',
                  kind: enemy.kind,
                  damage,
                  attack: 'melee',
                },
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
      const target = this.rangedTargetFor(player);
      this.projectiles.push(
        createPlayerProjectile(
          kind,
          {
            x: centre.x + player.facing * 22,
            y: centre.y + (kind === 'axe' ? 4 : 0),
          },
          player.facing,
          getRangedDamage(player),
          target,
        ),
      );
      events.push({ type: 'playerRanged', kind });
    }

    if (player.powerShot) {
      const centre = playerCentre(player);
      const ratio = Math.min(
        1,
        player.powerShotCharge / MAX_POWER_CHARGE,
      );
      const target = this.nearestEnemyTarget(centre);
      const damage = Math.max(
        3,
        Math.round(getRangedDamage(player) * (1 + ratio * 4)),
      );
      const shot = createPlayerProjectile(
        'lightning',
        { x: centre.x + player.facing * 18, y: centre.y },
        player.facing,
        damage,
        target,
      );
      shot.kind = 'chargedLightning';
      shot.charge = ratio;
      shot.velocity.x *= 0.85;
      shot.velocity.y *= 0.85;
      this.projectiles.push(shot);
      events.push({
        type: 'playerPowerShot',
        damage,
        charge: ratio,
      });
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
        const attack: EnemyHitAttack =
          moved.kind === 'chargedLightning' ? 'charged' : 'ranged';
        events.push(
          damaged.state === 'die'
            ? {
                type: 'enemyDied',
                kind: hit.kind,
                damage: moved.damage,
                attack,
              }
            : {
                type: 'enemyHit',
                kind: hit.kind,
                damage: moved.damage,
                attack,
              },
        );
        continue;
      }

      const ward = canReflectSpells(player)
        ? getWardBounds(player)
        : null;
      const guardBox = blocksDamage(player)
        ? getWardBounds(player)
        : playerBox;
      if (!overlaps(projectileBounds(moved), ward ?? guardBox)) {
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
          events.push({
            type: 'playerHurt',
            hp: player.hp,
            damage: moved.damage,
            source: moved.kind,
          });
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
      const defensiveBox = blocksDamage(player)
        ? getWardBounds(player)
        : playerBox;

      for (const enemy of this.enemies) {
        const hitbox = getEnemyAttackHitbox(enemy);
        if (hitbox !== null && overlaps(hitbox, defensiveBox)) {
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
              events.push({
                type: 'playerHurt',
                hp: player.hp,
                damage,
                source: enemy.kind,
              });
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
