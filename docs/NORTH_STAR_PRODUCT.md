# North star product — Trippy Phase 1

**This file is a thin pointer.** The canonical product charter, constitution, and architecture spec lives in the **legacy Trippy repository:**

- [`NORTH_STAR_AND_MASTER_PLAN.md`](../../Trippy/NORTH_STAR_AND_MASTER_PLAN.md) — technical bible (Parts A–M, Appendices A–F)
- [`OWNER_PRODUCT_STRATEGY.md`](../../Trippy/OWNER_PRODUCT_STRATEGY.md) — owner product strategy (market posture, V1 definition, risk register, open questions)
- [`TECHNICAL_QUICKSTART.md`](../../Trippy/TECHNICAL_QUICKSTART.md) — 5-minute engineering orientation
- [`WINDSURF_HANDOFF/EXECUTION_CONTRACT.md`](../../Trippy/WINDSURF_HANDOFF/EXECUTION_CONTRACT.md) — repo and test gates

**Phase 1 is the greenfield kernel.** It carries contracts (`AudioDrive`, `CommitValidator`, `BudgetProfile`, `ModuleRegistry`) that inform the long-term unified product. See [`LEGACY_AND_PHASE1_RELATIONSHIP.md`](../../Trippy/LEGACY_AND_PHASE1_RELATIONSHIP.md) for the relationship between repos.

**Implementation sequencing:** Vitest green → §F.19 HGC pure helpers → §F.20 radial → §F.21 compositing. Gate: no WebGPU/canvas rendering until test script is green.

**V1 definition:** the strategy doc distinguishes **NorthStarVision** (long-term depth) from **ShippableMilestones** (H0–H4 stability gates). Phase 1 kernel work maps to H0–H1 contracts. See [`OWNER_PRODUCT_STRATEGY.md`](../../Trippy/OWNER_PRODUCT_STRATEGY.md) §4.
