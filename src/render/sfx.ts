import type { EnemyKind } from '../game/types';

type AudioContextConstructor = typeof AudioContext;

/**
 * Tiny procedural sound kit. No audio files: every effect is a short
 * oscillator/noise envelope through the Web Audio API, so it works on
 * desktop and mobile without extra downloads.
 */
export class Sfx {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private lastBlockAt = 0;

  /** Must be called from a real user gesture to satisfy autoplay rules. */
  unlock(): void {
    if (this.context === null) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: AudioContextConstructor })
          .webkitAudioContext;
      if (!Ctor) {
        return;
      }
      this.context = new Ctor();
      this.master = this.context.createGain();
      this.master.gain.value = 0.16;
      this.master.connect(this.context.destination);
    }

    if (this.context.state === 'suspended') {
      void this.context.resume();
    }
  }

  close(): void {
    if (this.context) {
      void this.context.close();
      this.context = null;
      this.master = null;
    }
  }

  private tone(
    frequency: number,
    endFrequency: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    delay = 0,
  ): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master) {
      return;
    }

    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(1, endFrequency),
      start + duration,
    );

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  }

  private noise(
    duration: number,
    volume: number,
    frequency: number,
    delay = 0,
  ): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master) {
      return;
    }

    const start = context.currentTime + delay;
    const length = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = context.createBufferSource();
    source.buffer = buffer;

    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = 0.9;

    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(start);
    source.stop(start + duration);
  }

  jump(): void {
    this.tone(320, 540, 0.12, 'square', 0.06);
    this.noise(0.06, 0.05, 900);
  }

  land(): void {
    this.noise(0.08, 0.09, 220);
    this.tone(95, 55, 0.11, 'sine', 0.08);
  }

  swing(): void {
    this.noise(0.13, 0.16, 1700);
    this.tone(760, 260, 0.1, 'sawtooth', 0.04);
  }

  cast(): void {
    this.tone(1240, 420, 0.2, 'triangle', 0.07);
    this.tone(620, 1860, 0.16, 'sine', 0.04);
    this.noise(0.08, 0.04, 3200);
  }

  reflect(): void {
    this.tone(880, 1760, 0.18, 'triangle', 0.09);
    this.tone(440, 1320, 0.22, 'sine', 0.05);
  }

  berserk(): void {
    this.tone(110, 55, 0.7, 'sawtooth', 0.14);
    this.tone(220, 140, 0.5, 'square', 0.06);
    this.noise(0.4, 0.08, 260);
  }

  teleport(): void {
    this.tone(420, 1480, 0.35, 'sine', 0.08);
    this.tone(880, 220, 0.4, 'triangle', 0.05, 0.06);
    this.noise(0.18, 0.05, 2400);
  }

  hit(): void {
    this.tone(190, 70, 0.15, 'square', 0.12);
    this.noise(0.09, 0.12, 600);
  }

  block(): void {
    const now = performance.now();
    if (now - this.lastBlockAt < 180) {
      return;
    }
    this.lastBlockAt = now;
    this.tone(920, 1240, 0.11, 'triangle', 0.1);
    this.tone(1380, 1560, 0.1, 'sine', 0.05);
    this.noise(0.06, 0.06, 2400);
  }

  guard(): void {
    this.tone(520, 760, 0.18, 'sine', 0.05);
    this.tone(780, 900, 0.2, 'sine', 0.04);
  }

  heal(): void {
    this.tone(520, 880, 0.28, 'sine', 0.08);
    this.tone(780, 1170, 0.3, 'triangle', 0.05);
    this.noise(0.12, 0.03, 2600);
  }

  coin(): void {
    this.tone(1046, 1318, 0.08, 'square', 0.05);
    this.tone(1568, 1568, 0.1, 'sine', 0.04, 0.05);
  }

  playerHurt(): void {
    this.tone(160, 70, 0.25, 'sawtooth', 0.12);
    this.noise(0.1, 0.1, 320);
  }

  bossShot(): void {
    this.tone(190, 65, 0.5, 'sawtooth', 0.09);
    this.tone(420, 150, 0.3, 'triangle', 0.05);
    this.noise(0.24, 0.06, 520);
  }

  enemyShot(): void {
    this.tone(620, 240, 0.18, 'square', 0.05);
    this.noise(0.08, 0.04, 1400);
  }

  enemySwing(kind: EnemyKind): void {
    const base =
      kind === 'golem'
        ? 95
        : kind === 'skeleton'
          ? 240
          : kind === 'goblin'
            ? 310
            : kind === 'slime'
              ? 170
              : 720;
    this.tone(base, base * 0.45, 0.16, 'sawtooth', kind === 'golem' ? 0.12 : 0.05);
    this.noise(0.08, 0.05, 500);
  }

  enemyDie(): void {
    this.tone(300, 55, 0.5, 'sawtooth', 0.1);
    this.noise(0.22, 0.08, 300);
  }

  playerDeath(): void {
    this.tone(220, 48, 0.85, 'sawtooth', 0.13);
    this.noise(0.45, 0.1, 180);
  }

  bossRoar(): void {
    this.tone(72, 38, 1.5, 'sawtooth', 0.18);
    this.tone(110, 54, 1.4, 'square', 0.07);
    this.noise(1.25, 0.12, 120);
    this.tone(48, 30, 1.7, 'sine', 0.12);
  }

  victory(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((frequency, index) => {
      this.tone(frequency, frequency, 0.5, 'triangle', 0.08, index * 0.16);
    });
    this.tone(1046.5, 1046.5, 0.9, 'sine', 0.05, 0.7);
  }
}
