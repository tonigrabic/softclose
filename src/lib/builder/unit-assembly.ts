/**
 * The ONE cabinet-unit assembler.
 *
 * `assembleUnits(contract, hints, edits)` produces the unit list that the
 * Part-1 contract card displays, the builder seeds from, and `computeBom`
 * prices — the "what you confirm is what gets priced" invariant holds by
 * construction because all three call this single pure function.
 *
 * Pipeline per run (deterministic — same inputs, same output, stable ids):
 *  1. Appliance-BOUND slots from measured geometry: sink → exactly one
 *     `sink_unit` per sink appliance (AI `sink_unit` hints are ignored — the
 *     multi-sink fix), dishwasher → `appliance_slot`, oven → `oven_housing`,
 *     integrated fridge → tall housing. Bound units re-derive from the
 *     appliance every time; they're never stored in edits.
 *  2. Greedy width fill of the remaining capacity (corner reserved first).
 *  3. Pattern heuristic (corner / prime drawer bank / trash pullout / hob
 *     prefers a drawer bank under it).
 *  4. AI hints applied ONCE into the seed (±15 % position match, fillable
 *     slots only). `tallRunIds` folds render-seen tall towers in HERE so the
 *     confirmed tally shows them too (previously builder-only — a parity hole).
 *  5. User edits last (`UnitEdits` — per-row pattern SEQUENCES, sparse). The
 *     first edit to a row snapshots the currently displayed sequence, which is
 *     how AI hints become "applied once, fully editable". On geometry change
 *     the sequence refits: same patterns, widths redistributed; growth appends
 *     `doors_shelf` filler, shrink truncates from the tail with a warning.
 */
import type { CabinetPattern, CabinetUnit, ConfidenceLevel, FieldMeta } from './inventory'
import type { BuilderHypothesis } from './hypothesis'
import {
  clampWidth,
  fillRunWithWidths,
  pickBasePattern,
  type ContractSummary,
  type ContractSummaryRow,
} from './cabinet-suggest'
import {
  applianceSpansForRun,
  type ContractRun,
  type LayoutContract,
  type RunId,
} from '@/lib/contract/layout-contract'

export type RowKind = 'base' | 'wall' | 'tall'

/** One row's homeowner-edited pattern sequence (FILLABLE slots only). */
export interface RowSequenceEdit {
  runId: RunId
  row: RowKind
  /** Ordered patterns. Appliance-bound units are never stored here. */
  sequence: CabinetPattern[]
  editedAt: number
}

export interface UnitEdits {
  schemaVersion: 1
  rows: RowSequenceEdit[]
}

export interface AssemblyHints {
  /**
   * hypothesis.cabinetBoxes.unitPatterns. `sink_unit` / `appliance_slot` /
   * `oven_housing` entries are IGNORED — measured geometry owns those.
   */
  unitPatterns?: {
    runId: string
    positionPctAlongRun: number
    pattern: CabinetPattern
    confidence: ConfidenceLevel
  }[]
  /** Runs where the render showed a tall tower the floor plan didn't carry. */
  tallRunIds?: string[]
}

export interface AssemblyWarning {
  runId: RunId
  row: RowKind
  kind: 'sequence_truncated' | 'run_too_short'
  /** For sequence_truncated: how many trailing units were dropped. */
  dropped?: number
}

/** Per-row capacity readout for the editor UI (drives the "+ Add" affordance). */
export interface RowStat {
  runId: RunId
  row: RowKind
  /** Fillable capacity in mm (run minus corner reservation and bound slots). */
  fillableCapacityMm: number
  /** Number of FILLABLE units currently in the row (bound units excluded). */
  fillableCount: number
}

export interface AssemblyInput {
  contract: LayoutContract
  hints?: AssemblyHints | null
  edits?: UnitEdits | null
  /** Integrated fridge gets a tall housing carcass at the measured span. */
  integratedFridge?: boolean
}

export interface AssemblyResult {
  units: CabinetUnit[]
  warnings: AssemblyWarning[]
  rowStats: RowStat[]
}

const SINK_SLOT_MIN_MM = 600
const APPLIANCE_SLOT_MM = 600
const CORNER_RESERVED_MM = 900
const MIN_UNIT_MM = 300
const MAX_EVEN_UNIT_MM = 800
const STANDARD_WIDTHS = [800, 600, 600, 600, 450] as const

