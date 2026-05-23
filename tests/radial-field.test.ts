/**
 * Tests for §F.20 Radial Field Layout Prior.
 */

import { describe, it, expect } from 'vitest';
import {
  computeBandWeights,
  computeParticleAffinity,
  computeParticleOmega,
  computeRadius,
  computeParticleLayout,
  computeFieldLayout,
  radialFieldConfigFromLookState,
} from '../src/modules/radial-field/radial-field.js';
import { RADIAL_FIELD_DEFAULTS } from '../src/modules/radial-field/types.js';

describe('radialField', () => {
  describe('computeBandWeights', () => {
    it('returns empty array for empty bands', () => {
      expect(computeBandWeights([], 0.5)).toEqual([]);
    });

    it('normalises band energies to sum to ~1', () => {
      const bands = [0.4, 0.3, 0.2, 0.1];
      const weights = computeBandWeights(bands, 0.5);
      const sum = weights.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 4);
    });

    it('higher energy bands get higher weights', () => {
      const bands = [0.8, 0.1, 0.05, 0.05];
      const weights = computeBandWeights(bands, 0.5);
      expect(weights[0]).toBeGreaterThan(weights[1] as number);
      expect(weights[1]).toBeGreaterThan(weights[2] as number);
    });

    it('centroid lift increases last band weight when centroid is high', () => {
      const bands = [0.25, 0.25, 0.25, 0.25];
      const lowCentroid = computeBandWeights(bands, 0);
      const highCentroid = computeBandWeights(bands, 1);
      // With high centroid, last band weight should be higher
      expect(highCentroid[3]).toBeGreaterThan(lowCentroid[3] as number);
    });

    it('centroid lift with zero centroid reduces last band', () => {
      const bands = [0.25, 0.25, 0.25, 0.25];
      const weights = computeBandWeights(bands, 0);
      // centroid=0 → lift = 0.5, so last band is halved then renorm'd
      expect(weights[3]).toBeLessThan(0.25);
    });
  });

  describe('computeParticleAffinity', () => {
    it('returns empty array for zero bands', () => {
      expect(computeParticleAffinity(42, 0)).toEqual([]);
    });

    it('normalises to sum 1', () => {
      const aff = computeParticleAffinity(42, 8);
      const sum = aff.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 6);
    });

    it('is deterministic for same seed', () => {
      const a = computeParticleAffinity(99, 8);
      const b = computeParticleAffinity(99, 8);
      expect(a).toEqual(b);
    });

    it('different seeds produce different affinities', () => {
      const a = computeParticleAffinity(1, 8);
      const b = computeParticleAffinity(2, 8);
      const same = a.every((v, i) => Math.abs(v - (b[i] as number)) < 0.001);
      expect(same).toBe(false);
    });

    it('all values are non-negative', () => {
      for (let seed = 0; seed < 50; seed++) {
        const aff = computeParticleAffinity(seed, 8);
        for (const v of aff) {
          expect(v).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });

  describe('computeParticleOmega', () => {
    it('returns 0 for zero affinities and weights', () => {
      expect(computeParticleOmega([], [])).toBe(0);
    });

    it('returns weighted sum', () => {
      const affinity = [0.5, 0.5];
      const weights = [0.3, 0.7];
      const omega = computeParticleOmega(affinity, weights);
      expect(omega).toBeCloseTo(0.5, 4);
    });

    it('clamps result to [0,1]', () => {
      const omega = computeParticleOmega([1, 1], [0.6, 0.6]);
      expect(omega).toBeLessThanOrEqual(1);
      expect(omega).toBeGreaterThanOrEqual(0);
    });
  });

  describe('computeRadius', () => {
    it('returns baseRadius when omega=0', () => {
      expect(computeRadius(0, 1.0, 0.5)).toBeCloseTo(1.0, 6);
    });

    it('returns smaller radius for higher omega (centre bias)', () => {
      const r_low = computeRadius(0.2, 1.0, 0.5);
      const r_high = computeRadius(0.8, 1.0, 0.5);
      expect(r_high).toBeLessThan(r_low);
    });

    it('higher foveal bias increases centre pull', () => {
      const omega = 0.5;
      const r_low_bias = computeRadius(omega, 1.0, 0.2);
      const r_high_bias = computeRadius(omega, 1.0, 0.9);
      expect(r_high_bias).toBeLessThan(r_low_bias);
    });

    it('zero foveal bias means uniform radius (no power curve)', () => {
      const r = computeRadius(0.5, 1.0, 0);
      // exponent = 0 → (1−ω)^0 = 1 → R = baseRadius
      expect(r).toBeCloseTo(1.0, 6);
    });

    it('respects baseRadius scaling', () => {
      const r1 = computeRadius(0.3, 0.5, 0.5);
      const r2 = computeRadius(0.3, 1.0, 0.5);
      expect(r2).toBeCloseTo(r1 * 2, 4);
    });
  });

  describe('computeParticleLayout', () => {
    it('returns valid x,y coordinates', () => {
      const weights = [0.3, 0.2, 0.3, 0.2];
      const layout = computeParticleLayout(0, weights, RADIAL_FIELD_DEFAULTS, 0.8);
      expect(typeof layout.x).toBe('number');
      expect(typeof layout.y).toBe('number');
      expect(Number.isFinite(layout.x)).toBe(true);
      expect(Number.isFinite(layout.y)).toBe(true);
    });

    it('is deterministic', () => {
      const weights = [0.25, 0.25, 0.25, 0.25];
      const a = computeParticleLayout(42, weights, RADIAL_FIELD_DEFAULTS, 0.8);
      const b = computeParticleLayout(42, weights, RADIAL_FIELD_DEFAULTS, 0.8);
      expect(a.x).toBe(b.x);
      expect(a.y).toBe(b.y);
    });

    it('stereo asymmetry of 0 produces no offset (mono default)', () => {
      const config = { fovealFrequencyBias: 0.5, stereoAsymmetryBal: 0 };
      const layout = computeParticleLayout(0, [0.5, 0.5], config, 0.8);
      // Angle should be purely from the deterministic base angle
      expect(Number.isFinite(layout.angle)).toBe(true);
    });

    it('stereo asymmetry shifts angle', () => {
      const configMono = { fovealFrequencyBias: 0.5, stereoAsymmetryBal: 0 };
      const configStereo = { fovealFrequencyBias: 0.5, stereoAsymmetryBal: 0.5 };
      const weights = [0.5, 0.5];
      const a = computeParticleLayout(0, weights, configMono, 0.8);
      const b = computeParticleLayout(0, weights, configStereo, 0.8);
      // The angle should differ due to stereo offset
      expect(Math.abs(a.angle - b.angle)).toBeGreaterThan(0);
    });
  });

  describe('computeFieldLayout', () => {
    it('returns correct number of particles', () => {
      const layout = computeFieldLayout(50, [0.3, 0.2, 0.3, 0.2], RADIAL_FIELD_DEFAULTS, 0.8);
      expect(layout.length).toBe(50);
    });

    it('all particles have valid coordinates', () => {
      const layout = computeFieldLayout(100, [0.4, 0.3, 0.2, 0.1], RADIAL_FIELD_DEFAULTS, 0.8);
      for (const p of layout) {
        expect(Number.isFinite(p.x)).toBe(true);
        expect(Number.isFinite(p.y)).toBe(true);
        expect(Number.isFinite(p.radiusFraction)).toBe(true);
        expect(Number.isFinite(p.angle)).toBe(true);
      }
    });

    it('returns empty array for zero particle count', () => {
      expect(computeFieldLayout(0, [0.5, 0.5], RADIAL_FIELD_DEFAULTS, 0.8)).toEqual([]);
    });
  });

  describe('radialFieldConfigFromLookState', () => {
    it('uses defaults when state is empty', () => {
      const config = radialFieldConfigFromLookState({});
      expect(config.fovealFrequencyBias).toBe(RADIAL_FIELD_DEFAULTS.fovealFrequencyBias);
      expect(config.stereoAsymmetryBal).toBe(RADIAL_FIELD_DEFAULTS.stereoAsymmetryBal);
    });

    it('reads from look state keys', () => {
      const config = radialFieldConfigFromLookState({
        'field.fovealFrequencyBias': 0.8,
        'field.stereoAsymmetryBal': 0.3,
      });
      expect(config.fovealFrequencyBias).toBe(0.8);
      expect(config.stereoAsymmetryBal).toBe(0.3);
    });

    it('clamps values to [0,1]', () => {
      const config = radialFieldConfigFromLookState({
        'field.fovealFrequencyBias': 1.5,
        'field.stereoAsymmetryBal': -0.2,
      });
      expect(config.fovealFrequencyBias).toBe(1);
      expect(config.stereoAsymmetryBal).toBe(0);
    });
  });

  describe('§F.20.1 mono harness: stereo delta = 0', () => {
    it('mono: stereoAsymmetryBal=0 produces symmetric layout', () => {
      const config = { fovealFrequencyBias: 0.5, stereoAsymmetryBal: 0 };
      const weights = [0.25, 0.25, 0.25, 0.25];
      const layout = computeFieldLayout(100, weights, config, 0.8);
      // With stereo=0, layout should still be deterministically distributed
      // Check that centroid of all particles is near (0,0) for symmetric distribution
      const sumX = layout.reduce((acc, p) => acc + p.x, 0);
      const sumY = layout.reduce((acc, p) => acc + p.y, 0);
      // With many particles, mean should be near 0 (circular distribution)
      expect(Math.abs(sumX / 100)).toBeLessThan(0.3);
      expect(Math.abs(sumY / 100)).toBeLessThan(0.3);
    });
  });
});
