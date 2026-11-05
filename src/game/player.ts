import { characterDefinition } from './characters';
import { tileAt, tileRange } from './level';
import { moveAndCollide } from './physics';
import type {
  AABB,
  CharacterKind,
  InputState,
  Level,
  Player,
  PlayerState,
  Vec2,
} from './types';

/** Placeholder collision box, sized for the ~85x94 px rotoscoped art. */
export const PLAYER_WIDTH = 40;
export const PLAYER_HEIGHT = 88;

export const WALK_SPEED = 220;
export const JUMP_SPEED = 640;
export const GRAVITY = 2000;
export const MAX_FALL_SPEED = 1400;

/** The Knight's three hearts, kept as the default for existing callers. */
/** The Knight's maximum life, kept as the default for existing callers. */
export const PLAYER_MAX_HP = 5;
/** Physical HUD capacity; hearts above the character cap stay hidden. */
export const MAX_HUD_HEARTS = 16;
export const PLAYER_HURT_DURATION = 0.35;
export const PLAYER_INVULNERABILITY = 1.1;
const HURT_KNOCKBACK_X = 200;
const HURT_KNOCKBACK_Y = -230;

/** Committed attack timings, in seconds. */
export const ATTACK_STARTUP = 0.12;
export const ATTACK_ACTIVE = 0.12;
export const ATTACK_RECOVERY = 0.18;
export const ATTACK_DURATION =
  ATTACK_STARTUP + ATTACK_ACTIVE + ATTACK_RECOVERY;

export const ATTACK_REACH = 56;
export const ATTACK_HEIGHT = 52;
export const ATTACK_OFFSET_Y = 18;

export const RANGED_COOLDOWN = 0.46;
export const BERSERK_DURATION = 6;
export const BERSERK_COOLDOWN = 10;
export const BERSERK_SPEED_MULTIPLIER = 1.25;
export const MAX_POWER_CHARGE = 2;
export const MIN_POWER_CHARGE = 0.12;
export const POWER_MOVE_MULTIPLIER = 0.55;

/** Mage resources. */
export const MANA_MAX = 5;
export const MANA_REGEN_SECONDS = 4;
export const MANA_WELL_RESTORE = 3;
export const BOUNCE_MANA_COST = 5;
export const BOUNCE_DURATION = 3;
export const POWER_MANA_COST = 2;

export type PlayerStepContext = {
  level: Level;
  input: InputState;
  /** True only on the fixed step where jump was newly pressed. */
  jumpPressed: boolean;
  /** True only on the fixed step where attack was newly pressed. */
  attackPressed: boolean;
  /** True only on the fixed step where the ranged button was pressed. */
  rangedPressed?: boolean;
  /** True only on the fixed step where the relic/extra button was pressed. */
  guardPressed?: boolean;
  dtSeconds: number;
};

export type AttackPhase = 'startup' | 'active' | 'recovery';

export function createPlayer(
  spawn: Vec2,
  character: CharacterKind = 'knight',
): Player {
  const definition = characterDefinition(character);

  return {
    state: 'idle',
    position: { x: spawn.x, y: spawn.y },
    velocity: { x: 0, y: 0 },
    facing: 1,
    grounded: false,
    stateTime: 0,
    hp: definition.startHp,
    maxHp: definition.maxHp,
    invulnerableTime: 0,
    guardUnlocked: false,
    character,
    attackKind: 'melee',
    rangedCooldown: 0,
    rangedStarted: false,
    bonusMelee: 0,
    bonusRanged: 0,
    jumpBonus: 0,
    berserkTime: 0,
    berserkCooldown: 0,
    berserkPermanent: false,
    berserkStarted: false,
    powerCharge: 0,
    powerShot: false,
    powerShotCharge: 0,
    spikeGrace: 0,
    mana: MANA_MAX,
    bounceTime: 0,
  };
}

/**
 * Applies combat damage. A non-fatal hit staggers the hero away from the
 * source and grants i-frames; a fatal hit enters the death state.
 */
export function applyPlayerDamage(
  player: Player,
  amount: number,
  sourceX: number,
): Player {
  if (player.state === 'die' || player.invulnerableTime > 0) {
    return player;
  }

  const hp = Math.max(0, player.hp - amount);
  if (hp === 0) {
    return {
      ...player,
      hp,
      state: 'die',
      velocity: { x: 0, y: 0 },
      invulnerableTime: PLAYER_INVULNERABILITY,
      powerCharge: 0,
      powerShot: false,
      powerShotCharge: 0,
      bounceTime: 0,
    };
  }

  const away = player.position.x + PLAYER_WIDTH / 2 < sourceX ? -1 : 1;

  return {
    ...player,
    hp,
    state: 'hurt',
    stateTime: 0,
    facing: away === -1 ? 1 : -1,
    velocity: {
      x: away * HURT_KNOCKBACK_X,
      y: HURT_KNOCKBACK_Y,
    },
    grounded: false,
    invulnerableTime: PLAYER_INVULNERABILITY,
    powerCharge: 0,
    powerShot: false,
    powerShotCharge: 0,
  };
}