const BOUND_PATTERNS: ReadonlySet<CabinetPattern> = new Set([
  'sink_unit',
  'appliance_slot',
  'oven_housing',
])

export function isCornerPattern(p: CabinetPattern): boolean {
  return p === 'corner_magic' || p === 'corner_lazy'
}

/** Patterns the homeowner may pick per row (bound + corner handled separately). */
export const FREE_PATTERNS_BY_ROW: Record<RowKind, CabinetPattern[]> = {
  base: ['doors_shelf', 'drawer_bank', 'drawer_door_combo', 'pullouts_inside_doors', 'trash_pullout', 'wine_pullout'],
  wall: ['doors_shelf', 'open_shelves'],
  tall: ['doors_shelf', 'oven_housing', 'pullout_larder', 'pullouts_inside_doors', 'wine_pullout'],
}

export function hintsFromHypothesis(h: BuilderHypothesis | null | undefined): AssemblyHints | null {
  if (!h) return null
  const tallRunIds = new Set<string>()
  for (const r of h.layout?.runs ?? []) {
    if (r.hasTall?.value === true) tallRunIds.add(r.id)
  }
  const pantry = h.features?.tallPantry
  if (pantry?.present?.value === true && pantry.runId) tallRunIds.add(pantry.runId)
  const unitPatterns = h.cabinetBoxes?.unitPatterns
  if (!unitPatterns?.length && tallRunIds.size === 0) return null
  return {
    unitPatterns,
    tallRunIds: tallRunIds.size > 0 ? [...tallRunIds] : undefined,
  }
}

/* ── The assembler ─────────────────────────────────────────────────────── */

