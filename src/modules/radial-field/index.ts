/**
 * Radial Field Module — §F.20 polar layout prior.
 *
 * TrModule implementation that computes polar particle positions
 * based on audio band energies and foveal frequency bias.
 *
 * Outputs:
 *   - "layout": ParticleLayoutWeight[] for renderer use
 *   - "bandWeights": normalised band weights
 *   - "diagnostics": RadialFieldDiagnostics
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
  computeBandWeights,
  computeFieldLayout,
  radialFieldConfigFromLookState,
} from './radial-field.js';
import type { RadialFieldConfig, RadialFieldDiagnostics } from './types.js';
import { RADIAL_FIELD_DEFAULTS } from './types.js';

export const RADIAL_FIELD_MODULE_ID = 'trippy.visual.radial-field' as const;

const RADIAL_FIELD_MANIFEST: ModuleManifest = {
  id: RADIAL_FIELD_MODULE_ID,
  name: 'Radial Field Layout',
  version: '0.1.0',
  category: 'visual-recipe',
  description:
    'Polar particle/field layout prior — higher bands bias centre, sub-bass to periphery.',
  costManifest: {
    moduleId: RADIAL_FIELD_MODULE_ID,
    base: { ...zeroCost(), cpu: 0.2, gpu: 0.5 },
    perInstance: zeroCost(),
  },
  dependencies: [],
};

const DEFAULT_PARTICLE_COUNT = 120;
const DEFAULT_BASE_RADIUS = 0.8;

class RadialFieldModule implements TrModule {
  readonly manifest = RADIAL_FIELD_MANIFEST;
  private _config: RadialFieldConfig = RADIAL_FIELD_DEFAULTS;

  init(context: ModuleContext): void {
    this._config = radialFieldConfigFromLookState(
      context.lookState as Record<string, number>,
    );

    context.registerParam('field.fovealFrequencyBias', {
      label: 'Foveal Frequency Bias',
      min: 0,
      max: 1,
      step: 0.05,
      defaultValue: RADIAL_FIELD_DEFAULTS.fovealFrequencyBias,
      group: 'field',
      tier: 'advanced',
    });

    context.registerParam('field.stereoAsymmetryBal', {
      label: 'Stereo Asymmetry',
      min: 0,
      max: 1,
      step: 0.05,
      defaultValue: RADIAL_FIELD_DEFAULTS.stereoAsymmetryBal,
      group: 'field',
      tier: 'deep',
    });
  }

  update(
    drive: CanonicalAudioDrive,
    state: UserLookState,
    _dtMs: number,
  ): ModuleOutput {
    this._config = radialFieldConfigFromLookState(
      state as Record<string, number>,
    );

    const bands = drive.bands.map(b => b as number);
    const centroidHz = (drive.spectralCentroidHz as number | undefined) ?? 1000;
    // Normalise centroid to [0,1] — 200Hz = 0, 8000Hz = 1
    const centroidNorm = Math.min(1, Math.max(0, (centroidHz - 200) / 7800));

    const bandWeights = computeBandWeights(bands, centroidNorm);

    const layout = computeFieldLayout(
      DEFAULT_PARTICLE_COUNT,
      bandWeights,
      this._config,
      DEFAULT_BASE_RADIUS,
    );

    const diagnostics: RadialFieldDiagnostics = {
      bandWeights,
      fovealBias: this._config.fovealFrequencyBias,
      stereoAsymmetry: this._config.stereoAsymmetryBal,
      particleCount: layout.length,
    };

    return {
      layout,
      bandWeights,
      diagnostics,
    };
  }

  dispose(): void {
    // No persistent state to clean up
  }
}

export function createRadialFieldModule(): TrModule {
  return new RadialFieldModule();
}

export {
  computeBandWeights,
  computeFieldLayout,
  computeParticleAffinity,
  computeParticleLayout,
  computeParticleOmega,
  computeRadius,
  radialFieldConfigFromLookState,
} from './radial-field.js';

export type {
  ParticleLayoutWeight,
  RadialFieldConfig,
  RadialFieldDiagnostics,
} from './types.js';

export { RADIAL_FIELD_DEFAULTS } from './types.js';