/** Restores health up to the maximum. */
export function healPlayer(player: Player, amount: number): Player {
  if (player.state === 'die') {
    return player;
  }
  return {
    ...player,
    hp: Math.min(player.maxHp, player.hp + amount),
  };
}

/**
 * Restores life without ever exceeding the character's hard maximum.
 * The Orc relic and vitality sigils both heal through this helper.
 */
export function grantExtraLife(player: Player, amount = 3): Player {
  const maxHp = Math.min(
    characterDefinition(player.character).maxHp,
    player.maxHp + amount,
  );
  return {
    ...player,
    maxHp,
    hp: Math.min(maxHp, player.hp + amount),
  };
}

export function isBerserk(player: Player): boolean {
  return (
    player.character === 'orcBrute' &&
    (player.berserkPermanent || player.berserkTime > 0)
  );
}

export function getMeleeDamage(player: Player): number {
  return (
    characterDefinition(player.character).meleeDamage +
    player.bonusMelee
  );
}

export function getRangedDamage(player: Player): number {
  return (
    characterDefinition(player.character).rangedDamage +
    player.bonusRanged
  );
}

function horizontalIntent(input: InputState): -1 | 0 | 1 {
  const direction = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  return direction === 0 ? 0 : direction > 0 ? 1 : -1;
}

function canGuard(player: Player): boolean {
  return (
    player.guardUnlocked && player.character === 'knight'
  );
}

/** Which state to settle into when standing on the ground. */
function groundStateFor(input: InputState, player: Player): PlayerState {
  if (canGuard(player) && input.guardHeld) {
    return 'guard';
  }
  return horizontalIntent(input) !== 0 ? 'walk' : 'idle';
}

function groundVelocityFor(
  state: PlayerState,
  input: InputState,
  speed: number,
): number {
  return state === 'walk' ? horizontalIntent(input) * speed : 0;
}

/**
 * One fixed simulation step of the player state machine.
 *
 * Movement commitment:
 * - Horizontal steering only happens while grounded and not in combat.
 * - Jumping can only start from the ground.
 * - Jump horizontal momentum is frozen at takeoff; mid-air input is ignored.
 * - Melee swings, spells, and guard are committed for their full window.
 */
