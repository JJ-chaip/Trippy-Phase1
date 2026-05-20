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

  /** Trail persistence (0 = no trails, 1 = full persistence). */
  readonly trailAlpha?: number;

  /** Number of bloom glow passes (0 = disabled). */
  readonly bloomPasses?: number;

  /** Number of starburst rays from center (0 = disabled). */
  readonly starburstRays?: number;

  /** Scale multiplier on beat detection pulse (1 = normal). */
  readonly beatPulseScale?: number;

  /** Chromatic shift amount on high energy (0 = none). */
  readonly chromaShift?: number;

  /** Inner glow radius as fraction of minDim. */
  readonly innerGlowRadius?: number;
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
  trailAlpha: 0.12,
  bloomPasses: 2,
  starburstRays: 0,
  beatPulseScale: 1.4,
  chromaShift: 0.3,
  innerGlowRadius: 0.15,
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
  trailAlpha: 0.08,
  bloomPasses: 3,
  starburstRays: 12,
  beatPulseScale: 1.6,
  chromaShift: 0.5,
  innerGlowRadius: 0.18,
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
  trailAlpha: 0.18,
  bloomPasses: 1,
  starburstRays: 0,
  beatPulseScale: 1.2,
  chromaShift: 0.1,
  innerGlowRadius: 0.12,
};

export const PRESET_SOLAR_FLARE: VisualPreset = {
  id: 'solar-flare',
  name: 'Solar Flare',
  description: 'Explosive warm energy bursts with starburst rays and heavy beat response',
  bgColor: '#0a0200',
  ringCount: 7,
  baseHue: 20,
  hueSpread: 40,
  hueRotate: true,
  hueRotateSpeed: 30,
  baseRadiusFraction: 0.09,
  reactivity: 3.5,
  particleCount: 200,
  glowIntensity: 1.0,
  mirror: false,
  lineWidth: 2.8,
  fillAlpha: 0.1,
  rotationSpeed: 0.25,
  segments: 96,
  waveDistortion: 0.7,
  pulseIntensity: 1.0,
  trailAlpha: 0.06,
  bloomPasses: 3,
  starburstRays: 16,
  beatPulseScale: 2.0,
  chromaShift: 0.6,
  innerGlowRadius: 0.22,
};

export const PRESET_AURORA: VisualPreset = {
  id: 'aurora',
  name: 'Aurora Borealis',
  description: 'Ethereal curtains of shifting green-violet light with gentle flow',
  bgColor: '#010208',
  ringCount: 12,
  baseHue: 120,
  hueSpread: 60,
  hueRotate: true,
  hueRotateSpeed: 8,
  baseRadiusFraction: 0.05,
  reactivity: 2.0,
  particleCount: 150,
  glowIntensity: 0.7,
  mirror: true,
  lineWidth: 1.8,
  fillAlpha: 0.12,
  rotationSpeed: 0.05,
  segments: 192,
  waveDistortion: 0.5,
  pulseIntensity: 0.3,
  trailAlpha: 0.25,
  bloomPasses: 2,
  starburstRays: 0,
  beatPulseScale: 1.1,
  chromaShift: 0.2,
  innerGlowRadius: 0.1,
};

export const PRESET_CYBERPUNK: VisualPreset = {
  id: 'cyberpunk',
  name: 'Cyberpunk',
  description: 'Hard-edged magenta-cyan geometry with aggressive beat response',
  bgColor: '#030006',
  ringCount: 5,
  baseHue: 300,
  hueSpread: 70,
  hueRotate: true,
  hueRotateSpeed: 40,
  baseRadiusFraction: 0.12,
  reactivity: 4.0,
  particleCount: 90,
  glowIntensity: 1.0,
  mirror: true,
  lineWidth: 3.5,
  fillAlpha: 0.03,
  rotationSpeed: -0.35,
  segments: 64,
  waveDistortion: 0.8,
  pulseIntensity: 0.9,
  trailAlpha: 0.04,
  bloomPasses: 3,
  starburstRays: 8,
  beatPulseScale: 2.2,
  chromaShift: 0.8,
  innerGlowRadius: 0.2,
};

export const PRESET_VOID: VisualPreset = {
  id: 'void',
  name: 'The Void',
  description: 'Minimal monochrome with extreme subtlety — silence made visible',
  bgColor: '#000000',
  ringCount: 4,
  baseHue: 0,
  hueSpread: 0,
  hueRotate: false,
  hueRotateSpeed: 0,
  baseRadiusFraction: 0.15,
  reactivity: 5.0,
  particleCount: 30,
  glowIntensity: 0.3,
  mirror: false,
  lineWidth: 1,
  fillAlpha: 0.02,
  rotationSpeed: 0.02,
  segments: 256,
  waveDistortion: 0.2,
  pulseIntensity: 0.5,
  trailAlpha: 0.35,
  bloomPasses: 1,
  starburstRays: 0,
  beatPulseScale: 1.8,
  chromaShift: 0,
  innerGlowRadius: 0.08,
};

/** All available presets. New presets are added here. */
export const ALL_PRESETS: readonly VisualPreset[] = [
  PRESET_COSMIC_BLOOM,
  PRESET_NEON_PULSE,
  PRESET_DEEP_OCEAN,
  PRESET_SOLAR_FLARE,
  PRESET_AURORA,
  PRESET_CYBERPUNK,
  PRESET_VOID,
];

/** Default preset shown on startup. */
export const DEFAULT_PRESET = PRESET_SOLAR_FLARE;
