'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslations } from '@/lib/i18n'
import { PickerSlot } from '../PickerSlot'
import { ChipRow } from '../ChipRow'
import {
  suggestCabinetsForRun,
  totalBaseWidthMm,
  totalWallWidthMm,
  unitsForRun,
  unitsForRunByType,
} from '@/lib/builder/cabinet-suggest'
import { PATTERN_SPECS, unitIsCorner } from '@/lib/builder/cabinet-patterns'
import type { BuilderHypothesis } from '@/lib/builder/hypothesis'
import { applianceSpansForRun, type LayoutContract } from '@/lib/contract/layout-contract'
import type {
  BuilderState,
  CabinetPattern,
  CabinetUnit,
  CarcassMaterial,
} from '@/lib/builder/inventory'

const CARCASS_OPTIONS = [
  'white_melamine_standard',
  'colored_melamine',
  'moisture_resistant_p3',
  'matched_to_door',
] as const satisfies readonly CarcassMaterial[]

// Phase 2 lets the homeowner choose drawers vs doors on a normal base cabinet —
// not add/remove/resize (the maker owns the cabinet layout). Corner patterns are
// excluded here; corners are edited in the dedicated corner section.
const DRAWERS_VS_DOORS = [
  'doors_shelf',
  'drawer_bank',
  'drawer_door_combo',
  'pullouts_inside_doors',
] as const satisfies readonly CabinetPattern[]

// Corner mechanisms — each carries its own accessory cost in PATTERN_SPECS.
const CORNER_PATTERNS = ['corner_magic', 'corner_lazy'] as const satisfies readonly CabinetPattern[]

interface CabinetBoxesGroupProps {
  state: BuilderState
  hypothesis?: BuilderHypothesis | null
  /** Part-1 contract — used to place the sink unit at its measured position. */
  layoutContract?: LayoutContract | null
  onPatch: (patch: Partial<BuilderState['cabinetBoxes']>) => void
}

/**
 * Per-section cabinet wizard. The user is walked through each wall run in
 * turn (Main wall → Return wall → Corner) defining base / wall / tall counts
 * and widths. A fitting bar shows how much of the run is filled.
 */
