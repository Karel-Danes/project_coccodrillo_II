import Phaser from 'phaser';
import {
  CHARACTER_ORDER,
  CHARACTERS,
  isCharacterKind,
} from '../../game/characters';
import {
  DEFAULT_DIFFICULTY,
  DIFFICULTIES,
  isDifficulty,
} from '../../game/difficulty';
import type {
  CharacterKind,
  Difficulty,
  WorldMode,
} from '../../game/types';
import { PLAYER_ART, playerTextureKey } from '../assets/players';
import { createBackdrop, loadDesertAssets } from '../backdrop';
import {
  loadPlayerAssets,
  registerPlayerAnimations,
} from '../playerAnimations';

type CharacterCard = {
  kind: CharacterKind;
  background: Phaser.GameObjects.Rectangle;
  preview: Phaser.GameObjects.Sprite;
  name: Phaser.GameObjects.Text;
};

type ModePanel = {
  mode: WorldMode;
  background: Phaser.GameObjects.Rectangle;
  title: Phaser.GameObjects.Text;
};

type DifficultyChip = {
  difficulty: Difficulty;
  background: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
};

/**
 * Title screen: pick a hero and a world. Cards display the exact rulebook
 * numbers that drive the simulation, not decorative ratings.
 */
export class MenuScene extends Phaser.Scene {
  private selectedCharacter: CharacterKind = 'knight';
  private selectedMode: WorldMode = 'campaign';
  private selectedDifficulty: Difficulty = DEFAULT_DIFFICULTY;
  private cards: CharacterCard[] = [];
  private modePanels: ModePanel[] = [];
  private difficultyChips: DifficultyChip[] = [];
  private startButton: Phaser.GameObjects.Rectangle | null = null;
  private startLabel: Phaser.GameObjects.Text | null = null;
  private starting = false;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyC!: Phaser.Input.Keyboard.Key;
  private keyF!: Phaser.Input.Keyboard.Key;
  private keyEnter!: Phaser.Input.Keyboard.Key;
  private keyOne!: Phaser.Input.Keyboard.Key;
  private keyTwo!: Phaser.Input.Keyboard.Key;
  private keyThree!: Phaser.Input.Keyboard.Key;

  constructor() {
    super({ key: 'MenuScene' });
  }

  preload(): void {
    loadPlayerAssets(this);
    loadDesertAssets(this);
  }

