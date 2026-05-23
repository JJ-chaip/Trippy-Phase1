/**
 * Radial Field — §F.20 polar layout prior (pure functions).
 *
 * R(ω_i) = BaseRadius · (1.0 − ω_i)^(fovealFrequencyBias · 3.0)
 *
 * Higher band energy biases particles toward the centre;
 * sub-bass pushes to the periphery. Fully deterministic and CI-friendly.
 */

import { clamp } from '../../utils/math.js';
import type { RadialFieldConfig, ParticleLayoutWeight } from './types.js';
import { RADIAL_FIELD_DEFAULTS } from './types.js';

/**
 * Derive config from look state keys.
 */
export function radialFieldConfigFromLookState(
  state: Record<string, number>,
): RadialFieldConfig {
  return {
    fovealFrequencyBias: clamp(
      state['field.fovealFrequencyBias'] ?? RADIAL_FIELD_DEFAULTS.fovealFrequencyBias,
      0,
      1,
    ),
    stereoAsymmetryBal: clamp(
      state['field.stereoAsymmetryBal'] ?? RADIAL_FIELD_DEFAULTS.stereoAsymmetryBal,
      0,
      1,
    ),
  };
}

/**
 * Compute normalised band weights from AudioDrive band energies.
 * §F.20.1: ω_k = E_k / (Σ E_j + ε); centroid lift on highest band.
 */
export function computeBandWeights(
  bands: readonly number[],
  spectralCentroidNorm: number,
): number[] {
  const eps = 1e-8;
  const n = bands.length;
  if (n === 0) return [];

  let sum = eps;
  for (let i = 0; i < n; i++) {
    sum += bands[i] as number;
  }

  const weights: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    weights[i] = (bands[i] as number) / sum;
  }

  // Centroid lift on highest band: w_n' = w_n · (0.5 + 0.5 · centroidNorm)
  const lastIdx = n - 1;
  const centroidLift = 0.5 + 0.5 * clamp(spectralCentroidNorm, 0, 1);
  weights[lastIdx] = (weights[lastIdx] as number) * centroidLift;

  // Renormalise
  let newSum = 0;
  for (let i = 0; i < n; i++) {
    newSum += weights[i] as number;
  }
  if (newSum > eps) {
    for (let i = 0; i < n; i++) {
      weights[i] = (weights[i] as number) / newSum;
    }
  }

  return weights;
}

/**
 * Deterministic hash for per-particle band affinity.
 * Returns a value in [0,1] given a particle seed and band index.
 */
function deterministicHash(seed: number, band: number): number {
  // Simple integer hash (Robert Jenkins' 32-bit)
  let h = ((seed * 2654435761) ^ (band * 2246822519)) >>> 0;
  h = ((h >>> 16) ^ h) * 0x45d9f3b;
  h = ((h >>> 16) ^ h) * 0x45d9f3b;
  h = (h >>> 16) ^ h;
  return (h >>> 0) / 0xffffffff;
}

/**
 * Compute per-particle stratified band affinity α_ik.
 * Normalised so Σ_k α_ik = 1 for each particle.
 */
export function computeParticleAffinity(
  particleSeed: number,
  bandCount: number,
): number[] {
  if (bandCount === 0) return [];

  const raw: number[] = new Array(bandCount);
  let sum = 0;
  for (let k = 0; k < bandCount; k++) {
    const v = deterministicHash(particleSeed, k);
    raw[k] = v;
    sum += v;
  }

  if (sum < 1e-8) {
    // Uniform fallback
    const uniform = 1 / bandCount;
    for (let k = 0; k < bandCount; k++) {
      raw[k] = uniform;
    }
    return raw;
  }

  for (let k = 0; k < bandCount; k++) {
    raw[k] = (raw[k] as number) / sum;
  }
  return raw;
}

/**
 * Compute the composite frequency weight ω_i for a single particle.
 * ω_i = Σ_k α_ik · w_k'
 */
export function computeParticleOmega(
  affinity: readonly number[],
  bandWeights: readonly number[],
): number {
  const n = Math.min(affinity.length, bandWeights.length);
  let omega = 0;
  for (let k = 0; k < n; k++) {
    omega += (affinity[k] as number) * (bandWeights[k] as number);
  }
  return clamp(omega, 0, 1);
}

/**
 * Compute the radial position R(ω) from §F.20.
 * R(ω) = BaseRadius · (1.0 − ω)^(fovealFrequencyBias · 3.0)
 *
 * baseRadius is in normalised units [0,1] where 1 = full extent.
 */
export function computeRadius(
  omega: number,
  baseRadius: number,
  fovealFrequencyBias: number,
): number {
  const exponent = fovealFrequencyBias * 3.0;
  return baseRadius * Math.pow(1.0 - clamp(omega, 0, 0.999), exponent);
}

/**
 * Compute the full polar → Cartesian layout for a particle.
 *
 * X_i = R(ω_i) · cos(θ_i + stereoOffset)
 * Y_i = R(ω_i) · sin(θ_i + stereoOffset)
 */
export function computeParticleLayout(
  particleSeed: number,
  bandWeights: readonly number[],
  config: RadialFieldConfig,
  baseRadius: number,
): ParticleLayoutWeight {
  const bandCount = bandWeights.length;
  const affinity = computeParticleAffinity(particleSeed, bandCount);
  const omega = computeParticleOmega(affinity, bandWeights);
  const radius = computeRadius(omega, baseRadius, config.fovealFrequencyBias);

  // Deterministic base angle from particle seed
  const baseAngle = deterministicHash(particleSeed, 9999) * Math.PI * 2;

  // Stereo asymmetry offset (0 in mono)
  const stereoOffset = config.stereoAsymmetryBal * Math.PI * 0.25;

  const angle = baseAngle + stereoOffset;
  const x = radius * Math.cos(angle);
  const y = radius * Math.sin(angle);

  return { radiusFraction: radius / (baseRadius || 1), angle, x, y };
}

/**
 * Batch-compute layout weights for multiple particles.
 */
export function computeFieldLayout(
  particleCount: number,
  bandWeights: readonly number[],
  config: RadialFieldConfig,
  baseRadius: number,
): ParticleLayoutWeight[] {
  const layout: ParticleLayoutWeight[] = new Array(particleCount);
  for (let i = 0; i < particleCount; i++) {
    layout[i] = computeParticleLayout(i, bandWeights, config, baseRadius);
  }
  return layout;
}
