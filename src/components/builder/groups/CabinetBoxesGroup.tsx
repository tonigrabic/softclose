'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Wand2, X, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslations } from '@/lib/i18n'
import { PickerSlot } from '../PickerSlot'
import { ChipRow } from '../ChipRow'
import {
  allowedWidths,
  newCabinetId,
  suggestCabinetsForRun,
  totalBaseWidthMm,
  totalWallWidthMm,
  unitsForRun,
  unitsForRunByType,
} from '@/lib/builder/cabinet-suggest'
import {
  PATTERN_SPECS,
  defaultPatternForType,
  patternsForType,
  unitIsCorner,
} from '@/lib/builder/cabinet-patterns'
import type { BuilderHypothesis } from '@/lib/builder/hypothesis'
import type { LayoutContract } from '@/lib/contract/layout-contract'
import type {
  BuilderState,
  CabinetPattern,
  CabinetUnit,
  CarcassMaterial,
  CornerSolution,
} from '@/lib/builder/inventory'

const CARCASS_OPTIONS = [
  'white_melamine_standard',
  'colored_melamine',
  'moisture_resistant_p3',
  'matched_to_door',
] as const satisfies readonly CarcassMaterial[]

const CORNER_OPTIONS = [
  'magic_corner',
  'lazy_susan',
  'diagonal_corner',
  'dead_corner',
  'none',
] as const satisfies readonly CornerSolution[]

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
  const sections = useMemo(
    () => [...runs.map((r) => ({ id: r.id, label: r.label })), { id: '__corner', label: t('cabinetBoxes.cornerSection') }],
    [runs, t]
  )
  const [activeSectionId, setActiveSectionId] = useState<string>(sections[0]?.id ?? '__corner')

  // Auto-suggest cabinets the first time the user enters this step. Only fires
  // when state.cabinetBoxes.units is empty so a returning user keeps their work.
  // Vision-supplied unitPatterns (Track 2) override the heuristic at matching
  // positions, with a 15% position tolerance.
  useEffect(() => {
    if (state.cabinetBoxes.units.length > 0) return
    const overrides = hypothesis?.cabinetBoxes?.unitPatterns ?? []
    const appliances = layoutContract?.appliances ?? []
    const seeded: CabinetUnit[] = []
    runs.forEach((run, i) => {
      // Prefer the contract-derived corner ownership; fall back to the positional
      // heuristic only when no layout contract stamped run.hasCorner.
      const hasCorner = run.hasCorner ?? (i === 0 && runs.length > 1)
      const runUnits = suggestCabinetsForRun(run, { hasCorner })
      // AI-suggested patterns override the heuristic at matching positions (15% tol).
      const runOverrides = overrides.filter((o) => o.runId === run.id)
      runUnits.forEach((u) => {
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
        const candidates = runUnits.filter((u) => u.type === 'base' && !unitIsCorner(u))
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
  function removeUnit(id: string) {
    onPatch({ units: state.cabinetBoxes.units.filter((u) => u.id !== id) })
  }
  function addUnit(runId: string, type: CabinetUnit['type']) {
    const run = runs.find((r) => r.id === runId)
    if (!run) return
    const heightMm = type === 'tall' ? 2200 : type === 'wall' ? 720 : 720
    const depthMm = type === 'wall' ? 330 : 600
    onPatch({
      units: [
        ...state.cabinetBoxes.units,
        {
          id: newCabinetId(),
          type,
          widthMm: 600,
          heightMm,
          depthMm,
          runId,
          positionPctAlongRun: 100,
          pattern: defaultPatternForType(type),
        },
      ],
    })
  }
  function autoFillRun(runId: string) {
    const run = runs.find((r) => r.id === runId)
    if (!run) return
    const others = state.cabinetBoxes.units.filter((u) => u.runId !== runId)
    const seeded = suggestCabinetsForRun(run, {
      hasCorner: run.hasCorner ?? (runs.findIndex((r) => r.id === runId) === 0 && runs.length > 1),
    })
    onPatch({ units: [...others, ...seeded] })
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
        <CornerSection state={state} onPatch={onPatch} />
      ) : (
        <RunSection
          state={state}
          runId={activeSectionId}
          onAdd={addUnit}
          onUpdate={updateUnit}
          onRemove={removeUnit}
          onAutoFill={autoFillRun}
        />
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
  onAdd,
  onUpdate,
  onRemove,
  onAutoFill,
}: {
  state: BuilderState
  runId: string
  onAdd: (runId: string, type: CabinetUnit['type']) => void
  onUpdate: (id: string, patch: Partial<CabinetUnit>) => void
  onRemove: (id: string) => void
  onAutoFill: (runId: string) => void
}) {
  const { t } = useTranslations()
  const run = state.layout.runs.find((r) => r.id === runId)
  if (!run) return null
  const allUnits = unitsForRun(state.cabinetBoxes.units, runId)
  const baseUnits = unitsForRunByType(state.cabinetBoxes.units, runId, 'base')
  const wallUnits = unitsForRunByType(state.cabinetBoxes.units, runId, 'wall')
  const tallUnits = unitsForRunByType(state.cabinetBoxes.units, runId, 'tall')

  const totalMm = run.lengthCm * 10
  const baseMm = totalBaseWidthMm(allUnits)
  const wallMm = totalWallWidthMm(allUnits)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] text-muted-foreground">
          {t('cabinetBoxes.runLabel')}: <span className="font-semibold text-foreground">{run.label}</span> ·{' '}
          <span className="tabular-nums">{run.lengthCm} cm</span>
        </p>
        <button
          type="button"
          onClick={() => onAutoFill(runId)}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
        >
          <Wand2 className="size-3 stroke-[2]" aria-hidden /> {t('cabinetBoxes.autoSuggest')}
        </button>
      </div>

      {run.hasBase && (
        <CabinetRow
          label={t('cabinetBoxes.baseRow')}
          rowMm={baseMm}
          totalMm={totalMm}
          units={baseUnits}
          onAdd={() => onAdd(runId, 'base')}
          onUpdate={onUpdate}
          onRemove={onRemove}
        />
      )}
      {run.hasWall && (
        <CabinetRow
          label={t('cabinetBoxes.wallRow')}
          rowMm={wallMm}
          totalMm={totalMm}
          units={wallUnits}
          onAdd={() => onAdd(runId, 'wall')}
          onUpdate={onUpdate}
          onRemove={onRemove}
        />
      )}
      <CabinetRow
        label={t('cabinetBoxes.tallRow')}
        rowMm={tallUnits.reduce((s, u) => s + u.widthMm, 0)}
        totalMm={totalMm}
        units={tallUnits}
        onAdd={() => onAdd(runId, 'tall')}
        onUpdate={onUpdate}
        onRemove={onRemove}
      />
    </div>
  )
}

function CabinetRow({
  label,
  rowMm,
  totalMm,
  units,
  onAdd,
  onUpdate,
  onRemove,
}: {
  label: string
  rowMm: number
  totalMm: number
  units: CabinetUnit[]
  onAdd: () => void
  onUpdate: (id: string, patch: Partial<CabinetUnit>) => void
  onRemove: (id: string) => void
}) {
  const { t } = useTranslations()
  const widths = allowedWidths()
  const fitPct = totalMm > 0 ? Math.min(100, (rowMm / totalMm) * 100) : 0
  const overflow = rowMm > totalMm
  const remainingMm = Math.max(0, totalMm - rowMm)

  return (
    <section className="space-y-2 rounded-2xl border border-border bg-card/40 px-4 py-3">
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-[12px] font-semibold text-foreground">{label}</h3>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/20"
        >
          <Plus className="size-3 stroke-[2]" aria-hidden />
          {t('cabinetBoxes.addUnit')}
        </button>
      </header>

      {/* Fitting bar: fitted vs available. Red when over. */}
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

      {/* Units list */}
      <ul className="space-y-1.5">
        {units.map((u, i) => (
          <li
            key={u.id}
            className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background px-2.5 py-1.5"
          >
            <span className="min-w-[1.5rem] text-[10px] font-mono text-muted-foreground/70">{i + 1}</span>
            <select
              value={u.widthMm}
              onChange={(e) =>
                onUpdate(u.id, { widthMm: Number(e.target.value) as CabinetUnit['widthMm'] })
              }
              className="rounded-md border border-border bg-card px-2 py-1 text-[12px] tabular-nums focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
            >
              {widths.map((w) => (
                <option key={w} value={w}>
                  {w} mm
                </option>
              ))}
            </select>
            <PatternPicker
              type={u.type}
              pattern={u.pattern}
              onChange={(p) => onUpdate(u.id, { pattern: p })}
            />
            {unitIsCorner(u) && (
              <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                {t('cabinetBoxes.cornerBadge')}
              </span>
            )}
            <button
              type="button"
              onClick={() => onRemove(u.id)}
              className="ml-auto inline-flex items-center justify-center rounded-full p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              aria-label={t('cabinetBoxes.removeUnit')}
            >
              <X className="size-3 stroke-[2]" aria-hidden />
            </button>
          </li>
        ))}
        {units.length === 0 && (
          <li className="text-[11px] text-muted-foreground/70">— ništa još —</li>
        )}
      </ul>
    </section>
  )
}

/* ───────────── Corner section ───────────── */

function CornerSection({
  state,
  onPatch,
}: {
  state: BuilderState
  onPatch: (patch: Partial<BuilderState['cabinetBoxes']>) => void
}) {
  const { t } = useTranslations()
  const cornerCount = state.cabinetBoxes.units.filter((u) => unitIsCorner(u)).length
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card/40 px-4 py-4">
      <p className="text-[11px] text-muted-foreground">
        {cornerCount > 0
          ? `${cornerCount} kutni element${cornerCount === 1 ? '' : 'a'} dodijeljen.`
          : 'Bez kutnog elementa.'}
      </p>
      <PickerSlot label={t('cabinetBoxes.cornerLabel')} meta={state.cabinetBoxes.meta.cornerSolution}>
        <ChipRow
          keyPrefix="cabinetBoxes.corner"
          values={CORNER_OPTIONS}
          selected={state.cabinetBoxes.cornerSolution}
          onChange={(v) =>
            onPatch({
              cornerSolution: v,
              meta: {
                ...state.cabinetBoxes.meta,
                cornerSolution: { confidence: 'H', provenance: 'homeowner-edited' },
              },
            })
          }
        />
      </PickerSlot>
    </div>
  )
}

/* ───────────── PatternPicker ───────────── */

function PatternPicker({
  type,
  pattern,
  onChange,
}: {
  type: CabinetUnit['type']
  pattern: CabinetPattern
  onChange: (p: CabinetPattern) => void
}) {
  const { tDynamic } = useTranslations()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const options = patternsForType(type)
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

