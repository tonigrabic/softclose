/**
 * Layout Contract — the seam between Part 1 (floor-plan editor) and Part 2
 * (kitchen builder + pricing). See context/layout-contract.md.
 *
 * `floorPlanToLayout()` is a PURE, deterministic projection of a frozen
 * `FloorPlan` into the layout facts the builder needs: cabinet-bearing runs,
 * fixed-appliance positions, and corners. No AI. The builder seeds itself from
 * this and only uses the render/photo hypothesis to fill the *qualitative*
 * gaps geometry can't see (drawers-vs-doors, tall units, decor, hardware).
 *
 * Authority split (who owns each fact):
 *   FloorPlan  → shape, hasIsland, run lengths, which walls bear base, appliance
 *                positions, corners, island size.
 *   AI render  → hasWall, hasTall, cabinet pattern, decor/style, hardware, finish.
 */
import type {
  FloorPlan,
  FeatureKind,
  LayoutShape,
  DisplayUnit,
} from '@/lib/floor-plan'
import {
  counterSegmentsForWall,
  effectiveHasCounter,
  wallLengthCm,
} from '@/lib/floor-plan'
import type { WallSide, ConfidenceLevel } from '@/lib/types'

/** Stable run identifier. Wall names are stable across re-segmentation; the
 * plan is frozen on builder entry, so builder selections keyed off these
 * never orphan. */
export type RunId = WallSide | 'island'

export interface ContractRun {
  id: RunId
  label: string
  /** Cabinet-bearing length in cm (counter segments summed, doors cut out). */
  lengthCm: number
  /** Always true — a run exists *because* it bears a base/counter. */
  hasBase: true
  /**
   * Whether the run carries wall (upper) cabinets and a full-height tower. The
   * floor plan can't see these, so the contract supplies sensible geometry
   * defaults (wall units yes on perimeter runs / no over an island; no tower)
   * which the homeowner refines in the builder. The contract still *delivers*
   * a value for every field — the builder never falls back to its own guess.
   */
  hasWall: boolean
  hasTall: boolean
  /** True if this run owns an inner corner (reserves a corner cabinet). */
  hasCorner: boolean
  confidence: ConfidenceLevel
}

export interface ContractAppliance {
  kind: FeatureKind // 'sink' | 'hob' | 'fridge' | 'dishwasher'
  runId: WallSide
  /** Centre position of the appliance as % along its wall (0–100). */
  positionPctAlongRun: number
  widthCm: number
  confidence: ConfidenceLevel
}

export interface ContractCorner {
  /** The two adjacent counter-bearing runs that meet at this corner. */
  runA: WallSide
  runB: WallSide
}

export interface LayoutContract {
  schemaVersion: 1
  source: 'floor_plan'
  shape: LayoutShape
  hasIsland: boolean
  /** FloorPlan has no ceiling height; the contract supplies a standard default. */
  ceilingHeightCm: number
  units: DisplayUnit
  runs: ContractRun[]
  appliances: ContractAppliance[]
  corners: ContractCorner[]
}

const WALLS: WallSide[] = ['top', 'bottom', 'left', 'right']

/** Physically adjacent wall pairs that share a corner (opposite walls don't). */
const CORNER_PAIRS: ReadonlyArray<readonly [WallSide, WallSide]> = [
  ['top', 'left'],
  ['top', 'right'],
  ['bottom', 'left'],
  ['bottom', 'right'],
]

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, n))
}

/** Standard ceiling height (cm) — the floor plan doesn't capture it. */
export const DEFAULT_CEILING_CM = 280

/**
 * Project a frozen FloorPlan into the layout contract consumed by the builder.
 * Deterministic — same plan in, same contract out. The contract is COMPLETE:
 * every field the builder needs is supplied here (geometry where the plan knows
 * it, sensible defaults where it can't), so the builder never falls back to the
 * AI hypothesis or its own heuristics for layout.
 */
export function floorPlanToLayout(plan: FloorPlan): LayoutContract {
  // 1. Base-bearing walls + their cabinet lengths (doors/passages cut out).
  const baseWalls: Array<{ wall: WallSide; lengthCm: number }> = []
  for (const wall of WALLS) {
    if (!effectiveHasCounter(plan, wall)) continue
    const lengthCm = counterSegmentsForWall(plan, wall).reduce(
      (sum, seg) => sum + (seg.endCm - seg.startCm),
      0
    )
    if (lengthCm <= 0) continue
    baseWalls.push({ wall, lengthCm: Math.round(lengthCm) })
  }
  const baseWallSet = new Set<WallSide>(baseWalls.map((b) => b.wall))

  // 2. Corners = adjacent base-bearing walls that share a corner.
  const corners: ContractCorner[] = CORNER_PAIRS.filter(
    ([a, b]) => baseWallSet.has(a) && baseWallSet.has(b)
  ).map(([runA, runB]) => ({ runA, runB }))

  // 3. Assign each corner to exactly one owning run (prefer an un-owned run) so
  //    a U-shape reserves two corner units while galley/island reserve none.
  const cornerOwners = new Set<RunId>()
  for (const c of corners) {
    const owner = [c.runA, c.runB].find((r) => !cornerOwners.has(r)) ?? c.runA
    cornerOwners.add(owner)
  }

  // 4. Complete runs — geometry + defaults for render-silent fields.
  const runs: ContractRun[] = baseWalls.map(({ wall, lengthCm }) => ({
    id: wall,
    label: plan.room.sides[wall].label ?? capitalize(wall),
    lengthCm,
    hasBase: true,
    hasWall: true, // perimeter runs carry uppers by default; user refines
    hasTall: false,
    hasCorner: cornerOwners.has(wall),
    confidence: plan.room.confidence,
  }))

  if (plan.island) {
    runs.push({
      id: 'island',
      label: 'Island',
      lengthCm: Math.round(plan.island.lengthCm),
      hasBase: true,
      hasWall: false, // no upper cabinets over an island
      hasTall: false,
      hasCorner: false,
      confidence: plan.island.confidence,
    })
  }

  const appliances: ContractAppliance[] = plan.features.map((f) => ({
    kind: f.kind,
    runId: f.wall,
    positionPctAlongRun: clampPct((f.centerCm / wallLengthCm(f.wall, plan.room)) * 100),
    widthCm: Math.round(f.widthCm),
    confidence: f.confidence,
  }))

  return {
    schemaVersion: 1,
    source: 'floor_plan',
    shape: plan.layoutShape,
    hasIsland: plan.hasIsland,
    ceilingHeightCm: plan.ceilingHeightCm ?? DEFAULT_CEILING_CM,
    units: plan.units,
    runs,
    appliances,
    corners,
  }
}