export function assembleUnits(input: AssemblyInput): AssemblyResult {
  const { contract, hints, edits, integratedFridge = false } = input
  const units: CabinetUnit[] = []
  const warnings: AssemblyWarning[] = []
  const rowStats: RowStat[] = []

  for (const run of contract.runs) {
    const totalMm = run.lengthCm * 10
    if (totalMm <= 0) continue
    const spans = applianceSpansForRun(contract, run.id)
    const confidenceByKind = new Map(
      contract.appliances.filter((a) => a.runId === run.id).map((a) => [a.kind, a.confidence])
    )
    const tallHeight = Math.max(1800, contract.ceilingHeightCm * 10 - 120)
    const heuristicMeta: FieldMeta = { confidence: run.confidence, provenance: 'ai-default' }

    const sinkSpans = spans.filter((s) => s.kind === 'sink')
    const dwSpans = spans.filter((s) => s.kind === 'dishwasher')
    const ovenSpans = spans.filter((s) => s.kind === 'oven')
    const fridgeSpans = spans.filter((s) => s.kind === 'fridge')
    const hobSpan = spans.find((s) => s.kind === 'hob')
    const fridgeMm = fridgeSpans.reduce((sum, s) => sum + s.widthMm, 0)
    const boundMeta = (kind: 'sink' | 'dishwasher' | 'oven' | 'fridge'): FieldMeta => ({
      confidence: confidenceByKind.get(kind) ?? run.confidence,
      provenance: 'homeowner-confirmed',
    })

    /* ---- BASE row ---- */
    if (run.hasBase) {
      const bound: CabinetUnit[] = []
      let boundMm = 0
      for (const s of sinkSpans) {
        const w = clampWidth(Math.max(SINK_SLOT_MIN_MM, s.widthMm))
        boundMm += w
        bound.push(
          baseUnit(run, totalMm, s.startMm, w, 'sink_unit', boundMeta('sink'), 'sink')
        )
      }
      for (const s of dwSpans) {
        boundMm += APPLIANCE_SLOT_MM
        bound.push(
          baseUnit(run, totalMm, s.startMm, APPLIANCE_SLOT_MM, 'appliance_slot', boundMeta('dishwasher'), 'dishwasher')
        )
      }
      for (const s of ovenSpans) {
        boundMm += APPLIANCE_SLOT_MM
        bound.push(
          baseUnit(run, totalMm, s.startMm, APPLIANCE_SLOT_MM, 'oven_housing', boundMeta('oven'), 'oven')
        )
      }

      const cornerMm = run.hasCorner ? CORNER_RESERVED_MM : 0
      const capacityMm = Math.max(0, totalMm - fridgeMm - boundMm - cornerMm)
      if (capacityMm === 0 && bound.length > 0 && totalMm - fridgeMm - boundMm < 0) {
        warnings.push({ runId: run.id, row: 'base', kind: 'run_too_short' })
      }

      const rowEdit = editFor(edits, run.id, 'base')
      let fill: { pattern: CabinetPattern; widthMm: number; meta: FieldMeta }[]

      if (rowEdit) {
        const fitted = fitSequence(fillableSlots(rowEdit.sequence, run.hasCorner), capacityMm)
        if (fitted.dropped > 0) {
          warnings.push({ runId: run.id, row: 'base', kind: 'sequence_truncated', dropped: fitted.dropped })
        }
        // Seeded (pre-edit) sequence for provenance: edited where it differs.
        const seeded = seedPatterns(run, capacityMm, hints, hobSpan?.startMm, totalMm)
        fill = fitted.patterns.map((pattern, i) => ({
          pattern,
          widthMm: fitted.widthMm,
          meta: {
            confidence: 'H' as const,
            provenance: pattern === seeded[i]?.pattern ? ('homeowner-confirmed' as const) : ('homeowner-edited' as const),
          },
        }))
      } else {
        fill = seedPatterns(run, capacityMm, hints, hobSpan?.startMm, totalMm)
      }

      // Corner unit first (its mechanism is editable via the edit sequence).
      let positionMm = 0
      if (run.hasCorner) {
        const editedCorner = rowEdit?.sequence.find(isCornerPattern)
        units.push({
          ...baseUnit(run, totalMm, 0, CORNER_RESERVED_MM, editedCorner ?? 'corner_magic',
            editedCorner ? { confidence: 'H', provenance: 'homeowner-edited' } : heuristicMeta),
        })
        positionMm = CORNER_RESERVED_MM
      }
      for (const f of fill) {
        units.push(baseUnit(run, totalMm, positionMm, f.widthMm, f.pattern, f.meta))
        positionMm += f.widthMm
      }
      units.push(...bound)
      rowStats.push({ runId: run.id, row: 'base', fillableCapacityMm: capacityMm, fillableCount: fill.length })
    }

    /* ---- WALL row ---- */
    if (run.hasWall) {
      const cornerMm = run.hasCorner ? CORNER_RESERVED_MM : 0
      const capacityMm = Math.max(0, totalMm - fridgeMm - cornerMm)
      const rowEdit = editFor(edits, run.id, 'wall')

      let fill: { pattern: CabinetPattern; widthMm: number; meta: FieldMeta }[]
      if (rowEdit) {
        const fitted = fitSequence(fillableSlots(rowEdit.sequence, run.hasCorner), capacityMm)
        if (fitted.dropped > 0) {
          warnings.push({ runId: run.id, row: 'wall', kind: 'sequence_truncated', dropped: fitted.dropped })
        }
        fill = fitted.patterns.map((pattern) => ({
          pattern,
          widthMm: fitted.widthMm,
          meta: { confidence: 'H' as const, provenance: 'homeowner-edited' as const },
        }))
      } else {
        // Plain doors by default; wall-row hints (open_shelves) are matched by
        // applyHintsToRow below, once positions are assigned.
        const widths = fillRunWithWidths(capacityMm, STANDARD_WIDTHS)
        fill = widths.map((w) => ({
          pattern: 'doors_shelf' as CabinetPattern,
          widthMm: w,
          meta: heuristicMeta,
        }))
      }

      let positionMm = 0
      const wallUnits: CabinetUnit[] = []
      if (run.hasCorner) {
        const editedCorner = rowEdit?.sequence.find(isCornerPattern)
        wallUnits.push(
          wallUnit(run, totalMm, 0, CORNER_RESERVED_MM, editedCorner ?? 'corner_lazy',
            editedCorner ? { confidence: 'H', provenance: 'homeowner-edited' } : heuristicMeta)
        )
        positionMm = CORNER_RESERVED_MM
      }
      for (const f of fill) {
        wallUnits.push(wallUnit(run, totalMm, positionMm, f.widthMm, f.pattern, f.meta))
        positionMm += f.widthMm
      }
      if (!rowEdit) applyHintsToRow(wallUnits, hints, run.id, 'wall')
      units.push(...wallUnits)
      rowStats.push({ runId: run.id, row: 'wall', fillableCapacityMm: capacityMm, fillableCount: fill.length })
    }

    /* ---- TALL row ---- */
    const tallUnits: CabinetUnit[] = []
    if (integratedFridge) {
      for (const f of fridgeSpans) {
        tallUnits.push({
          id: '',
          type: 'tall',
          widthMm: clampWidth(f.widthMm),
          heightMm: tallHeight,
          depthMm: 600,
          runId: run.id,
          positionPctAlongRun: clampPct((f.startMm / totalMm) * 100),
          pattern: 'doors_shelf',
          boundTo: 'fridge',
          meta: boundMeta('fridge'),
        })
      }
    }
    const rowEdit = editFor(edits, run.id, 'tall')
    const hintedTall = hints?.tallRunIds?.includes(run.id) ?? false
    if (rowEdit) {
      // The homeowner's tall sequence replaces the heuristic tower list
      // entirely (bound fridge housing above always survives).
      for (const pattern of nonCorner(rowEdit.sequence)) {
        tallUnits.push(tallTower(run, tallHeight, pattern, {
          confidence: 'H',
          provenance: 'homeowner-edited',
        }))
      }
      if (rowEdit.sequence.length === 0 && (run.hasTall || hintedTall)) {
        // Explicitly emptied — respect it (removing the tower is a real edit).
      }
    } else if (run.hasTall || hintedTall) {
      tallUnits.push(
        tallTower(run, tallHeight, 'oven_housing',
          run.hasTall
            ? { confidence: run.confidence, provenance: 'homeowner-confirmed' }
            : { confidence: 'M', provenance: 'ai-vision' })
      )
    }
    units.push(...tallUnits)
    rowStats.push({
      runId: run.id,
      row: 'tall',
      fillableCapacityMm: 0,
      fillableCount: tallUnits.filter((u) => !u.boundTo).length,
    })
  }

  // Stable ids: sort each (run,row) by position, id = runId:row:index.
  const grouped = new Map<string, CabinetUnit[]>()
  for (const u of units) {
    const key = `${u.runId}:${u.type}`
    const list = grouped.get(key) ?? []
    list.push(u)
    grouped.set(key, list)
  }
  const out: CabinetUnit[] = []
  for (const run of contract.runs) {
    for (const row of ['base', 'wall', 'tall'] as const) {
      const list = grouped.get(`${run.id}:${row}`)
      if (!list) continue
      list.sort((a, b) => a.positionPctAlongRun - b.positionPctAlongRun)
      list.forEach((u, i) => {
        u.id = `${run.id}:${row}:${i}`
        out.push(u)
      })
    }
  }
  return { units: out, warnings, rowStats }
}

