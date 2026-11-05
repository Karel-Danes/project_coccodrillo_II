import { statsFor } from './enemy';
import { tileAt } from './level';
import type { Difficulty, EnemySpawn, Level } from './types';

export type DifficultyDefinition = {
  kind: Difficulty;
  name: string;
  description: string;
  /** Multiplies every creature's life pool. */
  enemyHpMultiplier: number;
  /** Multiplies contact and ranged damage. */
  enemyDamageMultiplier: number;
  /** Extra random-world monsters, and campaign reinforcements. */
  enemyCountBonus: number;
  /** Probability that a non-boss creature can fire bolts. */
  rangedChance: number;
  rangedDamage: number;
  rangedCooldown: number;
  accent: number;
};

export const DEFAULT_DIFFICULTY: Difficulty = 'middle';

export const DIFFICULTIES: Record<Difficulty, DifficultyDefinition> = {
  low: {
    kind: 'low',
    name: 'LOW',
    description: 'Lighter creatures, fewer patrols.',
    enemyHpMultiplier: 0.7,
    enemyDamageMultiplier: 0.7,
    enemyCountBonus: -1,
    rangedChance: 0,
    rangedDamage: 1,
    rangedCooldown: 3.2,
    accent: 0x8fd6a0,
  },
  middle: {
    kind: 'middle',
    name: 'MIDDLE',
    description: 'The original balance.',
    enemyHpMultiplier: 1,
    enemyDamageMultiplier: 1,
    enemyCountBonus: 0,
    rangedChance: 0,
    rangedDamage: 1,
    rangedCooldown: 3,
    accent: 0x9fc7ff,
  },
  nightmare: {
    kind: 'nightmare',
    name: 'NIGHTMARE',
    description: 'Packed patrols, tougher foes, ranged killers.',
    enemyHpMultiplier: 1.5,
    enemyDamageMultiplier: 1.5,
    enemyCountBonus: 3,
    rangedChance: 0.5,
    rangedDamage: 2,
    rangedCooldown: 2.2,
    accent: 0xff7a6a,
  },
};

export function isDifficulty(value: unknown): value is Difficulty {
  return (
    value === 'low' || value === 'middle' || value === 'nightmare'
  );
}

export function difficultyDefinition(
  difficulty: Difficulty,
): DifficultyDefinition {
  return DIFFICULTIES[difficulty];
}

/**
 * Gives the fixed campaign roster nightmare reinforcements and a few
 * bolt-throwing creatures. Random worlds handle this in their generator.
 */
export function prepareCampaignLevel(
  level: Level,
  difficulty: Difficulty,
): Level {
  const definition = DIFFICULTIES[difficulty];
  if (
    definition.enemyCountBonus <= 0 &&
    definition.rangedChance <= 0
  ) {
    return level;
  }

  const boss = level.enemies.find((enemy) => enemy.boss === true);
  const bossCol = boss ? Math.floor(boss.x / level.tileSize) : level.cols;
  const occupiedCols = new Set(
    level.enemies.map((enemy) => Math.floor(enemy.x / level.tileSize)),
  );
  const safeCols: number[] = [];

  for (
    let col = 8;
    col < Math.min(level.cols - 6, bossCol - 12);
    col += 1
  ) {
    if (
      tileAt(level, col, 16) === 'solid' &&
      tileAt(level, col, 15) === 'empty' &&
      !occupiedCols.has(col)
    ) {
      safeCols.push(col);
    }
  }

  const extraKinds = ['skeleton', 'goblin'] as const;
  const reinforcements: EnemySpawn[] = [];
  const wanted = Math.max(0, definition.enemyCountBonus);

  for (let index = 0; index < wanted && safeCols.length > 0; index += 1) {
    const stride = Math.max(1, Math.floor(safeCols.length / (wanted + 1)));
    const safeIndex = Math.min(
      safeCols.length - 1,
      stride * (index + 1),
    );
    const col = safeCols.splice(safeIndex, 1)[0];
    if (col === undefined) {
      break;
    }

    const kind = extraKinds[index % extraKinds.length] ?? 'skeleton';
    const stats = statsFor(kind);
    const x = col * level.tileSize + (level.tileSize - stats.width) / 2;
    const ranged =
      definition.rangedChance > 0 && index % 2 === 0;

    let left = col;
    let right = col;
    while (tileAt(level, left - 1, 16) === 'solid') {
      left -= 1;
    }
    while (tileAt(level, right + 1, 16) === 'solid') {
      right += 1;
    }

    reinforcements.push({
      kind,
      x,
      y: 16 * level.tileSize - stats.height,
      patrolMinX: Math.max(left * level.tileSize + 8, x - 90),
      patrolMaxX: Math.min(
        (right + 1) * level.tileSize - stats.width - 8,
        x + 90,
      ),
      ranged,
    });
  }

  const enemies = level.enemies.map((enemy, index) => ({
    ...enemy,
    ranged:
      enemy.ranged ??
      (definition.rangedChance > 0 &&
        !enemy.boss &&
        enemy.kind !== 'golem' &&
        enemy.kind !== 'darkKnight' &&
        enemy.kind !== 'orcBrute' &&
        index % 3 === 1),
  }));

  return { ...level, enemies: [...enemies, ...reinforcements] };
}
