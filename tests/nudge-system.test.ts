import { describe, it, expect } from 'vitest';
import {
  nudgePreset,
  randomizePreset,
  generateRandomPreset,
} from '../src/presets/nudgeSystem.js';
import { PRESET_SOLAR_FLARE, PRESET_VOID } from '../src/render/presets.js';

describe('nudgeSystem', () => {
  describe('nudgePreset', () => {
    it('returns a preset with the same id/name/description', () => {
      const result = nudgePreset(PRESET_SOLAR_FLARE, 'up');
      expect(result.preset.id).toBe(PRESET_SOLAR_FLARE.id);
      expect(result.preset.name).toBe(PRESET_SOLAR_FLARE.name);
    });

    it('mutates at least 3 parameters', () => {
      const result = nudgePreset(PRESET_SOLAR_FLARE, 'right');
      expect(result.mutatedKeys.length).toBeGreaterThanOrEqual(3);
    });

    it('produces magnitude "nudge"', () => {
      const result = nudgePreset(PRESET_SOLAR_FLARE, 'down');
      expect(result.magnitude).toBe('nudge');
    });

    it('keeps numeric values within safe ranges', () => {
      let p = PRESET_SOLAR_FLARE;
      for (let i = 0; i < 50; i++) {
        const dirs = ['up', 'down', 'left', 'right'] as const;
        const dir = dirs[i % 4]!;
        const result = nudgePreset(p, dir);
        p = result.preset;
        expect(p.ringCount).toBeGreaterThanOrEqual(2);
        expect(p.ringCount).toBeLessThanOrEqual(16);
        expect(p.baseHue).toBeGreaterThanOrEqual(0);
        expect(p.baseHue).toBeLessThanOrEqual(360);
        expect(p.particleCount).toBeGreaterThanOrEqual(0);
        expect(p.particleCount).toBeLessThanOrEqual(300);
        expect(p.glowIntensity).toBeGreaterThanOrEqual(0);
        expect(p.glowIntensity).toBeLessThanOrEqual(1);
      }
    });

    it('produces different results on repeated calls', () => {
      const a = nudgePreset(PRESET_SOLAR_FLARE, 'up');
      const b = nudgePreset(PRESET_SOLAR_FLARE, 'up');
      const aKeys = a.mutatedKeys.join(',');
      const bKeys = b.mutatedKeys.join(',');
      // Very unlikely to be identical after multiple calls
      let different = false;
      for (let i = 0; i < 10; i++) {
        const c = nudgePreset(PRESET_SOLAR_FLARE, 'up');
        if (c.mutatedKeys.join(',') !== aKeys || c.mutatedKeys.join(',') !== bKeys) {
          different = true;
          break;
        }
      }
      expect(different).toBe(true);
    });

    it('respects directional bias for "up"', () => {
      let increased = 0;
      for (let i = 0; i < 50; i++) {
        const result = nudgePreset(PRESET_VOID, 'up');
        const p = result.preset;
        // Check multiple "up"-biased params
        if (
          (p.glowIntensity ?? 0) > (PRESET_VOID.glowIntensity ?? 0) ||
          p.particleCount > PRESET_VOID.particleCount ||
          (p.pulseIntensity ?? 0) > (PRESET_VOID.pulseIntensity ?? 0)
        ) {
          increased++;
        }
      }
      // At least some nudges should increase up-biased params
      expect(increased).toBeGreaterThan(3);
    });

    it('returns integer values for integer params', () => {
      for (let i = 0; i < 20; i++) {
        const result = nudgePreset(PRESET_SOLAR_FLARE, 'left');
        expect(Number.isInteger(result.preset.ringCount)).toBe(true);
        expect(Number.isInteger(result.preset.particleCount)).toBe(true);
        expect(Number.isInteger(result.preset.segments)).toBe(true);
      }
    });
  });

  describe('randomizePreset', () => {
    it('mutates at least 10 parameters', () => {
      const result = randomizePreset(PRESET_SOLAR_FLARE);
      expect(result.mutatedKeys.length).toBeGreaterThanOrEqual(10);
    });

    it('produces magnitude "randomize"', () => {
      const result = randomizePreset(PRESET_SOLAR_FLARE);
      expect(result.magnitude).toBe('randomize');
    });

    it('produces dramatically different values', () => {
      const result = randomizePreset(PRESET_SOLAR_FLARE);
      const p = result.preset;
      let diffCount = 0;
      if (p.baseHue !== PRESET_SOLAR_FLARE.baseHue) diffCount++;
      if (p.ringCount !== PRESET_SOLAR_FLARE.ringCount) diffCount++;
      if (p.reactivity !== PRESET_SOLAR_FLARE.reactivity) diffCount++;
      if (p.particleCount !== PRESET_SOLAR_FLARE.particleCount) diffCount++;
      if (p.glowIntensity !== PRESET_SOLAR_FLARE.glowIntensity) diffCount++;
      expect(diffCount).toBeGreaterThanOrEqual(2);
    });

    it('generates a bgColor string', () => {
      const result = randomizePreset(PRESET_SOLAR_FLARE);
      expect(result.preset.bgColor).toMatch(/^hsl\(\d+/);
    });
  });

  describe('generateRandomPreset', () => {
    it('returns a preset with a random id', () => {
      const p = generateRandomPreset();
      expect(p.id).toMatch(/^random-/);
      expect(p.name).toBe('Random');
    });

    it('generates valid numeric values', () => {
      for (let i = 0; i < 10; i++) {
        const p = generateRandomPreset();
        expect(p.ringCount).toBeGreaterThanOrEqual(2);
        expect(p.ringCount).toBeLessThanOrEqual(16);
        expect(Number.isInteger(p.ringCount)).toBe(true);
        expect(p.particleCount).toBeGreaterThanOrEqual(0);
        expect(p.particleCount).toBeLessThanOrEqual(300);
        expect(p.glowIntensity).toBeGreaterThanOrEqual(0);
        expect(p.glowIntensity).toBeLessThanOrEqual(1);
      }
    });

    it('produces different presets each call', () => {
      const a = generateRandomPreset();
      const b = generateRandomPreset();
      expect(a.id).not.toBe(b.id);
      // At least one numeric param should differ
      const differs =
        a.baseHue !== b.baseHue ||
        a.ringCount !== b.ringCount ||
        a.reactivity !== b.reactivity;
      expect(differs).toBe(true);
    });
  });
});