/* ── Seeding internals ─────────────────────────────────────────────────── */

/** Heuristic + AI-hint patterns for the base row's fillable slots. */
function seedPatterns(
  run: ContractRun,
  capacityMm: number,
  hints: AssemblyHints | null | undefined,
  hobStartMm: number | undefined,
  totalMm: number
): { pattern: CabinetPattern; widthMm: number; meta: FieldMeta }[] {
  const widths = fillRunWithWidths(capacityMm, STANDARD_WIDTHS)
  const heuristicMeta: FieldMeta = { confidence: run.confidence, provenance: 'ai-default' }
  // Index offset of 1 when there's a corner keeps the historic heuristic
  // ("second slot is the prime drawer bank") counting the corner as slot 0.
  const offset = run.hasCorner ? 1 : 0
  const startMmOf: number[] = []
  let pos = run.hasCorner ? CORNER_RESERVED_MM : 0
  for (const w of widths) {
    startMmOf.push(pos)
    pos += w
  }
  const out = widths.map((w, i) => ({
    pattern: pickBasePattern({
      index: i + offset,
      lastIndex: widths.length - 1 + offset,
      widthMm: w,
      isCorner: false,
    }),
    widthMm: w,
    meta: heuristicMeta,
  }))
  // The hob wants a drawer bank under it (pots) — seed preference only, never
  // clobbering a more specific pattern than plain doors.
  if (hobStartMm !== undefined && out.length > 0) {
    let best = -1
    let bestDist = Infinity
    out.forEach((u, i) => {
      const center = startMmOf[i] + u.widthMm / 2
      const d = Math.abs(center - hobStartMm)
      if (d < bestDist) {
        bestDist = d
        best = i
      }
    })
    if (best >= 0 && out[best].pattern === 'doors_shelf') {
      out[best] = { ...out[best], pattern: 'drawer_bank' }
    }
  }
  // AI hints: nearest fillable slot within ±15 % of the run; bound/corner
  // patterns are ignored (measured geometry owns them — the multi-sink fix).
  for (const h of hints?.unitPatterns ?? []) {
    if (h.runId !== run.id) continue
    if (BOUND_PATTERNS.has(h.pattern) || isCornerPattern(h.pattern)) continue
    if (!FREE_PATTERNS_BY_ROW.base.includes(h.pattern)) continue
    let best = -1
    let bestDist = Infinity
    out.forEach((u, i) => {
      const pct = totalMm > 0 ? (startMmOf[i] / totalMm) * 100 : 0
      const d = Math.abs(pct - h.positionPctAlongRun)
      if (d < bestDist) {
        bestDist = d
        best = i
      }
    })
    if (best >= 0 && bestDist <= 15) {
      out[best] = {
        ...out[best],
        pattern: h.pattern,
        meta: { confidence: h.confidence, provenance: 'ai-vision' },
      }
    }
  }
  return out
}

