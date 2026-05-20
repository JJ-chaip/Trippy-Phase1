/**
 * App — main UI shell for Trippy Phase1.
 *
 * Full-screen canvas with audio-reactive visuals, driven by
 * the module registry (HGC + Beat Detector) and demo audio source.
 * Overlay HUD shows diagnostics, preset selector, quality tier,
 * nudge/randomize controls, and visual layer toggles.
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
import type { VisualPreset } from '../render/presets.js';
import {
  createPresetStore,
  getInterpolatedPreset,
  nextPreset,
  prevPreset,
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
import {
  nudgePreset,
  randomizePreset,
  generateRandomPreset,
} from '../presets/nudgeSystem.js';
import type { NudgeDirection } from '../presets/nudgeSystem.js';

const DEFAULT_LOOK_STATE: Record<string, number> = {
  'audio.homeostaticAdaptationRate': 0.05,
  'audio.targetRmsLevel': 0.35,
  'audio.gainCeilingLimit': 5.0,
  'beat.onsetThreshold': 0.35,
  'beat.minBeatIntervalMs': 200,
};

const QUALITY_TIERS: readonly QualityTier[] = ['low', 'medium', 'high', 'ultra'];

/** Layer toggle metadata for UI display. */
interface LayerInfo {
  readonly key: keyof VisualPreset;
  readonly label: string;
  readonly description: string;
}

