/**
 * Tests for the Beat/Bar Detector module.
 */

import { describe, it, expect } from 'vitest';
import {
  createBeatDetectorState,
  beatDetectorStep,
  beatDetectorConfigFromLookState,
} from '../src/modules/beat-detector/beat-detector.js';
import { BEAT_DETECTOR_DEFAULTS } from '../src/modules/beat-detector/types.js';

describe('BeatDetectorState', () => {
  it('creates with correct defaults', () => {
    const state = createBeatDetectorState();
    expect(state.runningEnergy).toBe(0);
    expect(state.lastBeatTimeMs).toBe(0);
    expect(state.beatThisFrame).toBe(false);
    expect(state.beatIntensity).toBe(0);
    expect(state.totalBeats).toBe(0);
    expect(state.barPosition).toBe(0);
    expect(state.estimatedBpm).toBe(0);
    expect(state.recentIntervals).toEqual([]);
    expect(state.kickEnergy).toBe(0);
    expect(state.hihatEnergy).toBe(0);
  });
});

describe('beatDetectorConfigFromLookState', () => {
  it('uses defaults for missing keys', () => {
    const config = beatDetectorConfigFromLookState({});
    expect(config.onsetThreshold).toBe(BEAT_DETECTOR_DEFAULTS.onsetThreshold);
    expect(config.energyDecay).toBe(BEAT_DETECTOR_DEFAULTS.energyDecay);
    expect(config.minBeatIntervalMs).toBe(BEAT_DETECTOR_DEFAULTS.minBeatIntervalMs);
    expect(config.beatsPerBar).toBe(BEAT_DETECTOR_DEFAULTS.beatsPerBar);
  });

  it('clamps values to valid ranges', () => {
    const config = beatDetectorConfigFromLookState({
      'beat.onsetThreshold': 5.0,
      'beat.energyDecay': 2.0,
      'beat.minBeatIntervalMs': 10,
      'beat.beatsPerBar': 100,
    });
    expect(config.onsetThreshold).toBe(1.0);
    expect(config.energyDecay).toBe(0.99);
    expect(config.minBeatIntervalMs).toBe(100);
    expect(config.beatsPerBar).toBe(8);
  });
});

describe('beatDetectorStep', () => {
  it('returns no beat on silence', () => {
    const state = createBeatDetectorState();
    const config = BEAT_DETECTOR_DEFAULTS;
    const bands = [0, 0, 0, 0, 0, 0, 0, 0];

    const output = beatDetectorStep(state, config, bands, 0, 1000);
    expect(output.beatThisFrame).toBe(false);
    expect(output.totalBeats).toBe(0);
  });

  it('detects a beat on sudden energy spike', () => {
    const state = createBeatDetectorState();
    const config = BEAT_DETECTOR_DEFAULTS;

    // Feed low energy for a while to establish baseline
    for (let i = 0; i < 20; i++) {
      beatDetectorStep(state, config, [0.05, 0.05, 0.05, 0.05], 0.01, i * 50);
    }

    // Spike energy
    const output = beatDetectorStep(
      state,
      config,
      [0.9, 0.8, 0.7, 0.6],
      0.8,
      20 * 50 + 250,
    );

    expect(output.beatThisFrame).toBe(true);
    expect(output.totalBeats).toBe(1);
  });

  it('respects minimum beat interval', () => {
    const state = createBeatDetectorState();
    const config = { ...BEAT_DETECTOR_DEFAULTS, minBeatIntervalMs: 500 };

    // Establish baseline
    for (let i = 0; i < 20; i++) {
      beatDetectorStep(state, config, [0.05, 0.05, 0.05, 0.05], 0.01, i * 10);
    }

    // First spike at t=500
    beatDetectorStep(state, config, [0.9, 0.8, 0.7, 0.6], 0.8, 500);

    // Second spike too soon at t=700 (within 500ms window)
    const output = beatDetectorStep(
      state,
      config,
      [0.9, 0.8, 0.7, 0.6],
      0.8,
      700,
    );
    expect(output.beatThisFrame).toBe(false);
  });

  it('tracks bar position correctly', () => {
    const state = createBeatDetectorState();
    const config = { ...BEAT_DETECTOR_DEFAULTS, beatsPerBar: 4, minBeatIntervalMs: 100 };

    // Build baseline
    for (let i = 0; i < 30; i++) {
      beatDetectorStep(state, config, [0.01, 0.01], 0, i * 10);
    }

    // Trigger 5 beats
    let lastBarPos = -1;
    for (let i = 0; i < 5; i++) {
      const t = 500 + i * 500;
      // Low energy between beats
      for (let j = 0; j < 5; j++) {
        beatDetectorStep(state, config, [0.01, 0.01], 0, t - 200 + j * 30);
      }
      const out = beatDetectorStep(state, config, [0.9, 0.8], 0.8, t);
      if (out.beatThisFrame) {
        lastBarPos = out.barPosition;
      }
    }

    // After 5 beats in 4-beat bar, position should have wrapped
    expect(lastBarPos).toBeGreaterThanOrEqual(0);
    expect(lastBarPos).toBeLessThan(4);
  });

  it('tracks kick and hihat energy', () => {
    const state = createBeatDetectorState();
    const config = BEAT_DETECTOR_DEFAULTS;
    const bands = [0.8, 0.7, 0.1, 0.1, 0.1, 0.1, 0.05, 0.9];

    beatDetectorStep(state, config, bands, 0, 1000);

    expect(state.kickEnergy).toBeGreaterThan(0);
    expect(state.hihatEnergy).toBeGreaterThan(0);
  });
});
