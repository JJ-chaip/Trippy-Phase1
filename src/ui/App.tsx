/**
 * App — main UI shell for Trippy Phase1.
 *
 * Full-screen canvas with audio-reactive visuals, driven by
 * the module registry (HGC + Beat Detector) and demo audio source.
 * Overlay HUD shows diagnostics, preset selector, and quality tier.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ModuleRegistry } from '../core/registry/module-registry.js';
import { createHgcModule, HGC_MODULE_ID } from '../modules/hgc/index.js';
import type { HgcDiagnostics } from '../modules/hgc/types.js';
import {
  createBeatDetectorModule,
  BEAT_DETECTOR_MODULE_ID,
} from '../modules/beat-detector/index.js';
import type { BeatDetectorOutput } from '../modules/beat-detector/types.js';
import { createDemoSourceState, demoSourceTick } from '../audio/demo-source.js';
import type { DemoSourceState } from '../audio/demo-source.js';
import { createRendererState, renderFrame } from '../render/canvas-renderer.js';
import type { RendererState } from '../render/canvas-renderer.js';
import { ALL_PRESETS } from '../render/presets.js';
import {
  createPresetStore,
  getInterpolatedPreset,
  nextPreset,
  presetStoreTick,
  selectPreset,
} from '../presets/presetStore.js';
import type { PresetStoreState } from '../presets/presetStore.js';
import {
  createQualityLadderState,
  getQualityConfig,
  qualityLadderTick,
  setQualityTier as applyQualityTier,
} from '../render/quality-ladder.js';
import type { QualityLadderState, QualityTier } from '../render/quality-ladder.js';

const DEFAULT_LOOK_STATE: Record<string, number> = {
  'audio.homeostaticAdaptationRate': 0.05,
  'audio.targetRmsLevel': 0.35,
  'audio.gainCeilingLimit': 5.0,
  'beat.onsetThreshold': 0.35,
  'beat.minBeatIntervalMs': 200,
};

const QUALITY_TIERS: readonly QualityTier[] = ['low', 'medium', 'high', 'ultra'];

export function App(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const registryRef = useRef<ModuleRegistry | null>(null);
  const demoRef = useRef<DemoSourceState | null>(null);
  const rendererRef = useRef<RendererState | null>(null);
  const presetStoreRef = useRef<PresetStoreState | null>(null);
  const qualityRef = useRef<QualityLadderState | null>(null);
  const rafRef = useRef<number>(0);

  const [running, setRunning] = useState(false);
  const [showHud, setShowHud] = useState(true);
  const [diag, setDiag] = useState<HgcDiagnostics | null>(null);
  const [beatInfo, setBeatInfo] = useState<BeatDetectorOutput | null>(null);
  const [activePresetId, setActivePresetId] = useState('');
  const [fps, setFps] = useState(0);
  const [qualityTier, setQualityTier] = useState<QualityTier>('high');

  const fpsFrames = useRef(0);
  const fpsLastTime = useRef(0);

  // Init
  useEffect(() => {
    const registry = new ModuleRegistry();
    registry.register(createHgcModule());
    registry.register(createBeatDetectorModule());
    registry.init(DEFAULT_LOOK_STATE);
    registryRef.current = registry;
    demoRef.current = createDemoSourceState();
    rendererRef.current = createRendererState();
    presetStoreRef.current = createPresetStore();
    qualityRef.current = createQualityLadderState('high');
    setActivePresetId(presetStoreRef.current.current.id);

    return () => {
      registry.dispose();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Canvas resize
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(dpr, dpr);
  }, []);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [resizeCanvas]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'h' || e.key === 'H') setShowHud(h => !h);
      if (e.key === ' ') { e.preventDefault(); setRunning(r => !r); }
      if (e.key === 'ArrowRight' && presetStoreRef.current) {
        nextPreset(presetStoreRef.current);
        setActivePresetId(presetStoreRef.current.current.id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Main render loop
  useEffect(() => {
    if (!running) return;

    let lastTime = performance.now();

    const tick = (now: number) => {
      const dt = now - lastTime;
      lastTime = now;

      const registry = registryRef.current;
      const demo = demoRef.current;
      const renderer = rendererRef.current;
      const canvas = canvasRef.current;
      const pStore = presetStoreRef.current;
      const qState = qualityRef.current;
      if (!registry || !demo || !renderer || !canvas || !pStore || !qState) return;

      // Demo audio
      const drive = demoSourceTick(demo, dt, now);

      // Module updates
      const frame = registry.update(drive, DEFAULT_LOOK_STATE, dt);

      const hgcOutput = frame.outputs.get(HGC_MODULE_ID);
      if (hgcOutput) {
        setDiag(hgcOutput['diagnostics'] as HgcDiagnostics);
      }

      const beatOutput = frame.outputs.get(BEAT_DETECTOR_MODULE_ID);
      const beat = beatOutput?.['beat'] as BeatDetectorOutput | undefined;
      if (beat) {
        setBeatInfo(beat);
      }

      // Preset store tick (transitions, auto-cycle)
      presetStoreTick(pStore, dt);
      const interpolatedPreset = getInterpolatedPreset(pStore);

      // Quality ladder
      qualityLadderTick(qState, fps, now);
      const qConfig = getQualityConfig(qState.currentTier);

      // Render
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const w = window.innerWidth;
        const h = window.innerHeight;
        renderFrame(ctx, w, h, drive, interpolatedPreset, renderer, dt, beat, qConfig);
      }

      // FPS
      fpsFrames.current++;
      if (now - fpsLastTime.current >= 1000) {
        setFps(fpsFrames.current);
        fpsFrames.current = 0;
        fpsLastTime.current = now;
        // Sync quality tier state
        if (qState.currentTier !== qualityTier) {
          setQualityTier(qState.currentTier);
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    fpsLastTime.current = performance.now();
    fpsFrames.current = 0;
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [running, fps, qualityTier]);

  // Auto-start
  useEffect(() => {
    setRunning(true);
  }, []);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#000' }}>
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          display: 'block',
        }}
      />

      {showHud && (
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: 16,
            color: '#0f0',
            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            fontSize: 11,
            lineHeight: 1.5,
            background: 'rgba(0, 0, 0, 0.6)',
            padding: '12px 16px',
            borderRadius: 8,
            border: '1px solid rgba(0, 255, 0, 0.15)',
            backdropFilter: 'blur(8px)',
            maxWidth: 340,
            pointerEvents: 'auto',
            userSelect: 'none',
          }}
        >
          <div style={{ color: '#0f0', fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
            Trippy Phase1 — Omnibus Engine
          </div>

          {/* Preset selector */}
          <div style={{ marginBottom: 8 }}>
            <span style={{ color: '#888' }}>Preset: </span>
            <select
              value={activePresetId}
              onChange={(e) => {
                const found = ALL_PRESETS.find(p => p.id === e.target.value);
                if (found && presetStoreRef.current) {
                  selectPreset(presetStoreRef.current, found);
                  setActivePresetId(found.id);
                }
              }}
              style={{
                background: 'rgba(0, 40, 0, 0.8)',
                color: '#0f0',
                border: '1px solid #0f03',
                borderRadius: 4,
                padding: '2px 6px',
                fontSize: 11,
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              {ALL_PRESETS.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Quality tier */}
          <div style={{ marginBottom: 8 }}>
            <span style={{ color: '#888' }}>Quality: </span>
            <select
              value={qualityTier}
              onChange={(e) => {
                const tier = e.target.value as QualityTier;
                setQualityTier(tier);
                if (qualityRef.current) {
                  applyQualityTier(qualityRef.current, tier, true);
                }
              }}
              style={{
                background: 'rgba(0, 40, 0, 0.8)',
                color: '#0f0',
                border: '1px solid #0f03',
                borderRadius: 4,
                padding: '2px 6px',
                fontSize: 11,
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              {QUALITY_TIERS.map(t => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </div>

          {/* Controls */}
          <div style={{ marginBottom: 8, display: 'flex', gap: 8 }}>
            <button
              onClick={() => setRunning(r => !r)}
              style={{
                padding: '3px 10px',
                background: running ? 'rgba(180, 0, 0, 0.7)' : 'rgba(0, 160, 0, 0.7)',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 11,
                fontFamily: 'inherit',
              }}
            >
              {running ? 'Stop' : 'Start'}
            </button>
            <button
              onClick={() => setShowHud(false)}
              style={{
                padding: '3px 10px',
                background: 'rgba(60, 60, 60, 0.7)',
                color: '#aaa',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 11,
                fontFamily: 'inherit',
              }}
            >
              Hide HUD
            </button>
          </div>

          {/* Status */}
          <div style={{ color: '#666', fontSize: 10, marginBottom: 4 }}>
            {running ? `Demo audio \u2022 ${fps} FPS \u2022 ${qualityTier}` : 'Paused'}
          </div>

          {/* Audio diagnostics */}
          {diag && (
            <pre style={{ fontSize: 10, lineHeight: 1.4, color: '#0a0', margin: 0 }}>
{`AGC: ${diag.agcStatus.replace('ENGINE: ', '')}
Gain:  ${diag.ws.toFixed(3)}  RMS: ${diag.currentRms.toFixed(4)}
\u0394: ${diag.clampedDelta.toFixed(6)}  ${diag.frozen ? '\u2744 FROZEN' : ''}`}
            </pre>
          )}

          {/* Beat diagnostics */}
          {beatInfo && (
            <pre style={{ fontSize: 10, lineHeight: 1.4, color: '#0a0', margin: '4px 0 0' }}>
{`Beat: ${beatInfo.beatThisFrame ? 'HIT' : '---'}  BPM: ${beatInfo.estimatedBpm > 0 ? beatInfo.estimatedBpm.toFixed(0) : '---'}
Bar: ${beatInfo.barPosition + 1}/4  Kick: ${beatInfo.kickEnergy.toFixed(3)}`}
            </pre>
          )}

          {/* Keyboard hints */}
          <div style={{ color: '#444', fontSize: 9, marginTop: 6 }}>
            [H] toggle HUD &nbsp; [Space] play/pause &nbsp; [\u2192] next preset
          </div>
        </div>
      )}

      {!showHud && (
        <button
          onClick={() => setShowHud(true)}
          style={{
            position: 'absolute',
            top: 16,
            left: 16,
            padding: '4px 10px',
            background: 'rgba(0, 0, 0, 0.4)',
            color: '#0f04',
            border: '1px solid #0f02',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 11,
            fontFamily: 'monospace',
            backdropFilter: 'blur(4px)',
          }}
        >
          HUD
        </button>
      )}
    </div>
  );
}
