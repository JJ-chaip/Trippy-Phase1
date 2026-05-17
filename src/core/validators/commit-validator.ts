/**
 * CommitValidator — five-axis cost budget enforcer (Part C of bible).
 *
 * Before any UserLookState mutation is committed, the validator
 * sums the cost of all active modules/parameters and checks
 * against the active BudgetProfile's ceilings.
 *
 * If any axis exceeds its ceiling, the commit is rejected with
 * a detailed violation report. The UI can then ghost the slider
 * or show a rejection toast.
 */

import type {
  BudgetAxis,
  BudgetProfile,
  BudgetValidationResult,
  BudgetViolation,
  CostManifest,
  CostVector,
} from '../types/budget.js';
import { addCosts, BUDGET_AXES, zeroCost } from '../types/budget.js';
import type { CommitOutcome, UserLookState } from '../types/look-state.js';

export class CommitValidator {
  private _profile: BudgetProfile;
  private readonly _manifests = new Map<string, CostManifest>();

  constructor(profile: BudgetProfile) {
    this._profile = profile;
  }

  /** Current budget profile. */
  get profile(): BudgetProfile {
    return this._profile;
  }

  /** Switch to a different budget profile. */
  setProfile(profile: BudgetProfile): void {
    this._profile = profile;
  }

  /**
   * Register a module's cost manifest.
   * Called during module registration.
   */
  registerCost(manifest: CostManifest): void {
    this._manifests.set(manifest.moduleId, manifest);
  }

  /**
   * Remove a module's cost manifest (on dispose).
   */
  unregisterCost(moduleId: string): void {
    this._manifests.delete(moduleId);
  }

  /**
   * Validate a proposed state against the budget.
   * This is a pure check — it does not mutate anything.
   */
  validate(
    _proposedState: UserLookState,
    instanceCounts?: ReadonlyMap<string, number>,
  ): BudgetValidationResult {
    let total = zeroCost();

    for (const [moduleId, manifest] of this._manifests) {
      total = addCosts(total, manifest.base);

      const count = instanceCounts?.get(moduleId) ?? 1;
      if (count > 1) {
        const extra: CostVector = {
          cpu: manifest.perInstance.cpu * (count - 1),
          gpu: manifest.perInstance.gpu * (count - 1),
          vram: manifest.perInstance.vram * (count - 1),
          bandwidth: manifest.perInstance.bandwidth * (count - 1),
          audioGraph: manifest.perInstance.audioGraph * (count - 1),
        };
        total = addCosts(total, extra);
      }
    }

    const violations: BudgetViolation[] = [];
    for (const axis of BUDGET_AXES) {
      if (total[axis] > this._profile.ceilings[axis]) {
        violations.push({
          axis,
          cost: total[axis],
          ceiling: this._profile.ceilings[axis],
          overagePercent:
            ((total[axis] - this._profile.ceilings[axis]) /
              this._profile.ceilings[axis]) *
            100,
        });
      }
    }

    return {
      valid: violations.length === 0,
      totalCost: total,
      ceilings: this._profile.ceilings,
      violations,
    };
  }

  /**
   * Attempt to commit a draft state. Returns CommitOutcome.
   * If valid, the proposed state becomes the new committed state.
   * If invalid, the previous state is returned unchanged.
   */
  tryCommit(
    previousState: UserLookState,
    proposedState: UserLookState,
    instanceCounts?: ReadonlyMap<string, number>,
  ): CommitOutcome {
    const result = this.validate(proposedState, instanceCounts);

    if (result.valid) {
      return {
        accepted: true,
        state: proposedState,
        rejectionReasons: [],
      };
    }

    const reasons = result.violations.map(
      (v: BudgetViolation) =>
        `${v.axis}: cost ${v.cost.toFixed(1)} exceeds ceiling ${v.ceiling.toFixed(1)} (+${v.overagePercent.toFixed(0)}%)`,
    );

    return {
      accepted: false,
      state: previousState,
      rejectionReasons: reasons,
    };
  }

  /**
   * Get a human-readable summary of current budget usage.
   * Useful for diagnostic overlays.
   */
  budgetSummary(
    instanceCounts?: ReadonlyMap<string, number>,
  ): Record<BudgetAxis, { used: number; ceiling: number; percent: number }> {
    const result = this.validate({}, instanceCounts);
    const summary = {} as Record<
      BudgetAxis,
      { used: number; ceiling: number; percent: number }
    >;
    for (const axis of BUDGET_AXES) {
      summary[axis] = {
        used: result.totalCost[axis],
        ceiling: result.ceilings[axis],
        percent:
          result.ceilings[axis] > 0
            ? (result.totalCost[axis] / result.ceilings[axis]) * 100
            : 0,
      };
    }
    return summary;
  }
}
