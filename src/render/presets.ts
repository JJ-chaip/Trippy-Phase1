/**
 * Visual preset definitions.
 *
 * A preset captures the rendering parameters for a visual scene.
 * Presets are pure data — the renderer reads them each frame.
 * New presets can be added without touching the renderer.
 */

export interface VisualPreset {
  readonly id: string;
  readonly name: string;
  readonly description: string;

  /** Background color (CSS format). */
  readonly bgColor: string;

  /** Number of radial rings to draw. */
  readonly ringCount: number;

  /** Base hue (0–360) for the color wheel. */
  readonly baseHue: number;

  /** How much hue shifts per ring (degrees). */
  readonly hueSpread: number;

  /** Whether hue rotates over time. */
  readonly hueRotate: boolean;

  /** Hue rotation speed (degrees per second). */
  readonly hueRotateSpeed: number;

  /** Base radius as fraction of min(width, height). */
  readonly baseRadiusFraction: number;

  /** How much rings grow per band energy. */
  readonly reactivity: number;

  /** Particle count (0 = no particles). */
  readonly particleCount: number;

  /** Glow intensity (0 = none, 1 = max). */
  readonly glowIntensity: number;

  /** Mirror mode (reflects pattern). */
  readonly mirror: boolean;

  /** Line width for ring strokes. */
  readonly lineWidth: number;

  /** Alpha for ring fills (0 = no fill, 1 = solid). */
  readonly fillAlpha: number;

  /** Rotation speed of the overall pattern (radians/sec). */
  readonly rotationSpeed: number;

  /** Number of radial segments per ring. */
  readonly segments: number;

  /** Waveform distortion amount. */
  readonly waveDistortion: number;

  /** Central pulse intensity. */
  readonly pulseIntensity: number;
}

export const PRESET_COSMIC_BLOOM: VisualPreset = {
  id: 'cosmic-bloom',
  name: 'Cosmic Bloom',
  description: 'Radial frequency rings with neon glow and particle field',
  bgColor: '#050510',
  ringCount: 8,
  baseHue: 280,
  hueSpread: 35,
  hueRotate: true,
  hueRotateSpeed: 15,
  baseRadiusFraction: 0.08,
  reactivity: 2.5,
  particleCount: 120,
  glowIntensity: 0.8,
  mirror: false,
  lineWidth: 2.5,
  fillAlpha: 0.06,
  rotationSpeed: 0.15,
  segments: 128,
  waveDistortion: 0.4,
  pulseIntensity: 0.6,
};

export const PRESET_NEON_PULSE: VisualPreset = {
  id: 'neon-pulse',
  name: 'Neon Pulse',
  description: 'High-contrast neon rings with mirrored symmetry',
  bgColor: '#000008',
  ringCount: 6,
  baseHue: 160,
  hueSpread: 50,
  hueRotate: true,
  hueRotateSpeed: 25,
  baseRadiusFraction: 0.1,
  reactivity: 3.0,
  particleCount: 60,
  glowIntensity: 1.0,
  mirror: true,
  lineWidth: 3,
  fillAlpha: 0.04,
  rotationSpeed: -0.2,
  segments: 96,
  waveDistortion: 0.6,
  pulseIntensity: 0.8,
};

export const PRESET_DEEP_OCEAN: VisualPreset = {
  id: 'deep-ocean',
  name: 'Deep Ocean',
  description: 'Calm blue-green layers with gentle wave motion',
  bgColor: '#020812',
  ringCount: 10,
  baseHue: 200,
  hueSpread: 20,
  hueRotate: true,
  hueRotateSpeed: 5,
  baseRadiusFraction: 0.06,
  reactivity: 1.8,
  particleCount: 80,
  glowIntensity: 0.5,
  mirror: false,
  lineWidth: 1.5,
  fillAlpha: 0.08,
  rotationSpeed: 0.08,
  segments: 160,
  waveDistortion: 0.3,
  pulseIntensity: 0.4,
};

/** All available presets. New presets are added here. */
export const ALL_PRESETS: readonly VisualPreset[] = [
  PRESET_COSMIC_BLOOM,
  PRESET_NEON_PULSE,
  PRESET_DEEP_OCEAN,
];

/** Default preset shown on startup. */
export const DEFAULT_PRESET = PRESET_COSMIC_BLOOM;
