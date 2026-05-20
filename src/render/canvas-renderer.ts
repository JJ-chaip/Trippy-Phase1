/**
 * Canvas2D renderer — draws audio-reactive visuals to a <canvas>.
 *
 * Architecture:
 *   - Each frame clears and redraws (no retained scene graph).
 *   - Optional trail afterimage via partial-alpha clear.
 *   - Rings are drawn from innermost to outermost with waveform distortion.
 *   - Particles float reacting to energy with drift and respawn.
 *   - Starburst rays extend from center on beat events.
 *   - Bloom simulation via layered glow passes.
 *   - Chromatic aberration shift on high energy.
 *   - Central pulse responds to RMS/peak with inner glow.
 */

import type { CanonicalAudioDrive } from '../core/types/audio-drive.js';
import type { VisualPreset } from './presets.js';
import type { QualityConfig } from './quality-ladder.js';
import type { BeatDetectorOutput } from '../modules/beat-detector/types.js';
import { clamp } from '../utils/math.js';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hueOffset: number;
  life: number;
  maxLife: number;
}

export interface RendererState {
  particles: Particle[];
  elapsedSec: number;
  smoothedRms: number;
  smoothedPeak: number;
  smoothedBands: number[];
  /** Accumulated beat intensity for visual pulse decay. */
  beatPulse: number;
  /** Starburst ray opacity (decays after beat). */
  starburstAlpha: number;
  /** Chromatic shift amount (tracks energy). */
  chromaAmount: number;
}

export function createRendererState(): RendererState {
  return {
    particles: [],
    elapsedSec: 0,
    smoothedRms: 0,
    smoothedPeak: 0,
    smoothedBands: [],
    beatPulse: 0,
    starburstAlpha: 0,
    chromaAmount: 0,
  };
}

function initParticle(w: number, h: number, preset: VisualPreset): Particle {
  const cx = w / 2;
  const cy = h / 2;
  const angle = Math.random() * Math.PI * 2;
  const dist = Math.random() * Math.min(w, h) * 0.45 + 20;
  return {
    x: cx + Math.cos(angle) * dist,
    y: cy + Math.sin(angle) * dist,
    vx: (Math.random() - 0.5) * 20,
    vy: (Math.random() - 0.5) * 20,
    radius: Math.random() * 2 + 0.5,
    hueOffset: Math.random() * preset.hueSpread * 2,
    life: Math.random() * 8 + 2,
    maxLife: 10,
  };
}

/**
 * Render one frame to the given canvas context.
 */
