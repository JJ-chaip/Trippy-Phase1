/**
 * Pure math utilities used across the codebase.
 *
 * Every function here is deterministic and side-effect-free.
 * They operate on plain numbers — branded types are unwrapped
 * by callers at the boundary.
 */

/**
 * Clamp a value to [min, max].
 * Handles NaN by returning min (fail-safe).
 */
export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Linear interpolation between a and b.
 * t=0 → a, t=1 → b. t is NOT clamped (extrapolation allowed).
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Inverse lerp: given a value in [a, b], return t in [0, 1].
 * Returns 0 if a === b (degenerate range).
 */
export function inverseLerp(a: number, b: number, value: number): number {
  if (a === b) return 0;
  return (value - a) / (b - a);
}

/**
 * Remap a value from [inMin, inMax] to [outMin, outMax].
 */
export function remap(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  const t = inverseLerp(inMin, inMax, value);
  return lerp(outMin, outMax, t);
}

/**
 * Exponential smoothing (EMA).
 * factor in (0, 1]: higher = more responsive, lower = smoother.
 */
export function exponentialSmooth(
  current: number,
  target: number,
  factor: number,
): number {
  return current + (target - current) * clamp(factor, 0, 1);
}

/**
 * Asymmetric clamp: clamps delta to [-maxNeg, +maxPos].
 * Used by HGC for attack/decay rate limiting.
 */
export function asymmetricClamp(
  delta: number,
  maxNegative: number,
  maxPositive: number,
): number {
  if (delta > maxPositive) return maxPositive;
  if (delta < -maxNegative) return -maxNegative;
  return delta;
}

/**
 * Check if a number is finite and not NaN.
 */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
