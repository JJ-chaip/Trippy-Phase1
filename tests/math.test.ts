/**
 * Tests for pure math utilities.
 */

import { describe, it, expect } from 'vitest';
import {
  clamp,
  lerp,
  inverseLerp,
  remap,
  exponentialSmooth,
  asymmetricClamp,
  isFiniteNumber,
} from '../src/utils/math.js';

describe('clamp', () => {
  it('returns value when within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('clamps to min', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it('clamps to max', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('handles min === max', () => {
    expect(clamp(5, 3, 3)).toBe(3);
  });

  it('handles NaN → returns min', () => {
    expect(clamp(NaN, 0, 10)).toBe(0);
  });

  it('handles exact boundaries', () => {
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });

  it('handles negative ranges', () => {
    expect(clamp(-5, -10, -1)).toBe(-5);
    expect(clamp(-15, -10, -1)).toBe(-10);
    expect(clamp(0, -10, -1)).toBe(-1);
  });
});

describe('lerp', () => {
  it('t=0 returns a', () => {
    expect(lerp(10, 20, 0)).toBe(10);
  });

  it('t=1 returns b', () => {
    expect(lerp(10, 20, 1)).toBe(20);
  });

  it('t=0.5 returns midpoint', () => {
    expect(lerp(0, 100, 0.5)).toBe(50);
  });

  it('handles extrapolation (t > 1)', () => {
    expect(lerp(0, 10, 2)).toBe(20);
  });

  it('handles extrapolation (t < 0)', () => {
    expect(lerp(0, 10, -1)).toBe(-10);
  });
});

describe('inverseLerp', () => {
  it('returns 0 for value at a', () => {
    expect(inverseLerp(10, 20, 10)).toBe(0);
  });

  it('returns 1 for value at b', () => {
    expect(inverseLerp(10, 20, 20)).toBe(1);
  });

  it('returns 0.5 for midpoint', () => {
    expect(inverseLerp(0, 100, 50)).toBe(0.5);
  });

  it('returns 0 for degenerate range (a === b)', () => {
    expect(inverseLerp(5, 5, 5)).toBe(0);
  });
});

describe('remap', () => {
  it('maps correctly between ranges', () => {
    expect(remap(5, 0, 10, 0, 100)).toBe(50);
  });

  it('maps min to min', () => {
    expect(remap(0, 0, 10, 100, 200)).toBe(100);
  });

  it('maps max to max', () => {
    expect(remap(10, 0, 10, 100, 200)).toBe(200);
  });

  it('handles inverted output range', () => {
    expect(remap(0, 0, 10, 100, 0)).toBe(100);
    expect(remap(10, 0, 10, 100, 0)).toBe(0);
  });
});

describe('exponentialSmooth', () => {
  it('factor=1 jumps to target', () => {
    expect(exponentialSmooth(0, 10, 1)).toBe(10);
  });

  it('factor=0 stays at current', () => {
    expect(exponentialSmooth(5, 10, 0)).toBe(5);
  });

  it('factor=0.5 moves halfway', () => {
    expect(exponentialSmooth(0, 10, 0.5)).toBe(5);
  });

  it('clamps factor to [0,1]', () => {
    expect(exponentialSmooth(0, 10, 2)).toBe(10);
    expect(exponentialSmooth(0, 10, -1)).toBe(0);
  });
});

describe('asymmetricClamp', () => {
  it('passes through value within range', () => {
    expect(asymmetricClamp(0.01, 0.1, 0.1)).toBe(0.01);
  });

  it('clamps positive to maxPositive', () => {
    expect(asymmetricClamp(0.5, 0.1, 0.02)).toBe(0.02);
  });

  it('clamps negative to -maxNegative', () => {
    expect(asymmetricClamp(-0.5, 0.005, 0.1)).toBe(-0.005);
  });

  it('handles zero delta', () => {
    expect(asymmetricClamp(0, 0.1, 0.1)).toBe(0);
  });

  it('handles exact boundary values', () => {
    expect(asymmetricClamp(0.02, 0.005, 0.02)).toBe(0.02);
    expect(asymmetricClamp(-0.005, 0.005, 0.02)).toBe(-0.005);
  });
});

describe('isFiniteNumber', () => {
  it('returns true for finite numbers', () => {
    expect(isFiniteNumber(0)).toBe(true);
    expect(isFiniteNumber(42)).toBe(true);
    expect(isFiniteNumber(-3.14)).toBe(true);
  });

  it('returns false for NaN', () => {
    expect(isFiniteNumber(NaN)).toBe(false);
  });

  it('returns false for Infinity', () => {
    expect(isFiniteNumber(Infinity)).toBe(false);
    expect(isFiniteNumber(-Infinity)).toBe(false);
  });

  it('returns false for non-numbers', () => {
    expect(isFiniteNumber('42')).toBe(false);
    expect(isFiniteNumber(null)).toBe(false);
    expect(isFiniteNumber(undefined)).toBe(false);
    expect(isFiniteNumber({})).toBe(false);
  });
});
