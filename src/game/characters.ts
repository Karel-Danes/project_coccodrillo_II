import type {
  CharacterDefinition,
  CharacterKind,
  EnemyKind,
  WorldMode,
} from './types';

/** The three playable heroes, in menu order. */
export const CHARACTER_ORDER: readonly CharacterKind[] = [
  'knight',
  'mage',
  'orcBrute',
] as const;

export const DEFAULT_CHARACTER: CharacterKind = 'knight';
export const DEFAULT_WORLD_MODE: WorldMode = 'campaign';

/**
 * Character rulebook. These numbers are the menu numbers: they drive real
 * HP, melee damage, and ranged damage in the simulation.
 */
export const CHARACTERS: Record<CharacterKind, CharacterDefinition> = {
  knight: {
    kind: 'knight',
    name: 'KNIGHT',
    epithet: 'The Oathbound',
    maxHp: 3,
    meleeDamage: 5,
    rangedDamage: 0,
    rangedRequiresBerserk: false,
    meleeName: 'Sword',
    rangedName: null,
    basicAbility: 'Sword',
    extraAbility: 'Defence Bubble',
    extraDetail: 'Hold the relic button to negate damage.',
    extraLabel: 'GUARD',
    accent: 0x8fc7ff,
  },
  mage: {
    kind: 'mage',
    name: 'MAGE',
    epithet: 'The Stormcaller',
    maxHp: 2,
    meleeDamage: 0,
    rangedDamage: 3,
    rangedRequiresBerserk: false,
    meleeName: null,
    rangedName: 'Lightning Strike',
    basicAbility: 'Lightning Strike',
    extraAbility: 'Spell Bounce',
    extraDetail: 'Bounce spells back at their caster.',
    extraLabel: 'BOUNCE',
    accent: 0xc5a4ff,
  },
  orcBrute: {
    kind: 'orcBrute',
    name: 'ORC BRUTE',
    epithet: 'The Red Maw',
    maxHp: 6,
    meleeDamage: 8,
    rangedDamage: 5,
    rangedRequiresBerserk: true,
    meleeName: 'Axe',
    rangedName: 'Berserk Axe Throw',
    basicAbility: 'Axe',
    extraAbility: 'Berserk Mode',
    extraDetail: 'Berserk: axe throws +3 life.',
    extraLabel: 'RAGE',
    accent: 0xff9b6a,
  },
};

export function characterDefinition(
  kind: CharacterKind,
): CharacterDefinition {
  return CHARACTERS[kind];
}

export function isCharacterKind(value: unknown): value is CharacterKind {
  return (
    value === 'knight' || value === 'mage' || value === 'orcBrute'
  );
}

export function isWorldMode(value: unknown): value is WorldMode {
  return value === 'campaign' || value === 'random';
}

/** Boss identities used by the intro, HUD, and victory screens. */
export const BOSS_NAMES: Record<'golem' | 'darkKnight' | 'orcBrute', string> = {
  golem: 'THE MIGHTY JAN ZÁTKA',
  darkKnight: 'MORVANE, THE DARK KNIGHT',
  orcBrute: 'GRAKKA, THE ORC BRUTE',
};

/** Every boss the random world can end with. */
export const RANDOM_BOSSES = ['golem', 'darkKnight', 'orcBrute'] as const;

export type BossKind = (typeof RANDOM_BOSSES)[number];

export function isBossKind(kind: EnemyKind): kind is BossKind {
  return (
    kind === 'golem' || kind === 'darkKnight' || kind === 'orcBrute'
  );
}

export function bossName(kind: EnemyKind): string {
  return isBossKind(kind) ? BOSS_NAMES[kind] : 'THE FINAL GUARDIAN';
}
