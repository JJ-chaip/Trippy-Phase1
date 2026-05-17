/**
 * Canvas2D renderer — draws audio-reactive visuals to a <canvas>.
 *
 * This is a pure rendering function: given a canvas context, audio
 * drive, preset, and elapsed time, it draws one frame. No state
 * is held here — all state lives in the caller or in RendererState.
 *
 * Architecture:
 *   - Each frame clears and redraws (no retained scene graph).
 *   - Rings are drawn from innermost to outermost.
 *   - Each ring's radius modulates with its corresponding band energy.
 *   - Particles float in the background, reacting to overall energy.
 *   - A central pulse responds to RMS/peak.
 */

import type { CanonicalAudioDrive } from '../core/types/audio-drive.js';
import type { VisualPreset } from './presets.js';
import { clamp } from '../utils/math.js';

/** Persistent particle state for smooth animation. */
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

/** Mutable renderer state that persists across frames. */
export interface RendererState {
  particles: Particle[];
  elapsedSec: number;
  smoothedRms: number;
  smoothedPeak: number;
  smoothedBands: number[];
}

export function createRendererState(): RendererState {
  return {
    particles: [],
    elapsedSec: 0,
    smoothedRms: 0,
    smoothedPeak: 0,
    smoothedBands: [],
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
): void {
  const dtSec = dtMs / 1000;
  state.elapsedSec += dtSec;
  const t = state.elapsedSec;

  // Smooth audio values for visual stability
  const smoothFactor = clamp(dtSec * 8, 0, 1);
  state.smoothedRms += ((drive.rms as number) - state.smoothedRms) * smoothFactor;
  state.smoothedPeak += ((drive.peak as number) - state.smoothedPeak) * smoothFactor;

  // Ensure smoothed bands array matches drive bands
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

  // ── Background ──
  ctx.fillStyle = preset.bgColor;
  ctx.fillRect(0, 0, w, h);

  // Subtle radial background gradient
  const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, minDim * 0.6);
  const hueBase = preset.hueRotate
    ? (preset.baseHue + t * preset.hueRotateSpeed) % 360
    : preset.baseHue;
  bgGrad.addColorStop(0, `hsla(${hueBase}, 60%, 8%, 0.3)`);
  bgGrad.addColorStop(0.5, `hsla(${hueBase + 40}, 40%, 4%, 0.15)`);
  bgGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // ── Central pulse ──
  if (preset.pulseIntensity > 0) {
    const pulseR = minDim * 0.03 + minDim * 0.12 * peak * preset.pulseIntensity;
    const pulseGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, pulseR);
    pulseGrad.addColorStop(0, `hsla(${hueBase}, 100%, 80%, ${0.6 * peak})`);
    pulseGrad.addColorStop(0.4, `hsla(${hueBase + 20}, 80%, 50%, ${0.3 * peak})`);
    pulseGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = pulseGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, pulseR, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Frequency rings ──
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(t * preset.rotationSpeed);

  const ringCount = Math.min(preset.ringCount, state.smoothedBands.length || preset.ringCount);

  for (let ring = 0; ring < ringCount; ring++) {
    const bandEnergy = state.smoothedBands[ring] ?? 0;
    const ringFrac = (ring + 1) / (ringCount + 1);
    const baseR = minDim * preset.baseRadiusFraction + ringFrac * minDim * 0.38;
    const energyR = baseR + bandEnergy * minDim * 0.15 * preset.reactivity;

    const ringHue = (hueBase + ring * preset.hueSpread) % 360;
    const saturation = 70 + 20 * bandEnergy;
    const lightness = 45 + 25 * bandEnergy;
    const alpha = 0.5 + 0.5 * bandEnergy;

    ctx.strokeStyle = `hsla(${ringHue}, ${saturation}%, ${lightness}%, ${alpha})`;
    ctx.lineWidth = preset.lineWidth * (0.8 + 0.6 * bandEnergy);

    // Glow effect
    if (preset.glowIntensity > 0) {
      ctx.shadowColor = `hsla(${ringHue}, 100%, 60%, ${preset.glowIntensity * bandEnergy})`;
      ctx.shadowBlur = 15 * preset.glowIntensity * (0.5 + bandEnergy);
    }

    // Draw waveform ring
    ctx.beginPath();
    const segCount = preset.segments;
    for (let s = 0; s <= segCount; s++) {
      const angle = (s / segCount) * Math.PI * 2;
      // Waveform distortion based on band energy and position
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

    // Optional fill
    if (preset.fillAlpha > 0) {
      ctx.fillStyle = `hsla(${ringHue}, ${saturation}%, ${lightness}%, ${preset.fillAlpha * bandEnergy})`;
      ctx.fill();
    }

    // Mirror mode: draw a second ring with inverted wave
    if (preset.mirror) {
      ctx.beginPath();
      for (let s = 0; s <= segCount; s++) {
        const angle = (s / segCount) * Math.PI * 2;
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

  // Reset shadow for particles
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  // ── Particles ──
  if (preset.particleCount > 0) {
    // Ensure we have enough particles
    while (state.particles.length < preset.particleCount) {
      state.particles.push(initParticle(w, h, preset));
    }
    // Trim excess particles
    if (state.particles.length > preset.particleCount) {
      state.particles.length = preset.particleCount;
    }

    for (const p of state.particles) {
      // Update particle
      const energy = rms * 2;
      p.x += p.vx * dtSec * (1 + energy);
      p.y += p.vy * dtSec * (1 + energy);
      p.life -= dtSec;

      // Gentle drift toward center when energy is high
      const dx = cx - p.x;
      const dy = cy - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      p.vx += (dx / dist) * energy * 5 * dtSec;
      p.vy += (dy / dist) * energy * 5 * dtSec;

      // Damping
      p.vx *= 0.995;
      p.vy *= 0.995;

      // Respawn if dead or out of bounds
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

      // Draw particle
      const lifeFrac = clamp(p.life / p.maxLife, 0, 1);
      const pHue = (hueBase + p.hueOffset) % 360;
      const pAlpha = lifeFrac * 0.5 * (0.3 + energy * 0.7);
      const pRadius = p.radius * (1 + peak * 2);

      ctx.fillStyle = `hsla(${pHue}, 80%, 70%, ${pAlpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, pRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Outer vignette ──
  const vigGrad = ctx.createRadialGradient(cx, cy, minDim * 0.3, cx, cy, minDim * 0.7);
  vigGrad.addColorStop(0, 'transparent');
  vigGrad.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
  ctx.fillStyle = vigGrad;
  ctx.fillRect(0, 0, w, h);
}
