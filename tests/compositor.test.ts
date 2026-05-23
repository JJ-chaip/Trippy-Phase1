/**
 * Tests for §F.21 Three-Tier Hierarchical Presentation Compositing.
 */

import { describe, it, expect } from 'vitest';
import {
  compositorConfigFromLookState,
  computeLayerIntensity,
  computeLayerCosts,
  shouldClampSuperficial,
  smoothLayerIntensity,
} from '../src/modules/compositor/compositor.js';
import { COMPOSITOR_DEFAULTS } from '../src/modules/compositor/types.js';
import type { LayerIntensity } from '../src/modules/compositor/types.js';

const DEMO_BANDS_8 = [0.6, 0.5, 0.3, 0.25, 0.2, 0.15, 0.1, 0.05];

describe('compositor', () => {
  describe('compositorConfigFromLookState', () => {
    it('uses defaults when state is empty', () => {
      const config = compositorConfigFromLookState({});
      expect(config.layerCompositionBias).toBe(COMPOSITOR_DEFAULTS.layerCompositionBias);
      expect(config.superficialAttnWeight).toBe(COMPOSITOR_DEFAULTS.superficialAttnWeight);
    });

    it('reads from look state keys', () => {
      const config = compositorConfigFromLookState({
        'presentation.layerCompositionBias': 0.7,
        'presentation.superficialAttnWeight': 0.9,
      });
      expect(config.layerCompositionBias).toBe(0.7);
      expect(config.superficialAttnWeight).toBe(0.9);
    });

    it('clamps values to [0,1]', () => {
      const config = compositorConfigFromLookState({
        'presentation.layerCompositionBias': -0.5,
        'presentation.superficialAttnWeight': 2.0,
      });
      expect(config.layerCompositionBias).toBe(0);
      expect(config.superficialAttnWeight).toBe(1);
    });
  });

  describe('computeLayerIntensity', () => {
    it('assigns sub-bass energy to deep layer', () => {
      // Heavy sub-bass, no treble
      const bands = [0.9, 0.8, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
      const intensity = computeLayerIntensity(bands, 0, COMPOSITOR_DEFAULTS);
      expect(intensity.deep).toBeGreaterThan(0.5);
      expect(intensity.mid).toBeCloseTo(0, 1);
    });

    it('assigns mid-range energy to mid layer', () => {
      const bands = [0.0, 0.0, 0.7, 0.6, 0.5, 0.4, 0.0, 0.0];
      const intensity = computeLayerIntensity(bands, 0, COMPOSITOR_DEFAULTS);
      expect(intensity.mid).toBeGreaterThan(0.3);
    });

    it('assigns treble + flux to superficial layer', () => {
      const bands = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.5, 0.4];
      const intensity = computeLayerIntensity(bands, 0.8, COMPOSITOR_DEFAULTS);
      expect(intensity.superficial).toBeGreaterThan(0);
    });

    it('flux contributes to superficial layer', () => {
      const bands = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
      const noFlux = computeLayerIntensity(bands, 0, COMPOSITOR_DEFAULTS);
      const highFlux = computeLayerIntensity(bands, 0.9, COMPOSITOR_DEFAULTS);
      expect(highFlux.superficial).toBeGreaterThan(noFlux.superficial);
    });

    it('all intensities are in [0,1]', () => {
      const intensity = computeLayerIntensity(DEMO_BANDS_8, 0.5, COMPOSITOR_DEFAULTS);
      expect(intensity.deep).toBeGreaterThanOrEqual(0);
      expect(intensity.deep).toBeLessThanOrEqual(1);
      expect(intensity.mid).toBeGreaterThanOrEqual(0);
      expect(intensity.mid).toBeLessThanOrEqual(1);
      expect(intensity.superficial).toBeGreaterThanOrEqual(0);
      expect(intensity.superficial).toBeLessThanOrEqual(1);
    });

    it('composition bias shifts energy toward superficial when high', () => {
      const configLow = { layerCompositionBias: 0, superficialAttnWeight: 0.6 };
      const configHigh = { layerCompositionBias: 1, superficialAttnWeight: 0.6 };
      const bands = [0.4, 0.4, 0.3, 0.3, 0.2, 0.2, 0.3, 0.3];
      const intensityLow = computeLayerIntensity(bands, 0.3, configLow);
      const intensityHigh = computeLayerIntensity(bands, 0.3, configHigh);
      expect(intensityHigh.superficial).toBeGreaterThanOrEqual(intensityLow.superficial);
    });

    it('superficialAttnWeight scales superficial intensity', () => {
      const configLow = { layerCompositionBias: 0.5, superficialAttnWeight: 0.1 };
      const configHigh = { layerCompositionBias: 0.5, superficialAttnWeight: 1.0 };
      const bands = [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.5, 0.5];
      const intensityLow = computeLayerIntensity(bands, 0.5, configLow);
      const intensityHigh = computeLayerIntensity(bands, 0.5, configHigh);
      expect(intensityHigh.superficial).toBeGreaterThan(intensityLow.superficial);
    });

    it('handles empty bands gracefully', () => {
      const intensity = computeLayerIntensity([], 0, COMPOSITOR_DEFAULTS);
      expect(intensity.deep).toBe(0);
      expect(intensity.mid).toBe(0);
    });
  });

  describe('computeLayerCosts', () => {
    it('deep layer cost primarily on vram axis', () => {
      const intensity: LayerIntensity = { deep: 0.8, mid: 0, superficial: 0 };
      const costs = computeLayerCosts(intensity, COMPOSITOR_DEFAULTS);
      expect(costs.deep.vram).toBeGreaterThan(costs.deep.cpu);
      expect(costs.deep.vram).toBeGreaterThan(costs.deep.gpu);
    });

    it('mid layer cost balanced between cpu and gpu', () => {
      const intensity: LayerIntensity = { deep: 0, mid: 0.8, superficial: 0 };
      const costs = computeLayerCosts(intensity, COMPOSITOR_DEFAULTS);
      expect(costs.mid.gpu).toBeGreaterThan(0);
      expect(costs.mid.cpu).toBeGreaterThan(0);
    });

    it('superficial cost scales with superficialAttnWeight', () => {
      const intensity: LayerIntensity = { deep: 0, mid: 0, superficial: 0.8 };
      const lowConfig = { layerCompositionBias: 0.5, superficialAttnWeight: 0.2 };
      const highConfig = { layerCompositionBias: 0.5, superficialAttnWeight: 1.0 };
      const lowCost = computeLayerCosts(intensity, lowConfig);
      const highCost = computeLayerCosts(intensity, highConfig);
      expect(highCost.superficial.gpu).toBeGreaterThan(lowCost.superficial.gpu);
    });

    it('total cost is sum of all layers', () => {
      const intensity: LayerIntensity = { deep: 0.5, mid: 0.3, superficial: 0.4 };
      const costs = computeLayerCosts(intensity, COMPOSITOR_DEFAULTS);
      expect(costs.total.cpu).toBeCloseTo(
        costs.deep.cpu + costs.mid.cpu + costs.superficial.cpu,
        6,
      );
      expect(costs.total.gpu).toBeCloseTo(
        costs.deep.gpu + costs.mid.gpu + costs.superficial.gpu,
        6,
      );
    });

    it('zero intensity produces zero cost', () => {
      const intensity: LayerIntensity = { deep: 0, mid: 0, superficial: 0 };
      const costs = computeLayerCosts(intensity, COMPOSITOR_DEFAULTS);
      expect(costs.total.cpu).toBe(0);
      expect(costs.total.gpu).toBe(0);
      expect(costs.total.vram).toBe(0);
    });
  });

  describe('shouldClampSuperficial', () => {
    it('returns false when gpu is within budget', () => {
      const intensity: LayerIntensity = { deep: 0.1, mid: 0.1, superficial: 0.1 };
      const costs = computeLayerCosts(intensity, COMPOSITOR_DEFAULTS);
      expect(shouldClampSuperficial(costs, 100)).toBe(false);
    });

    it('returns true when superficial gpu exceeds 40% of ceiling', () => {
      const intensity: LayerIntensity = { deep: 0, mid: 0, superficial: 1 };
      const config = { layerCompositionBias: 0.5, superficialAttnWeight: 1.0 };
      const costs = computeLayerCosts(intensity, config);
      // sup gpu = 3.0 * 1 * 1 = 3; ceiling * 0.4 = 4 → not clamped at ceiling=100
      // but at ceiling=5, 5*0.4=2 < 3 → clamped
      expect(shouldClampSuperficial(costs, 5)).toBe(true);
    });
  });

  describe('smoothLayerIntensity', () => {
    it('moves current toward target', () => {
      const current: LayerIntensity = { deep: 0, mid: 0, superficial: 0 };
      const target: LayerIntensity = { deep: 1, mid: 1, superficial: 1 };
      const result = smoothLayerIntensity(current, target, 0.1);
      expect(result.deep).toBeGreaterThan(0);
      expect(result.mid).toBeGreaterThan(0);
      expect(result.superficial).toBeGreaterThan(0);
    });

    it('deep layer smooths slower than superficial', () => {
      const current: LayerIntensity = { deep: 0, mid: 0, superficial: 0 };
      const target: LayerIntensity = { deep: 1, mid: 1, superficial: 1 };
      const result = smoothLayerIntensity(current, target, 0.05);
      expect(result.superficial).toBeGreaterThan(result.deep);
    });

    it('converges to target over time', () => {
      let current: LayerIntensity = { deep: 0, mid: 0, superficial: 0 };
      const target: LayerIntensity = { deep: 0.7, mid: 0.5, superficial: 0.3 };
      for (let i = 0; i < 200; i++) {
        current = smoothLayerIntensity(current, target, 0.016);
      }
      expect(current.deep).toBeCloseTo(target.deep, 2);
      expect(current.mid).toBeCloseTo(target.mid, 2);
      expect(current.superficial).toBeCloseTo(target.superficial, 2);
    });

    it('does not overshoot', () => {
      const current: LayerIntensity = { deep: 0, mid: 0, superficial: 0 };
      const target: LayerIntensity = { deep: 0.5, mid: 0.5, superficial: 0.5 };
      const result = smoothLayerIntensity(current, target, 1.0);
      expect(result.deep).toBeLessThanOrEqual(target.deep);
      expect(result.mid).toBeLessThanOrEqual(target.mid);
      expect(result.superficial).toBeLessThanOrEqual(target.superficial);
    });
  });

  describe('§F.21.1 per-layer cost attribution', () => {
    it('validator can reject gpuFill explosions when superficial + heavy recipes stack', () => {
      const intensity: LayerIntensity = { deep: 0.8, mid: 0.9, superficial: 1.0 };
      const aggressiveConfig = { layerCompositionBias: 1.0, superficialAttnWeight: 1.0 };
      const costs = computeLayerCosts(intensity, aggressiveConfig);
      // Total GPU cost should be significant
      expect(costs.total.gpu).toBeGreaterThan(3);
      // The relief suggestion: reduce superficialAttnWeight
      const clampedConfig = { ...aggressiveConfig, superficialAttnWeight: 0.3 };
      const reducedCosts = computeLayerCosts(intensity, clampedConfig);
      expect(reducedCosts.total.gpu).toBeLessThan(costs.total.gpu);
    });
  });
});
