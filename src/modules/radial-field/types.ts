/**
 * Radial Field types — §F.20 polar layout prior.
 *
 * Deterministic polar particle/field layout where higher-frequency
 * band energy biases toward central density (artist-tunable),
 * with peripheral emphasis for sub-bass.
 *
 * Keys: field.fovealFrequencyBias, field.stereoAsymmetryBal
 */

/** Configuration for the radial layout prior. */
export interface RadialFieldConfig {
  /** Strength of centre-bias for high-frequency bands [0,1]. */
  readonly fovealFrequencyBias: number;
  /** Stereo angular offset / asymmetry [0,1]. */
  readonly stereoAsymmetryBal: number;
}

export const RADIAL_FIELD_DEFAULTS: RadialFieldConfig = {
  fovealFrequencyBias: 0.5,
  stereoAsymmetryBal: 0,
};

/** Per-particle layout weight computed from AudioDrive bands. */
export interface ParticleLayoutWeight {
  /** Radius fraction [0,1] from the R(ω) formula. */
  readonly radiusFraction: number;
  /** Angle in radians including stereo offset. */
  readonly angle: number;
  /** Cartesian x (normalised to [-1,1] from centre). */
  readonly x: number;
  /** Cartesian y (normalised to [-1,1] from centre). */
  readonly y: number;
}

/** Diagnostics emitted by the radial field module. */
export interface RadialFieldDiagnostics {
  /** Normalised band weights ω_k after centroid lift. */
  readonly bandWeights: readonly number[];
  /** Current foveal bias setting. */
  readonly fovealBias: number;
  /** Current stereo asymmetry setting. */
  readonly stereoAsymmetry: number;
  /** Number of particles positioned this frame. */
  readonly particleCount: number;
}