export function CabinetBoxesGroup({ state, hypothesis, layoutContract, onPatch }: CabinetBoxesGroupProps) {
  const { t } = useTranslations()
  const runs = state.layout.runs
  // Corner section only exists when the contract actually has corners — never an
  // override that would change the Part-1 layout.
  const hasCorners = runs.some((r) => r.hasCorner)
  const sections = useMemo(
    () => [
      ...runs.map((r) => ({ id: r.id, label: r.label })),
      ...(hasCorners ? [{ id: '__corner', label: t('cabinetBoxes.cornerSection') }] : []),
    ],
    [runs, t, hasCorners]
  )
  const [activeSectionId, setActiveSectionId] = useState<string>(runs[0]?.id ?? '__corner')

  // Auto-suggest cabinets the first time the user enters this step. Only fires
  // when state.cabinetBoxes.units is empty so a returning user keeps their work.
  // Vision-supplied unitPatterns (Track 2) override the heuristic at matching
  // positions, with a 15% position tolerance.
  useEffect(() => {
    if (state.cabinetBoxes.units.length > 0) return
    const overrides = hypothesis?.cabinetBoxes?.unitPatterns ?? []
    const appliances = layoutContract?.appliances ?? []
    // Tall units run floor-to-ceiling, so their height (and thus board area)
    // follows the contract's ceiling height (minus a plinth).
    const tallHeightMm = Math.max(1800, (layoutContract?.ceilingHeightCm ?? 280) * 10 - 120)
    const seeded: CabinetUnit[] = []
    runs.forEach((run, i) => {
      // Prefer the contract-derived corner ownership; fall back to the positional
      // heuristic only when no layout contract stamped run.hasCorner.
      const hasCorner = run.hasCorner ?? (i === 0 && runs.length > 1)
      // Measured appliance footprints: the fridge span seeds no cabinets, the
      // dishwasher span seeds an appliance front instead of a carcass.
      const applianceSpans = layoutContract
        ? applianceSpansForRun(layoutContract, run.id)
        : []
      const runUnits = suggestCabinetsForRun(run, { hasCorner, tallHeightMm, applianceSpans })
      // AI-suggested patterns override the heuristic at matching positions (15% tol).
      // Contract-driven appliance slots are not up for grabs — measured geometry
      // beats the render hypothesis.
      const runOverrides = overrides.filter((o) => o.runId === run.id)
      runUnits.forEach((u) => {
        if (u.pattern === 'appliance_slot') return
        const match = runOverrides.find(
          (o) => Math.abs(o.positionPctAlongRun - u.positionPctAlongRun) <= 15
        )
        if (match) u.pattern = match.pattern
      })
      // Contract geometry is authoritative for the sink: force the nearest base
      // unit at the sink's measured position to a sink_unit (plumbing cutout).
      const totalMm = run.lengthCm * 10
      for (const a of appliances) {
        if (a.runId !== run.id || a.kind !== 'sink') continue
        const candidates = runUnits.filter(
          (u) => u.type === 'base' && !unitIsCorner(u) && u.pattern !== 'appliance_slot'
        )
        if (candidates.length === 0) continue
        let best = candidates[0]
        let bestDist = Infinity
        for (const u of candidates) {
          const centerPct =
            totalMm > 0 ? (((u.positionPctAlongRun / 100) * totalMm + u.widthMm / 2) / totalMm) * 100 : 0
          const d = Math.abs(centerPct - a.positionPctAlongRun)
          if (d < bestDist) {
            bestDist = d
            best = u
          }
        }
        best.pattern = 'sink_unit'
      }
      runUnits.forEach((u) => seeded.push(u))
    })
    if (seeded.length > 0) onPatch({ units: seeded })
  }, [runs, state.cabinetBoxes.units.length, hypothesis, layoutContract, onPatch])

  function updateUnit(id: string, patch: Partial<CabinetUnit>) {
    onPatch({
      units: state.cabinetBoxes.units.map((u) => (u.id === id ? { ...u, ...patch } : u)),
    })
  }

  return (
    <div className="space-y-5">
      {/* Section tabs — one per wall run plus a Corner tab. */}
      <div className="flex flex-wrap gap-1.5">
        {sections.map((section) => {
          const active = activeSectionId === section.id
          const run = runs.find((r) => r.id === section.id)
          const lengthLabel = run ? ` (${run.lengthCm} cm)` : ''
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => setActiveSectionId(section.id)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground'
              )}
            >
              {section.label}
              {lengthLabel}
            </button>
          )
        })}
      </div>

      {activeSectionId === '__corner' ? (
        <CornerSection state={state} onUpdate={updateUnit} />
      ) : (
        <RunSection state={state} runId={activeSectionId} onUpdate={updateUnit} />
      )}

      <PickerSlot label={t('cabinetBoxes.carcassLabel')} meta={state.cabinetBoxes.meta.carcassMaterial}>
        <ChipRow
          keyPrefix="cabinetBoxes.carcass"
          values={CARCASS_OPTIONS}
          selected={state.cabinetBoxes.carcassMaterial}
          onChange={(v) =>
            onPatch({
              carcassMaterial: v,
              meta: {
                ...state.cabinetBoxes.meta,
                carcassMaterial: { confidence: 'H', provenance: 'homeowner-edited' },
              },
            })
          }
        />
      </PickerSlot>
    </div>
  )
}

/* ───────────── Per-run section ───────────── */

