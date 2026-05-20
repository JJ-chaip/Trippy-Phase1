/**
 * PresetStore — reactive preset management with smooth transitions.
 *
 * Manages the active preset, handles crossfading between presets,
 * supports auto-cycling, and persists user preferences to localStorage.
 */

import type { VisualPreset } from '../render/presets.js';
import { ALL_PRESETS, DEFAULT_PRESET } from '../render/presets.js';
import { clamp, lerp } from '../utils/math.js';

const STORAGE_KEY = 'trippy-phase1-preset';
const TRANSITION_DURATION_MS = 1200;

export interface PresetStoreState {
  /** Currently active (or target) preset. */
  current: VisualPreset;
  /** Previous preset (source of crossfade). Null if no transition in progress. */
  previous: VisualPreset | null;
  /** Transition progress [0,1]. 1 = fully transitioned. */
  transitionProgress: number;
  /** Whether auto-cycle is enabled. */
  autoCycle: boolean;
  /** Interval in seconds between auto-cycle switches. */
  autoCycleIntervalSec: number;
  /** Accumulated time since last auto-cycle switch. */
  autoCycleAccumulator: number;
}

export function createPresetStore(): PresetStoreState {
  const savedId = loadSavedPresetId();
  const saved = savedId
    ? ALL_PRESETS.find(p => p.id === savedId) ?? DEFAULT_PRESET
    : DEFAULT_PRESET;

  return {
    current: saved,
    previous: null,
    transitionProgress: 1,
    autoCycle: false,
    autoCycleIntervalSec: 30,
    autoCycleAccumulator: 0,
  };
}

/** Select a new preset with smooth crossfade. */
export function selectPreset(
  store: PresetStoreState,
  preset: VisualPreset,
): void {
  if (preset.id === store.current.id && store.transitionProgress >= 1) return;
  store.previous = store.current;
  store.current = preset;
  store.transitionProgress = 0;
  persistPresetId(preset.id);
}

/** Advance to the next preset in the list. */
export function nextPreset(store: PresetStoreState): void {
  const idx = ALL_PRESETS.findIndex(p => p.id === store.current.id);
  const next = ALL_PRESETS[(idx + 1) % ALL_PRESETS.length];
  if (next) selectPreset(store, next);
}

/** Go to the previous preset in the list. */
export function prevPreset(store: PresetStoreState): void {
  const idx = ALL_PRESETS.findIndex(p => p.id === store.current.id);
  const prev = ALL_PRESETS[(idx - 1 + ALL_PRESETS.length) % ALL_PRESETS.length];
  if (prev) selectPreset(store, prev);
}

/**
 * Tick the store forward by dtMs. Handles transition animation
 * and auto-cycle timing.
 */
export function presetStoreTick(
  store: PresetStoreState,
  dtMs: number,
): void {
  // Advance transition
  if (store.transitionProgress < 1) {
    store.transitionProgress = clamp(
      store.transitionProgress + dtMs / TRANSITION_DURATION_MS,
      0,
      1,
    );
    if (store.transitionProgress >= 1) {
      store.previous = null;
    }
  }

  // Auto-cycle
  if (store.autoCycle) {
    store.autoCycleAccumulator += dtMs / 1000;
    if (store.autoCycleAccumulator >= store.autoCycleIntervalSec) {
      store.autoCycleAccumulator = 0;
      nextPreset(store);
    }
  }
}

/**
 * Interpolate numeric preset values between previous and current.
 * Returns a blended preset for smooth visual transitions.
 */
export function getInterpolatedPreset(store: PresetStoreState): VisualPreset {
  if (!store.previous || store.transitionProgress >= 1) {
    return store.current;
  }

  const t = easeInOutCubic(store.transitionProgress);
  const a = store.previous;
  const b = store.current;

  return {
    id: b.id,
    name: b.name,
    description: b.description,
    bgColor: t > 0.5 ? b.bgColor : a.bgColor,
    ringCount: Math.round(lerp(a.ringCount, b.ringCount, t)),
    baseHue: lerpAngle(a.baseHue, b.baseHue, t),
    hueSpread: lerp(a.hueSpread, b.hueSpread, t),
    hueRotate: t > 0.5 ? b.hueRotate : a.hueRotate,
    hueRotateSpeed: lerp(a.hueRotateSpeed, b.hueRotateSpeed, t),
    baseRadiusFraction: lerp(a.baseRadiusFraction, b.baseRadiusFraction, t),
    reactivity: lerp(a.reactivity, b.reactivity, t),
    particleCount: Math.round(lerp(a.particleCount, b.particleCount, t)),
    glowIntensity: lerp(a.glowIntensity, b.glowIntensity, t),
    mirror: t > 0.5 ? b.mirror : a.mirror,
    lineWidth: lerp(a.lineWidth, b.lineWidth, t),
    fillAlpha: lerp(a.fillAlpha, b.fillAlpha, t),
    rotationSpeed: lerp(a.rotationSpeed, b.rotationSpeed, t),
    segments: Math.round(lerp(a.segments, b.segments, t)),
    waveDistortion: lerp(a.waveDistortion, b.waveDistortion, t),
    pulseIntensity: lerp(a.pulseIntensity, b.pulseIntensity, t),
    trailAlpha: lerp(a.trailAlpha ?? 0, b.trailAlpha ?? 0, t),
    bloomPasses: Math.round(lerp(a.bloomPasses ?? 0, b.bloomPasses ?? 0, t)),
    starburstRays: Math.round(lerp(a.starburstRays ?? 0, b.starburstRays ?? 0, t)),
    beatPulseScale: lerp(a.beatPulseScale ?? 1, b.beatPulseScale ?? 1, t),
    chromaShift: lerp(a.chromaShift ?? 0, b.chromaShift ?? 0, t),
    innerGlowRadius: lerp(a.innerGlowRadius ?? 0.15, b.innerGlowRadius ?? 0.15, t),
    layerTrails: t > 0.5 ? b.layerTrails : a.layerTrails,
    layerBloom: t > 0.5 ? b.layerBloom : a.layerBloom,
    layerStarburst: t > 0.5 ? b.layerStarburst : a.layerStarburst,
    layerChroma: t > 0.5 ? b.layerChroma : a.layerChroma,
    layerParticles: t > 0.5 ? b.layerParticles : a.layerParticles,
    layerInnerGlow: t > 0.5 ? b.layerInnerGlow : a.layerInnerGlow,
    layerRings: t > 0.5 ? b.layerRings : a.layerRings,
    layerFill: t > 0.5 ? b.layerFill : a.layerFill,
    layerMirror: t > 0.5 ? b.layerMirror : a.layerMirror,
    layerPulse: t > 0.5 ? b.layerPulse : a.layerPulse,
    layerVignette: t > 0.5 ? b.layerVignette : a.layerVignette,
  };
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return ((a + diff * t) % 360 + 360) % 360;
}

function loadSavedPresetId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistPresetId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Storage unavailable — silently degrade.
  }
}