/** Apply wall-row hints (open_shelves etc.) onto already-positioned units. */
function applyHintsToRow(
  rowUnits: CabinetUnit[],
  hints: AssemblyHints | null | undefined,
  runId: string,
  row: RowKind
): void {
  for (const h of hints?.unitPatterns ?? []) {
    if (h.runId !== runId) continue
    if (BOUND_PATTERNS.has(h.pattern) || isCornerPattern(h.pattern)) continue
    if (!FREE_PATTERNS_BY_ROW[row].includes(h.pattern)) continue
    let best: CabinetUnit | null = null
    let bestDist = Infinity
    for (const u of rowUnits) {
      if (u.boundTo || isCornerPattern(u.pattern)) continue
      const d = Math.abs(u.positionPctAlongRun - h.positionPctAlongRun)
      if (d < bestDist) {
        bestDist = d
        best = u
      }
    }
    if (best && bestDist <= 15) {
      best.pattern = h.pattern
      best.meta = { confidence: h.confidence, provenance: 'ai-vision' }
    }
  }
}

/**
 * Fit an edited pattern sequence into the row's capacity: even widths,
 * growth appends nothing (an emptied row stays empty; a lengthened wall just
 * widens units up to 800 mm, then appends `doors_shelf` filler), shrink drops
 * from the tail.
 */
function fitSequence(
  sequence: CabinetPattern[],
  capacityMm: number
): { patterns: CabinetPattern[]; widthMm: CabinetUnit['widthMm']; dropped: number } {
  const patterns = [...sequence]
  let dropped = 0
  // Growth: keep per-unit width sane by appending plain cabinets.
  while (patterns.length > 0 && capacityMm / patterns.length > MAX_EVEN_UNIT_MM && patterns.length < 30) {
    patterns.push('doors_shelf')
  }
  // Shrink: drop trailing units that no longer fit.
  while (patterns.length > 0 && capacityMm / patterns.length < MIN_UNIT_MM) {
    patterns.pop()
    dropped++
  }
  const widthMm = patterns.length > 0 ? clampWidth(capacityMm / patterns.length) : clampWidth(MIN_UNIT_MM)
  return { patterns, widthMm, dropped }
}

function nonCorner(sequence: CabinetPattern[]): CabinetPattern[] {
  return sequence.filter((p) => !isCornerPattern(p))
}

/**
 * The fillable (non-corner) slots of a stored sequence. On corner runs the
 * displayed sequence always leads with the corner slot — if an edit somehow
 * overwrote it with a non-corner pattern, that first slot still IS the corner
 * (the mechanism just reverts to default), so it's dropped from the fill
 * rather than shifting every count by one.
 */
function fillableSlots(sequence: CabinetPattern[], hasCorner: boolean | undefined): CabinetPattern[] {
  if (hasCorner && sequence.length > 0 && !sequence.some(isCornerPattern)) {
    return nonCorner(sequence.slice(1))
  }
  return nonCorner(sequence)
}

function editFor(edits: UnitEdits | null | undefined, runId: string, row: RowKind): RowSequenceEdit | undefined {
  return edits?.rows.find((r) => r.runId === runId && r.row === row)
}

function baseUnit(
  run: ContractRun,
  totalMm: number,
  startMm: number,
  widthMm: number,
  pattern: CabinetPattern,
  meta: FieldMeta,
  boundTo?: CabinetUnit['boundTo']
): CabinetUnit {
  return {
    id: '',
    type: 'base',
    widthMm: clampWidth(widthMm),
    heightMm: 720,
    depthMm: 600,
    runId: run.id,
    positionPctAlongRun: totalMm > 0 ? clampPct((startMm / totalMm) * 100) : 0,
    pattern,
    boundTo,
    meta,
  }
}

