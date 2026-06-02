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
  /** FloorPlan has no ceiling height yet → undefined; builder fills a default. */
  ceilingHeightCm?: number
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

/**
 * Project a frozen FloorPlan into the layout contract consumed by the builder.
 * Deterministic — same plan in, same contract out.
 */
export function floorPlanToLayout(plan: FloorPlan): LayoutContract {
  const runs: ContractRun[] = []

  for (const wall of WALLS) {
    if (!effectiveHasCounter(plan, wall)) continue
    const lengthCm = counterSegmentsForWall(plan, wall).reduce(
      (sum, seg) => sum + (seg.endCm - seg.startCm),
      0
    )
    if (lengthCm <= 0) continue
    runs.push({
      id: wall,
      label: plan.room.sides[wall].label ?? capitalize(wall),
      lengthCm: Math.round(lengthCm),
      hasBase: true,
      confidence: plan.room.confidence,
    })
  }

  if (plan.island) {
    runs.push({
      id: 'island',
      label: 'Island',
      lengthCm: Math.round(plan.island.lengthCm),
      hasBase: true,
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

  const runWalls = new Set<RunId>(runs.map((r) => r.id))
  const corners: ContractCorner[] = CORNER_PAIRS.filter(
    ([a, b]) => runWalls.has(a) && runWalls.has(b)
  ).map(([runA, runB]) => ({ runA, runB }))

  return {
    schemaVersion: 1,
    source: 'floor_plan',
    shape: plan.layoutShape,
    hasIsland: plan.hasIsland,
    units: plan.units,
    runs,
    appliances,
    corners,
  }
}
