import { describe, expect, it } from 'vitest';
import { parseLevel } from './level';
import {
  applyPlayerDamage,
  ATTACK_REACH,
  blocksDamage,
  createPlayer,
  getAttackHitbox,
  getAttackPhase,
  GRAVITY,
  grantExtraLife,
  healPlayer,
  JUMP_SPEED,
  PLAYER_INVULNERABILITY,
  PLAYER_MAX_HP,
  PLAYER_WIDTH,
  stepPlayer,
  WALK_SPEED,
  type PlayerStepContext,
} from './player';
import type { AABB, InputState, Level, Player } from './types';

const DT_SECONDS = 1 / 60;

const NO_INPUT: InputState = {
  left: false,
  right: false,
  jumpHeld: false,
  attackHeld: false,
  guardHeld: false,
};
const IDLE = NO_INPUT;
const RIGHT: InputState = { ...NO_INPUT, right: true };
const GUARD: InputState = { ...NO_INPUT, guardHeld: true };
const GUARD_RIGHT: InputState = { ...NO_INPUT, right: true, guardHeld: true };

function flatLevel(): Level {
  return parseLevel(
    ['.'.repeat(40), '.'.repeat(40), '#'.repeat(40)],
    { tileSize: 64, spawn: { x: 128, y: 40 } },
  );
}

function step(
  player: Player,
  level: Level,
  input: InputState,
  jumpPressed = false,
  attackPressed = false,
): Player {
  const context: PlayerStepContext = {
    level,
    input,
    jumpPressed,
    attackPressed,
    dtSeconds: DT_SECONDS,
  };
  return stepPlayer(player, context);
}

function settle(level: Level): Player {
  let player = createPlayer(level.spawn);
  for (let i = 0; i < 10; i += 1) {
    player = step(player, level, IDLE);
  }
  return player;
}

describe('player state machine', () => {
  it('cannot change direction mid-jump', () => {
    const level = flatLevel();
    const walking = step(settle(level), level, RIGHT);
    expect(walking.state).toBe('walk');
    expect(walking.velocity.x).toBeCloseTo(WALK_SPEED);

    const jumping = step(walking, level, RIGHT, true);
    expect(jumping.state).toBe('jump');
    expect(jumping.velocity.x).toBeCloseTo(WALK_SPEED);

    const takeoffX = jumping.position.x;
    const airborne = step(jumping, level, {
      ...NO_INPUT,
      left: true,
    });

    expect(airborne.state).toBe('jump');
    expect(airborne.facing).toBe(1);
    expect(airborne.velocity.x).toBeCloseTo(WALK_SPEED);
    expect(airborne.position.x).toBeGreaterThan(takeoffX);
    expect(airborne.position.x).toBeGreaterThan(takeoffX + 1);
  });

  it('ignores a second jump press while airborne', () => {
    const level = flatLevel();
    const walking = step(settle(level), level, RIGHT);
    const jumping = step(walking, level, RIGHT, true);
    const firstVy = jumping.velocity.y;
    expect(firstVy).toBeLessThan(0);

    const afterPress = step(jumping, level, RIGHT, true);

    expect(afterPress.state).toBe('jump');
    expect(afterPress.velocity.y).toBeGreaterThan(firstVy);
    expect(afterPress.velocity.y).toBeCloseTo(firstVy + GRAVITY * DT_SECONDS);
  });

  it('resumes walking control on landing', () => {
    const level = flatLevel();
    const walking = step(settle(level), level, RIGHT);
    let player = step(walking, level, RIGHT, true);

    for (let i = 0; i < 120 && !player.grounded; i += 1) {
      player = step(player, level, RIGHT);
    }

    expect(player.grounded).toBe(true);
    expect(player.state).toBe('walk');
    expect(player.velocity.x).toBeCloseTo(WALK_SPEED);
  });

  it('switches to falling when walking off a ledge', () => {
    const level = parseLevel(
      ['.'.repeat(20), '.'.repeat(20), '#####'.padEnd(20, '.')],
      { tileSize: 64, spawn: { x: 64, y: 40 } },
    );

    let player = settle(level);
    let sawFall = false;
    for (let i = 0; i < 200; i += 1) {
      player = step(player, level, RIGHT);
      if (player.state === 'fall') {
        sawFall = true;
        break;
      }
    }

    expect(sawFall).toBe(true);
    expect(player.grounded).toBe(false);
  });

  it('jumps straight up from a standstill', () => {
    const level = flatLevel();
    const standing = settle(level);
    expect(standing.state).toBe('idle');

    const jumping = step(standing, level, IDLE, true);

    expect(jumping.state).toBe('jump');
    expect(jumping.velocity.x).toBe(0);
    expect(jumping.velocity.y).toBeLessThan(0);
  });

  it('jumps higher with a wind sigil bonus', () => {
    const level = flatLevel();
    const standing = { ...settle(level), jumpBonus: 90 };
    const jumping = step(standing, level, IDLE, true);

    expect(jumping.velocity.y).toBeCloseTo(
      -(JUMP_SPEED + 90) + GRAVITY * DT_SECONDS,
    );
  });

  it('stops at a wall instead of leaving the level', () => {
    const level = parseLevel(
      ['..........', '.........#', '##########'],
      { tileSize: 64, spawn: { x: 64, y: 40 } },
    );
    let player = settle(level);

    for (let i = 0; i < 300; i += 1) {
      player = step(player, level, RIGHT);
    }

    const wallX = 9 * level.tileSize;
    expect(player.position.x + PLAYER_WIDTH).toBeCloseTo(wallX);
    expect(player.grounded).toBe(true);
  });
});

