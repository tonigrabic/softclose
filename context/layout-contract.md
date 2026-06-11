# Layout Contract — Part 1 (FloorPlan) → Part 2 (Builder)

The seam between the homeowner floor-plan editor (Part 1, `src/lib/floor-plan/`)
and the kitchen builder + pricing (Part 2, `src/lib/builder/`).

**Rule:** the contract is the **complete, single source of truth for layout**.
It is derived from the frozen `FloorPlan` and delivers *every* layout field the
builder needs — geometry where the plan knows it, sensible defaults where it
can't. The builder **never falls back** to the AI hypothesis or its own
heuristics for layout. The AI hypothesis drives only non-layout concerns
(decor, patterns, material, hardware).

## Authority split

| Concern | Owner | Why |
|---|---|---|
| `shape`, `hasIsland` | Contract (FloorPlan) | measured / confirmed in Part 1 |
| run **lengths** (cm) | Contract (FloorPlan) | from `counterSegmentsForWall()` |
| which walls have a **base** run | Contract (FloorPlan) | from `effectiveHasCounter()` |
| **appliance positions** (sink/hob/fridge/dishwasher) | Contract (FloorPlan) | from `features[]` |
| **corners** + per-run corner ownership | Contract (FloorPlan) | adjacent counter-bearing walls |
| island presence + size | Contract (FloorPlan) | `island` |
| `hasWall`, `hasTall` per run | Contract (**default**, homeowner refines) | not visible in geometry, so the contract supplies a default rather than letting the builder guess |
| `ceilingHeightCm` | Contract (**default** 280) | not captured by the plan |
| cabinet **pattern** (drawers vs doors, larder, oven housing) | AI hypothesis | from render |
| decor / door style / worktop family / backsplash | AI hypothesis | from render |
| hardware, finishing, appliance config + SKU | AI hypothesis / user | style + product choice |

> The AI may later *enrich the contract upstream* (e.g. detect a window wall has
> no uppers → `hasWall: false`), but that happens before the contract reaches the
> builder. The builder always consumes one complete contract with no fallback.

## The contract object

Derived deterministically from a frozen `FloorPlan`. Pure function, no AI.

```ts
// src/lib/contract/layout-contract.ts
import type { LayoutShape, WallSide, ConfidenceLevel, DisplayUnit } from '@/lib/floor-plan'

export interface LayoutContract {
  schemaVersion: 1
  source: 'floor_plan'
  shape: LayoutShape           // = FloorPlan.layoutShape
  hasIsland: boolean
  ceilingHeightCm: number      // contract default (280) — plan has none
  units: DisplayUnit
  runs: ContractRun[]
  appliances: ContractAppliance[]
  corners: ContractCorner[]
}

export interface ContractRun {
  id: WallSide | 'island'      // STABLE id = wall name; selections key off this
  label: string                // side.label ?? capitalized wall
  lengthCm: number             // cabinet-bearing length (counter segments summed)
  hasBase: true                // it's a run *because* it bears counter
  hasWall: boolean             // default true (perimeter) / false (island); user refines
  hasTall: boolean             // default false; user refines
  hasCorner: boolean           // owns an inner corner → reserves a corner cabinet
  confidence: ConfidenceLevel  // from room/side provenance
}

export interface ContractAppliance {
  kind: 'sink' | 'hob' | 'fridge' | 'dishwasher'
  runId: WallSide
  positionPctAlongRun: number  // feature.centerCm / wallLength
  widthCm: number
  confidence: ConfidenceLevel
}

export interface ContractCorner {
  runA: WallSide
  runB: WallSide               // the two runs meeting; cornerSolution left to AI/user
}
```

### Derived projections (helpers on the contract module)

The contract module also owns the derivations consumers need, so the logic
lives in one place:

- `applianceSpansForRun(contract, runId)` → appliance footprints in **mm along
  the run** (approximation: `positionPctAlongRun` is wall-relative; identical
  to run-relative on walls without openings).
- `applianceFootprintCm(contract, runId)` → `{ fridgeCm, dishwasherCm }`.
  A **fridge** blocks both cabinet rows; a **dishwasher** occupies a base slot
  that is priced as an `appliance_slot` front (no carcass, no hardware); sink
  and hob sit ON base units. Consumers: cabinet seeding (skips the fridge span,
  seeds the dishwasher front), worktop length (subtracts fridge), the BOM's
  layout-only fallback, and the fitting bar's row capacity.

### Derivation (`floorPlanToLayout(plan): LayoutContract`)

- `shape` ← `plan.layoutShape`; `hasIsland` ← `plan.hasIsland`.
- For each closed wall where `effectiveHasCounter(plan, wall)`:
  emit a `ContractRun` with `lengthCm = Σ counterSegmentsForWall(plan, wall)`,
  `id = wall`, `label = sides[wall].label ?? Cap(wall)`.
  Defaults: `hasWall = true` **unless more than half the run sits under a
  window** (no wall to hang uppers on — deterministic, homeowner refines),
  `hasTall = false`, `hasCorner` = owns an inner corner.
- If `plan.island`: emit a run `id: 'island'`, `lengthCm = island.lengthCm`,
  `hasWall = false` (no uppers over an island).
- For each `feature` in `plan.features`: emit a `ContractAppliance`
  (`runId = feature.wall`, `positionPctAlongRun = feature.centerCm / wallLengthCm`).
- Corners: every adjacent pair of counter-bearing walls (e.g. l_shape → `top`+`left`).
  Each corner is assigned to one owning run (prefer an un-owned run) → `hasCorner`.

## How each side changes

### Part 2 (builder) — consume, don't re-derive
- `hydrateFromHypothesis(hypothesis, { layoutContract })`: **required** contract.
  The entire `layout` block (runs, shape, island, ceiling, hasWall/hasTall,
  corner ownership) comes from the contract — **no fallback** to the hypothesis
  or hardcoded defaults. The hypothesis drives only decor/patterns/material.
- `cornerSolution` = `none` when `contract.corners` is empty, else a default.
- `/api/builder-hypothesis`: still receives `layoutContract` so the AI reuses the
  run ids when suggesting cabinet patterns/decor (it no longer drives layout).
- Delete the builder's own `LayoutShape`; import the one from `@/lib/floor-plan`.

### Part 1 (floor plan) — freeze + hand off
- On entering the builder: `validate(plan)` to freeze, then
  `floorPlanToLayout(plan)` → pass alongside the chosen render id.
- Add `floorPlanToLayout` next to the existing geometry helpers.

## Merge reconciliation (main → this worktree)
- Keep main's rich `src/lib/floor-plan/` directory.
- **Delete** this worktree's stub `src/lib/floor-plan.ts` (ambiguous with the dir).
- Repoint the builder's `renderFloorPlanSvg` call sites to the rich `svg.ts`
  (it takes a `FloorPlan`, not the old `FloorPlanInput`).
- Share `LayoutShape | WallSide | ConfidenceLevel | DisplayUnit` from
  `@/lib/floor-plan` — remove the duplicate declarations in `builder/inventory.ts`.
```