export function renderFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  drive: CanonicalAudioDrive,
  preset: VisualPreset,
  state: RendererState,
  dtMs: number,
  beat?: BeatDetectorOutput,
  quality?: QualityConfig,
): void {
  const dtSec = dtMs / 1000;
  state.elapsedSec += dtSec;
  const t = state.elapsedSec;

  // Smooth audio values
  const smoothFactor = clamp(dtSec * 8, 0, 1);
  state.smoothedRms += ((drive.rms as number) - state.smoothedRms) * smoothFactor;
  state.smoothedPeak += ((drive.peak as number) - state.smoothedPeak) * smoothFactor;

  while (state.smoothedBands.length < drive.bands.length) {
    state.smoothedBands.push(0);
  }
  for (let i = 0; i < drive.bands.length; i++) {
    const bandVal = drive.bands[i] as number;
    const prev = state.smoothedBands[i] ?? 0;
    state.smoothedBands[i] = prev + (bandVal - prev) * smoothFactor;
  }

  const rms = state.smoothedRms;
  const peak = state.smoothedPeak;
  const cx = w / 2;
  const cy = h / 2;
  const minDim = Math.min(w, h);

  // Beat pulse tracking
  const beatScale = preset.beatPulseScale ?? 1;
  if (beat?.beatThisFrame) {
    state.beatPulse = clamp(beat.beatIntensity * beatScale, 0, 1);
    state.starburstAlpha = clamp(beat.beatIntensity * 0.8, 0, 1);
  }
  state.beatPulse *= 0.92;
  state.starburstAlpha *= 0.88;

  // Chromatic shift tracking
  const targetChroma = rms * (preset.chromaShift ?? 0);
  state.chromaAmount += (targetChroma - state.chromaAmount) * clamp(dtSec * 6, 0, 1);

  const trailAlpha = preset.trailAlpha ?? 0;
  const trailsLayerOn = (preset.layerTrails ?? true) && (quality?.trailsEnabled ?? true);
  const useTrails = trailAlpha > 0 && trailsLayerOn;

  // -- Background --
  if (useTrails) {
    ctx.fillStyle = preset.bgColor;
    ctx.globalAlpha = 1 - trailAlpha;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = preset.bgColor;
    ctx.fillRect(0, 0, w, h);
  }

  // Hue base
  const hueBase = preset.hueRotate
    ? (preset.baseHue + t * preset.hueRotateSpeed) % 360
    : preset.baseHue;

  // -- Background radial gradient --
  const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, minDim * 0.6);
  bgGrad.addColorStop(0, `hsla(${hueBase}, 60%, 8%, 0.3)`);
  bgGrad.addColorStop(0.5, `hsla(${(hueBase + 40) % 360}, 40%, 4%, 0.15)`);
  bgGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // -- Inner glow --
  if (preset.layerInnerGlow ?? true) {
    const innerR = minDim * (preset.innerGlowRadius ?? 0.15);
    const innerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, innerR * (1 + state.beatPulse * 0.5));
    innerGrad.addColorStop(0, `hsla(${hueBase}, 100%, 70%, ${0.15 + state.beatPulse * 0.3})`);
    innerGrad.addColorStop(0.5, `hsla(${(hueBase + 30) % 360}, 80%, 40%, ${0.08 + state.beatPulse * 0.15})`);
    innerGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = innerGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, innerR * (1 + state.beatPulse * 0.5), 0, Math.PI * 2);
    ctx.fill();
  }

  // -- Central pulse --
  if (preset.pulseIntensity > 0 && (preset.layerPulse ?? true)) {
    const pulseR = minDim * 0.03 + minDim * 0.12 * peak * preset.pulseIntensity * (1 + state.beatPulse * 0.4);
    const pulseGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, pulseR);
    pulseGrad.addColorStop(0, `hsla(${hueBase}, 100%, 80%, ${0.6 * peak})`);
    pulseGrad.addColorStop(0.4, `hsla(${(hueBase + 20) % 360}, 80%, 50%, ${0.3 * peak})`);
    pulseGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = pulseGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, pulseR, 0, Math.PI * 2);
    ctx.fill();
  }

  // -- Starburst rays --
  const starburstRays = preset.starburstRays ?? 0;
  const starburstLayerOn = (preset.layerStarburst ?? true) && (quality?.starburstEnabled ?? true);
  if (starburstRays > 0 && state.starburstAlpha > 0.01 && starburstLayerOn) {
    drawStarburst(ctx, cx, cy, minDim, hueBase, starburstRays, state.starburstAlpha, t);
  }

  // -- Frequency rings --
  const ringsLayerOn = preset.layerRings ?? true;
  const glowQuality = quality?.glowQuality ?? 1;
  const segMultiplier = quality?.segmentMultiplier ?? 1;

  if (ringsLayerOn) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(t * preset.rotationSpeed);

  const ringCount = Math.min(preset.ringCount, state.smoothedBands.length || preset.ringCount);
  const effectiveSegments = Math.round(preset.segments * segMultiplier);

  for (let ring = 0; ring < ringCount; ring++) {
    const bandEnergy = state.smoothedBands[ring] ?? 0;
    const ringFrac = (ring + 1) / (ringCount + 1);
    const baseR = minDim * preset.baseRadiusFraction + ringFrac * minDim * 0.38;
    const beatExpand = state.beatPulse * minDim * 0.02 * (1 - ringFrac);
    const energyR = baseR + bandEnergy * minDim * 0.15 * preset.reactivity + beatExpand;

    const ringHue = (hueBase + ring * preset.hueSpread) % 360;
    const saturation = 70 + 20 * bandEnergy;
    const lightness = 45 + 25 * bandEnergy;
    const alpha = 0.5 + 0.5 * bandEnergy;

    ctx.strokeStyle = `hsla(${ringHue}, ${saturation}%, ${lightness}%, ${alpha})`;
    ctx.lineWidth = preset.lineWidth * (0.8 + 0.6 * bandEnergy);

    // Glow effect
    if (preset.glowIntensity > 0) {
      ctx.shadowColor = `hsla(${ringHue}, 100%, 60%, ${preset.glowIntensity * bandEnergy})`;
      ctx.shadowBlur = 15 * preset.glowIntensity * (0.5 + bandEnergy) * glowQuality;
    }

    // Draw waveform ring
    ctx.beginPath();
    for (let s = 0; s <= effectiveSegments; s++) {
      const angle = (s / effectiveSegments) * Math.PI * 2;
      const waveFreq = 3 + ring * 2;
      const wave = Math.sin(angle * waveFreq + t * (1 + ring * 0.3)) * preset.waveDistortion * bandEnergy;
      const r = energyR * (1 + wave * 0.15);
      const px = Math.cos(angle) * r;
      const py = Math.sin(angle) * r;
      if (s === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.closePath();
    ctx.stroke();

    // Fill
    if (preset.fillAlpha > 0 && (preset.layerFill ?? true)) {
      ctx.fillStyle = `hsla(${ringHue}, ${saturation}%, ${lightness}%, ${preset.fillAlpha * bandEnergy})`;
      ctx.fill();
    }

    // Mirror mode
    if (preset.mirror && (preset.layerMirror ?? true)) {
      ctx.beginPath();
      for (let s = 0; s <= effectiveSegments; s++) {
        const angle = (s / effectiveSegments) * Math.PI * 2;
        const waveFreq = 3 + ring * 2;
        const wave = Math.sin(-angle * waveFreq - t * (1 + ring * 0.3)) * preset.waveDistortion * bandEnergy;
        const r = energyR * (1 + wave * 0.15);
        const px = Math.cos(angle) * r;
        const py = Math.sin(angle) * r;
        if (s === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.closePath();
      ctx.strokeStyle = `hsla(${(ringHue + 180) % 360}, ${saturation}%, ${lightness}%, ${alpha * 0.5})`;
      ctx.stroke();
    }
  }

  ctx.restore();
  } // end ringsLayerOn

  // Reset shadow
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  // -- Bloom simulation --
  const maxBloom = quality?.maxBloomPasses ?? 3;
  const bloomPasses = Math.min(preset.bloomPasses ?? 0, maxBloom);
  const bloomLayerOn = preset.layerBloom ?? true;
  if (bloomPasses > 0 && peak > 0.15 && bloomLayerOn) {
    drawBloom(ctx, w, h, cx, cy, minDim, hueBase, peak, bloomPasses, state.beatPulse);
  }

  // -- Chromatic aberration --
  const chromaLayerOn = (preset.layerChroma ?? true) && (quality?.chromaEnabled ?? true);
  if (state.chromaAmount > 0.01 && chromaLayerOn) {
    drawChromaShift(ctx, w, h, state.chromaAmount);
  }

  // -- Particles --
  const particlesLayerOn = preset.layerParticles ?? true;
  const particleMult = quality?.particleMultiplier ?? 1;
  const effectiveParticleCount = Math.round(preset.particleCount * particleMult);
  if (effectiveParticleCount > 0 && particlesLayerOn) {
    drawParticles(ctx, w, h, state, preset, hueBase, rms, peak, dtSec, effectiveParticleCount);
  }

  // -- Outer vignette --
  if (preset.layerVignette ?? true) {
    const vigGrad = ctx.createRadialGradient(cx, cy, minDim * 0.3, cx, cy, minDim * 0.7);
    vigGrad.addColorStop(0, 'transparent');
    vigGrad.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
    ctx.fillStyle = vigGrad;
    ctx.fillRect(0, 0, w, h);
  }
}

function drawStarburst(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  minDim: number,
  hue: number,
  rayCount: number,
  alpha: number,
  t: number,
): void {
  const rayLen = minDim * 0.5 * alpha;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(t * 0.1);
  ctx.globalAlpha = alpha * 0.4;

  for (let i = 0; i < rayCount; i++) {
    const angle = (i / rayCount) * Math.PI * 2;
    const rayHue = (hue + i * (360 / rayCount)) % 360;
    const grad = ctx.createLinearGradient(0, 0, Math.cos(angle) * rayLen, Math.sin(angle) * rayLen);
    grad.addColorStop(0, `hsla(${rayHue}, 100%, 80%, 0.6)`);
    grad.addColorStop(0.3, `hsla(${rayHue}, 90%, 60%, 0.3)`);
    grad.addColorStop(1, 'transparent');

    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.5 + alpha * 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(angle) * rayLen, Math.sin(angle) * rayLen);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawBloom(
  ctx: CanvasRenderingContext2D,
  _w: number,
  _h: number,
  cx: number,
  cy: number,
  minDim: number,
  hue: number,
  peak: number,
  passes: number,
  beatPulse: number,
): void {
  for (let pass = 0; pass < passes; pass++) {
    const passR = minDim * (0.2 + pass * 0.12) * (0.8 + peak * 0.4 + beatPulse * 0.2);
    const passAlpha = 0.03 * (1 - pass * 0.25) * peak;
    const passHue = (hue + pass * 30) % 360;

    const grad = ctx.createRadialGradient(cx, cy, passR * 0.3, cx, cy, passR);
    grad.addColorStop(0, `hsla(${passHue}, 100%, 70%, ${passAlpha})`);
    grad.addColorStop(0.5, `hsla(${passHue}, 80%, 50%, ${passAlpha * 0.5})`);
    grad.addColorStop(1, 'transparent');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, passR, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawChromaShift(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  amount: number,
): void {
  const shift = Math.round(amount * 3);
  if (shift < 1) return;

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.06 * amount;
  ctx.drawImage(ctx.canvas, shift, 0, w, h, 0, 0, w, h);
  ctx.drawImage(ctx.canvas, -shift, 0, w, h, 0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawParticles(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  state: RendererState,
  preset: VisualPreset,
  hueBase: number,
  rms: number,
  peak: number,
  dtSec: number,
  targetCount: number,
): void {
  const cx = w / 2;
  const cy = h / 2;

  while (state.particles.length < targetCount) {
    state.particles.push(initParticle(w, h, preset));
  }
  if (state.particles.length > targetCount) {
    state.particles.length = targetCount;
  }

  for (const p of state.particles) {
    const energy = rms * 2;
    p.x += p.vx * dtSec * (1 + energy);
    p.y += p.vy * dtSec * (1 + energy);
    p.life -= dtSec;

    // Drift toward center on energy
    const dx = cx - p.x;
    const dy = cy - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    p.vx += (dx / dist) * energy * 5 * dtSec;
    p.vy += (dy / dist) * energy * 5 * dtSec;

    // Beat push
    if (state.beatPulse > 0.1) {
      p.vx -= (dx / dist) * state.beatPulse * 30 * dtSec;
      p.vy -= (dy / dist) * state.beatPulse * 30 * dtSec;
    }

    p.vx *= 0.995;
    p.vy *= 0.995;

    // Respawn
    if (p.life <= 0 || p.x < -20 || p.x > w + 20 || p.y < -20 || p.y > h + 20) {
      const np = initParticle(w, h, preset);
      p.x = np.x;
      p.y = np.y;
      p.vx = np.vx;
      p.vy = np.vy;
      p.life = np.life;
      p.maxLife = np.maxLife;
      p.hueOffset = np.hueOffset;
      p.radius = np.radius;
    }

    // Draw
    const lifeFrac = clamp(p.life / p.maxLife, 0, 1);
    const pHue = (hueBase + p.hueOffset) % 360;
    const pAlpha = lifeFrac * 0.5 * (0.3 + energy * 0.7);
    const pRadius = p.radius * (1 + peak * 2 + state.beatPulse * 1.5);

    ctx.fillStyle = `hsla(${pHue}, 80%, 70%, ${pAlpha})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, pRadius, 0, Math.PI * 2);
    ctx.fill();
  }
}
