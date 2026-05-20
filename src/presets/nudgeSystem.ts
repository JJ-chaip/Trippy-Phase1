/**
 * Nudge System — random parameter mutation engine.
 *
 * Arrow keys trigger small, varied mutations ("nudges") that
 * evolve the current preset organically. The randomize action
 * applies a dramatic, wide-ranging mutation for big jumps.
 *
 * Every mutation is random — no two presses produce the same
 * result. Parameters are clamped to safe ranges after mutation.
 */

import type { VisualPreset } from '../render/presets.js';
import { clamp } from '../utils/math.js';

/** Describes one mutable numeric parameter. */
interface ParamSpec {
  readonly key: keyof VisualPreset;
  readonly min: number;
  readonly max: number;
  /** Small nudge range (± fraction of full range). */
  readonly nudgeFrac: number;
  /** Whether the value is an integer. */
  readonly integer?: boolean;
}

/** All numeric parameters eligible for mutation. */
const PARAM_SPECS: readonly ParamSpec[] = [
  { key: 'ringCount',          min: 2,     max: 16,    nudgeFrac: 0.15, integer: true },
  { key: 'baseHue',            min: 0,     max: 360,   nudgeFrac: 0.12 },
  { key: 'hueSpread',          min: 0,     max: 120,   nudgeFrac: 0.2 },
  { key: 'hueRotateSpeed',     min: 0,     max: 60,    nudgeFrac: 0.2 },
  { key: 'baseRadiusFraction', min: 0.03,  max: 0.2,   nudgeFrac: 0.15 },
  { key: 'reactivity',         min: 0.5,   max: 6.0,   nudgeFrac: 0.15 },
  { key: 'particleCount',      min: 0,     max: 300,   nudgeFrac: 0.2, integer: true },
  { key: 'glowIntensity',      min: 0,     max: 1.0,   nudgeFrac: 0.15 },
  { key: 'lineWidth',          min: 0.5,   max: 5.0,   nudgeFrac: 0.15 },
  { key: 'fillAlpha',          min: 0,     max: 0.3,   nudgeFrac: 0.2 },
  { key: 'rotationSpeed',      min: -0.5,  max: 0.5,   nudgeFrac: 0.15 },
  { key: 'segments',           min: 32,    max: 256,   nudgeFrac: 0.15, integer: true },
  { key: 'waveDistortion',     min: 0,     max: 1.5,   nudgeFrac: 0.15 },
  { key: 'pulseIntensity',     min: 0,     max: 1.5,   nudgeFrac: 0.15 },
  { key: 'trailAlpha',         min: 0,     max: 0.5,   nudgeFrac: 0.2 },
  { key: 'bloomPasses',        min: 0,     max: 4,     nudgeFrac: 0.3, integer: true },
  { key: 'starburstRays',      min: 0,     max: 24,    nudgeFrac: 0.25, integer: true },
  { key: 'beatPulseScale',     min: 0.5,   max: 3.0,   nudgeFrac: 0.15 },
  { key: 'chromaShift',        min: 0,     max: 1.0,   nudgeFrac: 0.2 },
  { key: 'innerGlowRadius',    min: 0.05,  max: 0.35,  nudgeFrac: 0.15 },
];

/** How many parameters a single nudge touches. */
const NUDGE_PARAM_COUNT_MIN = 3;
const NUDGE_PARAM_COUNT_MAX = 6;

/** How many parameters a randomize touches. */
const RANDOMIZE_PARAM_COUNT_MIN = 10;
const RANDOMIZE_PARAM_COUNT_MAX = PARAM_SPECS.length;

/** Direction bias for themed nudges. */
export type NudgeDirection = 'up' | 'down' | 'left' | 'right';

/** Result of a nudge/randomize operation. */
export interface NudgeResult {
  readonly preset: VisualPreset;
  readonly mutatedKeys: readonly string[];
  readonly magnitude: 'nudge' | 'randomize';
}

/**
 * Apply a small, random nudge mutation.
 *
 * Each arrow direction has a loose "flavour":
 *   up    → brighter, more particles, more glow
 *   down  → subtler, fewer particles, less glow
 *   left  → hue shifts backward, wider spread
 *   right → hue shifts forward, tighter focus
 *
 * Within that bias, the selection and magnitude are random.
 */