export function stepPlayer(player: Player, context: PlayerStepContext): Player {
  if (player.state === 'die') {
    return player;
  }

  const { input, level, dtSeconds } = context;
  const definition = characterDefinition(player.character);
  const direction = horizontalIntent(input);
  const invulnerableTime = Math.max(0, player.invulnerableTime - dtSeconds);
  const spikeGrace = Math.max(0, player.spikeGrace - dtSeconds);
  const canMelee = definition.meleeDamage > 0;

  let mana = Math.min(
    MANA_MAX,
    player.mana + dtSeconds / MANA_REGEN_SECONDS,
  );
  let bounceTime = Math.max(0, player.bounceTime - dtSeconds);
  let rangedCooldown = Math.max(0, player.rangedCooldown - dtSeconds);
  let berserkTime = Math.max(0, player.berserkTime - dtSeconds);
  let berserkCooldown = Math.max(
    0,
    player.berserkCooldown - dtSeconds,
  );
  let berserkStarted = false;

  // The Orc's relic turns the extra button into a berserk trigger.
  if (
    player.character === 'orcBrute' &&
    player.guardUnlocked &&
    context.guardPressed === true &&
    berserkCooldown <= 0 &&
    player.state !== 'hurt'
  ) {
    berserkTime = BERSERK_DURATION;
    berserkCooldown = BERSERK_COOLDOWN;
    berserkStarted = true;
  }

  // The Mage's bounce is a timed, mana-hungry shield.
  if (
    player.character === 'mage' &&
    player.guardUnlocked &&
    context.guardPressed === true &&
    bounceTime <= 0 &&
    mana >= BOUNCE_MANA_COST &&
    player.state !== 'hurt'
  ) {
    mana -= BOUNCE_MANA_COST;
    bounceTime = BOUNCE_DURATION;
  }

  // The Orc's axe throw exists only while the rage is burning.
  const canRanged =
    definition.rangedDamage > 0 &&
    (!definition.rangedRequiresBerserk || isBerserk(player));
  const canPower =
    player.character === 'mage' && player.guardUnlocked;
  const powerWanted = canPower && input.powerHeld === true;

  let powerCharge = canPower ? player.powerCharge : 0;
  let powerShot = false;
  let powerShotCharge = 0;
  if (player.state !== 'hurt') {
    if (
      powerWanted &&
      (powerCharge > 0 || mana >= POWER_MANA_COST)
    ) {
      if (powerCharge <= 0) {
        mana -= POWER_MANA_COST;
      }
      powerCharge = Math.min(
        MAX_POWER_CHARGE,
        powerCharge + dtSeconds,
      );
    } else if (powerCharge > 0) {
      if (powerCharge >= MIN_POWER_CHARGE) {
        powerShot = true;
        powerShotCharge = powerCharge;
      }
      powerCharge = 0;
    }
  } else {
    powerCharge = 0;
  }
  const charging = powerWanted && powerCharge > 0;

  const speed =
    WALK_SPEED *
    (isBerserk(player) ? BERSERK_SPEED_MULTIPLIER : 1) *
    (charging ? POWER_MOVE_MULTIPLIER : 1);
  const wantsRanged =
    !charging &&
    canRanged &&
    rangedCooldown <= 0 &&
    ((context.rangedPressed === true) ||
      (context.attackPressed && !canMelee));
  const wantsMelee = !charging && canMelee && context.attackPressed;

  let state: PlayerState = player.state;
  let stateTime = 0;
  let facing = player.facing;
  let vx = player.velocity.x;
  let vy = player.velocity.y;
  let attackKind = player.attackKind;
  let rangedStarted = false;

  const beginRanged = (): void => {
    state = 'attack';
    stateTime = 0;
    attackKind = 'ranged';
    rangedStarted = true;
    rangedCooldown = RANGED_COOLDOWN;
    vx = player.grounded ? 0 : player.velocity.x;
  };

  const beginMelee = (): void => {
    state = 'attack';
    stateTime = 0;
    attackKind = 'melee';
    vx = player.grounded ? 0 : player.velocity.x;
  };

  if (player.state === 'hurt') {
    stateTime = player.stateTime + dtSeconds;
    vx = player.velocity.x;
    vy = player.velocity.y;

    if (stateTime >= PLAYER_HURT_DURATION) {
      if (player.grounded) {
        state = groundStateFor(input, player);
        stateTime = 0;
        vx = groundVelocityFor(state, input, speed);
      } else {
        state = player.velocity.y < 0 ? 'jump' : 'fall';
        stateTime = 0;
      }
    }
  } else if (player.state === 'attack') {
    stateTime = player.stateTime + dtSeconds;
    // A grounded attack plants the feet; an air swing keeps jump momentum.
    vx = player.grounded ? 0 : player.velocity.x;

    if (stateTime >= ATTACK_DURATION) {
      if (player.grounded) {
        if (direction !== 0) {
          facing = direction;
        }
        state = groundStateFor(input, player);
        stateTime = 0;
        vx = groundVelocityFor(state, input, speed);
      } else {
        // Finish the air attack without ever redirecting the jump.
        state = player.velocity.y < 0 ? 'jump' : 'fall';
        stateTime = 0;
        vx = player.velocity.x;
      }
    }
  } else if (player.state === 'guard') {
    if (direction !== 0) {
      facing = direction;
    }
    vx = 0;

    if (wantsMelee) {
      // Striking out of a guard is allowed; the swing is committed.
      beginMelee();
    } else if (wantsRanged) {
      beginRanged();
    } else if (!input.guardHeld || !canGuard(player)) {
      state = groundStateFor(input, player);
      stateTime = 0;
      vx = groundVelocityFor(state, input, speed);
    } else {
      state = 'guard';
      stateTime = player.stateTime + dtSeconds;
    }
  } else if (player.grounded) {
    if (direction !== 0) {
      facing = direction;
    }

    if (wantsMelee) {
      beginMelee();
    } else if (wantsRanged) {
      beginRanged();
    } else if (input.guardHeld && canGuard(player)) {
      state = 'guard';
      stateTime = 0;
      vx = 0;
    } else if (context.jumpPressed) {
      state = 'jump';
      stateTime = 0;
      vx = direction * speed;
      vy = -(JUMP_SPEED + player.jumpBonus);
    } else {
      state = direction !== 0 ? 'walk' : 'idle';
      stateTime = 0;
      vx = direction * speed;
    }
  } else {
    // Airborne: horizontal velocity stays committed from takeoff.
    if (wantsMelee) {
      // Air attacks are allowed and keep the jump's horizontal momentum.
      beginMelee();
    } else if (wantsRanged) {
      beginRanged();
    } else {
      state = player.state === 'jump' ? 'jump' : 'fall';
      stateTime = 0;
    }
  }

  vy = Math.min(vy + GRAVITY * dtSeconds, MAX_FALL_SPEED);

  const kinematics = moveAndCollide(
    {
      position: player.position,
      width: PLAYER_WIDTH,
      height: PLAYER_HEIGHT,
    },
    { x: vx, y: vy },
    level,
    dtSeconds,
  );

  let finalState = state;
  let finalTime = stateTime;

  if (!kinematics.grounded) {
    if (state === 'attack' || state === 'hurt') {
      finalState = state;
      finalTime = stateTime;
    } else {
      finalState = kinematics.velocity.y < 0 ? 'jump' : 'fall';
      finalTime = 0;
    }
  } else if (state === 'attack' || state === 'guard' || state === 'hurt') {
    finalState = state;
    finalTime = stateTime;
  } else if (state === 'walk' || state === 'idle') {
    finalState = state;
    finalTime = 0;
  } else {
    // Landed from a jump or fall.
    if (direction !== 0) {
      facing = direction;
    }
    finalState = groundStateFor(input, player);
    finalTime = 0;
  }

  return {
    state: finalState,
    position: kinematics.position,
    velocity: kinematics.velocity,
    facing,
    grounded: kinematics.grounded,
    stateTime: finalTime,
    hp: player.hp,
    maxHp: player.maxHp,
    invulnerableTime,
    guardUnlocked: player.guardUnlocked,
    character: player.character,
    attackKind,
    rangedCooldown,
    rangedStarted,
    bonusMelee: player.bonusMelee,
    bonusRanged: player.bonusRanged,
    jumpBonus: player.jumpBonus,
    berserkTime,
    berserkCooldown,
    berserkPermanent: player.berserkPermanent,
    berserkStarted,
    powerCharge,
    powerShot,
    powerShotCharge,
    spikeGrace,
    mana,
    bounceTime,
  };
}

