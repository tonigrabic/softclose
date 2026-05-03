'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus, Wand2, X } from 'lucide-react'
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
import type {
  BuilderState,
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
  onPatch: (patch: Partial<BuilderState['cabinetBoxes']>) => void
}

/**
 * Per-section cabinet wizard. The user is walked through each wall run in
 * turn (Main wall → Return wall → Corner) defining base / wall / tall counts
 * and widths. A fitting bar shows how much of the run is filled.
 */
export function CabinetBoxesGroup({ state, onPatch }: CabinetBoxesGroupProps) {
  const { t } = useTranslations()
  const runs = state.layout.runs
  const sections = useMemo(
    () => [...runs.map((r) => ({ id: r.id, label: r.label })), { id: '__corner', label: t('cabinetBoxes.cornerSection') }],
    [runs, t]
  )
  const [activeSectionId, setActiveSectionId] = useState<string>(sections[0]?.id ?? '__corner')

  // Auto-suggest cabinets the first time the user enters this step. Only fires
  // when state.cabinetBoxes.units is empty so a returning user keeps their work.
  useEffect(() => {
    if (state.cabinetBoxes.units.length > 0) return
    const seeded: CabinetUnit[] = []
    runs.forEach((run, i) =>
      seeded.push(...suggestCabinetsForRun(run, { hasCorner: i === 0 && runs.length > 1 }))
    )
    if (seeded.length > 0) onPatch({ units: seeded })
  }, [runs, state.cabinetBoxes.units.length, onPatch])

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
          drawers: 0,
          isCorner: false,
        },
      ],
    })
  }
  function autoFillRun(runId: string) {
    const run = runs.find((r) => r.id === runId)
    if (!run) return
    const others = state.cabinetBoxes.units.filter((u) => u.runId !== runId)
    const seeded = suggestCabinetsForRun(run, {
      hasCorner: runs.findIndex((r) => r.id === runId) === 0 && runs.length > 1,
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
          showDrawers
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
  showDrawers,
}: {
  label: string
  rowMm: number
  totalMm: number
  units: CabinetUnit[]
  onAdd: () => void
  onUpdate: (id: string, patch: Partial<CabinetUnit>) => void
  onRemove: (id: string) => void
  showDrawers?: boolean
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
            {showDrawers && (
              <label className="flex items-center gap-1 text-[10.5px] text-muted-foreground">
                {t('cabinetBoxes.drawersLabel')}
                <input
                  type="number"
                  min={0}
                  max={6}
                  value={u.drawers}
                  onChange={(e) =>
                    onUpdate(u.id, { drawers: Math.max(0, Math.min(6, parseInt(e.target.value || '0', 10))) })
                  }
                  className="w-12 rounded-md border border-border bg-background px-1.5 py-0.5 text-right text-[12px] tabular-nums focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
                />
              </label>
            )}
            {u.isCorner && (
              <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                Kut
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
  const cornerCount = state.cabinetBoxes.units.filter((u) => u.isCorner).length
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