const LAYER_TOGGLES: readonly LayerInfo[] = [
  { key: 'layerTrails',    label: 'Trails',     description: 'Ghostly afterimage persistence' },
  { key: 'layerBloom',     label: 'Bloom',      description: 'Soft radial glow on beats' },
  { key: 'layerStarburst', label: 'Starburst',  description: 'Lines radiating from center' },
  { key: 'layerChroma',    label: 'Chroma',     description: 'RGB colour-split shift' },
  { key: 'layerParticles', label: 'Particles',  description: 'Floating dots reacting to audio' },
  { key: 'layerInnerGlow', label: 'Inner Glow', description: 'Pulsing light at the centre' },
  { key: 'layerRings',     label: 'Rings',      description: 'Audio-driven frequency circles' },
  { key: 'layerFill',      label: 'Ring Fill',   description: 'Colour fill inside each ring' },
  { key: 'layerMirror',    label: 'Mirror',     description: 'Reflected duplicate pattern' },
  { key: 'layerPulse',     label: 'Pulse',      description: 'Energy-reactive core disc' },
  { key: 'layerVignette',  label: 'Vignette',   description: 'Dark edges framing the visual' },
];

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
  const [showLayers, setShowLayers] = useState(false);
  const [diag, setDiag] = useState<HgcDiagnostics | null>(null);
  const [beatInfo, setBeatInfo] = useState<BeatDetectorOutput | null>(null);
  const [activePresetId, setActivePresetId] = useState('');
  const [fps, setFps] = useState(0);
  const [qualityTier, setQualityTier] = useState<QualityTier>('high');

  /** Layer override state — applied on top of current preset. */
  const layerOverridesRef = useRef<Record<string, boolean>>({});
  const [layerOverrides, setLayerOverrides] = useState<Record<string, boolean>>({});

  /** Custom nudged preset (replaces store preset when active). */
  const nudgedPresetRef = useRef<VisualPreset | null>(null);
  const [nudgeFeedback, setNudgeFeedback] = useState('');
  const nudgeFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fpsFrames = useRef(0);
  const fpsLastTime = useRef(0);

  // Show temporary nudge feedback
  const flashFeedback = useCallback((msg: string) => {
    setNudgeFeedback(msg);
    if (nudgeFeedbackTimer.current) clearTimeout(nudgeFeedbackTimer.current);
    nudgeFeedbackTimer.current = setTimeout(() => setNudgeFeedback(''), 1500);
  }, []);

  // Apply a nudge result into the active rendering
  const applyNudge = useCallback((direction: NudgeDirection) => {
    const store = presetStoreRef.current;
    if (!store) return;
    const base = nudgedPresetRef.current ?? getInterpolatedPreset(store);
    const result = nudgePreset(base, direction);
    nudgedPresetRef.current = result.preset;
    flashFeedback(`Nudge ${direction} — ${result.mutatedKeys.length} params`);
  }, [flashFeedback]);

  const applyRandomize = useCallback(() => {
    const store = presetStoreRef.current;
    if (!store) return;
    const base = nudgedPresetRef.current ?? getInterpolatedPreset(store);
    const result = randomizePreset(base);
    nudgedPresetRef.current = result.preset;
    flashFeedback(`Randomize! ${result.mutatedKeys.length} params shuffled`);
  }, [flashFeedback]);

  const applyFullRandom = useCallback(() => {
    nudgedPresetRef.current = generateRandomPreset();
    flashFeedback('Generated brand new random preset');
  }, [flashFeedback]);

  const resetNudge = useCallback(() => {
    nudgedPresetRef.current = null;
    layerOverridesRef.current = {};
    setLayerOverrides({});
    flashFeedback('Reset to preset defaults');
  }, [flashFeedback]);

  // Toggle a layer override
  const toggleLayer = useCallback((key: string) => {
    const store = presetStoreRef.current;
    if (!store) return;
    const base = nudgedPresetRef.current ?? getInterpolatedPreset(store);
    const currentVal = layerOverridesRef.current[key] ?? (base[key as keyof VisualPreset] as boolean | undefined) ?? true;
    layerOverridesRef.current[key] = !currentVal;
    setLayerOverrides({ ...layerOverridesRef.current });
  }, []);

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
      // Ignore when typing in an input/select
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      switch (e.key) {
        case 'h':
        case 'H':
          setShowHud(h => !h);
          break;
        case ' ':
          e.preventDefault();
          setRunning(r => !r);
          break;
        case 'ArrowUp':
          e.preventDefault();
          applyNudge('up');
          break;
        case 'ArrowDown':
          e.preventDefault();
          applyNudge('down');
          break;
        case 'ArrowLeft':
          e.preventDefault();
          applyNudge('left');
          break;
        case 'ArrowRight':
          e.preventDefault();
          applyNudge('right');
          break;
        case 'r':
        case 'R':
          applyRandomize();
          break;
        case 'n':
        case 'N':
          applyFullRandom();
          break;
        case 'Escape':
          resetNudge();
          break;
        case 'l':
        case 'L':
          setShowLayers(s => !s);
          break;
        case 'm':
        case 'M':
          toggleLayer('layerMirror');
          break;
        case 'p':
        case 'P':
          toggleLayer('layerParticles');
          break;
        case 'b':
        case 'B':
          toggleLayer('layerBloom');
          break;
        case 't':
        case 'T':
          toggleLayer('layerTrails');
          break;
        case ']':
          if (presetStoreRef.current) {
            nextPreset(presetStoreRef.current);
            nudgedPresetRef.current = null;
            setActivePresetId(presetStoreRef.current.current.id);
          }
          break;
        case '[':
          if (presetStoreRef.current) {
            prevPreset(presetStoreRef.current);
            nudgedPresetRef.current = null;
            setActivePresetId(presetStoreRef.current.current.id);
          }
          break;
        default: {
          // Number keys 1-7 for quick preset selection
          const num = parseInt(e.key, 10);
          if (num >= 1 && num <= ALL_PRESETS.length && presetStoreRef.current) {
            const target = ALL_PRESETS[num - 1];
            if (target) {
              selectPreset(presetStoreRef.current, target);
              nudgedPresetRef.current = null;
              setActivePresetId(target.id);
            }
          }
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [applyNudge, applyRandomize, applyFullRandom, resetNudge, toggleLayer]);

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

      // Build the effective preset: store preset → nudge overrides → layer overrides
      let effectivePreset = nudgedPresetRef.current ?? getInterpolatedPreset(pStore);

      // Apply layer overrides
      const overrides = layerOverridesRef.current;
      if (Object.keys(overrides).length > 0) {
        effectivePreset = { ...effectivePreset, ...overrides } as VisualPreset;
      }

      // Quality ladder
      qualityLadderTick(qState, fps, now);
      const qConfig = getQualityConfig(qState.currentTier);

      // Render
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const w = window.innerWidth;
        const h = window.innerHeight;
        renderFrame(ctx, w, h, drive, effectivePreset, renderer, dt, beat, qConfig);
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

  // Get effective layer state for toggle display
  const getLayerState = (key: string): boolean => {
    if (key in layerOverrides) return layerOverrides[key] ?? true;
    const store = presetStoreRef.current;
    if (store) {
      const base = nudgedPresetRef.current ?? getInterpolatedPreset(store);
      return (base[key as keyof VisualPreset] as boolean | undefined) ?? true;
    }
    return true;
  };

  const hudStyle: React.CSSProperties = {
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
    maxWidth: 360,
    pointerEvents: 'auto',
    userSelect: 'none',
  };

  const btnStyle: React.CSSProperties = {
    padding: '3px 10px',
    background: 'rgba(60, 60, 60, 0.7)',
    color: '#aaa',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 11,
    fontFamily: 'inherit',
  };

  const selectStyle: React.CSSProperties = {
    background: 'rgba(0, 40, 0, 0.8)',
    color: '#0f0',
    border: '1px solid #0f03',
    borderRadius: 4,
    padding: '2px 6px',
    fontSize: 11,
    fontFamily: 'inherit',
    cursor: 'pointer',
  };

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

      {/* Nudge feedback overlay */}
      {nudgeFeedback && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: '#0f0',
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 16,
            fontWeight: 700,
            background: 'rgba(0, 0, 0, 0.5)',
            padding: '8px 20px',
            borderRadius: 8,
            border: '1px solid rgba(0, 255, 0, 0.3)',
            pointerEvents: 'none',
            animation: 'fadeIn 0.15s ease-out',
          }}
        >
          {nudgeFeedback}
        </div>
      )}

      {showHud && (
        <div style={hudStyle}>
          <div style={{ color: '#0f0', fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
            Trippy Phase1 — Omnibus Engine
          </div>

          {/* Preset selector */}
          <div style={{ marginBottom: 6 }}>
            <span style={{ color: '#888' }}>Preset: </span>
            <select
              value={activePresetId}
              onChange={(e) => {
                const found = ALL_PRESETS.find(p => p.id === e.target.value);
                if (found && presetStoreRef.current) {
                  selectPreset(presetStoreRef.current, found);
                  nudgedPresetRef.current = null;
                  setActivePresetId(found.id);
                }
              }}
              style={selectStyle}
            >
              {ALL_PRESETS.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Quality tier */}
          <div style={{ marginBottom: 6 }}>
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
              style={selectStyle}
            >
              {QUALITY_TIERS.map(t => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </div>

          {/* Controls row */}
          <div style={{ marginBottom: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              onClick={() => setRunning(r => !r)}
              style={{
                ...btnStyle,
                background: running ? 'rgba(180, 0, 0, 0.7)' : 'rgba(0, 160, 0, 0.7)',
                color: '#fff',
              }}
            >
              {running ? 'Stop' : 'Start'}
            </button>
            <button onClick={applyRandomize} style={{ ...btnStyle, background: 'rgba(100, 0, 160, 0.7)', color: '#e0b0ff' }}>
              Randomize
            </button>
            <button onClick={applyFullRandom} style={{ ...btnStyle, background: 'rgba(0, 80, 160, 0.7)', color: '#b0d0ff' }}>
              New Random
            </button>
            <button onClick={resetNudge} style={btnStyle}>
              Reset
            </button>
          </div>

          {/* Nudge arrows */}
          <div style={{ marginBottom: 6 }}>
            <span style={{ color: '#888', fontSize: 10 }}>Nudge: </span>
            <div style={{ display: 'inline-flex', gap: 3, verticalAlign: 'middle' }}>
              {(['left', 'up', 'down', 'right'] as const).map(dir => (
                <button
                  key={dir}
                  onClick={() => applyNudge(dir)}
                  style={{ ...btnStyle, padding: '2px 8px', fontSize: 13 }}
                >
                  {{ left: '\u2190', up: '\u2191', down: '\u2193', right: '\u2192' }[dir]}
                </button>
              ))}
            </div>
          </div>

          {/* Layer toggles */}
          <div style={{ marginBottom: 4 }}>
            <button
              onClick={() => setShowLayers(s => !s)}
              style={{ ...btnStyle, fontSize: 10, padding: '2px 8px' }}
            >
              {showLayers ? 'Hide Layers' : 'Show Layers'} [L]
            </button>
          </div>
          {showLayers && (
            <div style={{ marginBottom: 6, fontSize: 10, lineHeight: 1.8 }}>
              {LAYER_TOGGLES.map(layer => {
                const on = getLayerState(layer.key);
                return (
                  <div
                    key={layer.key}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                    onClick={() => toggleLayer(layer.key)}
                    title={layer.description}
                  >
                    <span style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: on ? '#0f0' : '#333',
                      border: '1px solid #0f04',
                      flexShrink: 0,
                    }} />
                    <span style={{ color: on ? '#0f0' : '#555' }}>{layer.label}</span>
                    <span style={{ color: '#444', marginLeft: 'auto' }}>{layer.description}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Status */}
          <div style={{ color: '#666', fontSize: 10, marginBottom: 4 }}>
            {running
              ? `Demo audio \u2022 ${fps} FPS \u2022 ${qualityTier}${nudgedPresetRef.current ? ' \u2022 nudged' : ''}`
              : 'Paused'}
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
          <div style={{ color: '#444', fontSize: 9, marginTop: 6, lineHeight: 1.6 }}>
            [H] toggle HUD &nbsp; [Space] play/pause &nbsp; [Esc] reset<br />
            [Arrows] nudge &nbsp; [R] randomize &nbsp; [N] new random<br />
            [L] layers &nbsp; [M] mirror &nbsp; [P] particles &nbsp; [B] bloom &nbsp; [T] trails<br />
            {"[/] prev/next preset \u00a0 [1-7] quick preset"}
          </div>

          <button
            onClick={() => setShowHud(false)}
            style={{ ...btnStyle, fontSize: 9, marginTop: 4, padding: '2px 6px' }}
          >
            Hide HUD
          </button>
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
