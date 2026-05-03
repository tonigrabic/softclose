/**
 * Auto-suggest cabinet placement for a wall run.
 *
 * Given a run length in cm and which cabinet rows the run carries (base /
 * wall / tall), produce a sensible default cabinet list. The user then tweaks
 * counts and widths in the Cabinet Section Wizard.
 *
 * Approach: greedy fill starting with 800/600/450 mm modules, with the corner
 * unit reserved at one end if the run is the *first* run of an L/U layout.
 */

import type { CabinetPattern, CabinetUnit, WallRunDimensions } from './inventory'

const STANDARD_WIDTHS_BASE = [800, 600, 600, 600, 450] as const
const STANDARD_WIDTHS_WALL = [800, 600, 600, 600, 450] as const

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `unit-${crypto.randomUUID()}`
  }
  // Fallback for old runtimes — shouldn't hit in modern Next.js.
  return `unit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

interface SuggestOptions {
  /** True if this run owns the inner corner (so we reserve a corner unit). */
  hasCorner?: boolean
  /** Cabinet base depth (mm). 600 = standard. */
  baseDepthMm?: number
  /** Cabinet wall depth (mm). 330 = standard. */
  wallDepthMm?: number
  /** Cabinet base height (mm) — incl. plinth. */
  baseHeightMm?: number
  /** Cabinet wall height (mm). */
  wallHeightMm?: number
  /** Cabinet tall height (mm). */
  tallHeightMm?: number
}

function fillRunWithWidths(
  totalMm: number,
  widths: readonly number[],
  reservedFirstMm = 0
): number[] {
  let remaining = totalMm - reservedFirstMm
  const out: number[] = []
  if (reservedFirstMm > 0) out.push(reservedFirstMm)
  // Greedy: take the largest width that fits; cycle through widths so we don't
  // produce 8 × 800 in a row.
  let attempt = 0
  while (remaining >= 300 && attempt < 30) {
    const w = widths[attempt % widths.length]
    if (remaining >= w) {
      out.push(w)
      remaining -= w
    } else {
      // Try a smaller fallback width.
      const fallback = widths.slice().sort((a, b) => a - b).find((x) => x <= remaining && x >= 300)
      if (!fallback) break
      out.push(fallback)
      remaining -= fallback
    }
    attempt++
  }
  return out
}

export function suggestCabinetsForRun(
  run: WallRunDimensions,
  opts: SuggestOptions = {}
): CabinetUnit[] {
  const totalMm = run.lengthCm * 10
  const baseDepth = opts.baseDepthMm ?? 600
  const wallDepth = opts.wallDepthMm ?? 330
  const baseHeight = opts.baseHeightMm ?? 720
  const wallHeight = opts.wallHeightMm ?? 720
  const tallHeight = opts.tallHeightMm ?? 2200
  const cornerReservedMm = opts.hasCorner ? 900 : 0

  const out: CabinetUnit[] = []

  if (run.hasBase) {
    const widths = fillRunWithWidths(totalMm, STANDARD_WIDTHS_BASE, cornerReservedMm)
    const lastIdx = widths.length - 1
    let positionMm = 0
    widths.forEach((w, i) => {
      const isCornerUnit = i === 0 && Boolean(opts.hasCorner)
      const pattern = pickBasePattern({
        index: i,
        lastIndex: lastIdx,
        widthMm: w,
        isCorner: isCornerUnit,
      })
      out.push({
        id: newId(),
        type: 'base',
        widthMm: clampWidth(w),
        heightMm: baseHeight,
        depthMm: baseDepth,
        runId: run.id,
        positionPctAlongRun: totalMm > 0 ? (positionMm / totalMm) * 100 : 0,
        pattern,
      })
      positionMm += w
    })
  }

  if (run.hasWall) {
    const widths = fillRunWithWidths(totalMm, STANDARD_WIDTHS_WALL, cornerReservedMm)
    let positionMm = 0
    widths.forEach((w) => {
      out.push({
        id: newId(),
        type: 'wall',
        widthMm: clampWidth(w),
        heightMm: wallHeight,
        depthMm: wallDepth,
        runId: run.id,
        positionPctAlongRun: totalMm > 0 ? (positionMm / totalMm) * 100 : 0,
        pattern: 'doors_shelf',
      })
      positionMm += w
    })
  }

  if (run.hasTall) {
    // One tall unit at 600mm wide, placed at the end of the run.
    out.push({
      id: newId(),
      type: 'tall',
      widthMm: 600,
      heightMm: tallHeight,
      depthMm: baseDepth,
      runId: run.id,
      positionPctAlongRun: 80,
      pattern: 'oven_housing',
    })
  }

  return out
}

function pickBasePattern(args: {
  index: number
  lastIndex: number
  widthMm: number
  isCorner: boolean
}): CabinetPattern {
  if (args.isCorner) return 'corner_magic'
  // Second slot tends to be the prime drawer bank under the worktop edge.
  if (args.index === 1 && args.widthMm >= 400) return 'drawer_bank'
  // Narrow unit at run end → trash pullout if it fits the slot.
  if (args.index === args.lastIndex && args.widthMm <= 600) return 'trash_pullout'
  return 'doors_shelf'
}

function clampWidth(mm: number): CabinetUnit['widthMm'] {
  const allowed: CabinetUnit['widthMm'][] = [300, 400, 450, 500, 600, 800, 900, 1000, 1200]
  let best = allowed[0]
  let bestDist = Infinity
  for (const a of allowed) {
    const d = Math.abs(a - mm)
    if (d < bestDist) {
      bestDist = d
      best = a
    }
  }
  return best
}

/** Compute how much of a run is filled by base cabinets, in mm. */
export function totalBaseWidthMm(units: CabinetUnit[]): number {
  return units.filter((u) => u.type === 'base').reduce((s, u) => s + u.widthMm, 0)
}

export function totalWallWidthMm(units: CabinetUnit[]): number {
  return units.filter((u) => u.type === 'wall').reduce((s, u) => s + u.widthMm, 0)
}

export function unitsForRun(units: CabinetUnit[], runId: string): CabinetUnit[] {
  return units.filter((u) => u.runId === runId)
}

export function unitsForRunByType(
  units: CabinetUnit[],
  runId: string,
  type: CabinetUnit['type']
): CabinetUnit[] {
  return units.filter((u) => u.runId === runId && u.type === type)
}

export function allowedWidths(): CabinetUnit['widthMm'][] {
  return [300, 400, 450, 500, 600, 800, 900, 1000, 1200]
}

export { newId as newCabinetId }
