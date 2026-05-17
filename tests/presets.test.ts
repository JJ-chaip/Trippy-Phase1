/**
 * Tests for the visual preset system.
 *
 * Validates preset structure, defaults, and extensibility.
 */

import { describe, it, expect } from 'vitest';
import {
  ALL_PRESETS,
  DEFAULT_PRESET,
  PRESET_COSMIC_BLOOM,
  PRESET_NEON_PULSE,
  PRESET_DEEP_OCEAN,
} from '../src/render/presets.js';
import type { VisualPreset } from '../src/render/presets.js';

describe('preset structure', () => {
  it.each(ALL_PRESETS.map(p => [p.id, p] as const))(
    '%s has all required fields',
    (_id, preset: VisualPreset) => {
      expect(typeof preset.id).toBe('string');
      expect(preset.id.length).toBeGreaterThan(0);
      expect(typeof preset.name).toBe('string');
      expect(preset.name.length).toBeGreaterThan(0);
      expect(typeof preset.description).toBe('string');
      expect(typeof preset.bgColor).toBe('string');
      expect(typeof preset.ringCount).toBe('number');
      expect(typeof preset.baseHue).toBe('number');
      expect(typeof preset.hueSpread).toBe('number');
      expect(typeof preset.hueRotate).toBe('boolean');
      expect(typeof preset.hueRotateSpeed).toBe('number');
      expect(typeof preset.baseRadiusFraction).toBe('number');
      expect(typeof preset.reactivity).toBe('number');
      expect(typeof preset.particleCount).toBe('number');
      expect(typeof preset.glowIntensity).toBe('number');
      expect(typeof preset.mirror).toBe('boolean');
      expect(typeof preset.lineWidth).toBe('number');
      expect(typeof preset.fillAlpha).toBe('number');
      expect(typeof preset.rotationSpeed).toBe('number');
      expect(typeof preset.segments).toBe('number');
      expect(typeof preset.waveDistortion).toBe('number');
      expect(typeof preset.pulseIntensity).toBe('number');
    },
  );
});

describe('preset value ranges', () => {
  it.each(ALL_PRESETS.map(p => [p.id, p] as const))(
    '%s has valid numeric ranges',
    (_id, preset: VisualPreset) => {
      expect(preset.ringCount).toBeGreaterThanOrEqual(1);
      expect(preset.ringCount).toBeLessThanOrEqual(32);
      expect(preset.baseHue).toBeGreaterThanOrEqual(0);
      expect(preset.baseHue).toBeLessThan(360);
      expect(preset.hueSpread).toBeGreaterThanOrEqual(0);
      expect(preset.baseRadiusFraction).toBeGreaterThan(0);
      expect(preset.baseRadiusFraction).toBeLessThan(1);
      expect(preset.reactivity).toBeGreaterThan(0);
      expect(preset.particleCount).toBeGreaterThanOrEqual(0);
      expect(preset.glowIntensity).toBeGreaterThanOrEqual(0);
      expect(preset.glowIntensity).toBeLessThanOrEqual(1);
      expect(preset.lineWidth).toBeGreaterThan(0);
      expect(preset.fillAlpha).toBeGreaterThanOrEqual(0);
      expect(preset.fillAlpha).toBeLessThanOrEqual(1);
      expect(preset.segments).toBeGreaterThanOrEqual(3);
      expect(preset.waveDistortion).toBeGreaterThanOrEqual(0);
      expect(preset.pulseIntensity).toBeGreaterThanOrEqual(0);
    },
  );
});

describe('preset collection', () => {
  it('ALL_PRESETS contains at least 3 presets', () => {
    expect(ALL_PRESETS.length).toBeGreaterThanOrEqual(3);
  });

  it('ALL_PRESETS has unique IDs', () => {
    const ids = ALL_PRESETS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ALL_PRESETS has unique names', () => {
    const names = ALL_PRESETS.map(p => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('DEFAULT_PRESET is included in ALL_PRESETS', () => {
    expect(ALL_PRESETS).toContain(DEFAULT_PRESET);
  });

  it('DEFAULT_PRESET is Cosmic Bloom', () => {
    expect(DEFAULT_PRESET).toBe(PRESET_COSMIC_BLOOM);
  });

  it('contains all three named presets', () => {
    expect(ALL_PRESETS).toContain(PRESET_COSMIC_BLOOM);
    expect(ALL_PRESETS).toContain(PRESET_NEON_PULSE);
    expect(ALL_PRESETS).toContain(PRESET_DEEP_OCEAN);
  });
});

describe('preset visual differentiation', () => {
  it('presets have different base hues', () => {
    const hues = ALL_PRESETS.map(p => p.baseHue);
    expect(new Set(hues).size).toBe(hues.length);
  });

  it('presets have different ring counts', () => {
    const counts = ALL_PRESETS.map(p => p.ringCount);
    // Not all need to be unique, but at least some variation
    expect(new Set(counts).size).toBeGreaterThanOrEqual(2);
  });

  it('at least one preset uses mirror mode', () => {
    expect(ALL_PRESETS.some(p => p.mirror)).toBe(true);
  });

  it('at least one preset does not use mirror mode', () => {
    expect(ALL_PRESETS.some(p => !p.mirror)).toBe(true);
  });
});
