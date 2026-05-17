/**
 * HGC (Homeostatic Gain Control) types — §F.19 of the bible.
 *
 * HGC is a slow AGC (Automatic Gain Control) module that adjusts
 * the input gain multiplier W_s toward a target RMS level with
 * asymmetric attack/decay rate limiting.
 *
 * All types here are pure data — no behaviour.
 */

import type { GainMultiplier, NormalisedAmplitude } from '../../core/types/common.js';

/**
 * User-facing HGC configuration keys (flat, per bible convention).
 *
 * These map to UserLookState keys prefixed with "audio.".
 */
export interface HgcConfig {
  /**
   * Time-scale of adaptation. Higher = faster tracking.
   * Range: [0.01, 0.20]. Default: 0.05.
   */
  readonly homeostaticAdaptationRate: number;

  /**
   * Desired RMS band the AGC drives toward.
   * Range: [0.10, 0.90]. Default: 0.35.
   */
  readonly targetRmsLevel: number;

  /**
   * Maximum amplification multiplier. Prevents noise-floor runaway.
   * Range: [1.0, 20.0]. Default: 5.0.
   */
  readonly gainCeilingLimit: number;
}

/** Default configuration values per bible §F.19. */
export const HGC_CONFIG_DEFAULTS: HgcConfig = {
  homeostaticAdaptationRate: 0.05,
  targetRmsLevel: 0.35,
  gainCeilingLimit: 5.0,
};

/** Validated ranges for each config field. */
export const HGC_CONFIG_RANGES = {
  homeostaticAdaptationRate: { min: 0.01, max: 0.20 },
  targetRmsLevel: { min: 0.10, max: 0.90 },
  gainCeilingLimit: { min: 1.0, max: 20.0 },
} as const;

/**
 * Internal mutable state of the HGC algorithm.
 * Persists across frames; reset on init or audio source change.
 */
export interface HgcState {
  /** Current gain multiplier W_s. Always in [HGC_GAIN_FLOOR, config.gainCeilingLimit]. */
  ws: GainMultiplier;

  /** Previous frame's RMS for trend detection. */
  previousRms: NormalisedAmplitude;

  /** Number of consecutive frames below noise floor. */
  noiseFloorFrameCount: number;

  /** Whether the gain is currently frozen due to noise floor. */
  frozen: boolean;

  /** Total frames processed (for diagnostics). */
  frameCount: number;
}

/**
 * HGC rate-limiting constants.
 * Per-frame max delta applied to W_s.
 */
export const HGC_MAX_ATTACK = 0.02;
export const HGC_MAX_DECAY = 0.005;

/**
 * Minimum gain multiplier (never goes below 1.0 — no attenuation).
 * The bible implies W_s is always >= 1.0 (amplification only).
 * If the signal is already at target, W_s stays at 1.0.
 */
export const HGC_GAIN_FLOOR = 0.0;

/**
 * RMS threshold below which we consider the signal to be noise floor.
 * When A_RMS < this for consecutive frames, freeze W_s.
 */
export const HGC_NOISE_FLOOR_THRESHOLD = 0.002;

/**
 * Number of consecutive noise-floor frames before freezing gain.
 */
export const HGC_NOISE_FLOOR_FREEZE_FRAMES = 10;

/**
 * Diagnostic status strings for diag.agcStatus.
 * Follows the ENGINE: prefix convention from the bible.
 */
export type HgcDiagStatus =
  | 'ENGINE: AGC_TRACKING'
  | 'ENGINE: AGC_CEILING_MAX'
  | 'ENGINE: AGC_FLOOR_MIN'
  | 'ENGINE: AGC_FROZEN_NOISE_FLOOR'
  | 'ENGINE: AGC_IDLE';

/**
 * Full HGC diagnostic output for a single frame.
 */
export interface HgcDiagnostics {
  readonly agcStatus: HgcDiagStatus;
  readonly ws: number;
  readonly targetRms: number;
  readonly currentRms: number;
  readonly delta: number;
  readonly clampedDelta: number;
  readonly frozen: boolean;
  readonly noiseFloorFrameCount: number;
  readonly frameCount: number;
}
