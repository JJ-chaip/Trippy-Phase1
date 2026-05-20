/**
 * Beat/bar detection types.
 *
 * Provides onset detection, beat tracking, and bar-level
 * phrasing from the audio drive's band energies and spectral flux.
 */

export interface BeatDetectorConfig {
  /** Sensitivity threshold for onset detection [0.1, 1.0]. */
  readonly onsetThreshold: number;
  /** Decay rate for the running energy average [0.8, 0.99]. */
  readonly energyDecay: number;
  /** Minimum interval between beats in ms. */
  readonly minBeatIntervalMs: number;
  /** Number of beats per bar for phrasing. */
  readonly beatsPerBar: number;
}

export const BEAT_DETECTOR_DEFAULTS: BeatDetectorConfig = {
  onsetThreshold: 0.35,
  energyDecay: 0.92,
  minBeatIntervalMs: 200,
  beatsPerBar: 4,
};

export interface BeatDetectorState {
  /** Running average of energy (for onset comparison). */
  runningEnergy: number;
  /** Time of the last detected beat in ms. */
  lastBeatTimeMs: number;
  /** Whether a beat was detected this frame. */
  beatThisFrame: boolean;
  /** Smoothed beat intensity [0,1]. */
  beatIntensity: number;
  /** Number of beats detected since start. */
  totalBeats: number;
  /** Current beat within the bar (0-based). */
  barPosition: number;
  /** Estimated BPM (0 if not enough data). */
  estimatedBpm: number;
  /** Recent inter-beat intervals for BPM estimation. */
  recentIntervals: number[];
  /** Smoothed low-frequency energy for kick detection. */
  kickEnergy: number;
  /** Smoothed high-frequency energy for hihat detection. */
  hihatEnergy: number;
}

export interface BeatDetectorOutput {
  readonly beatThisFrame: boolean;
  readonly beatIntensity: number;
  readonly barPosition: number;
  readonly estimatedBpm: number;
  readonly kickEnergy: number;
  readonly hihatEnergy: number;
  readonly totalBeats: number;
}
