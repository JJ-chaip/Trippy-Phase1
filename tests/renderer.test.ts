/**
 * Tests for the canvas renderer.
 *
 * Since we're in a Node/Vitest environment without a real canvas,
 * we test the renderer state management and the pure logic portions.
 * Visual correctness is verified via the browser end-to-end test.
 */

import { describe, it, expect } from 'vitest';
import { createRendererState } from '../src/render/canvas-renderer.js';

describe('createRendererState', () => {
  it('creates a fresh state with zero values', () => {
    const state = createRendererState();
    expect(state.elapsedSec).toBe(0);
    expect(state.smoothedRms).toBe(0);
    expect(state.smoothedPeak).toBe(0);
    expect(state.smoothedBands).toHaveLength(0);
    expect(state.particles).toHaveLength(0);
  });

  it('creates independent instances', () => {
    const a = createRendererState();
    const b = createRendererState();
    a.elapsedSec = 10;
    a.particles.push({
      x: 0, y: 0, vx: 0, vy: 0,
      radius: 1, hueOffset: 0, life: 5, maxLife: 10,
    });
    expect(b.elapsedSec).toBe(0);
    expect(b.particles).toHaveLength(0);
  });

  it('smoothedBands can be extended', () => {
    const state = createRendererState();
    state.smoothedBands.push(0.5, 0.3, 0.1);
    expect(state.smoothedBands).toHaveLength(3);
    expect(state.smoothedBands[0]).toBe(0.5);
  });
});

describe('renderer state mutation patterns', () => {
  it('particles array is mutable for in-place updates', () => {
    const state = createRendererState();
    state.particles.push({
      x: 100, y: 200, vx: 1, vy: -1,
      radius: 2, hueOffset: 45, life: 8, maxLife: 10,
    });
    expect(state.particles).toHaveLength(1);
    expect(state.particles[0]?.x).toBe(100);

    // Simulate particle update
    const p = state.particles[0];
    if (p) {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.016;
    }
    expect(state.particles[0]?.x).toBe(101);
    expect(state.particles[0]?.life).toBeCloseTo(7.984);
  });

  it('elapsed time accumulates correctly', () => {
    const state = createRendererState();
    state.elapsedSec += 0.016;
    state.elapsedSec += 0.016;
    state.elapsedSec += 0.016;
    expect(state.elapsedSec).toBeCloseTo(0.048, 5);
  });

  it('smoothed values can be updated incrementally', () => {
    const state = createRendererState();
    // Simulate exponential smoothing
    const target = 0.5;
    const factor = 0.1;
    for (let i = 0; i < 100; i++) {
      state.smoothedRms += (target - state.smoothedRms) * factor;
    }
    expect(state.smoothedRms).toBeCloseTo(target, 2);
  });
});
