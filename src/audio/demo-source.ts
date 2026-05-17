/**
 * Demo audio source — generates synthetic CanonicalAudioDrive snapshots.
 *
 * Used for visual testing when no microphone is connected.
 * Produces rhythmic, evolving patterns that exercise the full
 * range of the audio feature vector (RMS, peak, bands, spectral).
 *
 * This is NOT a real audio analyser — it is a deterministic
 * signal generator for visual development and demos.
 */

import type { CanonicalAudioDrive } from '../core/types/audio-drive.js';
import { AUDIO_DRIVE_SCHEMA_VERSION } from '../core/types/audio-drive.js';
import type {
  AudioClockMs,
  Hz,
  NormalisedAmplitude,
  UnitScalar,
} from '../core/types/common.js';

/** Number of frequency bands in the demo output. */
const BAND_COUNT = 8;

/** BPM of the synthetic rhythm. */
const DEFAULT_BPM = 120;

/**
 * Internal state for the demo source.
 * Tracks phase accumulators for deterministic evolution.
 */
export interface DemoSourceState {
  /** Accumulated time in seconds. */
  elapsedSec: number;
  /** Current BPM (can be modulated). */
  bpm: number;
  /** Per-band smoothed values for temporal coherence. */
  smoothedBands: number[];
}

export function createDemoSourceState(): DemoSourceState {
  return {
    elapsedSec: 0,
    bpm: DEFAULT_BPM,
    smoothedBands: new Array(BAND_COUNT).fill(0),
  };
}

/**
 * Generate one frame of synthetic audio features.
 *
 * @param state  Mutable demo state (updated in place for smoothing).
 * @param dtMs   Delta time in milliseconds.
 * @param tMs    Current wall clock time in milliseconds.
 * @returns A valid CanonicalAudioDrive snapshot.
 */
export function demoSourceTick(
  state: DemoSourceState,
  dtMs: number,
  tMs: number,
): CanonicalAudioDrive {
  const dtSec = dtMs / 1000;
  state.elapsedSec += dtSec;

  const t = state.elapsedSec;
  const beatHz = state.bpm / 60;
  const beatPhase = (t * beatHz) % 1;

  // Kick-like envelope: sharp attack, exponential decay
  const kickEnv = Math.exp(-beatPhase * 8);

  // Slower modulation for variety
  const slowMod = 0.5 + 0.5 * Math.sin(t * 0.3);
  const midMod = 0.5 + 0.5 * Math.sin(t * 0.7 + 1.2);

  // Per-band target levels with musical structure
  const bandTargets = [
    0.7 * kickEnv + 0.1,                              // sub-bass
    0.6 * kickEnv + 0.15,                             // bass
    0.3 * midMod + 0.1,                               // low-mid
    0.25 + 0.25 * Math.sin(t * 1.1 + 0.5),           // mid
    0.2 + 0.3 * Math.sin(t * 1.7 + 1.0) * slowMod,  // upper-mid
    0.15 + 0.2 * Math.sin(t * 2.3 + 2.0),            // presence
    0.1 + 0.15 * Math.sin(t * 3.1 + 3.0) * midMod,  // brilliance
    0.05 + 0.1 * Math.sin(t * 4.1 + 4.0),            // air
  ];

  // Smooth bands for temporal coherence
  const smoothFactor = Math.min(1, dtSec * 12);
  const bands: NormalisedAmplitude[] = [];
  for (let i = 0; i < BAND_COUNT; i++) {
    const target = bandTargets[i] ?? 0;
    const prev = state.smoothedBands[i] ?? 0;
    const smoothed = prev + (target - prev) * smoothFactor;
    state.smoothedBands[i] = smoothed;
    bands.push(Math.max(0, Math.min(1, smoothed)) as NormalisedAmplitude);
  }

  // RMS from band energies (weighted sum)
  let sumSq = 0;
  for (const b of bands) {
    sumSq += (b as number) * (b as number);
  }
  const rms = Math.sqrt(sumSq / BAND_COUNT);

  // Peak is slightly above RMS
  const peak = Math.min(1, rms * 1.4 + 0.05 * kickEnv);

  // Spectral centroid shifts with content
  const centroidBase = 800 + 2000 * midMod + 500 * kickEnv;

  // Spectral flux spikes on beats
  const flux = kickEnv * 0.6 + 0.1 * Math.abs(Math.sin(t * 5));

  // Entropy varies inversely with tonal clarity
  const entropy = 0.3 + 0.4 * slowMod;

  return {
    schemaVersion: AUDIO_DRIVE_SCHEMA_VERSION,
    tAnalysisMs: tMs as AudioClockMs,
    tFeatureMs: tMs as AudioClockMs,
    rms: rms as NormalisedAmplitude,
    peak: peak as NormalisedAmplitude,
    gateOpen: rms > 0.02,
    active: true,
    status: 'RUNNING',
    bands,
    spectralCentroidHz: centroidBase as Hz,
    spectralFlux: flux as UnitScalar,
    spectralEntropy: entropy as UnitScalar,
  };
}
