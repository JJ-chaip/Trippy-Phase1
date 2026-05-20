/**
 * Quality Ladder — adaptive performance tiers for rendering.
 *
 * Monitors frame rate and automatically adjusts visual quality
 * to maintain smooth performance. Higher tiers enable more
 * particles, bloom passes, and render features.
 */

import { clamp } from '../utils/math.js';

export type QualityTier = 'low' | 'medium' | 'high' | 'ultra';

export interface QualityConfig {
  /** Maximum particle multiplier (0.25 = quarter, 1 = full, 2 = double). */
  readonly particleMultiplier: number;
  /** Maximum bloom passes allowed. */
  readonly maxBloomPasses: number;
  /** Whether starburst rays are enabled. */
  readonly starburstEnabled: boolean;
  /** Whether trail afterimage is enabled. */
  readonly trailsEnabled: boolean;
  /** Segment multiplier for ring detail (0.5 = half, 1 = full). */
  readonly segmentMultiplier: number;
  /** Whether chromatic shift is enabled. */
  readonly chromaEnabled: boolean;
  /** Shadow blur quality multiplier. */
  readonly glowQuality: number;
}

const QUALITY_CONFIGS: Record<QualityTier, QualityConfig> = {
  low: {
    particleMultiplier: 0.25,
    maxBloomPasses: 0,
    starburstEnabled: false,
    trailsEnabled: false,
    segmentMultiplier: 0.5,
    chromaEnabled: false,
    glowQuality: 0.5,
  },
  medium: {
    particleMultiplier: 0.6,
    maxBloomPasses: 1,
    starburstEnabled: false,
    trailsEnabled: true,
    segmentMultiplier: 0.75,
    chromaEnabled: false,
    glowQuality: 0.75,
  },
  high: {
    particleMultiplier: 1.0,
    maxBloomPasses: 2,
    starburstEnabled: true,
    trailsEnabled: true,
    segmentMultiplier: 1.0,
    chromaEnabled: true,
    glowQuality: 1.0,
  },
  ultra: {
    particleMultiplier: 1.5,
    maxBloomPasses: 3,
    starburstEnabled: true,
    trailsEnabled: true,
    segmentMultiplier: 1.5,
    chromaEnabled: true,
    glowQuality: 1.0,
  },
};

export interface QualityLadderState {
  currentTier: QualityTier;
  manualOverride: boolean;
  fpsHistory: number[];
  lastAdjustmentTime: number;
}

const FPS_HISTORY_SIZE = 30;
const ADJUST_COOLDOWN_MS = 3000;
const DOWNGRADE_FPS_THRESHOLD = 45;
const UPGRADE_FPS_THRESHOLD = 58;

const TIER_ORDER: readonly QualityTier[] = ['low', 'medium', 'high', 'ultra'];

export function createQualityLadderState(
  initialTier: QualityTier = 'high',
): QualityLadderState {
  return {
    currentTier: initialTier,
    manualOverride: false,
    fpsHistory: [],
    lastAdjustmentTime: 0,
  };
}

export function getQualityConfig(tier: QualityTier): QualityConfig {
  return QUALITY_CONFIGS[tier];
}

export function setQualityTier(
  state: QualityLadderState,
  tier: QualityTier,
  manual: boolean,
): void {
  state.currentTier = tier;
  state.manualOverride = manual;
  state.fpsHistory = [];
}

/**
 * Feed a frame's FPS into the ladder and potentially adjust quality.
 */
export function qualityLadderTick(
  state: QualityLadderState,
  currentFps: number,
  nowMs: number,
): void {
  if (state.manualOverride) return;

  state.fpsHistory.push(currentFps);
  if (state.fpsHistory.length > FPS_HISTORY_SIZE) {
    state.fpsHistory.shift();
  }

  if (state.fpsHistory.length < FPS_HISTORY_SIZE / 2) return;
  if (nowMs - state.lastAdjustmentTime < ADJUST_COOLDOWN_MS) return;

  const avgFps = state.fpsHistory.reduce((a, b) => a + b, 0) / state.fpsHistory.length;
  const tierIdx = TIER_ORDER.indexOf(state.currentTier);

  if (avgFps < DOWNGRADE_FPS_THRESHOLD && tierIdx > 0) {
    const newTier = TIER_ORDER[tierIdx - 1];
    if (newTier) {
      state.currentTier = newTier;
      state.lastAdjustmentTime = nowMs;
      state.fpsHistory = [];
    }
  } else if (avgFps > UPGRADE_FPS_THRESHOLD && tierIdx < TIER_ORDER.length - 1) {
    const newTier = TIER_ORDER[tierIdx + 1];
    if (newTier) {
      state.currentTier = newTier;
      state.lastAdjustmentTime = nowMs;
      state.fpsHistory = [];
    }
  }
}

export function applyQualityToPresetValues(
  quality: QualityConfig,
  particleCount: number,
  segments: number,
  bloomPasses: number,
): {
  particleCount: number;
  segments: number;
  bloomPasses: number;
} {
  return {
    particleCount: Math.round(
      clamp(particleCount * quality.particleMultiplier, 0, 500),
    ),
    segments: Math.round(
      clamp(segments * quality.segmentMultiplier, 16, 512),
    ),
    bloomPasses: Math.min(bloomPasses, quality.maxBloomPasses),
  };
}