function RunSection({
  state,
  runId,
  onUpdate,
}: {
  state: BuilderState
  runId: string
  onUpdate: (id: string, patch: Partial<CabinetUnit>) => void
}) {
  const { t } = useTranslations()
  const run = state.layout.runs.find((r) => r.id === runId)
  if (!run) return null
  const allUnits = unitsForRun(state.cabinetBoxes.units, runId)
  const baseUnits = unitsForRunByType(state.cabinetBoxes.units, runId, 'base')
  const wallUnits = unitsForRunByType(state.cabinetBoxes.units, runId, 'wall')
  const tallUnits = unitsForRunByType(state.cabinetBoxes.units, runId, 'tall')

  const totalMm = run.lengthCm * 10
  // The fridge span hosts no cabinets, so it isn't fillable capacity. The
  // dishwasher slot IS a unit (appliance front), so it stays in the capacity.
  const fridgeMm = (run.applianceFootprintCm?.fridgeCm ?? 0) * 10
  const rowCapacityMm = Math.max(0, totalMm - fridgeMm)
  const baseMm = totalBaseWidthMm(allUnits)
  const wallMm = totalWallWidthMm(allUnits)

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-muted-foreground">
        {t('cabinetBoxes.runLabel')}: <span className="font-semibold text-foreground">{run.label}</span> ·{' '}
        <span className="tabular-nums">{run.lengthCm} cm</span>
      </p>

      {run.hasBase && (
        <CabinetRow label={t('cabinetBoxes.baseRow')} rowMm={baseMm} totalMm={rowCapacityMm} units={baseUnits} onUpdate={onUpdate} />
      )}
      {run.hasWall && (
        <CabinetRow label={t('cabinetBoxes.wallRow')} rowMm={wallMm} totalMm={rowCapacityMm} units={wallUnits} onUpdate={onUpdate} />
      )}
      {tallUnits.length > 0 && (
        <CabinetRow
          label={t('cabinetBoxes.tallRow')}
          rowMm={tallUnits.reduce((s, u) => s + u.widthMm, 0)}
          totalMm={rowCapacityMm}
          units={tallUnits}
          onUpdate={onUpdate}
        />
      )}
    </div>
  )
}

function CabinetRow({
  label,
  rowMm,
  totalMm,
  units,
  onUpdate,
}: {
  label: string
  rowMm: number
  totalMm: number
  units: CabinetUnit[]
  onUpdate: (id: string, patch: Partial<CabinetUnit>) => void
}) {
  const { t, tDynamic } = useTranslations()
  const fitPct = totalMm > 0 ? Math.min(100, (rowMm / totalMm) * 100) : 0
  const overflow = rowMm > totalMm
  const remainingMm = Math.max(0, totalMm - rowMm)

  return (
    <section className="space-y-2 rounded-2xl border border-border bg-card/40 px-4 py-3">
      <h3 className="text-[12px] font-semibold text-foreground">{label}</h3>

      {/* Fitting bar — read-only; the maker owns the cabinet layout. */}
      <div className="space-y-1">
        <div className="relative h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              overflow ? 'bg-destructive' : fitPct > 95 ? 'bg-emerald-500' : 'bg-primary'
            )}
            style={{ width: `${fitPct}%` }}
          />
        </div>
        <p className="flex justify-between text-[10.5px] tabular-nums text-muted-foreground">
          <span>
            {Math.round(rowMm)} mm {t('cabinetBoxes.fillBar.fitted')} / {totalMm} mm
          </span>
          <span className={overflow ? 'font-semibold text-destructive' : ''}>
            {overflow
              ? `${Math.round(rowMm - totalMm)} mm ${t('cabinetBoxes.fillBar.over')}`
              : `${Math.round(remainingMm)} mm ${t('cabinetBoxes.fillBar.gap')}`}
          </span>
        </p>
      </div>

      {/* Units — width is fixed (maker's job); only drawers-vs-doors is editable
          on a normal base cabinet. Corner and sink units are read-only here. */}
      <ul className="space-y-1.5">
        {units.map((u, i) => {
          const isCorner = unitIsCorner(u)
          const isSink = u.pattern === 'sink_unit'
          // Appliance fronts come from the contract's measured footprints —
          // not a homeowner pattern choice.
          const isApplianceSlot = u.pattern === 'appliance_slot'
          const editable = u.type === 'base' && !isCorner && !isSink && !isApplianceSlot
          return (
            <li
              key={u.id}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background px-2.5 py-1.5"
            >
              <span className="min-w-[1.5rem] text-[10px] font-mono text-muted-foreground/70">{i + 1}</span>
              <span className="rounded-md border border-border bg-card px-2 py-1 text-[12px] tabular-nums text-muted-foreground">
                {u.widthMm} mm
              </span>
              {editable ? (
                <PatternPicker
                  pattern={u.pattern}
                  options={DRAWERS_VS_DOORS}
                  onChange={(p) => onUpdate(u.id, { pattern: p })}
                />
              ) : (
                <span className="text-[12px] text-muted-foreground">
                  {tDynamic(PATTERN_SPECS[u.pattern].labelKey)}
                </span>
              )}
              {isCorner && (
                <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                  {t('cabinetBoxes.cornerBadge')}
                </span>
              )}
            </li>
          )
        })}
        {units.length === 0 && <li className="text-[11px] text-muted-foreground/70">—</li>}
      </ul>
    </section>
  )
}

