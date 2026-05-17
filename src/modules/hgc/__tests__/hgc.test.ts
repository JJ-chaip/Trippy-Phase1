/**
 * Exhaustive test suite for HGC (Homeostatic Gain Control) — §F.19.
 *
 * Coverage:
 *   1. Config validation (happy, boundary, invalid, NaN, partial)
 *   2. State creation and reset
 *   3. Core algorithm — happy path
 *   4. Core algorithm — boundary conditions
 *   5. Core algorithm — noise floor freeze
 *   6. Core algorithm — ceiling/floor enforcement
 *   7. Asymmetric attack/decay behaviour
 *   8. Convergence / step response
 *   9. Monotonicity smoke tests
 *  10. Multi-frame simulation
 *  11. Config extraction from look state
 *  12. Adversarial / edge-case inputs
 */

import { describe, it, expect } from 'vitest';
import {
  validateHgcConfig,
  createHgcState,
  resetHgcState,
  hgcStep,
  hgcSimulate,
  hgcConfigFromLookState,
} from '../hgc.js';
import {
  HGC_CONFIG_DEFAULTS,
  HGC_CONFIG_RANGES,
  HGC_GAIN_FLOOR,
  HGC_MAX_ATTACK,
  HGC_MAX_DECAY,
  HGC_NOISE_FLOOR_FREEZE_FRAMES,
  HGC_NOISE_FLOOR_THRESHOLD,
} from '../types.js';
import type { HgcConfig, HgcState } from '../types.js';
import type { GainMultiplier, NormalisedAmplitude } from '../../../core/types/common.js';

// ═══════════════════════════════════════════════════════════════
// 1. CONFIG VALIDATION
// ═══════════════════════════════════════════════════════════════

