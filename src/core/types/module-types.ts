/**
 * Module system types — the extensibility backbone.
 *
 * Every feature (HGC, radial field, compositor, future recipes)
 * implements the TrModule interface and registers via the
 * ModuleRegistry. This allows adding new modules without
 * touching existing code.
 *
 * Lifecycle:
 *   1. Module factory creates instance → registry.register(module)
 *   2. On activate: module.init(context)
 *   3. Per frame: module.update(drive, state, dt)
 *   4. On teardown: module.dispose()
 *
 * Modules declare their cost via CostManifest so the
 * CommitValidator can enforce budget ceilings.
 */

import type { CanonicalAudioDrive } from './audio-drive.js';
import type { CostManifest } from './budget.js';
import type { UserLookState } from './look-state.js';

/** Unique identifier for a module instance. */
export type ModuleId = string;

/** Category for filtering / grouping modules. */
export type ModuleCategory =
  | 'audio-processing'
  | 'visual-recipe'
  | 'compositor'
  | 'analysis'
  | 'utility';

/**
 * Static metadata about a module. Does not change after creation.
 */
export interface ModuleManifest {
  readonly id: ModuleId;
  readonly name: string;
  readonly version: string;
  readonly category: ModuleCategory;
  readonly description: string;
  readonly costManifest: CostManifest;
  /**
   * Module IDs this module depends on. The registry ensures
   * dependencies are initialised first.
   */
  readonly dependencies: readonly ModuleId[];
}

/**
 * Runtime context provided to modules during init.
 */
export interface ModuleContext {
  readonly lookState: UserLookState;
  /** Request a param descriptor to be registered for this module. */
  readonly registerParam: (key: string, descriptor: ModuleParamDescriptor) => void;
}

/**
 * Simplified param descriptor for module-declared params.
 */
export interface ModuleParamDescriptor {
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly defaultValue: number;
  readonly group: string;
  readonly tier: 'essential' | 'advanced' | 'deep';
}

/**
 * The core module interface. All modules must implement this.
 *
 * Methods returning void may be async in future horizons,
 * but for H0-H1 they are synchronous to keep the frame loop
 * predictable.
 */
export interface TrModule {
  readonly manifest: ModuleManifest;

  /**
   * Called once when the module is activated.
   * Set up internal state, register parameters.
   */
  init(context: ModuleContext): void;

  /**
   * Called once per frame with the current audio drive and look state.
   * Returns an optional output that downstream modules can consume.
   */
  update(
    drive: CanonicalAudioDrive,
    state: UserLookState,
    dtMs: number,
  ): ModuleOutput;

  /**
   * Called when the module is deactivated. Release resources.
   */
  dispose(): void;
}

/**
 * Output from a module's update(). Keyed by output name.
 * Downstream modules can read these via the frame context.
 */
export type ModuleOutput = Readonly<Record<string, unknown>>;
