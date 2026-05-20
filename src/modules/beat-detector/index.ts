/**
 * Beat Detector Module — onset detection and BPM tracking.
 *
 * TrModule implementation wrapping the pure beat detection functions.
 *
 * Outputs:
 *   - "beat": BeatDetectorOutput for renderer use
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
  beatDetectorConfigFromLookState,
  beatDetectorStep,
  createBeatDetectorState,
} from './beat-detector.js';
import type { BeatDetectorConfig, BeatDetectorState } from './types.js';
import { BEAT_DETECTOR_DEFAULTS } from './types.js';

export const BEAT_DETECTOR_MODULE_ID = 'trippy.audio.beat-detector' as const;

const BEAT_DETECTOR_MANIFEST: ModuleManifest = {
  id: BEAT_DETECTOR_MODULE_ID,
  name: 'Beat/Bar Detector',
  version: '0.1.0',
  category: 'audio-processing',
  description:
    'Energy-threshold onset detector with BPM estimation and bar phrasing.',
  costManifest: {
    moduleId: BEAT_DETECTOR_MODULE_ID,
    base: { ...zeroCost(), cpu: 0.05 },
    perInstance: zeroCost(),
  },
  dependencies: [],
};

class BeatDetectorModule implements TrModule {
  readonly manifest = BEAT_DETECTOR_MANIFEST;
  private _state: BeatDetectorState = createBeatDetectorState();
  private _config: BeatDetectorConfig = BEAT_DETECTOR_DEFAULTS;

  init(context: ModuleContext): void {
    this._state = createBeatDetectorState();
    this._config = beatDetectorConfigFromLookState(
      context.lookState as Record<string, number>,
    );

    context.registerParam('beat.onsetThreshold', {
      label: 'Beat Onset Threshold',
      min: 0.1,
      max: 1.0,
      step: 0.05,
      defaultValue: BEAT_DETECTOR_DEFAULTS.onsetThreshold,
      group: 'audio',
      tier: 'advanced',
    });

    context.registerParam('beat.minBeatIntervalMs', {
      label: 'Min Beat Interval (ms)',
      min: 100,
      max: 500,
      step: 10,
      defaultValue: BEAT_DETECTOR_DEFAULTS.minBeatIntervalMs,
      group: 'audio',
      tier: 'deep',
    });
  }

  update(
    drive: CanonicalAudioDrive,
    state: UserLookState,
    _dtMs: number,
  ): ModuleOutput {
    this._config = beatDetectorConfigFromLookState(
      state as Record<string, number>,
    );

    const bands = drive.bands.map(b => b as number);
    const flux = (drive.spectralFlux as number | undefined) ?? 0;
    const tMs = drive.tAnalysisMs as number;

    const output = beatDetectorStep(
      this._state,
      this._config,
      bands,
      flux,
      tMs,
    );

    return { beat: output };
  }

  dispose(): void {
    this._state = createBeatDetectorState();
  }
}

export function createBeatDetectorModule(): TrModule {
  return new BeatDetectorModule();
}

export {
  beatDetectorConfigFromLookState,
  beatDetectorStep,
  createBeatDetectorState,
} from './beat-detector.js';

export type {
  BeatDetectorConfig,
  BeatDetectorOutput,
  BeatDetectorState,
} from './types.js';

export { BEAT_DETECTOR_DEFAULTS } from './types.js';
