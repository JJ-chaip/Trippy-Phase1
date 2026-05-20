/**
 * Beat/bar detection — onset detection from audio drive energy.
 *
 * Uses a simple energy-threshold onset detector with adaptive
 * averaging. Tracks inter-beat intervals for BPM estimation
 * and maintains bar-level phrasing.
 *
 * Pure functions — no side effects.
 */

import { clamp } from '../../utils/math.js';
import type {
  BeatDetectorConfig,
  BeatDetectorOutput,
  BeatDetectorState,
} from './types.js';
import { BEAT_DETECTOR_DEFAULTS } from './types.js';

const MAX_RECENT_INTERVALS = 8;
const BPM_MIN = 60;
const BPM_MAX = 200;
const BEAT_INTENSITY_DECAY = 0.88;

export function createBeatDetectorState(): BeatDetectorState {
  return {
    runningEnergy: 0,
    lastBeatTimeMs: 0,
    beatThisFrame: false,
    beatIntensity: 0,
    totalBeats: 0,
    barPosition: 0,
    estimatedBpm: 0,
    recentIntervals: [],
    kickEnergy: 0,
    hihatEnergy: 0,
  };
}

export function beatDetectorConfigFromLookState(
  state: Record<string, number>,
): BeatDetectorConfig {
  return {
    onsetThreshold: clamp(
      state['beat.onsetThreshold'] ?? BEAT_DETECTOR_DEFAULTS.onsetThreshold,
      0.1,
      1.0,
    ),
    energyDecay: clamp(
      state['beat.energyDecay'] ?? BEAT_DETECTOR_DEFAULTS.energyDecay,
      0.8,
      0.99,
    ),
    minBeatIntervalMs: clamp(
      state['beat.minBeatIntervalMs'] ?? BEAT_DETECTOR_DEFAULTS.minBeatIntervalMs,
      100,
      500,
    ),
    beatsPerBar: Math.round(
      clamp(
        state['beat.beatsPerBar'] ?? BEAT_DETECTOR_DEFAULTS.beatsPerBar,
        2,
        8,
      ),
    ),
  };
}

/**
 * Process one frame of beat detection.
 * Mutates state in place for performance (no allocation per frame).
 */
export function beatDetectorStep(
  state: BeatDetectorState,
  config: BeatDetectorConfig,
  bands: readonly number[],
  spectralFlux: number,
  tMs: number,
): BeatDetectorOutput {
  // Compute instantaneous energy from bands
  let instantEnergy = 0;
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i] ?? 0;
    instantEnergy += b * b;
  }
  instantEnergy = bands.length > 0 ? Math.sqrt(instantEnergy / bands.length) : 0;

  // Weight spectral flux into the energy calculation
  const combinedEnergy = instantEnergy * 0.7 + spectralFlux * 0.3;

  // Update running average
  state.runningEnergy =
    state.runningEnergy * config.energyDecay +
    combinedEnergy * (1 - config.energyDecay);

  // Track frequency-specific energies
  const kickBands = bands.slice(0, 2);
  const hihatBands = bands.slice(Math.max(0, bands.length - 2));
  const kickRaw = kickBands.length > 0
    ? kickBands.reduce((a, b) => a + b, 0) / kickBands.length
    : 0;
  const hihatRaw = hihatBands.length > 0
    ? hihatBands.reduce((a, b) => a + b, 0) / hihatBands.length
    : 0;

  state.kickEnergy += (kickRaw - state.kickEnergy) * 0.15;
  state.hihatEnergy += (hihatRaw - state.hihatEnergy) * 0.15;

  // Decay beat intensity
  state.beatIntensity *= BEAT_INTENSITY_DECAY;

  // Onset detection
  const timeSinceLastBeat = tMs - state.lastBeatTimeMs;
  const threshold = state.runningEnergy + config.onsetThreshold * 0.5;
  const onsetDetected =
    combinedEnergy > threshold &&
    timeSinceLastBeat >= config.minBeatIntervalMs;

  state.beatThisFrame = onsetDetected;

  if (onsetDetected) {
    state.beatIntensity = clamp(combinedEnergy / (state.runningEnergy + 0.001), 0, 1);

    // Record interval for BPM estimation
    if (state.lastBeatTimeMs > 0) {
      state.recentIntervals.push(timeSinceLastBeat);
      if (state.recentIntervals.length > MAX_RECENT_INTERVALS) {
        state.recentIntervals.shift();
      }
    }

    state.lastBeatTimeMs = tMs;
    state.totalBeats++;
    state.barPosition = (state.barPosition + 1) % config.beatsPerBar;

    // Estimate BPM from recent intervals
    if (state.recentIntervals.length >= 3) {
      const sorted = [...state.recentIntervals].sort((a, b) => a - b);
      // Use median interval for robustness
      const medianIdx = Math.floor(sorted.length / 2);
      const medianInterval = sorted[medianIdx] ?? 500;
      const bpm = 60000 / medianInterval;
      state.estimatedBpm = clamp(bpm, BPM_MIN, BPM_MAX);
    }
  }

  return {
    beatThisFrame: state.beatThisFrame,
    beatIntensity: state.beatIntensity,
    barPosition: state.barPosition,
    estimatedBpm: state.estimatedBpm,
    kickEnergy: state.kickEnergy,
    hihatEnergy: state.hihatEnergy,
    totalBeats: state.totalBeats,
  };
}
