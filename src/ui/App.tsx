import React, { useEffect, useRef, useState } from 'react';
import { ModuleRegistry } from '../core/registry/module-registry.js';
import { createHgcModule } from '../modules/hgc/index.js';
import { createSilentDrive } from '../core/types/audio-drive.js';
import type { AudioClockMs } from '../core/types/common.js';
import type { HgcDiagnostics } from '../modules/hgc/types.js';
import { HGC_MODULE_ID } from '../modules/hgc/index.js';

const DEFAULT_LOOK_STATE: Record<string, number> = {
  'audio.homeostaticAdaptationRate': 0.05,
  'audio.targetRmsLevel': 0.35,
  'audio.gainCeilingLimit': 5.0,
};

export function App(): React.JSX.Element {
  const registryRef = useRef<ModuleRegistry | null>(null);
  const [diag, setDiag] = useState<HgcDiagnostics | null>(null);
  const [running, setRunning] = useState(false);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const registry = new ModuleRegistry();
    registry.register(createHgcModule());
    registry.init(DEFAULT_LOOK_STATE);
    registryRef.current = registry;

    return () => {
      registry.dispose();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    if (!running) return;

    let lastTime = performance.now();

    const tick = (now: number) => {
      const dt = now - lastTime;
      lastTime = now;

      const registry = registryRef.current;
      if (!registry) return;

      const drive = createSilentDrive(now as AudioClockMs);
      const frame = registry.update(drive, DEFAULT_LOOK_STATE, dt);
      const hgcOutput = frame.outputs.get(HGC_MODULE_ID);
      if (hgcOutput) {
        setDiag(hgcOutput['diagnostics'] as HgcDiagnostics);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [running]);

  return (
    <div style={{ color: '#0f0', background: '#000', fontFamily: 'monospace', padding: 24 }}>
      <h1>Trippy Phase1 — Kernel</h1>
      <p style={{ color: '#888', marginBottom: 16 }}>
        HGC (Homeostatic Gain Control) module running. No audio input yet — silent drive.
      </p>

      <button
        onClick={() => setRunning(r => !r)}
        style={{
          padding: '8px 16px',
          background: running ? '#a00' : '#0a0',
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          marginBottom: 16,
        }}
      >
        {running ? 'Stop' : 'Start'} HGC Loop
      </button>

      {diag && (
        <pre style={{ fontSize: 12, lineHeight: 1.6 }}>
{`AGC Status:     ${diag.agcStatus}
Ws (gain):      ${diag.ws.toFixed(4)}
Target RMS:     ${diag.targetRms.toFixed(3)}
Current RMS:    ${diag.currentRms.toFixed(6)}
Delta:          ${diag.delta.toFixed(8)}
Clamped Delta:  ${diag.clampedDelta.toFixed(8)}
Frozen:         ${diag.frozen}
Noise Floor #:  ${diag.noiseFloorFrameCount}
Frame:          ${diag.frameCount}`}
        </pre>
      )}
    </div>
  );
}
