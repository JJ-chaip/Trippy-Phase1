/**
 * Compositor Module — §F.21 three-tier hierarchical presentation.
 *
 * TrModule implementation that computes per-layer intensity and
 * cost attribution for the deep/mid/superficial presentation layers.
 *
 * Outputs:
 *   - "layerIntensity": LayerIntensity for renderer use
 *   - "costAttribution": LayerCostAttribution for budget checks
 *   - "diagnostics": CompositorDiagnostics
 */

import type { CanonicalAudioDrive } from '../../core/types/audio-drive.js';
import type { UserLookState } from '../../core/types/look-state.js';
import type {
  ModuleContext,
  ModuleManifest,
  ModuleOutput,
  TrModule,
} from '../../core/types/module-types.js';
import { zeroCost } from '../../core/types/budget.js';
import {
  compositorConfigFromLookState,
  computeLayerCosts,
  computeLayerIntensity,
  shouldClampSuperficial,
  smoothLayerIntensity,
} from './compositor.js';
import type {
  CompositorConfig,
  CompositorDiagnostics,
  LayerIntensity,
} from './types.js';
import { COMPOSITOR_DEFAULTS } from './types.js';

export const COMPOSITOR_MODULE_ID = 'trippy.visual.compositor' as const;

const COMPOSITOR_MANIFEST: ModuleManifest = {
  id: COMPOSITOR_MODULE_ID,
  name: 'Three-Tier Compositor',
  version: '0.1.0',
  category: 'compositor',
  description:
    'Deep/mid/superficial layer compositing with per-layer cost attribution.',
  costManifest: {
    moduleId: COMPOSITOR_MODULE_ID,
    base: { ...zeroCost(), cpu: 0.15 },
    perInstance: zeroCost(),
  },
  dependencies: [],
};

const DEFAULT_GPU_CEILING = 100;

class CompositorModule implements TrModule {
  readonly manifest = COMPOSITOR_MANIFEST;
  private _config: CompositorConfig = COMPOSITOR_DEFAULTS;
  private _smoothedIntensity: LayerIntensity = { deep: 0, mid: 0, superficial: 0 };

  init(context: ModuleContext): void {
    this._config = compositorConfigFromLookState(
      context.lookState as Record<string, number>,
    );
    this._smoothedIntensity = { deep: 0, mid: 0, superficial: 0 };

    context.registerParam('presentation.layerCompositionBias', {
      label: 'Layer Composition Bias',
      min: 0,
      max: 1,
      step: 0.05,
      defaultValue: COMPOSITOR_DEFAULTS.layerCompositionBias,
      group: 'presentation',
      tier: 'advanced',
    });

    context.registerParam('presentation.superficialAttnWeight', {
      label: 'Superficial Layer Weight',
      min: 0,
      max: 1,
      step: 0.05,
      defaultValue: COMPOSITOR_DEFAULTS.superficialAttnWeight,
      group: 'presentation',
      tier: 'advanced',
    });
  }

  update(
    drive: CanonicalAudioDrive,
    state: UserLookState,
    dtMs: number,
  ): ModuleOutput {
    this._config = compositorConfigFromLookState(
      state as Record<string, number>,
    );

    const bands = drive.bands.map(b => b as number);
    const flux = (drive.spectralFlux as number | undefined) ?? 0;

    const rawIntensity = computeLayerIntensity(bands, flux, this._config);

    // Smooth for temporal coherence
    const dtSec = dtMs / 1000;
    this._smoothedIntensity = smoothLayerIntensity(
      this._smoothedIntensity,
      rawIntensity,
      dtSec,
    );

    const costs = computeLayerCosts(this._smoothedIntensity, this._config);
    const clamped = shouldClampSuperficial(costs, DEFAULT_GPU_CEILING);

    const diagnostics: CompositorDiagnostics = {
      layerIntensity: this._smoothedIntensity,
      compositionBias: this._config.layerCompositionBias,
      superficialWeight: this._config.superficialAttnWeight,
      costAttribution: costs,
      superficialClamped: clamped,
    };

    return {
      layerIntensity: this._smoothedIntensity,
      costAttribution: costs,
      diagnostics,
    };
  }

  dispose(): void {
    this._smoothedIntensity = { deep: 0, mid: 0, superficial: 0 };
  }
}

export function createCompositorModule(): TrModule {
  return new CompositorModule();
}

export {
  compositorConfigFromLookState,
  computeLayerCosts,
  computeLayerIntensity,
  shouldClampSuperficial,
  smoothLayerIntensity,
} from './compositor.js';

export type {
  CompositorConfig,
  CompositorDiagnostics,
  CompositorLayer,
  LayerCostAttribution,
  LayerIntensity,
} from './types.js';

export { COMPOSITOR_DEFAULTS, COMPOSITOR_LAYERS } from './types.js';