  create(): void {
    this.cards = [];
    this.modePanels = [];
    this.difficultyChips = [];
    this.startButton = null;
    this.startLabel = null;
    this.starting = false;
    this.selectedCharacter = 'knight';
    this.selectedMode = 'campaign';
    this.selectedDifficulty = DEFAULT_DIFFICULTY;

    const width = this.scale.width;
    const height = this.scale.height;

    registerPlayerAnimations(this);
    createBackdrop(this, width, height, 690);

    this.add
      .rectangle(0, 0, width, height, 0x05070b, 0.55)
      .setOrigin(0, 0)
      .setDepth(1);

    // A cold moon above the ruined horizon.
    this.add
      .circle(width * 0.84, height * 0.16, 86, 0xffe2a1, 0.08)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(2);
    this.add
      .circle(width * 0.84, height * 0.16, 34, 0xfff1c9, 0.9)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(2);

    this.add
      .text(width / 2, 48, 'COCCODRILLO-II', {
        fontFamily: 'Georgia, serif',
        fontSize: '66px',
        color: '#f3dfa2',
        stroke: '#160f08',
        strokeThickness: 8,
      })
      .setOrigin(0.5, 0)
      .setDepth(4);

    this.add
      .text(
        width / 2,
        132,
        'A ROTOSCOPED DESERT SAGA  ·  CHOOSE YOUR HERO AND YOUR WORLD',
        {
          fontFamily: 'monospace',
          fontSize: '18px',
          color: '#9faeBE',
          letterSpacing: 2,
        },
      )
      .setOrigin(0.5, 0)
      .setDepth(4);

    const cardWidth = 330;
    const cardCentres = [230, 640, 1050];
    CHARACTER_ORDER.forEach((kind, index) => {
      const definition = CHARACTERS[kind];
      const art = PLAYER_ART[kind];
      const x = cardCentres[index] ?? 640;
      const y = 392;

      const background = this.add
        .rectangle(x, y, cardWidth, 354, 0x0c1118, 0.78)
        .setStrokeStyle(2, 0x35445a, 0.8)
        .setDepth(3)
        .setInteractive({ useHandCursor: true });
      background.on('pointerdown', () => {
        this.selectedCharacter = kind;
        this.refresh();
      });

      const preview = this.add
        .sprite(x, 368, playerTextureKey(kind, 'idle'))
        .setOrigin(0.5, art.feetY / art.frameHeight)
        .setScale(art.menuScale)
        .setDepth(5)
        .play(`${art.prefix}-idle`);

      const name = this.add
        .text(x, 396, definition.name, {
          fontFamily: 'Georgia, serif',
          fontSize: '29px',
          color: '#f3dfa2',
        })
        .setOrigin(0.5, 0)
        .setDepth(5);

      this.add
        .text(x, 426, definition.epithet, {
          fontFamily: 'monospace',
          fontSize: '14px',
          color: '#7f8fa3',
        })
        .setOrigin(0.5, 0)
        .setDepth(5);

      const melee =
        definition.meleeDamage > 0 ? String(definition.meleeDamage) : '—';
      const ranged =
        definition.rangedDamage > 0
          ? `${definition.rangedDamage}${definition.rangedRequiresBerserk ? '*' : ''}`
          : '—';

      this.add
        .text(
          x,
          454,
          `♥ ${definition.maxHp}    MELEE ${melee}    RANGED ${ranged}`,
          {
            fontFamily: 'monospace',
            fontSize: '18px',
            color: '#d9e3ec',
          },
        )
        .setOrigin(0.5, 0)
        .setDepth(5);

      this.add
        .text(x, 486, `BASIC  ${definition.basicAbility}`, {
          fontFamily: 'monospace',
          fontSize: '16px',
          color: '#8fc7ff',
        })
        .setOrigin(0.5, 0)
        .setDepth(5);

      this.add
        .text(x, 510, `EXTRA  ${definition.extraAbility}`, {
          fontFamily: 'monospace',
          fontSize: '16px',
          color: '#e6c47a',
        })
        .setOrigin(0.5, 0)
        .setDepth(5);

      this.add
        .text(x, 536, definition.extraDetail, {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#7f8fa3',
          align: 'center',
          wordWrap: { width: 306 },
          lineSpacing: 3,
        })
        .setOrigin(0.5, 0)
        .setDepth(5);

      this.cards.push({ kind, background, preview, name });
    });

    this.createModePanel(
      350,
      'campaign',
      'CAMPAIGN',
      'March the ruins · face Jan Zátka',
    );
    this.createModePanel(
      930,
      'random',
      'RANDOM WORLD',
      'New terrain · new monsters · one random boss',
    );

    this.add
      .text(352, 661, 'DIFFICULTY', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#8b98a5',
      })
      .setOrigin(1, 0.5)
      .setDepth(4);

    const difficultyOrder: Difficulty[] = ['low', 'middle', 'nightmare'];
    difficultyOrder.forEach((difficulty, index) => {
      this.createDifficultyChip(
        450 + index * 190,
        661,
        difficulty,
      );
    });

    const startButton = this.add
      .rectangle(width / 2, 708, 380, 48, 0xd8b46a, 1)
      .setStrokeStyle(2, 0xfff0c4, 0.9)
      .setDepth(3)
      .setInteractive({ useHandCursor: true });
    startButton.on('pointerdown', () => this.startGame());
    const startLabel = this.add
      .text(width / 2, 708, 'ENTER THE WORLD', {
        fontFamily: 'monospace',
        fontSize: '23px',
        color: '#181008',
      })
      .setOrigin(0.5)
      .setDepth(4);
    this.startButton = startButton;
    this.startLabel = startLabel;