/* ───────────── Corner section ───────────── */

function CornerSection({
  state,
  onUpdate,
}: {
  state: BuilderState
  onUpdate: (id: string, patch: Partial<CabinetUnit>) => void
}) {
  const { t } = useTranslations()
  // One subsection per corner the contract gave us (U-shape → two). Each edits
  // its own corner unit's mechanism, which drives that corner's accessory cost.
  const cornerRuns = state.layout.runs.filter((r) => r.hasCorner)
  return (
    <div className="space-y-3">
      {cornerRuns.map((run) => {
        const cornerUnit = state.cabinetBoxes.units.find((u) => u.runId === run.id && unitIsCorner(u))
        return (
          <div key={run.id} className="space-y-2 rounded-2xl border border-border bg-card/40 px-4 py-4">
            <p className="text-[12px] text-muted-foreground">
              {t('cabinetBoxes.cornerLabel')} · <span className="font-semibold text-foreground">{run.label}</span>
            </p>
            {cornerUnit ? (
              <ChipRow
                keyPrefix="builder.cabinetBoxes.pattern"
                values={CORNER_PATTERNS as readonly CabinetPattern[]}
                selected={cornerUnit.pattern}
                onChange={(p) => onUpdate(cornerUnit.id, { pattern: p })}
              />
            ) : (
              <p className="text-[11px] text-muted-foreground/70">—</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ───────────── PatternPicker ───────────── */

function PatternPicker({
  pattern,
  options,
  onChange,
}: {
  pattern: CabinetPattern
  options: readonly CabinetPattern[]
  onChange: (p: CabinetPattern) => void
}) {
  const { tDynamic } = useTranslations()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const spec = PATTERN_SPECS[pattern]

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-1 text-[11px] font-medium text-foreground hover:border-primary/40"
      >
        <PatternIconGlyph icon={spec.iconKey} />
        <span>{tDynamic(spec.labelKey)}</span>
        <ChevronDown className="size-3 stroke-[2] text-muted-foreground" aria-hidden />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
          <ul className="max-h-72 overflow-y-auto py-1">
            {options.map((p) => {
              const s = PATTERN_SPECS[p]
              const active = p === pattern
              return (
                <li key={p}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(p)
                      setOpen(false)
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px]',
                      active
                        ? 'bg-primary/10 font-semibold text-foreground'
                        : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                    )}
                  >
                    <PatternIconGlyph icon={s.iconKey} />
                    <span className="flex-1">{tDynamic(s.labelKey)}</span>
                    {s.defaultDrawers > 0 && (
                      <span className="text-[9.5px] tabular-nums text-muted-foreground/80">
                        {s.defaultDrawers}×
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

function PatternIconGlyph({ icon }: { icon: string }) {
  const ch =
    icon === 'drawers'
      ? '▤'
      : icon === 'doors'
        ? '▢'
        : icon === 'mixed'
          ? '▥'
          : icon === 'sink'
            ? '◔'
            : icon === 'trash'
              ? '⌫'
              : icon === 'corner'
                ? '◣'
                : icon === 'tall'
                  ? '▯'
                  : icon === 'wine'
                    ? '◇'
                    : '☰'
  return <span className="font-mono text-[12px] leading-none">{ch}</span>
}

