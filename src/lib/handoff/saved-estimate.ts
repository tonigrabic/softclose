/**
 * The range the project's current brief stored, as the homeowner may see it
 * again (IMP-07): a revisit of the review shows the figures the maker has —
 * not "Procjena još nije dostupna" until they send again.
 *
 * Read on the server from one JSON path of the stored bundle (bundle->estimate)
 * plus the brief row's columns, and handed to the client. So it is validated
 * here, and built from known fields only: the stored estimate carries the
 * maker-only money (net cost and margin), and nothing that is not named below
 * leaves this function.
 *
 * Pure and server-safe.
 */
import { normalizeAssumptions } from '@/lib/builder/range'
import type { BomLineItem } from '@/lib/builder/bom'
import type { HandoffEstimate } from '@/lib/types'

/** The brief row's denormalised range, for briefs whose bundle has none to read. */
export interface SavedEstimateColumns {
  low: number | null
  high: number | null
  bandPct: number | null
  allInLow: number | null
  allInHigh: number | null
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function rangeOf(v: unknown): { low: number; high: number } | null {
  if (!v || typeof v !== 'object') return null
  const { low, high } = v as Record<string, unknown>
  return isNum(low) && isNum(high) ? { low, high } : null
}

const SECTIONS = new Set(['works', 'goods', 'project'])
const WORKS_KINDS = new Set(['material', 'make', 'install'])

/** Lines as computeBom stored them; anything else is dropped rather than drawn. */
function linesOf(v: unknown): BomLineItem[] {
  if (!Array.isArray(v)) return []
  return v.filter((l): l is BomLineItem => {
    if (!l || typeof l !== 'object') return false
    const line = l as Record<string, unknown>
    return (
      typeof line.key === 'string' &&
      typeof line.section === 'string' &&
      SECTIONS.has(line.section) &&
      (line.worksKind === undefined || (typeof line.worksKind === 'string' && WORKS_KINDS.has(line.worksKind))) &&
      isNum(line.low) &&
      isNum(line.high)
    )
  })
}

/**
 * The stored estimate (numeric low and high; lines as stored, or none;
 * assumptions through `normalizeAssumptions`, so a brief from before IMP-04
 * gets the legacy list). A brief whose bundle holds no estimate falls back to
 * the row's columns. Null when there is no range at all — the brief went out
 * without a build.
 */
export function savedEstimate(raw: unknown, cols: SavedEstimateColumns): HandoffEstimate | null {
  const stored = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null
  const columnsGoods = isNum(cols.allInLow) && isNum(cols.allInHigh) ? { low: cols.allInLow, high: cols.allInHigh } : null

  if (stored && isNum(stored.low) && isNum(stored.high)) {
    const estimate: HandoffEstimate = {
      low: stored.low,
      high: stored.high,
      withAppliances: rangeOf(stored.withAppliances) ?? (stored.withAppliances === undefined ? columnsGoods : null),
      basis: typeof stored.basis === 'string' ? stored.basis : '',
      lines: linesOf(stored.lines),
      assumptions: normalizeAssumptions(stored.assumptions),
    }
    const bandPct = isNum(stored.bandPct) ? stored.bandPct : isNum(cols.bandPct) ? cols.bandPct : null
    if (bandPct !== null) estimate.bandPct = bandPct
    if (stored.priceBasis === 'gross-margin-v1') estimate.priceBasis = 'gross-margin-v1'
    return estimate
  }

  if (isNum(cols.low) && isNum(cols.high)) {
    const estimate: HandoffEstimate = {
      low: cols.low,
      high: cols.high,
      withAppliances: columnsGoods,
      basis: '',
      lines: [],
      assumptions: normalizeAssumptions(undefined),
    }
    if (isNum(cols.bandPct)) estimate.bandPct = cols.bandPct
    return estimate
  }

  return null
}
