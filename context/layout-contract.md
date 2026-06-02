# Layout Contract — Part 1 (FloorPlan) → Part 2 (Builder)

The seam between the homeowner floor-plan editor (Part 1, `src/lib/floor-plan/`)
and the kitchen builder + pricing (Part 2, `src/lib/builder/`).

**Rule:** the frozen `FloorPlan` is the single source of truth for *layout
geometry*. The builder consumes it through this contract and never re-measures.
The AI hypothesis (render + photo) only fills the *qualitative* gaps geometry
can't see.

## Authority split

| Concern | Owner | Why |
|---|---|---|
| `shape`, `hasIsland` | FloorPlan | measured / confirmed in Part 1 |
| run **lengths** (cm) | FloorPlan | from `counterSegmentsForWall()` |
| which walls have a **base** run | FloorPlan | from `effectiveHasCounter()` |
| **appliance positions** (sink/hob/fridge/dishwasher) | FloorPlan | from `features[]` |
| **corners** (which runs meet) | FloorPlan | adjacent counter-bearing walls |
| island presence + size | FloorPlan | `island` |
| `hasWall`, `hasTall` per run | AI hypothesis | not visible in plan geometry |
| cabinet **pattern** (drawers vs doors, larder, oven housing) | AI hypothesis | from render |
| decor / door style / worktop family / backsplash | AI hypothesis | from render |
| hardware, finishing, appliance config + SKU | AI hypothesis / user | style + product choice |

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
  ceilingHeightCm?: number     // FloorPlan has none yet → AI/default fills
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
  // hasWall / hasTall intentionally absent — AI hypothesis sets them
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

### Derivation (`floorPlanToLayout(plan): LayoutContract`)

- `shape` ← `plan.layoutShape`; `hasIsland` ← `plan.hasIsland`.
- For each closed wall where `effectiveHasCounter(plan, wall)`:
  emit a `ContractRun` with `lengthCm = Σ counterSegmentsForWall(plan, wall)`,
  `id = wall`, `label = sides[wall].label ?? Cap(wall)`.
- If `plan.island`: emit a run `id: 'island'`, `lengthCm = island.lengthCm`.
- For each `feature` in `plan.features`: emit a `ContractAppliance`
  (`runId = feature.wall`, `positionPctAlongRun = feature.centerCm / wallLengthCm`).
- Corners: every adjacent pair of counter-bearing walls (e.g. l_shape → `top`+`left`).

## How each side changes

### Part 2 (builder) — consume, don't re-derive
- `/api/builder-hypothesis`: accept `layoutContract` in the request body. Prompt
  states runs/appliances/corners are **fixed facts** — the model only infers
  `hasWall`, `hasTall`, patterns, decor, hardware. Geometry fields bypass the AI.
- `hydrateFromHypothesis(hypothesis, layoutContract)`: runs come from the
  contract; `hasWall`/`hasTall`/patterns come from the hypothesis.
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
