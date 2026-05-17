/**
 * HGC (Homeostatic Gain Control) — pure functions, §F.19.
 *
 * This module implements a slow Automatic Gain Control that drives
 * the audio input gain W_s toward a target RMS level. It uses
 * asymmetric attack/decay clamping to provide smooth, musical
 * gain riding without noise-floor runaway.
 *
 * All functions are pure and deterministic. No side effects,
 * no DOM, no WebGPU — just math. This is the mandated first
 * deliverable per EXECUTION_CONTRACT §3.
 *
 * Algorithm (from bible §F.19):
 *   dWs/dt = adaptationRate * (targetRms - A_RMS(t))
 *   Ws(t) = Ws(t-1) + Clamp(dWs/dt, -MAX_DECAY, MAX_ATTACK)
 *   Ws(t) = Clamp(Ws(t), GAIN_FLOOR, gainCeilingLimit)
 *
 * Noise floor freeze:
 *   When A_RMS < 0.002 for N consecutive frames, freeze Ws.
 *   This prevents gain from spiralling up during silence.
 */

import type { GainMultiplier, NormalisedAmplitude } from '../../core/types/common.js';
import { clamp, asymmetricClamp } from '../../utils/math.js';
import type { HgcConfig, HgcDiagnostics, HgcDiagStatus, HgcState } from './types.js';
import {
  HGC_CONFIG_DEFAULTS,
  HGC_CONFIG_RANGES,
  HGC_GAIN_FLOOR,
  HGC_MAX_ATTACK,
  HGC_MAX_DECAY,
  HGC_NOISE_FLOOR_FREEZE_FRAMES,
  HGC_NOISE_FLOOR_THRESHOLD,
} from './types.js';

// ── Config validation ───────────────────────────────────────────

/**
 * Validate and clamp an HGC config to its declared ranges.
 * Returns a fully valid config — never throws.
 * Invalid/NaN values are replaced with defaults.
 */
export function validateHgcConfig(partial: Partial<HgcConfig>): HgcConfig {
  return {
    homeostaticAdaptationRate: clampConfigField(
      partial.homeostaticAdaptationRate,
      HGC_CONFIG_RANGES.homeostaticAdaptationRate,
      HGC_CONFIG_DEFAULTS.homeostaticAdaptationRate,
    ),
    targetRmsLevel: clampConfigField(
      partial.targetRmsLevel,
      HGC_CONFIG_RANGES.targetRmsLevel,
      HGC_CONFIG_DEFAULTS.targetRmsLevel,
    ),
    gainCeilingLimit: clampConfigField(
      partial.gainCeilingLimit,
      HGC_CONFIG_RANGES.gainCeilingLimit,
      HGC_CONFIG_DEFAULTS.gainCeilingLimit,
    ),
  };
}

function clampConfigField(
  value: number | undefined,
  range: { readonly min: number; readonly max: number },
  fallback: number,
): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return clamp(value, range.min, range.max);
}

// ── State management ────────────────────────────────────────────

/**
 * Create a fresh HGC state. Called on init or audio source change.
 * Starting Ws at 1.0 means "no amplification" — the AGC will
 * ramp up if signal is quiet.
 */
export function createHgcState(): HgcState {
  return {
    ws: 1.0 as GainMultiplier,
    previousRms: 0 as NormalisedAmplitude,
    noiseFloorFrameCount: 0,
    frozen: false,
    frameCount: 0,
  };
}

/**
 * Reset HGC state without creating a new object.
 * Useful when audio source changes mid-session.
 */
export function resetHgcState(_state: HgcState): HgcState {
  return {
    ws: 1.0 as GainMultiplier,
    previousRms: 0 as NormalisedAmplitude,
    noiseFloorFrameCount: 0,
    frozen: false,
    frameCount: 0,
  };
}

// ── Core algorithm ──────────────────────────────────────────────

/**
 * Single HGC step: compute the next gain multiplier W_s.
 *
 * This is the heart of §F.19. Pure function — takes current state
 * and config, returns new state and diagnostics.
 *
 * @param state  Current HGC state (immutable read).
 * @param config Validated HGC configuration.
 * @param currentRms Current frame's RMS amplitude [0,1].
 * @returns Tuple of [newState, diagnostics].
 */
