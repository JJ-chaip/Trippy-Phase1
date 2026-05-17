/**
 * Five-axis cost budget system (Part C of the bible).
 *
 * Every visual module declares its cost coefficients across five
 * axes. The CommitValidator sums costs and rejects any look-state
 * that exceeds the active BudgetProfile's ceilings.
 *
 * Axes:
 *   1. CPU     — JS thread time (ms per frame)
 *   2. GPU     — fill-rate / shader complexity (abstract units)
 *   3. VRAM    — texture + buffer memory (MB)
 *   4. BW      — bandwidth / data transfer (MB/s)
 *   5. Audio   — audio graph node count
 */

/** Names of the five budget axes. */
export type BudgetAxis = 'cpu' | 'gpu' | 'vram' | 'bandwidth' | 'audioGraph';

/** All five axes as a const tuple for iteration. */
export const BUDGET_AXES: readonly BudgetAxis[] = [
  'cpu',
  'gpu',
  'vram',
  'bandwidth',
  'audioGraph',
] as const;

/** Per-axis cost value. All axes must be present (no partial). */
export type CostVector = Readonly<Record<BudgetAxis, number>>;

/**
 * A budget profile defines per-axis ceilings for a deployment class.
 * E.g. "consumer-laptop", "mobile", "event-rig".
 */
export interface BudgetProfile {
  readonly name: string;
  readonly ceilings: CostVector;
}

/**
 * Cost manifest declared by a visual module / recipe.
 * `base` is the always-on cost; `perInstance` scales with count.
 */
export interface CostManifest {
  readonly moduleId: string;
  readonly base: CostVector;
  readonly perInstance: CostVector;
}

/** Result of a budget validation check. */
export interface BudgetValidationResult {
  readonly valid: boolean;
  readonly totalCost: CostVector;
  readonly ceilings: CostVector;
  /** Which axes (if any) are over budget. Empty if valid. */
  readonly violations: readonly BudgetViolation[];
}

export interface BudgetViolation {
  readonly axis: BudgetAxis;
  readonly cost: number;
  readonly ceiling: number;
  readonly overagePercent: number;
}

/**
 * Zero-cost vector. Useful as an identity element when summing.
 */
export function zeroCost(): CostVector {
  return { cpu: 0, gpu: 0, vram: 0, bandwidth: 0, audioGraph: 0 };
}

/**
 * Sum two cost vectors element-wise.
 */
export function addCosts(a: CostVector, b: CostVector): CostVector {
  return {
    cpu: a.cpu + b.cpu,
    gpu: a.gpu + b.gpu,
    vram: a.vram + b.vram,
    bandwidth: a.bandwidth + b.bandwidth,
    audioGraph: a.audioGraph + b.audioGraph,
  };
}

/**
 * Scale a cost vector by a scalar multiplier.
 */
export function scaleCost(v: CostVector, factor: number): CostVector {
  return {
    cpu: v.cpu * factor,
    gpu: v.gpu * factor,
    vram: v.vram * factor,
    bandwidth: v.bandwidth * factor,
    audioGraph: v.audioGraph * factor,
  };
}

// ── Default profiles ────────────────────────────────────────────

export const BUDGET_PROFILE_CONSUMER: BudgetProfile = {
  name: 'consumer-laptop',
  ceilings: { cpu: 8, gpu: 100, vram: 256, bandwidth: 50, audioGraph: 32 },
};

export const BUDGET_PROFILE_MOBILE: BudgetProfile = {
  name: 'mobile',
  ceilings: { cpu: 4, gpu: 50, vram: 128, bandwidth: 20, audioGraph: 16 },
};

export const BUDGET_PROFILE_EVENT_RIG: BudgetProfile = {
  name: 'event-rig',
  ceilings: { cpu: 16, gpu: 400, vram: 1024, bandwidth: 200, audioGraph: 64 },
};