describe('health', () => {
  it('loses a heart, staggers away, and gains i-frames', () => {
    const level = flatLevel();
    const standing = settle(level);
    const sourceX = standing.position.x + 100;

    const hurt = applyPlayerDamage(standing, 1, sourceX);
    expect(hurt.hp).toBe(standing.hp - 1);
    expect(hurt.state).toBe('hurt');
    expect(hurt.invulnerableTime).toBeCloseTo(PLAYER_INVULNERABILITY);
    expect(hurt.velocity.x).toBeLessThan(0);

    const ignored = applyPlayerDamage(hurt, 1, sourceX);
    expect(ignored).toBe(hurt);
    expect(ignored.hp).toBe(hurt.hp);

    let player = hurt;
    for (let i = 0; i < 40 && player.state === 'hurt'; i += 1) {
      player = step(player, level, NO_INPUT);
    }

    expect(player.state).not.toBe('hurt');
    expect(player.invulnerableTime).toBeLessThan(PLAYER_INVULNERABILITY);
  });

  it('heals up to the cap and dies when the last heart is lost', () => {
    const level = flatLevel();
    const standing = settle(level);

    const wounded = { ...standing, hp: 1, invulnerableTime: 0 };
    expect(healPlayer(wounded, 1).hp).toBe(2);
    expect(healPlayer(wounded, 99).hp).toBe(PLAYER_MAX_HP);

    const dead = applyPlayerDamage(
      { ...standing, hp: 1, invulnerableTime: 0 },
      1,
      standing.position.x + 100,
    );
    expect(dead.hp).toBe(0);
    expect(dead.state).toBe('die');
  });

  it('never lets extra-life gains exceed the character cap', () => {
    const level = flatLevel();
    const standing = settle(level);
    const nearCap = {
      ...standing,
      maxHp: PLAYER_MAX_HP - 1,
      hp: PLAYER_MAX_HP - 2,
    };

    const capped = grantExtraLife(nearCap, 5);
    expect(capped.maxHp).toBe(PLAYER_MAX_HP);
    expect(capped.hp).toBeLessThanOrEqual(PLAYER_MAX_HP);

    const atCap = grantExtraLife(
      { ...nearCap, maxHp: PLAYER_MAX_HP, hp: PLAYER_MAX_HP },
      2,
    );
    expect(atCap.maxHp).toBe(PLAYER_MAX_HP);
    expect(atCap.hp).toBe(PLAYER_MAX_HP);

    const mageWithOldProgress = {
      ...createPlayer({ x: 0, y: 0 }, 'mage'),
      maxHp: 7,
      hp: 6,
    };
    const cappedMage = grantExtraLife(mageWithOldProgress, 3);
    expect(cappedMage.maxHp).toBe(3);
    expect(cappedMage.hp).toBe(3);
  });
});