/** Timing window of the melee swing, or null when not attacking. */
export function getAttackPhase(player: Player): AttackPhase | null {
  if (player.state !== 'attack' || player.attackKind !== 'melee') {
    return null;
  }
  if (player.stateTime < ATTACK_STARTUP) {
    return 'startup';
  }
  if (player.stateTime < ATTACK_STARTUP + ATTACK_ACTIVE) {
    return 'active';
  }
  if (player.stateTime < ATTACK_DURATION) {
    return 'recovery';
  }
  return null;
}

/** Melee hitbox, present only during the active window. */
export function getAttackHitbox(player: Player): AABB | null {
  if (getAttackPhase(player) !== 'active') {
    return null;
  }

  const definition = characterDefinition(player.character);
  return {
    x:
      player.facing === 1
        ? player.position.x + PLAYER_WIDTH
        : player.position.x - definition.meleeReach,
    y: player.position.y + definition.meleeOffsetY,
    width: definition.meleeReach,
    height: definition.meleeHeight,
  };
}

/** Guard or the Mage's timed bubble negates incoming damage. */
export function blocksDamage(player: Player): boolean {
  if (player.character === 'mage') {
    return player.guardUnlocked && player.bounceTime > 0;
  }
  return canGuard(player) && player.state === 'guard';
}

/** The Mage's earned skill reflects hostile spells while it is active. */
export function canReflectSpells(player: Player): boolean {
  return (
    player.character === 'mage' &&
    player.guardUnlocked &&
    player.bounceTime > 0
  );
}

/**
 * The visible ward is larger than the body. Spells that strike the bubble
 * edge should bounce, not sail past the 40 px collision box.
 */
export function getWardBounds(player: Player): AABB {
  const cx = player.position.x + PLAYER_WIDTH / 2;
  const cy = player.position.y + PLAYER_HEIGHT / 2;
  return {
    x: cx - 62,
    y: cy - 82,
    width: 124,
    height: 164,
  };
}

/** True when any part of the player overlaps a deadly tile. */
export function touchesSpikes(level: Level, player: Player): boolean {
  const box = {
    x: player.position.x,
    y: player.position.y,
    width: PLAYER_WIDTH,
    height: PLAYER_HEIGHT,
  };
  const { left, right, top, bottom } = tileRange(level, box);

  for (let row = top; row <= bottom; row += 1) {
    for (let col = left; col <= right; col += 1) {
      if (tileAt(level, col, row) === 'spike') {
        return true;
      }
    }
  }

  return false;
}

/** True once the player has dropped entirely below the level. */
export function hasFallenOutOfWorld(level: Level, player: Player): boolean {
  return player.position.y > level.rows * level.tileSize;
}
