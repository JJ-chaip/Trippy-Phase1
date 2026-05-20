---
name: testing-trippy-phase1
description: Test the Trippy Phase1 audio-reactive visualizer end-to-end. Use when verifying UI, preset, quality, or beat detection changes.
---

# Testing Trippy Phase1

## Setup

1. Run `npm run dev` — dev server starts on `http://localhost:5174` (strictPort)
2. Open Chrome to `http://localhost:5174`
3. The app auto-starts on mount — no click needed to begin rendering

## Key UI Elements

- **HUD overlay** (top-left): Contains preset dropdown, quality dropdown, Start/Stop button, Hide HUD button, diagnostics
- **Preset dropdown**: Lists all available presets (currently 7). Selected preset controls color palette, ring count, visual effects
- **Quality dropdown**: Low / Medium / High / Ultra — controls rendering complexity
- **Status line**: Shows "Demo audio • XX FPS • {tier}" when running, "Paused" when stopped
- **Audio diagnostics**: AGC status, Gain, RMS, Delta
- **Beat diagnostics**: Beat HIT/---, BPM estimation, Bar position (X/4), Kick energy

## Keyboard Shortcuts

- `H` — Toggle HUD visibility
- `Space` — Play/pause animation
- `ArrowRight` (→) — Next preset

## What to Test

### Default Load
- Canvas renders animated visuals (not blank/black)
- Preset dropdown shows the default preset (check `DEFAULT_PRESET` in `src/render/presets.ts`)
- Status shows running state with FPS counter

### Preset Switching
- Dropdown selection changes visual color palette and geometry
- ArrowRight key advances to next preset and updates dropdown
- Each preset has distinct baseHue/ringCount/mirror settings (check `src/render/presets.ts`)

### Quality Tiers
- Low disables bloom, starburst, chromatic aberration, trails (see `QUALITY_CONFIGS` in `src/render/quality-ladder.ts`)
- Ultra enables all effects with higher particle count
- The quality ladder auto-downgrades if FPS is sustained below 45 — this is expected on slower VMs
- Manual quality selection sets `manualOverride: true` which prevents auto-adjustment

### Beat Detection
- BPM estimation may start as "---" and update after a few seconds
- Bar position cycles 1/4 → 2/4 → 3/4 → 4/4
- "Beat: HIT" flashes intermittently when onset is detected
- Beat detection uses demo audio source (synthetic patterns), not real microphone input

### Keyboard Shortcuts
- H hides full HUD, shows small "HUD" button; pressing H again restores full HUD
- Space pauses animation (status = "Paused", button = "Start"); Space again resumes

## Performance Notes

- On slower VMs, expect 10-20 FPS which will trigger quality auto-downgrade
- The quality ladder has a 3-second cooldown between adjustments
- FPS history needs 15+ frames before auto-adjustment kicks in

## Key Source Files

- `src/ui/App.tsx` — Main UI shell, keyboard handlers, render loop
- `src/render/presets.ts` — Preset definitions and DEFAULT_PRESET
- `src/render/canvas-renderer.ts` — Canvas2D rendering with all visual effects
- `src/render/quality-ladder.ts` — Quality tier configs and auto-adjustment
- `src/presets/presetStore.ts` — Preset transitions and persistence
- `src/modules/beat-detector/` — Beat detection module

## Commands

```bash
npm run dev        # Start dev server (localhost:5174)
npm run test       # Run vitest (214+ tests)
npm run typecheck  # TypeScript strict check
npm run build      # Production build
npm run lint       # ESLint
```
