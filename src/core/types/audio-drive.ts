/**
 * CanonicalAudioDrive — per-frame audio feature vector.
 *
 * This is the **single source of temporal truth** for each rendered
 * frame. Every visual module reads from this; none may mutate it.
 *
 * Wire schema from NORTH_STAR_AND_MASTER_PLAN.md §E.6 / Appendix F.
 */

import type {
  AudioClockMs,
  ContentHash,
  Hz,
  NormalisedAmplitude,
  SchemaVersion,
  UnitScalar,
} from './common.js';

/** Current canonical schema version. */
export const AUDIO_DRIVE_SCHEMA_VERSION = '0.1.0' as SchemaVersion;

/**
 * Immutable per-frame audio feature snapshot.
 *
 * Fields marked optional (?) are progressively filled as the audio
 * analysis pipeline matures through horizons. Consumers MUST
 * null-check optional fields and degrade gracefully.
 */
export interface CanonicalAudioDrive {
  /** Schema version for forward compatibility. */
  readonly schemaVersion: SchemaVersion;

  /** Timestamp of the analysis window centre (audio clock). */
  readonly tAnalysisMs: AudioClockMs;

  /** Timestamp of the feature extraction (may lag tAnalysisMs). */
  readonly tFeatureMs?: AudioClockMs;

  /** Root-mean-square amplitude of the current window [0,1]. */
  readonly rms: NormalisedAmplitude;

  /** Peak amplitude of the current window [0,1]. */
  readonly peak: NormalisedAmplitude;

  /** True when RMS exceeds the noise gate threshold. */
  readonly gateOpen: boolean;

  /** True when audio input is connected and producing signal. */
  readonly active: boolean;

  /** Human-readable pipeline status (e.g. "RUNNING", "SILENT"). */
  readonly status: AudioPipelineStatus;

  /**
   * Per-band energy. Canonical order: sub-bass, bass, low-mid,
   * mid, upper-mid, presence, brilliance, air.
   * Length is implementation-defined; consumers index defensively.
   */
  readonly bands: readonly NormalisedAmplitude[];

  /** Spectral centroid frequency (brightness indicator). */
  readonly spectralCentroidHz?: Hz;

  /** Spectral flux (onset / transient energy). */
  readonly spectralFlux?: UnitScalar;

  /**
   * Normalised Shannon entropy of the power spectrum.
   * 0 = pure tone, 1 = white noise.
   */
  readonly spectralEntropy?: UnitScalar;

  /**
   * Bayesian surprisal (T0 CPU-only baseline).
   * Normalised to [0,1] via clamped -log2(P).
   */
  readonly bayesianSurprisalNorm?: UnitScalar;

  /** Content hash for dedup / caching. */
  readonly driveHash?: ContentHash;
}

/**
 * Exhaustive set of pipeline status values.
 * New statuses may be added; consumers should handle `default`.
 */
export type AudioPipelineStatus =
  | 'BOOT'
  | 'PROFILING'
  | 'RUNNING'
  | 'SILENT'
  | 'ERROR'
  | 'SUSPENDED';

/**
 * Creates a silent / zero-energy AudioDrive snapshot.
 * Useful as a safe default before the audio pipeline is live.
 */
export function createSilentDrive(tMs: AudioClockMs): CanonicalAudioDrive {
  return {
    schemaVersion: AUDIO_DRIVE_SCHEMA_VERSION,
    tAnalysisMs: tMs,
    rms: 0 as NormalisedAmplitude,
    peak: 0 as NormalisedAmplitude,
    gateOpen: false,
    active: false,
    status: 'SILENT',
    bands: [],
  };
}