describe('sword and guard', () => {
  it('commits to a sword attack and cannot walk out of it', () => {
    const level = flatLevel();
    const attacking = step(settle(level), level, RIGHT, false, true);

    expect(attacking.state).toBe('attack');
    expect(attacking.velocity.x).toBe(0);
    expect(attacking.stateTime).toBe(0);
    expect(getAttackPhase(attacking)).toBe('startup');
    expect(getAttackHitbox(attacking)).toBeNull();

    const startX = attacking.position.x;
    let player = attacking;
    for (let i = 0; i < 10; i += 1) {
      player = step(player, level, RIGHT);
    }

    expect(player.state).toBe('attack');
    expect(player.position.x).toBeCloseTo(startX);
  });

  it('only exposes the sword hitbox during the active window', () => {
    const level = flatLevel();
    let player = step(settle(level), level, IDLE, false, true);
    const startX = player.position.x;
    const phases = new Set<string>();
    let activeHitbox: AABB | null = null;

    for (let i = 0; i < 60 && player.state === 'attack'; i += 1) {
      const phase = getAttackPhase(player);
      if (phase !== null) {
        phases.add(phase);
      }
      const hitbox = getAttackHitbox(player);
      if (hitbox !== null) {
        activeHitbox = hitbox;
      }
      player = step(player, level, IDLE);
    }

    expect(phases.has('startup')).toBe(true);
    expect(phases.has('active')).toBe(true);
    expect(phases.has('recovery')).toBe(true);
    expect(activeHitbox).not.toBeNull();
    expect(activeHitbox!.x).toBeCloseTo(startX + PLAYER_WIDTH);
    expect(activeHitbox!.width).toBe(ATTACK_REACH);
  });

  it('throws the hitbox on the facing side', () => {
    const level = flatLevel();
    const facingLeft = step(settle(level), level, {
      ...NO_INPUT,
      left: true,
    });
    expect(facingLeft.facing).toBe(-1);

    let player = step(facingLeft, level, NO_INPUT, false, true);
    let hitbox: AABB | null = null;
    for (let i = 0; i < 30 && player.state === 'attack'; i += 1) {
      hitbox = getAttackHitbox(player);
      if (hitbox !== null) {
        break;
      }
      player = step(player, level, NO_INPUT);
    }

    expect(hitbox).not.toBeNull();
    expect(hitbox!.x).toBeCloseTo(player.position.x - ATTACK_REACH);
  });

  it('allows a committed air attack without changing jump direction', () => {
    const level = flatLevel();
    const walking = step(settle(level), level, RIGHT);
    const jumping = step(walking, level, RIGHT, true);
    expect(jumping.state).toBe('jump');

    const attacking = step(jumping, level, NO_INPUT, false, true);
    expect(attacking.state).toBe('attack');
    expect(getAttackPhase(attacking)).toBe('startup');
    expect(attacking.velocity.x).toBeCloseTo(WALK_SPEED);

    const airborne = step(attacking, level, { ...NO_INPUT, left: true });
    expect(airborne.state).toBe('attack');
    expect(airborne.facing).toBe(1);
    expect(airborne.velocity.x).toBeCloseTo(WALK_SPEED);
    expect(airborne.position.x).toBeGreaterThan(attacking.position.x);

    let player = airborne;
    for (let i = 0; i < 40 && player.state === 'attack'; i += 1) {
      player = step(player, level, { ...NO_INPUT, left: true });
    }

    expect(player.state).toBe('fall');
    expect(player.velocity.x).toBeCloseTo(WALK_SPEED);
  });

  it('cannot guard until the artefact unlocks the skill', () => {
    const level = flatLevel();
    const locked = step(settle(level), level, GUARD);
    expect(locked.state).toBe('idle');
    expect(blocksDamage(locked)).toBe(false);

    const unlocked = step(
      { ...settle(level), guardUnlocked: true },
      level,
      GUARD,
    );
    expect(unlocked.state).toBe('guard');
    expect(blocksDamage(unlocked)).toBe(true);
  });

  it('holds guard without moving and blocks damage', () => {
    const level = flatLevel();
    const guarding = step(
      { ...settle(level), guardUnlocked: true },
      level,
      GUARD,
    );
    expect(guarding.state).toBe('guard');
    expect(blocksDamage(guarding)).toBe(true);

    const startX = guarding.position.x;
    let player = guarding;
    for (let i = 0; i < 12; i += 1) {
      player = step(player, level, GUARD_RIGHT);
    }

    expect(player.state).toBe('guard');
    expect(player.position.x).toBeCloseTo(startX);

    const turned = step(player, level, {
      ...NO_INPUT,
      left: true,
      guardHeld: true,
    });
    expect(turned.facing).toBe(-1);
    expect(turned.position.x).toBeCloseTo(startX);

    const released = step(turned, level, NO_INPUT);
    expect(released.state).toBe('idle');
    expect(blocksDamage(released)).toBe(false);
  });

  it('can strike out of guard but cannot guard in the air', () => {
    const level = flatLevel();
    const guarding = step(
      { ...settle(level), guardUnlocked: true },
      level,
      GUARD,
    );
    const attacking = step(guarding, level, GUARD, false, true);
    expect(attacking.state).toBe('attack');

    const jumping = step(settle(level), level, IDLE, true);
    const guardMidair = step(jumping, level, GUARD);
    expect(guardMidair.state).toBe('jump');
    expect(blocksDamage(guardMidair)).toBe(false);
  });

  it('returns to guard after a swing when guard is still held', () => {
    const level = flatLevel();
    let player = step(
      { ...settle(level), guardUnlocked: true },
      level,
      GUARD,
    );
    player = step(player, level, GUARD, false, true);

    for (let i = 0; i < 60 && player.state === 'attack'; i += 1) {
      player = step(player, level, GUARD);
    }

    expect(player.state).toBe('guard');
    expect(blocksDamage(player)).toBe(true);
  });
});
