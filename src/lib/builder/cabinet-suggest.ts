/**
 * Shared cabinet-fill helpers + the contract-summary types.
 *
 * The actual unit derivation lives in `unit-assembly.ts` (`assembleUnits`) —
 * the ONE function the Part-1 tally, builder seeding and computeBom all call.
 * This module keeps the low-level pieces the assembler composes: the greedy
 * width fill, the base-pattern heuristic, and width clamping.
 */

import type { CabinetPattern, CabinetUnit } from './inventory'
import type { RunId } from '@/lib/contract/layout-contract'
import type { FeatureKind, LayoutShape } from '@/lib/floor-plan'

/**
 * Greedy width fill: take the largest standard width that fits, cycling so we
 * don't produce 8 × 800 in a row. `reservedFirstMm` (the corner unit) is
 * emitted as the first width when set.
 */
export function fillRunWithWidths(
  totalMm: number,
  widths: readonly number[],
  reservedFirstMm = 0
): number[] {
  let remaining = totalMm - reservedFirstMm
  const out: number[] = []
  if (reservedFirstMm > 0) out.push(reservedFirstMm)
  let attempt = 0
  while (remaining >= 300 && attempt < 30) {
    const w = widths[attempt % widths.length]
    if (remaining >= w) {
      out.push(w)
      remaining -= w
    } else {
      const fallback = widths.slice().sort((a, b) => a - b).find((x) => x <= remaining && x >= 300)
      if (!fallback) break
      out.push(fallback)
      remaining -= fallback
    }
    attempt++
  }
  return out
}

/** One run's line in the contract summary: its length and per-row cabinet tally. */
export interface ContractSummaryRow {
  id: RunId
  label: string
  lengthCm: number
  base: number
  wall: number
  tall: number
  /**
   * The ordered cabinet units for this run — the same list the builder seeds
   * from. Lets the contract card render the per-row sequence, not just counts.
   */
  units: CabinetUnit[]
}

/**
 * Everything the homeowner signs off on at the contract-confirmation step.
 * Built by `summarizeAssembly` (unit-assembly.ts) from the one assembled unit
 * list, so the tally shown is the tally that gets priced.
 */
export interface ContractSummary {
  rows: ContractSummaryRow[]
  totalCabinets: number
  cornerCount: number
  shape: LayoutShape
  hasIsland: boolean
  ceilingHeightCm: number
  appliances: { kind: FeatureKind }[]
}

export function pickBasePattern(args: {
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

export function clampWidth(mm: number): CabinetUnit['widthMm'] {
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
