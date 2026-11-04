/**
 * Fixed-timestep clock driver.
 *
 * Pure TypeScript: no Phaser, no DOM. The render loop feeds it the real
 * frame delta; it returns how many deterministic steps to simulate. Physics
 * will only ever run inside `step`, so the same input always produces the
 * same result regardless of frame rate.
 */

/** 60 simulated steps per second. */
export const FIXED_TIMESTEP_MS = 1000 / 60;

/**
 * Longest real-time delta a single frame may contribute. Prevents the
 * "spiral of death" (and tunneling) after a tab switch, breakpoint, or
 * long GC pause: time beyond this is dropped, not simulated.
 */
export const MAX_FRAME_MS = 250;

/**
 * Tolerance for floating-point accumulation error. Without it a delta that
 * is mathematically exactly one timestep (e.g. 1000 / 60) can land a few
 * ulps short and skip a step. One microsecond is far below anything visible.
 */
const EPSILON_MS = 1e-3;

export class FixedStepLoop {
  private accumulatorMs = 0;

  constructor(
    readonly timestepMs: number = FIXED_TIMESTEP_MS,
    private readonly maxFrameMs: number = MAX_FRAME_MS,
  ) {
    if (timestepMs <= 0) {
      throw new RangeError('timestepMs must be greater than zero');
    }
    if (maxFrameMs < timestepMs) {
      throw new RangeError('maxFrameMs must be at least timestepMs');
    }
  }

  /**
   * Adds `deltaMs` of real time and invokes `step` once per whole timestep.
   * Returns the number of steps performed.
   */
  advance(deltaMs: number, step: () => void): number {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) {
      return 0;
    }

    this.accumulatorMs += Math.min(deltaMs, this.maxFrameMs);

    let steps = 0;
    while (this.accumulatorMs + EPSILON_MS >= this.timestepMs) {
      step();
      this.accumulatorMs -= this.timestepMs;
      steps += 1;
    }
    return steps;
  }

  /**
   * Fraction of a timestep left over, in [0, 1). Render code will use this
   * later to interpolate between the last two simulated states.
   */
  get alpha(): number {
    // A step taken inside the epsilon window can leave a tiny negative
    // remainder; alpha must never go below zero.
    return Math.max(0, this.accumulatorMs / this.timestepMs);
  }

  reset(): void {
    this.accumulatorMs = 0;
  }
}
