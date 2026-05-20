/**
 * Tests for the Quality Ladder system.
 */

import { describe, it, expect } from 'vitest';
import {
  createQualityLadderState,
  getQualityConfig,
  setQualityTier,
  qualityLadderTick,
  applyQualityToPresetValues,
} from '../src/render/quality-ladder.js';

describe('QualityLadderState', () => {
  it('creates with the specified tier', () => {
    const state = createQualityLadderState('high');
    expect(state.currentTier).toBe('high');
    expect(state.manualOverride).toBe(false);
    expect(state.fpsHistory).toEqual([]);
  });

  it('defaults to high tier', () => {
    const state = createQualityLadderState();
    expect(state.currentTier).toBe('high');
  });
});

describe('getQualityConfig', () => {
  it('returns valid config for all tiers', () => {
    const tiers = ['low', 'medium', 'high', 'ultra'] as const;
    for (const tier of tiers) {
      const config = getQualityConfig(tier);
      expect(config.particleMultiplier).toBeGreaterThan(0);
      expect(config.maxBloomPasses).toBeGreaterThanOrEqual(0);
      expect(typeof config.starburstEnabled).toBe('boolean');
      expect(typeof config.trailsEnabled).toBe('boolean');
      expect(config.segmentMultiplier).toBeGreaterThan(0);
      expect(typeof config.chromaEnabled).toBe('boolean');
      expect(config.glowQuality).toBeGreaterThan(0);
    }
  });

  it('ultra has highest particle multiplier', () => {
    expect(getQualityConfig('ultra').particleMultiplier).toBeGreaterThan(
      getQualityConfig('low').particleMultiplier,
    );
  });

  it('low disables expensive features', () => {
    const low = getQualityConfig('low');
    expect(low.starburstEnabled).toBe(false);
    expect(low.trailsEnabled).toBe(false);
    expect(low.chromaEnabled).toBe(false);
    expect(low.maxBloomPasses).toBe(0);
  });
});

describe('setQualityTier', () => {
  it('sets tier and manual override', () => {
    const state = createQualityLadderState('high');
    setQualityTier(state, 'low', true);
    expect(state.currentTier).toBe('low');
    expect(state.manualOverride).toBe(true);
  });

  it('clears fps history on change', () => {
    const state = createQualityLadderState('high');
    state.fpsHistory = [60, 60, 60];
    setQualityTier(state, 'medium', false);
    expect(state.fpsHistory).toEqual([]);
  });
});

describe('qualityLadderTick', () => {
  it('does not adjust when manually overridden', () => {
    const state = createQualityLadderState('ultra');
    state.manualOverride = true;

    // Feed low fps
    for (let i = 0; i < 30; i++) {
      qualityLadderTick(state, 20, i * 200);
    }

    expect(state.currentTier).toBe('ultra');
  });

  it('downgrades on sustained low fps', () => {
    const state = createQualityLadderState('high');

    for (let i = 0; i < 30; i++) {
      qualityLadderTick(state, 30, i * 200);
    }

    expect(state.currentTier).toBe('medium');
  });

  it('upgrades on sustained high fps', () => {
    const state = createQualityLadderState('low');
    state.lastAdjustmentTime = 0;

    // Feed high fps — should upgrade at least one tier
    for (let i = 0; i < 20; i++) {
      qualityLadderTick(state, 60, 5000 + i * 200);
    }

    // Should have upgraded from low
    expect(state.currentTier).not.toBe('low');
  });
});

describe('applyQualityToPresetValues', () => {
  it('scales values with quality config', () => {
    const low = getQualityConfig('low');
    const result = applyQualityToPresetValues(low, 100, 128, 3);

    expect(result.particleCount).toBe(Math.round(100 * low.particleMultiplier));
    expect(result.segments).toBeLessThanOrEqual(128);
    expect(result.bloomPasses).toBeLessThanOrEqual(low.maxBloomPasses);
  });

  it('caps values at quality limits', () => {
    const low = getQualityConfig('low');
    const result = applyQualityToPresetValues(low, 200, 256, 5);
    expect(result.bloomPasses).toBe(0);
  });
});