    this.add
      .text(
        width / 2,
        742,
        '← → hero     ↑ ↓ / C world     F difficulty     ENTER begin',
        {
          fontFamily: 'monospace',
          fontSize: '14px',
          color: '#74849a',
        },
      )
      .setOrigin(0.5, 0)
      .setDepth(4);

    const keyboard = this.input.keyboard;
    if (keyboard === null) {
      throw new Error('Keyboard input is not available in this environment');
    }
    this.cursors = keyboard.createCursorKeys();
    this.keyC = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C);
    this.keyF = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    this.keyEnter = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.keyOne = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
    this.keyTwo = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
    this.keyThree = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE);

    this.refresh();
    this.cameras.main.fadeIn(320, 0, 0, 0);

    // Dev URLs such as ?play=1&world=random jump straight past the menu.
    const params = new URLSearchParams(window.location.search);
    if (
      params.has('play') ||
      params.has('boss') ||
      params.has('spawnX') ||
      params.has('character') ||
      params.has('world') ||
      params.has('difficulty')
    ) {
      const character = params.get('character');
      const world = params.get('world');
      const difficulty = params.get('difficulty');
      this.selectedCharacter = isCharacterKind(character)
        ? character
        : 'knight';
      this.selectedMode = world === 'random' ? 'random' : 'campaign';
      this.selectedDifficulty = isDifficulty(difficulty)
        ? difficulty
        : DEFAULT_DIFFICULTY;
      this.time.delayedCall(0, () => this.startGame());
    }
  }

  override update(): void {
    if (this.starting) {
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.cursors.left)) {
      this.moveSelection(-1);
    }
    if (Phaser.Input.Keyboard.JustDown(this.cursors.right)) {
      this.moveSelection(1);
    }
    if (
      Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
      Phaser.Input.Keyboard.JustDown(this.keyC)
    ) {
      this.toggleMode();
    }
    if (Phaser.Input.Keyboard.JustDown(this.cursors.down)) {
      this.toggleMode();
    }
    if (Phaser.Input.Keyboard.JustDown(this.keyF)) {
      this.cycleDifficulty();
    }
    if (Phaser.Input.Keyboard.JustDown(this.keyOne)) {
      this.selectedCharacter = 'knight';
      this.refresh();
    }
    if (Phaser.Input.Keyboard.JustDown(this.keyTwo)) {
      this.selectedCharacter = 'mage';
      this.refresh();
    }
    if (Phaser.Input.Keyboard.JustDown(this.keyThree)) {
      this.selectedCharacter = 'orcBrute';
      this.refresh();
    }
    if (
      Phaser.Input.Keyboard.JustDown(this.keyEnter) ||
      Phaser.Input.Keyboard.JustDown(this.cursors.space)
    ) {
      this.startGame();
    }
  }

  private createModePanel(
    x: number,
    mode: WorldMode,
    title: string,
    subtitle: string,
  ): void {
    const background = this.add
      .rectangle(x, 607, 480, 58, 0x0c1118, 0.78)
      .setStrokeStyle(2, 0x35445a, 0.8)
      .setDepth(3)
      .setInteractive({ useHandCursor: true });
    background.on('pointerdown', () => {
      this.selectedMode = mode;
      this.refresh();
    });

    const titleText = this.add
      .text(x, 583, title, {
        fontFamily: 'monospace',
        fontSize: '21px',
        color: '#f3dfa2',
      })
      .setOrigin(0.5, 0)
      .setDepth(4);
    this.add
      .text(x, 608, subtitle, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#7f8fa3',
      })
      .setOrigin(0.5, 0)
      .setDepth(4);

    this.modePanels.push({ mode, background, title: titleText });
  }

  private createDifficultyChip(
    x: number,
    y: number,
    difficulty: Difficulty,
  ): void {
    const definition = DIFFICULTIES[difficulty];
    const background = this.add
      .rectangle(x, y, 170, 38, 0x0c1118, 0.8)
      .setStrokeStyle(2, 0x35445a, 0.8)
      .setDepth(3)
      .setInteractive({ useHandCursor: true });
    background.on('pointerdown', () => {
      this.selectedDifficulty = difficulty;
      this.refresh();
    });

    const label = this.add
      .text(x, y, definition.name, {
        fontFamily: 'monospace',
        fontSize: '17px',
        color: '#8b98a5',
      })
      .setOrigin(0.5)
      .setDepth(4);

    this.difficultyChips.push({ difficulty, background, label });
  }

  private cycleDifficulty(): void {
    const order: Difficulty[] = ['low', 'middle', 'nightmare'];
    const index = order.indexOf(this.selectedDifficulty);
    this.selectedDifficulty =
      order[(index + 1) % order.length] ?? 'middle';
    this.refresh();
  }

  private moveSelection(delta: number): void {
    const current = CHARACTER_ORDER.indexOf(this.selectedCharacter);
    const next =
      (current + delta + CHARACTER_ORDER.length) %
      CHARACTER_ORDER.length;
    this.selectedCharacter = CHARACTER_ORDER[next] ?? 'knight';
    this.refresh();
  }

  private toggleMode(): void {
    this.selectedMode =
      this.selectedMode === 'campaign' ? 'random' : 'campaign';
    this.refresh();
  }

  private refresh(): void {
    for (const card of this.cards) {
      const selected = card.kind === this.selectedCharacter;
      card.background.setFillStyle(
        selected ? 0x17202c : 0x0c1118,
        selected ? 0.94 : 0.78,
      );
      card.background.setStrokeStyle(
        selected ? 3 : 2,
        selected ? 0xd8b46a : 0x35445a,
        selected ? 1 : 0.8,
      );
      card.preview.setAlpha(selected ? 1 : 0.62);
      card.name.setColor(selected ? '#f3dfa2' : '#8b98a5');
    }

    for (const panel of this.modePanels) {
      const selected = panel.mode === this.selectedMode;
      panel.background.setFillStyle(
        selected ? 0x1b2530 : 0x0c1118,
        selected ? 0.95 : 0.75,
      );
      panel.background.setStrokeStyle(
        selected ? 3 : 2,
        selected ? 0x9fe8ff : 0x35445a,
        selected ? 1 : 0.8,
      );
      panel.title.setColor(selected ? '#d9f6ff' : '#8b98a5');
    }

    for (const chip of this.difficultyChips) {
      const selected = chip.difficulty === this.selectedDifficulty;
      const definition = DIFFICULTIES[chip.difficulty];
      chip.background.setFillStyle(
        selected ? 0x1b2530 : 0x0c1118,
        selected ? 0.95 : 0.75,
      );
      chip.background.setStrokeStyle(
        selected ? 3 : 2,
        selected ? definition.accent : 0x35445a,
        selected ? 1 : 0.8,
      );
      chip.label.setColor(
        selected ? '#f1e7cf' : '#8b98a5',
      );
    }

    this.startButton?.setFillStyle(
      this.selectedMode === 'campaign' ? 0xd8b46a : 0x8fc7ff,
      1,
    );
    this.startLabel?.setText(
      this.selectedMode === 'campaign'
        ? 'ENTER THE CAMPAIGN'
        : 'ENTER THE RANDOM WORLD',
    );
  }

  private startGame(): void {
    if (this.starting) {
      return;
    }
    this.starting = true;
    this.cameras.main.fadeOut(240, 0, 0, 0);
    this.time.delayedCall(240, () => {
      this.scene.start('GameScene', {
        character: this.selectedCharacter,
        worldMode: this.selectedMode,
        difficulty: this.selectedDifficulty,
      });
    });
  }
}
