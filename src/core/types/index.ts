/**
 * Core type re-exports.
 *
 * Import from '@/core/types' to get all shared types.
 * This barrel file is the ONLY place that re-exports;
 * individual modules import from the specific file when
 * they need to avoid circular dependencies.
 */

export type {
  AudioClockMs,
  ContentHash,
  GainMultiplier,
  Hz,
  NormalisedAmplitude,
  SchemaVersion,
  Seconds,
  UnitScalar,
  WallClockMs,
} from './common.js';

export { brand, unbrand } from './common.js';

export type {
  AudioPipelineStatus,
  CanonicalAudioDrive,
} from './audio-drive.js';

export {
  AUDIO_DRIVE_SCHEMA_VERSION,
  createSilentDrive,
} from './audio-drive.js';

export type {
  BudgetAxis,
  BudgetProfile,
  BudgetValidationResult,
  BudgetViolation,
  CostManifest,
  CostVector,
} from './budget.js';

export {
  addCosts,
  BUDGET_AXES,
  BUDGET_PROFILE_CONSUMER,
  BUDGET_PROFILE_EVENT_RIG,
  BUDGET_PROFILE_MOBILE,
  scaleCost,
  zeroCost,
} from './budget.js';

export type {
  CommitOutcome,
  DraftLookState,
  ParamDescriptor,
  ParamGroup,
  ParamTier,
  UserLookState,
} from './look-state.js';

export {
  applyDraftToState,
  createDefaultLookState,
} from './look-state.js';

export type {
  ModuleCategory,
  ModuleContext,
  ModuleId,
  ModuleManifest,
  ModuleOutput,
  ModuleParamDescriptor,
  TrModule,
} from './module-types.js';