export function hgcStep(
  state: HgcState,
  config: HgcConfig,
  currentRms: number,
): [HgcState, HgcDiagnostics] {
  // Sanitize input: NaN or negative RMS → 0
  const safeRms = Number.isFinite(currentRms) && currentRms >= 0
    ? currentRms
    : 0;

  const frameCount = state.frameCount + 1;

  // ── Noise floor detection ──
  const belowNoiseFloor = safeRms < HGC_NOISE_FLOOR_THRESHOLD;
  let noiseFloorFrameCount = belowNoiseFloor
    ? state.noiseFloorFrameCount + 1
    : 0;
  const frozen = noiseFloorFrameCount >= HGC_NOISE_FLOOR_FREEZE_FRAMES;

  // ── If frozen, hold Ws steady ──
  if (frozen) {
    const diag: HgcDiagnostics = {
      agcStatus: 'ENGINE: AGC_FROZEN_NOISE_FLOOR',
      ws: state.ws as number,
      targetRms: config.targetRmsLevel,
      currentRms: safeRms,
      delta: 0,
      clampedDelta: 0,
      frozen: true,
      noiseFloorFrameCount,
      frameCount,
    };
    return [
      {
        ws: state.ws,
        previousRms: safeRms as NormalisedAmplitude,
        noiseFloorFrameCount,
        frozen: true,
        frameCount,
      },
      diag,
    ];
  }

  // ── Compute raw delta ──
  // dWs/dt = adaptationRate * (targetRms - A_RMS)
  // When A_RMS < target → delta > 0 → gain increases (attack)
  // When A_RMS > target → delta < 0 → gain decreases (decay)
  const rawDelta = config.homeostaticAdaptationRate * (config.targetRmsLevel - safeRms);

  // ── Asymmetric clamp ──
  // Attack (gain increase) is faster than decay (gain decrease).
  // This matches musical expectations: quiet → loud response
  // is quicker than loud → quiet settling.
  const clampedDelta = asymmetricClamp(rawDelta, HGC_MAX_DECAY, HGC_MAX_ATTACK);

  // ── Apply delta and enforce bounds ──
  let newWs = (state.ws as number) + clampedDelta;
  newWs = clamp(newWs, HGC_GAIN_FLOOR, config.gainCeilingLimit);

  // ── Determine diagnostic status ──
  let agcStatus: HgcDiagStatus;
  if (newWs >= config.gainCeilingLimit) {
    agcStatus = 'ENGINE: AGC_CEILING_MAX';
  } else if (newWs <= HGC_GAIN_FLOOR) {
    agcStatus = 'ENGINE: AGC_FLOOR_MIN';
  } else if (Math.abs(clampedDelta) < 1e-8) {
    agcStatus = 'ENGINE: AGC_IDLE';
  } else {
    agcStatus = 'ENGINE: AGC_TRACKING';
  }

  const newState: HgcState = {
    ws: newWs as GainMultiplier,
    previousRms: safeRms as NormalisedAmplitude,
    noiseFloorFrameCount,
    frozen: false,
    frameCount,
  };

  const diag: HgcDiagnostics = {
    agcStatus,
    ws: newWs,
    targetRms: config.targetRmsLevel,
    currentRms: safeRms,
    delta: rawDelta,
    clampedDelta,
    frozen: false,
    noiseFloorFrameCount,
    frameCount,
  };

  return [newState, diag];
}

// ── Multi-frame simulation ──────────────────────────────────────

/**
 * Run HGC for N frames with a constant RMS. Useful for testing
 * convergence and step response behaviour.
 *
 * @param config  Validated HGC config.
 * @param rms     Constant RMS value for all frames.
 * @param frames  Number of frames to simulate.
 * @param initialState Optional starting state.
 * @returns Final state after all frames, plus array of all diagnostics.
 */
export function hgcSimulate(
  config: HgcConfig,
  rms: number,
  frames: number,
  initialState?: HgcState,
): { finalState: HgcState; history: HgcDiagnostics[] } {
  let state = initialState ?? createHgcState();
  const history: HgcDiagnostics[] = [];

  for (let i = 0; i < frames; i++) {
    const [newState, diag] = hgcStep(state, config, rms);
    state = newState;
    history.push(diag);
  }

  return { finalState: state, history };
}

/**
 * Extract the UserLookState keys for HGC from a flat state map.
 * Returns a validated HgcConfig.
 */
export function hgcConfigFromLookState(
  state: Record<string, number>,
): HgcConfig {
  return validateHgcConfig({
    homeostaticAdaptationRate: state['audio.homeostaticAdaptationRate'],
    targetRmsLevel: state['audio.targetRmsLevel'],
    gainCeilingLimit: state['audio.gainCeilingLimit'],
  });
}