export function nudgePreset(
  source: VisualPreset,
  direction: NudgeDirection,
): NudgeResult {
  const count = randInt(NUDGE_PARAM_COUNT_MIN, NUDGE_PARAM_COUNT_MAX);
  const chosen = pickRandomSubset(PARAM_SPECS, count);
  const mutated = { ...source } as Record<string, unknown>;
  const mutatedKeys: string[] = [];

  for (const spec of chosen) {
    const current = (source[spec.key] as number | undefined) ?? spec.min;
    const range = spec.max - spec.min;
    const maxDelta = range * spec.nudgeFrac;
    let delta = (Math.random() * 2 - 1) * maxDelta;

    delta = applyDirectionBias(spec.key as string, delta, direction);

    let next = current + delta;
    next = clamp(next, spec.min, spec.max);
    if (spec.integer) next = Math.round(next);

    mutated[spec.key] = next;
    mutatedKeys.push(spec.key);
  }

  // Occasionally flip boolean parameters for variety
  if (Math.random() < 0.15) {
    mutated['mirror'] = !source.mirror;
    mutatedKeys.push('mirror');
  }
  if (Math.random() < 0.1) {
    mutated['hueRotate'] = !source.hueRotate;
    mutatedKeys.push('hueRotate');
  }

  return {
    preset: mutated as unknown as VisualPreset,
    mutatedKeys,
    magnitude: 'nudge',
  };
}

/**
 * Apply a large, dramatic random mutation.
 * Touches most parameters with wide deltas — a "shuffle".
 */
export function randomizePreset(source: VisualPreset): NudgeResult {
  const count = randInt(RANDOMIZE_PARAM_COUNT_MIN, RANDOMIZE_PARAM_COUNT_MAX);
  const chosen = pickRandomSubset(PARAM_SPECS, count);
  const mutated = { ...source } as Record<string, unknown>;
  const mutatedKeys: string[] = [];

  for (const spec of chosen) {
    const range = spec.max - spec.min;
    let next = spec.min + Math.random() * range;
    if (spec.integer) next = Math.round(next);
    mutated[spec.key] = next;
    mutatedKeys.push(spec.key);
  }

  // Randomize booleans
  mutated['mirror'] = Math.random() < 0.4;
  mutatedKeys.push('mirror');
  mutated['hueRotate'] = Math.random() < 0.7;
  mutatedKeys.push('hueRotate');

  // Pick a random background darkness
  const bgHue = Math.round(Math.random() * 360);
  const bgLight = Math.round(Math.random() * 6 + 1);
  mutated['bgColor'] = `hsl(${bgHue}, 30%, ${bgLight}%)`;
  mutatedKeys.push('bgColor');

  return {
    preset: mutated as unknown as VisualPreset,
    mutatedKeys,
    magnitude: 'randomize',
  };
}

/**
 * Generate a fully random preset from scratch.
 */
export function generateRandomPreset(): VisualPreset {
  const mutated: Record<string, unknown> = {};

  mutated['id'] = 'random-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  mutated['name'] = 'Random';
  mutated['description'] = 'Randomly generated preset';

  for (const spec of PARAM_SPECS) {
    const range = spec.max - spec.min;
    let val = spec.min + Math.random() * range;
    if (spec.integer) val = Math.round(val);
    mutated[spec.key] = val;
  }

  mutated['mirror'] = Math.random() < 0.35;
  mutated['hueRotate'] = Math.random() < 0.6;

  const bgHue = Math.round(Math.random() * 360);
  const bgLight = Math.round(Math.random() * 6 + 1);
  mutated['bgColor'] = `hsl(${bgHue}, 30%, ${bgLight}%)`;

  return mutated as unknown as VisualPreset;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function applyDirectionBias(key: string, delta: number, dir: NudgeDirection): number {
  const absDelta = Math.abs(delta);

  switch (dir) {
    case 'up':
      if (['glowIntensity', 'particleCount', 'bloomPasses', 'pulseIntensity', 'beatPulseScale'].includes(key)) {
        return absDelta;
      }
      if (['reactivity', 'starburstRays', 'chromaShift'].includes(key)) {
        return absDelta * 0.8;
      }
      break;
    case 'down':
      if (['glowIntensity', 'particleCount', 'bloomPasses', 'pulseIntensity', 'beatPulseScale'].includes(key)) {
        return -absDelta;
      }
      if (['reactivity', 'starburstRays', 'chromaShift'].includes(key)) {
        return -absDelta * 0.8;
      }
      break;
    case 'left':
      if (key === 'baseHue') return -absDelta * 1.5;
      if (key === 'hueSpread') return absDelta;
      if (key === 'rotationSpeed') return -absDelta;
      break;
    case 'right':
      if (key === 'baseHue') return absDelta * 1.5;
      if (key === 'hueSpread') return -absDelta * 0.6;
      if (key === 'rotationSpeed') return absDelta;
      break;
  }

  return delta;
}

function pickRandomSubset<T>(arr: readonly T[], count: number): T[] {
  const pool = [...arr];
  const result: T[] = [];
  const n = Math.min(count, pool.length);

  for (let i = 0; i < n; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    result.push(pool[idx]!);
    pool.splice(idx, 1);
  }

  return result;
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