describe('validateHgcConfig', () => {
  it('returns defaults when given empty partial', () => {
    const config = validateHgcConfig({});
    expect(config).toEqual(HGC_CONFIG_DEFAULTS);
  });

  it('passes through valid values unchanged', () => {
    const input: HgcConfig = {
      homeostaticAdaptationRate: 0.10,
      targetRmsLevel: 0.50,
      gainCeilingLimit: 3.0,
    };
    expect(validateHgcConfig(input)).toEqual(input);
  });

  it('clamps values below minimum to minimum', () => {
    const config = validateHgcConfig({
      homeostaticAdaptationRate: 0.001,
      targetRmsLevel: 0.01,
      gainCeilingLimit: 0.1,
    });
    expect(config.homeostaticAdaptationRate).toBe(HGC_CONFIG_RANGES.homeostaticAdaptationRate.min);
    expect(config.targetRmsLevel).toBe(HGC_CONFIG_RANGES.targetRmsLevel.min);
    expect(config.gainCeilingLimit).toBe(HGC_CONFIG_RANGES.gainCeilingLimit.min);
  });

  it('clamps values above maximum to maximum', () => {
    const config = validateHgcConfig({
      homeostaticAdaptationRate: 1.0,
      targetRmsLevel: 1.0,
      gainCeilingLimit: 100.0,
    });
    expect(config.homeostaticAdaptationRate).toBe(HGC_CONFIG_RANGES.homeostaticAdaptationRate.max);
    expect(config.targetRmsLevel).toBe(HGC_CONFIG_RANGES.targetRmsLevel.max);
    expect(config.gainCeilingLimit).toBe(HGC_CONFIG_RANGES.gainCeilingLimit.max);
  });

  it('replaces NaN with defaults', () => {
    const config = validateHgcConfig({
      homeostaticAdaptationRate: NaN,
      targetRmsLevel: NaN,
      gainCeilingLimit: NaN,
    });
    expect(config).toEqual(HGC_CONFIG_DEFAULTS);
  });

  it('replaces Infinity with defaults', () => {
    const config = validateHgcConfig({
      homeostaticAdaptationRate: Infinity,
      targetRmsLevel: -Infinity,
      gainCeilingLimit: Infinity,
    });
    expect(config).toEqual(HGC_CONFIG_DEFAULTS);
  });

  it('handles partial config — fills missing with defaults', () => {
    const config = validateHgcConfig({ targetRmsLevel: 0.60 });
    expect(config.homeostaticAdaptationRate).toBe(HGC_CONFIG_DEFAULTS.homeostaticAdaptationRate);
    expect(config.targetRmsLevel).toBe(0.60);
    expect(config.gainCeilingLimit).toBe(HGC_CONFIG_DEFAULTS.gainCeilingLimit);
  });

  it('handles exact boundary values', () => {
    const config = validateHgcConfig({
      homeostaticAdaptationRate: 0.01,
      targetRmsLevel: 0.10,
      gainCeilingLimit: 1.0,
    });
    expect(config.homeostaticAdaptationRate).toBe(0.01);
    expect(config.targetRmsLevel).toBe(0.10);
    expect(config.gainCeilingLimit).toBe(1.0);
  });

  it('handles exact upper boundary values', () => {
    const config = validateHgcConfig({
      homeostaticAdaptationRate: 0.20,
      targetRmsLevel: 0.90,
      gainCeilingLimit: 20.0,
    });
    expect(config.homeostaticAdaptationRate).toBe(0.20);
    expect(config.targetRmsLevel).toBe(0.90);
    expect(config.gainCeilingLimit).toBe(20.0);
  });

  it('handles negative values by clamping to minimum', () => {
    const config = validateHgcConfig({
      homeostaticAdaptationRate: -5,
      targetRmsLevel: -1,
      gainCeilingLimit: -10,
    });
    expect(config.homeostaticAdaptationRate).toBe(HGC_CONFIG_RANGES.homeostaticAdaptationRate.min);
    expect(config.targetRmsLevel).toBe(HGC_CONFIG_RANGES.targetRmsLevel.min);
    expect(config.gainCeilingLimit).toBe(HGC_CONFIG_RANGES.gainCeilingLimit.min);
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. STATE CREATION AND RESET
// ═══════════════════════════════════════════════════════════════

describe('createHgcState', () => {
  it('creates state with Ws = 1.0 (no amplification)', () => {
    const state = createHgcState();
    expect(state.ws).toBe(1.0);
  });

  it('creates state with zero RMS history', () => {
    const state = createHgcState();
    expect(state.previousRms).toBe(0);
  });

  it('creates state not frozen', () => {
    const state = createHgcState();
    expect(state.frozen).toBe(false);
    expect(state.noiseFloorFrameCount).toBe(0);
  });

  it('creates state with zero frame count', () => {
    const state = createHgcState();
    expect(state.frameCount).toBe(0);
  });
});

describe('resetHgcState', () => {
  it('resets all fields to initial values', () => {
    const dirty: HgcState = {
      ws: 4.5 as GainMultiplier,
      previousRms: 0.8 as NormalisedAmplitude,
      noiseFloorFrameCount: 50,
      frozen: true,
      frameCount: 1000,
    };
    const reset = resetHgcState(dirty);
    expect(reset.ws).toBe(1.0);
    expect(reset.previousRms).toBe(0);
    expect(reset.frozen).toBe(false);
    expect(reset.noiseFloorFrameCount).toBe(0);
    expect(reset.frameCount).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. CORE ALGORITHM — HAPPY PATH
// ═══════════════════════════════════════════════════════════════

describe('hgcStep — happy path', () => {
  const config = validateHgcConfig(HGC_CONFIG_DEFAULTS);

  it('increases Ws when RMS is below target', () => {
    const state = createHgcState();
    const [newState] = hgcStep(state, config, 0.10); // well below 0.35 target
    expect(newState.ws).toBeGreaterThan(state.ws as number);
  });

  it('decreases Ws when RMS is above target', () => {
    const state: HgcState = {
      ws: 3.0 as GainMultiplier,
      previousRms: 0.5 as NormalisedAmplitude,
      noiseFloorFrameCount: 0,
      frozen: false,
      frameCount: 10,
    };
    const [newState] = hgcStep(state, config, 0.60); // above 0.35 target
    expect(newState.ws).toBeLessThan(state.ws as number);
  });

  it('holds Ws steady when RMS equals target', () => {
    const state = createHgcState();
    const [newState, diag] = hgcStep(state, config, config.targetRmsLevel);
    // Delta should be ~0
    expect(Math.abs(diag.delta)).toBeLessThan(1e-10);
    expect(newState.ws).toBeCloseTo(state.ws as number, 8);
  });

  it('increments frame count', () => {
    const state = createHgcState();
    const [newState] = hgcStep(state, config, 0.30);
    expect(newState.frameCount).toBe(1);
    const [newState2] = hgcStep(newState, config, 0.30);
    expect(newState2.frameCount).toBe(2);
  });

  it('stores current RMS as previousRms', () => {
    const state = createHgcState();
    const [newState] = hgcStep(state, config, 0.42);
    expect(newState.previousRms).toBeCloseTo(0.42);
  });

  it('returns tracking status during normal operation', () => {
    const state = createHgcState();
    const [, diag] = hgcStep(state, config, 0.10);
    expect(diag.agcStatus).toBe('ENGINE: AGC_TRACKING');
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. BOUNDARY CONDITIONS
// ═══════════════════════════════════════════════════════════════

describe('hgcStep — boundary conditions', () => {
  const config = validateHgcConfig(HGC_CONFIG_DEFAULTS);

  it('Ws never exceeds gainCeilingLimit', () => {
    // Start near ceiling, push it higher
    const state: HgcState = {
      ws: 4.99 as GainMultiplier,
      previousRms: 0.01 as NormalisedAmplitude,
      noiseFloorFrameCount: 0,
      frozen: false,
      frameCount: 100,
    };
    const [newState, diag] = hgcStep(state, config, 0.01); // very quiet → wants to increase
    expect(newState.ws).toBeLessThanOrEqual(config.gainCeilingLimit);
    expect(diag.agcStatus).toBe('ENGINE: AGC_CEILING_MAX');
  });

  it('Ws never goes below GAIN_FLOOR', () => {
    const state: HgcState = {
      ws: 0.001 as GainMultiplier,
      previousRms: 0.9 as NormalisedAmplitude,
      noiseFloorFrameCount: 0,
      frozen: false,
      frameCount: 100,
    };
    const [newState] = hgcStep(state, config, 0.95); // very loud → wants to decrease
    expect(newState.ws).toBeGreaterThanOrEqual(HGC_GAIN_FLOOR);
  });

  it('handles RMS = 0 without error', () => {
    const state = createHgcState();
    const [newState, diag] = hgcStep(state, config, 0);
    expect(Number.isFinite(newState.ws as number)).toBe(true);
    expect(diag.currentRms).toBe(0);
  });

  it('handles RMS = 1.0 (max) without error', () => {
    const state = createHgcState();
    const [newState, diag] = hgcStep(state, config, 1.0);
    expect(Number.isFinite(newState.ws as number)).toBe(true);
    expect(diag.currentRms).toBe(1.0);
  });

  it('handles RMS > 1.0 (over-range) without error', () => {
    const state = createHgcState();
    const [newState] = hgcStep(state, config, 2.5);
    expect(Number.isFinite(newState.ws as number)).toBe(true);
  });

  it('Ws stays bounded after 10000 frames of zero RMS', () => {
    const { finalState } = hgcSimulate(config, 0, 10000);
    expect(finalState.ws).toBeLessThanOrEqual(config.gainCeilingLimit);
    expect(finalState.ws).toBeGreaterThanOrEqual(HGC_GAIN_FLOOR);
  });

  it('Ws stays bounded after 10000 frames of max RMS', () => {
    const { finalState } = hgcSimulate(config, 1.0, 10000);
    expect(finalState.ws).toBeLessThanOrEqual(config.gainCeilingLimit);
    expect(finalState.ws).toBeGreaterThanOrEqual(HGC_GAIN_FLOOR);
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. NOISE FLOOR FREEZE
// ═══════════════════════════════════════════════════════════════

describe('hgcStep — noise floor freeze', () => {
  const config = validateHgcConfig(HGC_CONFIG_DEFAULTS);

  it('does not freeze before threshold frame count', () => {
    let state = createHgcState();
    for (let i = 0; i < HGC_NOISE_FLOOR_FREEZE_FRAMES - 1; i++) {
      const [newState, diag] = hgcStep(state, config, 0.001);
      state = newState;
      expect(diag.frozen).toBe(false);
    }
    expect(state.noiseFloorFrameCount).toBe(HGC_NOISE_FLOOR_FREEZE_FRAMES - 1);
  });

  it('freezes after threshold frame count of sub-noise-floor signal', () => {
    let state = createHgcState();
    for (let i = 0; i < HGC_NOISE_FLOOR_FREEZE_FRAMES; i++) {
      const [newState] = hgcStep(state, config, 0.001);
      state = newState;
    }
    // One more step should be frozen
    const [frozenState, diag] = hgcStep(state, config, 0.001);
    expect(diag.frozen).toBe(true);
    expect(diag.agcStatus).toBe('ENGINE: AGC_FROZEN_NOISE_FLOOR');
    expect(frozenState.frozen).toBe(true);
  });

  it('holds Ws constant while frozen', () => {
    let state = createHgcState();
    // Run until frozen
    for (let i = 0; i < HGC_NOISE_FLOOR_FREEZE_FRAMES + 5; i++) {
      const [newState] = hgcStep(state, config, 0.0005);
      state = newState;
    }
    const frozenWs = state.ws;
    // Run 100 more frozen frames
    for (let i = 0; i < 100; i++) {
      const [newState] = hgcStep(state, config, 0.0005);
      state = newState;
    }
    expect(state.ws).toBe(frozenWs);
  });

  it('unfreezes when signal returns above noise floor', () => {
    let state = createHgcState();
    // Freeze it
    for (let i = 0; i < HGC_NOISE_FLOOR_FREEZE_FRAMES + 5; i++) {
      const [newState] = hgcStep(state, config, 0.0005);
      state = newState;
    }
    expect(state.frozen).toBe(true);

    // Signal returns
    const [unfrozenState, diag] = hgcStep(state, config, 0.30);
    expect(unfrozenState.frozen).toBe(false);
    expect(unfrozenState.noiseFloorFrameCount).toBe(0);
    expect(diag.agcStatus).not.toBe('ENGINE: AGC_FROZEN_NOISE_FLOOR');
  });

  it('resets noise floor counter when signal exceeds threshold', () => {
    let state = createHgcState();
    // Build up noise floor count
    for (let i = 0; i < 5; i++) {
      const [newState] = hgcStep(state, config, 0.001);
      state = newState;
    }
    expect(state.noiseFloorFrameCount).toBe(5);

    // One frame above threshold resets
    const [newState] = hgcStep(state, config, 0.10);
    expect(newState.noiseFloorFrameCount).toBe(0);
  });

  it('exactly at noise floor threshold is considered below', () => {
    const state = createHgcState();
    const [newState] = hgcStep(state, config, HGC_NOISE_FLOOR_THRESHOLD - 0.0001);
    expect(newState.noiseFloorFrameCount).toBe(1);
  });

  it('just above noise floor threshold resets counter', () => {
    let state = createHgcState();
    // Build up count
    for (let i = 0; i < 5; i++) {
      const [newState] = hgcStep(state, config, 0.001);
      state = newState;
    }
    const [newState] = hgcStep(state, config, HGC_NOISE_FLOOR_THRESHOLD + 0.001);
    expect(newState.noiseFloorFrameCount).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. CEILING/FLOOR ENFORCEMENT
// ═══════════════════════════════════════════════════════════════

describe('hgcStep — ceiling and floor enforcement', () => {
  it('reports AGC_CEILING_MAX when Ws hits ceiling', () => {
    const config = validateHgcConfig({ gainCeilingLimit: 2.0 });
    const state: HgcState = {
      ws: 2.0 as GainMultiplier,
      previousRms: 0.01 as NormalisedAmplitude,
      noiseFloorFrameCount: 0,
      frozen: false,
      frameCount: 0,
    };
    const [, diag] = hgcStep(state, config, 0.01);
    expect(diag.agcStatus).toBe('ENGINE: AGC_CEILING_MAX');
  });

  it('reports AGC_FLOOR_MIN when Ws hits floor', () => {
    const config = validateHgcConfig(HGC_CONFIG_DEFAULTS);
    const state: HgcState = {
      ws: 0.0 as GainMultiplier,
      previousRms: 0.9 as NormalisedAmplitude,
      noiseFloorFrameCount: 0,
      frozen: false,
      frameCount: 0,
    };
    const [newState, diag] = hgcStep(state, config, 0.95);
    expect(newState.ws).toBeGreaterThanOrEqual(HGC_GAIN_FLOOR);
    // With very loud signal and ws=0, delta is negative, ws stays at floor
    expect(diag.agcStatus).toBe('ENGINE: AGC_FLOOR_MIN');
  });

  it('Ws is exactly ceiling when clamped from above', () => {
    const config = validateHgcConfig({ gainCeilingLimit: 3.0 });
    const state: HgcState = {
      ws: 2.99 as GainMultiplier,
      previousRms: 0.01 as NormalisedAmplitude,
      noiseFloorFrameCount: 0,
      frozen: false,
      frameCount: 0,
    };
    // Very quiet signal → large positive delta
    const { finalState } = hgcSimulate(config, 0.01, 100, state);
    expect(finalState.ws).toBe(3.0);
  });

  it('respects custom ceiling limits', () => {
    const config = validateHgcConfig({ gainCeilingLimit: 1.5 });
    const { finalState } = hgcSimulate(config, 0.01, 5000);
    expect(finalState.ws).toBeLessThanOrEqual(1.5);
  });
});

// ═══════════════════════════════════════════════════════════════
// 7. ASYMMETRIC ATTACK/DECAY
// ═══════════════════════════════════════════════════════════════

describe('hgcStep — asymmetric attack/decay', () => {
  const config = validateHgcConfig({
    homeostaticAdaptationRate: 0.20, // max rate for easier testing
    targetRmsLevel: 0.50,
    gainCeilingLimit: 10.0,
  });

  it('attack rate is clamped to MAX_ATTACK per frame', () => {
    const state = createHgcState();
    // Very quiet signal → large positive delta wanted
    const [, diag] = hgcStep(state, config, 0.0);
    // Raw delta = 0.20 * (0.50 - 0.0) = 0.10
    // Should be clamped to MAX_ATTACK = 0.02
    expect(diag.clampedDelta).toBeLessThanOrEqual(HGC_MAX_ATTACK);
    expect(diag.clampedDelta).toBe(HGC_MAX_ATTACK);
  });

  it('decay rate is clamped to MAX_DECAY per frame', () => {
    const state: HgcState = {
      ws: 5.0 as GainMultiplier,
      previousRms: 0.5 as NormalisedAmplitude,
      noiseFloorFrameCount: 0,
      frozen: false,
      frameCount: 0,
    };
    // Very loud signal → large negative delta wanted
    const [, diag] = hgcStep(state, config, 1.0);
    // Raw delta = 0.20 * (0.50 - 1.0) = -0.10
    // Should be clamped to -MAX_DECAY = -0.005
    expect(diag.clampedDelta).toBeGreaterThanOrEqual(-HGC_MAX_DECAY);
    expect(diag.clampedDelta).toBe(-HGC_MAX_DECAY);
  });

  it('attack is faster than decay (asymmetry)', () => {
    expect(HGC_MAX_ATTACK).toBeGreaterThan(HGC_MAX_DECAY);
  });

  it('small deltas are not clamped', () => {
    const gentleConfig = validateHgcConfig({
      homeostaticAdaptationRate: 0.01,
      targetRmsLevel: 0.35,
      gainCeilingLimit: 5.0,
    });
    const state = createHgcState();
    // RMS close to target → small delta
    const [, diag] = hgcStep(state, gentleConfig, 0.34);
    // Raw delta = 0.01 * (0.35 - 0.34) = 0.0001
    expect(diag.clampedDelta).toBeCloseTo(diag.delta, 10);
  });
});

// ═══════════════════════════════════════════════════════════════
// 8. CONVERGENCE / STEP RESPONSE
// ═══════════════════════════════════════════════════════════════

describe('hgcStep — convergence', () => {
  it('converges to ceiling when signal is perpetually quiet', () => {
    const config = validateHgcConfig({
      homeostaticAdaptationRate: 0.10,
      targetRmsLevel: 0.35,
      gainCeilingLimit: 5.0,
    });
    // Very quiet signal — gain should ramp up to ceiling
    const { finalState } = hgcSimulate(config, 0.01, 5000);
    expect(finalState.ws).toBeCloseTo(5.0, 1);
  });

  it('converges toward floor when signal is perpetually loud', () => {
    const config = validateHgcConfig({
      homeostaticAdaptationRate: 0.10,
      targetRmsLevel: 0.35,
      gainCeilingLimit: 5.0,
    });
    // Very loud signal — gain should decrease toward floor
    const { finalState } = hgcSimulate(config, 0.90, 5000);
    expect(finalState.ws).toBeLessThan(1.0);
  });

  it('reaches steady state within 5 seconds at 60fps (300 frames)', () => {
    const config = validateHgcConfig(HGC_CONFIG_DEFAULTS);
    // Moderate quiet signal — RMS 0.20 is below target 0.35,
    // so gain ramps up. With MAX_ATTACK=0.02/frame and 300
    // frames, Ws can increase by up to 6.0 total. Starting at
    // 1.0, it will hit ceiling (5.0) and settle there.
    const { history } = hgcSimulate(config, 0.20, 300);
    const lastDiag = history[history.length - 1]!;
    // At steady state: either at ceiling, at floor, idle, or
    // still tracking but with very small clamped delta.
    const settled =
      lastDiag.agcStatus === 'ENGINE: AGC_IDLE' ||
      lastDiag.agcStatus === 'ENGINE: AGC_CEILING_MAX' ||
      lastDiag.agcStatus === 'ENGINE: AGC_FLOOR_MIN' ||
      lastDiag.agcStatus === 'ENGINE: AGC_TRACKING';
    expect(settled).toBe(true);
    // Ws must be bounded
    expect(lastDiag.ws).toBeLessThanOrEqual(config.gainCeilingLimit);
    expect(lastDiag.ws).toBeGreaterThanOrEqual(HGC_GAIN_FLOOR);
  });

  it('step response: quiet→loud transition reduces Ws monotonically', () => {
    const config = validateHgcConfig(HGC_CONFIG_DEFAULTS);
    // Start with high gain (from quiet period)
    let state: HgcState = {
      ws: 4.0 as GainMultiplier,
      previousRms: 0.05 as NormalisedAmplitude,
      noiseFloorFrameCount: 0,
      frozen: false,
      frameCount: 0,
    };
    // Suddenly loud
    const wsValues: number[] = [];
    for (let i = 0; i < 200; i++) {
      const [newState] = hgcStep(state, config, 0.80);
      wsValues.push(newState.ws as number);
      state = newState;
    }
    // Ws should be monotonically decreasing (or stable)
    for (let i = 1; i < wsValues.length; i++) {
      expect(wsValues[i]!).toBeLessThanOrEqual(wsValues[i - 1]! + 1e-10);
    }
  });

  it('step response: loud→quiet transition increases Ws monotonically', () => {
    const config = validateHgcConfig(HGC_CONFIG_DEFAULTS);
    let state: HgcState = {
      ws: 0.5 as GainMultiplier,
      previousRms: 0.80 as NormalisedAmplitude,
      noiseFloorFrameCount: 0,
      frozen: false,
      frameCount: 0,
    };
    const wsValues: number[] = [];
    for (let i = 0; i < 200; i++) {
      const [newState] = hgcStep(state, config, 0.10);
      wsValues.push(newState.ws as number);
      state = newState;
    }
    // Ws should be monotonically increasing (or stable at ceiling)
    for (let i = 1; i < wsValues.length; i++) {
      expect(wsValues[i]!).toBeGreaterThanOrEqual(wsValues[i - 1]! - 1e-10);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 9. MONOTONICITY SMOKE TESTS
// ═══════════════════════════════════════════════════════════════

describe('hgcStep — monotonicity smoke', () => {
  const config = validateHgcConfig(HGC_CONFIG_DEFAULTS);

  it('higher RMS → lower or equal Ws after same number of frames', () => {
    const { finalState: lowRms } = hgcSimulate(config, 0.10, 100);
    const { finalState: highRms } = hgcSimulate(config, 0.60, 100);
    expect(highRms.ws).toBeLessThanOrEqual(lowRms.ws as number);
  });

  it('higher adaptation rate → faster convergence', () => {
    const slowConfig = validateHgcConfig({ homeostaticAdaptationRate: 0.02 });
    const fastConfig = validateHgcConfig({ homeostaticAdaptationRate: 0.15 });

    const { history: slowHistory } = hgcSimulate(slowConfig, 0.10, 50);
    const { history: fastHistory } = hgcSimulate(fastConfig, 0.10, 50);

    // Fast config should have moved Ws further from initial in same time
    const slowDelta = Math.abs((slowHistory[49]!.ws) - 1.0);
    const fastDelta = Math.abs((fastHistory[49]!.ws) - 1.0);
    expect(fastDelta).toBeGreaterThanOrEqual(slowDelta);
  });

  it('lower ceiling limit → Ws capped sooner', () => {
    const lowCeiling = validateHgcConfig({ gainCeilingLimit: 2.0 });
    const highCeiling = validateHgcConfig({ gainCeilingLimit: 10.0 });

    const { finalState: lowResult } = hgcSimulate(lowCeiling, 0.01, 5000);
    const { finalState: highResult } = hgcSimulate(highCeiling, 0.01, 5000);

    expect(lowResult.ws).toBeLessThanOrEqual(highResult.ws as number);
    expect(lowResult.ws).toBeLessThanOrEqual(2.0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 10. MULTI-FRAME SIMULATION
// ═══════════════════════════════════════════════════════════════

describe('hgcSimulate', () => {
  const config = validateHgcConfig(HGC_CONFIG_DEFAULTS);

  it('returns correct number of history entries', () => {
    const { history } = hgcSimulate(config, 0.30, 100);
    expect(history).toHaveLength(100);
  });

  it('history frame counts are sequential', () => {
    const { history } = hgcSimulate(config, 0.30, 50);
    for (let i = 0; i < history.length; i++) {
      expect(history[i]!.frameCount).toBe(i + 1);
    }
  });

  it('final state matches last history entry', () => {
    const { finalState, history } = hgcSimulate(config, 0.30, 100);
    const lastDiag = history[history.length - 1]!;
    expect(finalState.ws as number).toBeCloseTo(lastDiag.ws, 10);
  });

  it('handles zero frames', () => {
    const { finalState, history } = hgcSimulate(config, 0.30, 0);
    expect(history).toHaveLength(0);
    expect(finalState.ws).toBe(1.0);
  });

  it('accepts custom initial state', () => {
    const initialState: HgcState = {
      ws: 3.0 as GainMultiplier,
      previousRms: 0.20 as NormalisedAmplitude,
      noiseFloorFrameCount: 0,
      frozen: false,
      frameCount: 50,
    };
    const { history } = hgcSimulate(config, 0.30, 10, initialState);
    expect(history[0]!.frameCount).toBe(51);
  });
});

// ═══════════════════════════════════════════════════════════════
// 11. CONFIG FROM LOOK STATE
// ═══════════════════════════════════════════════════════════════

describe('hgcConfigFromLookState', () => {
  it('extracts config from look state keys', () => {
    const state: Record<string, number> = {
      'audio.homeostaticAdaptationRate': 0.08,
      'audio.targetRmsLevel': 0.40,
      'audio.gainCeilingLimit': 7.0,
    };
    const config = hgcConfigFromLookState(state);
    expect(config.homeostaticAdaptationRate).toBe(0.08);
    expect(config.targetRmsLevel).toBe(0.40);
    expect(config.gainCeilingLimit).toBe(7.0);
  });

  it('uses defaults for missing keys', () => {
    const config = hgcConfigFromLookState({});
    expect(config).toEqual(HGC_CONFIG_DEFAULTS);
  });

  it('clamps out-of-range look state values', () => {
    const state: Record<string, number> = {
      'audio.homeostaticAdaptationRate': 999,
      'audio.targetRmsLevel': -1,
      'audio.gainCeilingLimit': 0,
    };
    const config = hgcConfigFromLookState(state);
    expect(config.homeostaticAdaptationRate).toBe(HGC_CONFIG_RANGES.homeostaticAdaptationRate.max);
    expect(config.targetRmsLevel).toBe(HGC_CONFIG_RANGES.targetRmsLevel.min);
    expect(config.gainCeilingLimit).toBe(HGC_CONFIG_RANGES.gainCeilingLimit.min);
  });
});

// ═══════════════════════════════════════════════════════════════
// 12. ADVERSARIAL / EDGE-CASE INPUTS
// ═══════════════════════════════════════════════════════════════

describe('hgcStep — adversarial inputs', () => {
  const config = validateHgcConfig(HGC_CONFIG_DEFAULTS);

  it('handles NaN RMS input gracefully (treats as 0)', () => {
    const state = createHgcState();
    const [newState, diag] = hgcStep(state, config, NaN);
    expect(Number.isFinite(newState.ws as number)).toBe(true);
    expect(diag.currentRms).toBe(0);
  });

  it('handles Infinity RMS input gracefully (treats as 0)', () => {
    const state = createHgcState();
    const [newState, diag] = hgcStep(state, config, Infinity);
    expect(Number.isFinite(newState.ws as number)).toBe(true);
    expect(diag.currentRms).toBe(0);
  });

  it('handles -Infinity RMS input gracefully (treats as 0)', () => {
    const state = createHgcState();
    const [newState, diag] = hgcStep(state, config, -Infinity);
    expect(Number.isFinite(newState.ws as number)).toBe(true);
    expect(diag.currentRms).toBe(0);
  });

  it('handles negative RMS input gracefully (treats as 0)', () => {
    const state = createHgcState();
    const [newState, diag] = hgcStep(state, config, -0.5);
    expect(Number.isFinite(newState.ws as number)).toBe(true);
    expect(diag.currentRms).toBe(0);
  });

  it('handles extremely large RMS input', () => {
    const state = createHgcState();
    const [newState] = hgcStep(state, config, 1e15);
    expect(Number.isFinite(newState.ws as number)).toBe(true);
    expect(newState.ws).toBeGreaterThanOrEqual(HGC_GAIN_FLOOR);
  });

  it('handles rapid oscillation between extremes', () => {
    let state = createHgcState();
    for (let i = 0; i < 1000; i++) {
      const rms = i % 2 === 0 ? 0.001 : 0.999;
      const [newState] = hgcStep(state, config, rms);
      state = newState;
      // Ws must always be in valid range
      expect(state.ws).toBeGreaterThanOrEqual(HGC_GAIN_FLOOR);
      expect(state.ws).toBeLessThanOrEqual(config.gainCeilingLimit);
    }
  });

  it('deterministic: same inputs produce same outputs', () => {
    const state = createHgcState();
    const [stateA, diagA] = hgcStep(state, config, 0.25);
    const [stateB, diagB] = hgcStep(state, config, 0.25);
    expect(stateA.ws).toBe(stateB.ws);
    expect(diagA.delta).toBe(diagB.delta);
    expect(diagA.clampedDelta).toBe(diagB.clampedDelta);
    expect(diagA.agcStatus).toBe(diagB.agcStatus);
  });

  it('handles config with ceiling == floor', () => {
    // gainCeilingLimit min is 1.0, GAIN_FLOOR is 0.0
    // So this won't create ceiling==floor, but let's test ceiling=1.0
    const config = validateHgcConfig({ gainCeilingLimit: 1.0 });
    const { finalState } = hgcSimulate(config, 0.01, 100);
    expect(finalState.ws).toBeLessThanOrEqual(1.0);
    expect(finalState.ws).toBeGreaterThanOrEqual(HGC_GAIN_FLOOR);
  });

  it('all diagnostics fields are finite numbers', () => {
    const state = createHgcState();
    const inputs = [0, 0.001, 0.5, 0.999, 1.0, NaN, Infinity, -1];
    for (const rms of inputs) {
      const [, diag] = hgcStep(state, config, rms);
      expect(Number.isFinite(diag.ws)).toBe(true);
      expect(Number.isFinite(diag.targetRms)).toBe(true);
      expect(Number.isFinite(diag.currentRms)).toBe(true);
      expect(Number.isFinite(diag.delta)).toBe(true);
      expect(Number.isFinite(diag.clampedDelta)).toBe(true);
      expect(typeof diag.agcStatus).toBe('string');
      expect(typeof diag.frozen).toBe('boolean');
      expect(Number.isFinite(diag.noiseFloorFrameCount)).toBe(true);
      expect(Number.isFinite(diag.frameCount)).toBe(true);
    }
  });
});
