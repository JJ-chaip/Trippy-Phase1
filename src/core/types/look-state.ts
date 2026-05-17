/**
 * UserLookState — the committed semantic state of the visual instrument.
 *
 * From bible Part B:
 *   - This is a flat key-value map (no nesting beyond one level).
 *   - Every key has a declared range, default, and cost coefficient.
 *   - Mutations go through DraftLookState → CommitValidator → UserLookState.
 *   - Presets are snapshots of this state, not controllers.
 *   - No silent writes: every change must be user-visible.
 *
 * The state is intentionally kept as a plain Record so that new
 * visual parameters can be added without structural changes.
 * Each parameter's metadata (range, default, cost) lives in the
 * parameter registry, not in the state itself.
 */

import type { CostVector } from './budget.js';

/**
 * A single parameter descriptor. The registry holds one per known key.
 */
export interface ParamDescriptor {
  readonly key: string;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly defaultValue: number;
  /** Which budget axes this param influences and by how much per unit. */
  readonly costCoefficients: Partial<CostVector>;
  /** Grouping for UI (e.g. "motion", "geometry", "color", "audio"). */
  readonly group: ParamGroup;
  /** Complexity tier for progressive disclosure. */
  readonly tier: ParamTier;
}

export type ParamGroup =
  | 'motion'
  | 'geometry'
  | 'color'
  | 'glow'
  | 'audio'
  | 'performance'
  | 'fx'
  | 'composition';

export type ParamTier = 'essential' | 'advanced' | 'deep';

/**
 * The committed look state. A flat map of parameter keys to numeric values.
 *
 * Using a Record allows adding parameters without changing the type.
 * The parameter registry (ParamDescriptor[]) is the source of truth
 * for which keys are valid.
 */
export type UserLookState = Readonly<Record<string, number>>;

/**
 * Draft state during user interaction (before commit).
 * Mutable — lives only during a drag/edit session.
 */
export type DraftLookState = Record<string, number>;

/**
 * Outcome of a commit attempt.
 */
export interface CommitOutcome {
  readonly accepted: boolean;
  /** The committed state (or the last valid state if rejected). */
  readonly state: UserLookState;
  /** If rejected, the reason per violated axis. */
  readonly rejectionReasons: readonly string[];
}

/**
 * Creates a default UserLookState from a set of parameter descriptors.
 */
export function createDefaultLookState(
  descriptors: readonly ParamDescriptor[],
): UserLookState {
  const state: Record<string, number> = {};
  for (const d of descriptors) {
    state[d.key] = d.defaultValue;
  }
  return state;
}

/**
 * Clones a look state, applying overrides. Does NOT validate — that
 * is the CommitValidator's job.
 */
export function applyDraftToState(
  base: UserLookState,
  draft: Partial<DraftLookState>,
): DraftLookState {
  const result: DraftLookState = {};
  for (const key of Object.keys(base)) {
    const v = base[key];
    if (v !== undefined) result[key] = v;
  }
  for (const key of Object.keys(draft)) {
    const v = draft[key];
    if (v !== undefined) result[key] = v;
  }
  return result;
}