function wallUnit(
  run: ContractRun,
  totalMm: number,
  startMm: number,
  widthMm: number,
  pattern: CabinetPattern,
  meta: FieldMeta
): CabinetUnit {
  return {
    id: '',
    type: 'wall',
    widthMm: clampWidth(widthMm),
    heightMm: 720,
    depthMm: 330,
    runId: run.id,
    positionPctAlongRun: totalMm > 0 ? clampPct((startMm / totalMm) * 100) : 0,
    pattern,
    meta,
  }
}

function tallTower(run: ContractRun, tallHeight: number, pattern: CabinetPattern, meta: FieldMeta): CabinetUnit {
  return {
    id: '',
    type: 'tall',
    widthMm: 600,
    heightMm: tallHeight,
    depthMm: 600,
    runId: run.id,
    positionPctAlongRun: 80,
    pattern,
    meta,
  }
}

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, n))
}

/**
 * The contract summary (tally card) built from an assembly — the same
 * projection `summarizeContract` used to derive, now over the one unit list.
 */
export function summarizeAssembly(contract: LayoutContract, result: AssemblyResult): ContractSummary {
  const rows: ContractSummaryRow[] = contract.runs.map((run) => {
    const units = result.units.filter((u) => u.runId === run.id)
    return {
      id: run.id,
      label: run.label,
      lengthCm: run.lengthCm,
      units,
      base: units.filter((u) => u.type === 'base').length,
      wall: units.filter((u) => u.type === 'wall').length,
      tall: units.filter((u) => u.type === 'tall').length,
    }
  })
  return {
    rows,
    totalCabinets: rows.reduce((s, r) => s + r.base + r.wall + r.tall, 0),
    cornerCount: contract.corners.length,
    shape: contract.shape,
    hasIsland: contract.hasIsland,
    ceilingHeightCm: contract.ceilingHeightCm,
    appliances: contract.appliances.map((a) => ({ kind: a.kind })),
  }
}

/* ── Edit helpers (used by the Part-1 unit editor) ─────────────────────── */

/**
 * The FILLABLE pattern sequence a row currently displays (corner included so
 * its mechanism is part of the stored sequence; bound units excluded).
 */
export function displayedSequence(units: CabinetUnit[], runId: string, row: RowKind): CabinetPattern[] {
  return units
    .filter((u) => u.runId === runId && u.type === row && !u.boundTo)
    .sort((a, b) => a.positionPctAlongRun - b.positionPctAlongRun)
    .map((u) => u.pattern)
}

function upsertRow(edits: UnitEdits | null | undefined, next: RowSequenceEdit): UnitEdits {
  const rows = (edits?.rows ?? []).filter((r) => !(r.runId === next.runId && r.row === next.row))
  return { schemaVersion: 1, rows: [...rows, next] }
}

/** Snapshot-on-first-edit: mutate the DISPLAYED sequence, store the result. */
export function withPatternChanged(
  edits: UnitEdits | null | undefined,
  displayed: CabinetPattern[],
  runId: RunId,
  row: RowKind,
  index: number,
  pattern: CabinetPattern,
  now: number
): UnitEdits {
  const sequence = displayed.map((p, i) => (i === index ? pattern : p))
  return upsertRow(edits, { runId, row, sequence, editedAt: now })
}

export function withUnitAdded(
  edits: UnitEdits | null | undefined,
  displayed: CabinetPattern[],
  runId: RunId,
  row: RowKind,
  pattern: CabinetPattern,
  now: number
): UnitEdits {
  return upsertRow(edits, { runId, row, sequence: [...displayed, pattern], editedAt: now })
}

export function withUnitRemoved(
  edits: UnitEdits | null | undefined,
  displayed: CabinetPattern[],
  runId: RunId,
  row: RowKind,
  index: number,
  now: number
): UnitEdits {
  // The corner slot is never removable — its mechanism is a pattern choice.
  if (isCornerPattern(displayed[index])) return upsertRow(edits, { runId, row, sequence: displayed, editedAt: now })
  const sequence = displayed.filter((_, i) => i !== index)
  return upsertRow(edits, { runId, row, sequence, editedAt: now })
}
