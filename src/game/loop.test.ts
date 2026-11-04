import { describe, expect, it } from 'vitest';
import { FIXED_TIMESTEP_MS, FixedStepLoop, MAX_FRAME_MS } from './loop';

/** Runs `advance` over `frames` frames of `deltaMs` each. */
function run(loop: FixedStepLoop, frames: number, deltaMs: number): number {
  let steps = 0;
  for (let i = 0; i < frames; i += 1) {
    steps += loop.advance(deltaMs, () => undefined);
  }
  return steps;
}

describe('FixedStepLoop', () => {
  it('runs no step until a full timestep has accumulated', () => {
    const loop = new FixedStepLoop();

    expect(loop.advance(FIXED_TIMESTEP_MS / 2, () => undefined)).toBe(0);
    expect(loop.alpha).toBeCloseTo(0.5);
    expect(loop.advance(FIXED_TIMESTEP_MS / 2, () => undefined)).toBe(1);
    expect(loop.alpha).toBeCloseTo(0);
  });

  it('always simulates at the same rate regardless of frame rate', () => {
    const oneSecondAt = (deltaMs: number): number =>
      run(new FixedStepLoop(), Math.round(1000 / deltaMs), deltaMs);

    expect(oneSecondAt(1000 / 60)).toBe(60);
    expect(oneSecondAt(1000 / 30)).toBe(60);
    expect(oneSecondAt(1000 / 144)).toBe(60);
  });

  it('caps a huge frame delta instead of simulating unbounded time', () => {
    const loop = new FixedStepLoop();
    const steps = loop.advance(10_000, () => undefined);

    expect(steps).toBe(Math.round(MAX_FRAME_MS / FIXED_TIMESTEP_MS));
    expect(loop.alpha).toBeGreaterThanOrEqual(0);
    expect(loop.alpha).toBeLessThan(1);
  });

  it('ignores non-finite and non-positive deltas', () => {
    const loop = new FixedStepLoop();

    expect(loop.advance(Number.NaN, () => undefined)).toBe(0);
    expect(loop.advance(Number.POSITIVE_INFINITY, () => undefined)).toBe(0);
    expect(loop.advance(-16, () => undefined)).toBe(0);
    expect(loop.alpha).toBe(0);
  });

  it('reset clears the leftover accumulator', () => {
    const loop = new FixedStepLoop();
    loop.advance(FIXED_TIMESTEP_MS / 2, () => undefined);

    loop.reset();

    expect(loop.alpha).toBe(0);
  });

  it('rejects invalid configuration', () => {
    expect(() => new FixedStepLoop(0)).toThrow(RangeError);
    expect(() => new FixedStepLoop(10, 5)).toThrow(RangeError);
  });
});
