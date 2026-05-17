/**
 * Tests for the demo audio source.
 *
 * Validates synthetic audio feature generation including:
 * - State creation and initialization
 * - Output structure and field types
 * - Value ranges (all normalised values in [0,1])
 * - Temporal evolution (values change over time)
 * - Band count and ordering
 * - Edge cases (zero dt, large dt, negative dt)
 */

import { describe, it, expect } from 'vitest';
import {
  createDemoSourceState,
  demoSourceTick,
} from '../src/audio/demo-source.js';
import { AUDIO_DRIVE_SCHEMA_VERSION } from '../src/core/types/audio-drive.js';

describe('createDemoSourceState', () => {
  it('creates a fresh state with zero elapsed time', () => {
    const state = createDemoSourceState();
    expect(state.elapsedSec).toBe(0);
    expect(state.bpm).toBe(120);
    expect(state.smoothedBands).toHaveLength(8);
    expect(state.smoothedBands.every(b => b === 0)).toBe(true);
  });

  it('creates independent state objects', () => {
    const a = createDemoSourceState();
    const b = createDemoSourceState();
    a.elapsedSec = 5;
    expect(b.elapsedSec).toBe(0);
  });
});

describe('demoSourceTick', () => {
  it('returns a valid CanonicalAudioDrive', () => {
    const state = createDemoSourceState();
    const drive = demoSourceTick(state, 16.67, 1000);

    expect(drive.schemaVersion).toBe(AUDIO_DRIVE_SCHEMA_VERSION);
    expect(drive.tAnalysisMs).toBe(1000);
    expect(drive.tFeatureMs).toBe(1000);
    expect(drive.active).toBe(true);
    expect(drive.status).toBe('RUNNING');
    expect(typeof drive.rms).toBe('number');
    expect(typeof drive.peak).toBe('number');
    expect(typeof drive.gateOpen).toBe('boolean');
  });

  it('produces bands of length 8', () => {
    const state = createDemoSourceState();
    const drive = demoSourceTick(state, 16.67, 1000);
    expect(drive.bands).toHaveLength(8);
  });

  it('keeps all band values in [0, 1]', () => {
    const state = createDemoSourceState();
    // Run many frames to test across the full cycle
    for (let i = 0; i < 500; i++) {
      const drive = demoSourceTick(state, 16.67, i * 16.67);
      for (const band of drive.bands) {
        expect(band as number).toBeGreaterThanOrEqual(0);
        expect(band as number).toBeLessThanOrEqual(1);
      }
    }
  });

  it('keeps RMS in [0, 1]', () => {
    const state = createDemoSourceState();
    for (let i = 0; i < 300; i++) {
      const drive = demoSourceTick(state, 16.67, i * 16.67);
      expect(drive.rms as number).toBeGreaterThanOrEqual(0);
      expect(drive.rms as number).toBeLessThanOrEqual(1);
    }
  });

  it('keeps peak in [0, 1]', () => {
    const state = createDemoSourceState();
    for (let i = 0; i < 300; i++) {
      const drive = demoSourceTick(state, 16.67, i * 16.67);
      expect(drive.peak as number).toBeGreaterThanOrEqual(0);
      expect(drive.peak as number).toBeLessThanOrEqual(1);
    }
  });

  it('peak >= rms (envelope property)', () => {
    const state = createDemoSourceState();
    for (let i = 0; i < 300; i++) {
      const drive = demoSourceTick(state, 16.67, i * 16.67);
      expect(drive.peak as number).toBeGreaterThanOrEqual(drive.rms as number - 0.001);
    }
  });

  it('provides spectral features', () => {
    const state = createDemoSourceState();
    const drive = demoSourceTick(state, 16.67, 1000);
    expect(drive.spectralCentroidHz).toBeDefined();
    expect(typeof drive.spectralCentroidHz).toBe('number');
    expect(drive.spectralFlux).toBeDefined();
    expect(drive.spectralEntropy).toBeDefined();
  });

  it('advances elapsed time', () => {
    const state = createDemoSourceState();
    expect(state.elapsedSec).toBe(0);

    demoSourceTick(state, 1000, 1000); // 1 second
    expect(state.elapsedSec).toBeCloseTo(1, 5);

    demoSourceTick(state, 500, 1500); // 0.5 seconds
    expect(state.elapsedSec).toBeCloseTo(1.5, 5);
  });

  it('evolves values over time (not static)', () => {
    const state = createDemoSourceState();
    const snapshots: number[] = [];

    for (let i = 0; i < 60; i++) {
      const drive = demoSourceTick(state, 16.67, i * 16.67);
      snapshots.push(drive.rms as number);
    }

    // At least some variation should exist
    const min = Math.min(...snapshots);
    const max = Math.max(...snapshots);
    expect(max - min).toBeGreaterThan(0.01);
  });

  it('handles zero dt gracefully', () => {
    const state = createDemoSourceState();
    const drive = demoSourceTick(state, 0, 0);
    expect(drive.rms as number).toBeGreaterThanOrEqual(0);
    expect(drive.bands).toHaveLength(8);
  });

  it('handles very large dt without NaN', () => {
    const state = createDemoSourceState();
    const drive = demoSourceTick(state, 10000, 10000);
    expect(Number.isFinite(drive.rms as number)).toBe(true);
    expect(Number.isFinite(drive.peak as number)).toBe(true);
    for (const b of drive.bands) {
      expect(Number.isFinite(b as number)).toBe(true);
    }
  });

  it('gate opens when there is signal energy', () => {
    const state = createDemoSourceState();
    // After a few frames, demo source should produce enough energy
    let gateEverOpen = false;
    for (let i = 0; i < 100; i++) {
      const drive = demoSourceTick(state, 16.67, i * 16.67);
      if (drive.gateOpen) gateEverOpen = true;
    }
    expect(gateEverOpen).toBe(true);
  });

  it('smoothed bands converge toward targets', () => {
    const state = createDemoSourceState();
    // Initial bands are all 0; after some frames they should be non-zero
    demoSourceTick(state, 16.67, 0);
    const firstBands = [...state.smoothedBands];

    for (let i = 1; i < 60; i++) {
      demoSourceTick(state, 16.67, i * 16.67);
    }
    const laterBands = [...state.smoothedBands];

    // Bands should have moved from initial zeros
    const moved = laterBands.some((b, i) => Math.abs(b - (firstBands[i] ?? 0)) > 0.01);
    expect(moved).toBe(true);
  });
});

describe('demo source determinism', () => {
  it('produces identical output for identical inputs', () => {
    const stateA = createDemoSourceState();
    const stateB = createDemoSourceState();

    const driveA = demoSourceTick(stateA, 16.67, 1000);
    const driveB = demoSourceTick(stateB, 16.67, 1000);

    expect(driveA.rms).toBe(driveB.rms);
    expect(driveA.peak).toBe(driveB.peak);
    expect(driveA.bands).toEqual(driveB.bands);
  });
});
