# Trippy — Phase 1 (greenfield kernel)

A small, modular canvas + audio kernel (Vite + TypeScript + React), **not** a line-for-line port of legacy Trippy. Carries **contracts** (`AudioDrive`, `CommitValidator`, `BudgetProfile`, `ModuleRegistry`) that inform the long-term unified product.

## Quick start

```bash
npm install
npm run dev        # Vite dev server at 127.0.0.1:5174
npm run check      # TypeScript + Vitest
npm run test       # Vitest only
npm run typecheck  # tsc only
npm run build      # Production build
```

## Architecture

- **Core types:** `src/core/types/` — branded types (`AudioClockMs`, `NormalisedAmplitude`, etc.), `CanonicalAudioDrive`, `UserLookState`, `BudgetProfile`, `TrModule`
- **Module registry:** `src/core/registry/` — extensible module system with topological dependency sorting
- **CommitValidator:** `src/core/validators/` — five-axis budget enforcement (CPU, GPU, VRAM, bandwidth, audioGraph)
- **Modules:** `src/modules/` — self-contained modules (HGC, etc.) with lifecycle + cost manifests
- **Math utilities:** `src/utils/` — pure, deterministic helper functions
- **UI:** `src/ui/` — React components

## Planning docs (in legacy Trippy repo)

- [`NORTH_STAR_AND_MASTER_PLAN.md`](../Trippy/NORTH_STAR_AND_MASTER_PLAN.md) — canonical technical bible
- [`OWNER_PRODUCT_STRATEGY.md`](../Trippy/OWNER_PRODUCT_STRATEGY.md) — owner product strategy (market posture, V1 definition, risk register, open questions)
- [`WINDSURF_HANDOFF/EXECUTION_CONTRACT.md`](../Trippy/WINDSURF_HANDOFF/EXECUTION_CONTRACT.md) — repo and test gates
- [`TECHNICAL_QUICKSTART.md`](../Trippy/TECHNICAL_QUICKSTART.md) — 5-minute orientation

## Phase 1 docs

- [`docs/NORTH_STAR_PRODUCT.md`](./docs/NORTH_STAR_PRODUCT.md) — pointer to canonical product charter and strategy

## Status

Phase 1 kernel foundation implemented:
- Core types with branded type safety
- Module registry with topological dependency sorting
- CommitValidator with five-axis budget enforcement
- F.19 HGC (Homeostatic Gain Control) module
- 139 tests passing, TypeScript strict mode, zero TODOs
