/**
 * HGC Module — Homeostatic Gain Control (§F.19).
 *
 * This is a TrModule implementation that wraps the pure HGC
 * functions into the module lifecycle system.
 *
 * Registration:
 *   registry.register(createHgcModule());
 *
 * Outputs:
 *   - "ws": current gain multiplier (number)
 *   - "diagnostics": full HgcDiagnostics object
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
  createHgcState,
  hgcConfigFromLookState,
  hgcStep,
  validateHgcConfig,
} from './hgc.js';
import { HGC_CONFIG_DEFAULTS } from './types.js';
import type { HgcConfig, HgcState } from './types.js';

export const HGC_MODULE_ID = 'trippy.audio.hgc' as const;

const HGC_MANIFEST: ModuleManifest = {
  id: HGC_MODULE_ID,
  name: 'Homeostatic Gain Control',
  version: '0.1.0',
  category: 'audio-processing',
  description:
    'Slow AGC that drives input gain toward a target RMS level with asymmetric attack/decay.',
  costManifest: {
    moduleId: HGC_MODULE_ID,
    base: { ...zeroCost(), cpu: 0.1 },
    perInstance: zeroCost(),
  },
  dependencies: [],
};

class HgcModule implements TrModule {
  readonly manifest = HGC_MANIFEST;
  private _state: HgcState = createHgcState();
  private _config: HgcConfig = validateHgcConfig(HGC_CONFIG_DEFAULTS);

  init(context: ModuleContext): void {
    this._state = createHgcState();
    this._config = hgcConfigFromLookState(
      context.lookState as Record<string, number>,
    );

    context.registerParam('audio.homeostaticAdaptationRate', {
      label: 'HGC Adaptation Rate',
      min: 0.01,
      max: 0.20,
      step: 0.01,
      defaultValue: HGC_CONFIG_DEFAULTS.homeostaticAdaptationRate,
      group: 'audio',
      tier: 'advanced',
    });

    context.registerParam('audio.targetRmsLevel', {
      label: 'HGC Target RMS',
      min: 0.10,
      max: 0.90,
      step: 0.01,
      defaultValue: HGC_CONFIG_DEFAULTS.targetRmsLevel,
      group: 'audio',
      tier: 'advanced',
    });

    context.registerParam('audio.gainCeilingLimit', {
      label: 'HGC Gain Ceiling',
      min: 1.0,
      max: 20.0,
      step: 0.5,
      defaultValue: HGC_CONFIG_DEFAULTS.gainCeilingLimit,
      group: 'audio',
      tier: 'deep',
    });
  }

  update(
    drive: CanonicalAudioDrive,
    state: UserLookState,
    _dtMs: number,
  ): ModuleOutput {
    this._config = hgcConfigFromLookState(state as Record<string, number>);

    const rms = drive.rms as number;
    const [newState, diagnostics] = hgcStep(this._state, this._config, rms);
    this._state = newState;

    return {
      ws: newState.ws as number,
      diagnostics,
    };
  }

  dispose(): void {
    this._state = createHgcState();
  }
}

/**
 * Factory function — creates a fresh HGC module instance.
 * Use: registry.register(createHgcModule())
 */
export function createHgcModule(): TrModule {
  return new HgcModule();
}

// Re-export pure functions for direct use / testing
export {
  createHgcState,
  hgcConfigFromLookState,
  hgcSimulate,
  hgcStep,
  resetHgcState,
  validateHgcConfig,
} from './hgc.js';

export type { HgcConfig, HgcDiagnostics, HgcDiagStatus, HgcState } from './types.js';

export {
  HGC_CONFIG_DEFAULTS,
  HGC_CONFIG_RANGES,
  HGC_GAIN_FLOOR,
  HGC_MAX_ATTACK,
  HGC_MAX_DECAY,
  HGC_NOISE_FLOOR_FREEZE_FRAMES,
  HGC_NOISE_FLOOR_THRESHOLD,
} from './types.js';
