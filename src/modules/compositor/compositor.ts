/**
 * Compositor — §F.21 three-tier hierarchical presentation (pure functions).
 *
 * Deep: slow gradients driven by sub-bass / long envelopes.
 * Mid:  core structure driven by mids / harmonic carriers.
 * Superficial: sparkles / transients driven by treble / onset flux.
 *
 * Each layer carries partial cost vectors for CommitValidator integration.
 */

import { clamp } from '../../utils/math.js';
import { addCosts } from '../../core/types/budget.js';
import type { CostVector } from '../../core/types/budget.js';
import type {
  CompositorConfig,
  LayerIntensity,
  LayerCostAttribution,
} from './types.js';
import { COMPOSITOR_DEFAULTS } from './types.js';

/**
 * Derive compositor config from look state keys.
 */
export function compositorConfigFromLookState(
  state: Record<string, number>,
): CompositorConfig {
  return {
    layerCompositionBias: clamp(
      state['presentation.layerCompositionBias'] ?? COMPOSITOR_DEFAULTS.layerCompositionBias,
      0,
      1,
    ),
    superficialAttnWeight: clamp(
      state['presentation.superficialAttnWeight'] ?? COMPOSITOR_DEFAULTS.superficialAttnWeight,
      0,
      1,
    ),
  };
}

/**
 * Compute per-layer intensity from audio bands and config.
 *
 * Band mapping (8-band default):
 *   Deep:        bands 0-1 (sub-bass, bass)
 *   Mid:         bands 2-5 (low-mid through upper-mid)
 *   Superficial: bands 6-7 (brilliance, air) + spectral flux
 */
export function computeLayerIntensity(
  bands: readonly number[],
  spectralFlux: number,
  config: CompositorConfig,
): LayerIntensity {
  const n = bands.length;

  // Deep: sub-bass + bass energy (slow, ambient)
  let deepEnergy = 0;
  const deepEnd = Math.min(2, n);
  for (let i = 0; i < deepEnd; i++) {
    deepEnergy += bands[i] as number;
  }
  deepEnergy = deepEnd > 0 ? deepEnergy / deepEnd : 0;

  // Mid: core harmonic carriers
  let midEnergy = 0;
  const midStart = Math.min(2, n);
  const midEnd = Math.min(6, n);
  const midCount = midEnd - midStart;
  for (let i = midStart; i < midEnd; i++) {
    midEnergy += bands[i] as number;
  }
  midEnergy = midCount > 0 ? midEnergy / midCount : 0;

  // Superficial: treble + transients
  let supEnergy = 0;
  const supStart = Math.min(6, n);
  const supCount = n - supStart;
  for (let i = supStart; i < n; i++) {
    supEnergy += bands[i] as number;
  }
  supEnergy = supCount > 0 ? supEnergy / supCount : 0;
  // Weight in spectral flux for transient sparkles
  supEnergy = supEnergy * 0.6 + spectralFlux * 0.4;

  // Apply composition bias: shifts energy between layers
  const bias = config.layerCompositionBias;
  const deepWeight = 1.0 - bias * 0.6;
  const supWeight = config.superficialAttnWeight * (0.4 + bias * 0.6);

  return {
    deep: clamp(deepEnergy * deepWeight, 0, 1),
    mid: clamp(midEnergy, 0, 1),
    superficial: clamp(supEnergy * supWeight, 0, 1),
  };
}

/**
 * Compute per-layer cost attribution.
 *
 * §F.21.1: Each layer contributes partial cost vectors:
 *   Deep:  primarily VRAM (large backgrounds)
 *   Mid:   balanced GPU + fill
 *   Sup:   gpuFill-heavy, scaled by superficialAttnWeight
 */
export function computeLayerCosts(
  intensity: LayerIntensity,
  config: CompositorConfig,
): LayerCostAttribution {
  const deepCost: CostVector = {
    cpu: 0.1 * intensity.deep,
    gpu: 0.5 * intensity.deep,
    vram: 2.0 * intensity.deep,
    bandwidth: 0,
    audioGraph: 0,
  };

  const midCost: CostVector = {
    cpu: 0.3 * intensity.mid,
    gpu: 1.5 * intensity.mid,
    vram: 0.5 * intensity.mid,
    bandwidth: 0,
    audioGraph: 0,
  };

  // Superficial cost is multiplied by superficialAttnWeight
  const supScale = config.superficialAttnWeight;
  const supCost: CostVector = {
    cpu: 0.2 * intensity.superficial * supScale,
    gpu: 3.0 * intensity.superficial * supScale,
    vram: 0.2 * intensity.superficial,
    bandwidth: 0,
    audioGraph: 0,
  };

  const total = addCosts(addCosts(deepCost, midCost), supCost);

  return { deep: deepCost, mid: midCost, superficial: supCost, total };
}

/**
 * Check if the superficial layer would need clamping given a GPU ceiling.
 * Returns true if the superficial cost alone exceeds a reasonable fraction.
 */
export function shouldClampSuperficial(
  costs: LayerCostAttribution,
  gpuCeiling: number,
): boolean {
  return costs.superficial.gpu > gpuCeiling * 0.4;
}

/**
 * Compute smoothed layer intensities with temporal coherence.
 * Prevents jarring jumps between frames.
 */
export function smoothLayerIntensity(
  current: LayerIntensity,
  target: LayerIntensity,
  dtSec: number,
): LayerIntensity {
  // Deep layer smooths slowly (ambient), superficial reacts fast (transient)
  const deepFactor = clamp(dtSec * 3, 0, 1);
  const midFactor = clamp(dtSec * 6, 0, 1);
  const supFactor = clamp(dtSec * 12, 0, 1);

  return {
    deep: current.deep + (target.deep - current.deep) * deepFactor,
    mid: current.mid + (target.mid - current.mid) * midFactor,
    superficial: current.superficial + (target.superficial - current.superficial) * supFactor,
  };
}
