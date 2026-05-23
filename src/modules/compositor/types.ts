/**
 * Compositor types — §F.21 three-tier hierarchical presentation.
 *
 * Reduces long-set fatigue by compositing motion into three
 * presentation layers:
 *   Deep     — slow gradients, ambience (sub-bass / long envelopes)
 *   Mid      — core meshes / stable structure (mids, harmonic carriers)
 *   Superficial — sparkles, transient flashes (treble / sharp transients)
 *
 * Keys: presentation.layerCompositionBias, presentation.superficialAttnWeight
 */

import type { CostVector } from '../../core/types/budget.js';

/** The three compositor layers. */
export type CompositorLayer = 'deep' | 'mid' | 'superficial';

export const COMPOSITOR_LAYERS: readonly CompositorLayer[] = [
  'deep',
  'mid',
  'superficial',
] as const;

/** Configuration for the three-tier compositor. */
export interface CompositorConfig {
  /** Balance between layer groups [0,1]. 0 = deep-heavy, 1 = superficial-heavy. */
  readonly layerCompositionBias: number;
  /** Transient/superficial layer intensity [0,1]. */
  readonly superficialAttnWeight: number;
}

export const COMPOSITOR_DEFAULTS: CompositorConfig = {
  layerCompositionBias: 0.5,
  superficialAttnWeight: 0.6,
};

/** Per-layer intensity computed from audio energy. */
export interface LayerIntensity {
  readonly deep: number;
  readonly mid: number;
  readonly superficial: number;
}

/** Per-layer partial cost vector for budget attribution. */
export interface LayerCostAttribution {
  readonly deep: CostVector;
  readonly mid: CostVector;
  readonly superficial: CostVector;
  readonly total: CostVector;
}

/** Diagnostics emitted by the compositor module. */
export interface CompositorDiagnostics {
  readonly layerIntensity: LayerIntensity;
  readonly compositionBias: number;
  readonly superficialWeight: number;
  readonly costAttribution: LayerCostAttribution;
  /** Whether the superficial layer was budget-clamped. */
  readonly superficialClamped: boolean;
}
