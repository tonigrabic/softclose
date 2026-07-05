'use client'

import { useMemo, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, CornerUpRight, Plus, Ruler, Trash2, X } from 'lucide-react'
import { useTranslations, type Locale } from '@/lib/i18n'
import { formatLength, validate, wallLengthCm } from '@/lib/floor-plan'
import type { FeatureKind, FloorPlan } from '@/lib/floor-plan'
import type { WallSide } from '@/lib/types'
import type { LayoutContract, RunId } from '@/lib/contract/layout-contract'
import {
  assembleUnits,
  displayedSequence,
  hintsFromHypothesis,
  isCornerPattern,
  summarizeAssembly,
  withPatternChanged,
  withUnitAdded,
  withUnitRemoved,
  FREE_PATTERNS_BY_ROW,
  type RowKind,
  type UnitEdits,
} from '@/lib/builder/unit-assembly'
import type { BuilderHypothesis } from '@/lib/builder/hypothesis'
import type { CabinetPattern, CabinetUnit } from '@/lib/builder/inventory'

/**
 * The contract — what we'll build and price — and the place the homeowner
 * confirms it. When given a `plan` + `onPlanChange` (+ `onEditsChange`) it is
 * fully EDITABLE: per wall they change the length, toggle the upper / tall
 * rows, drop the wall entirely, and — per UNIT — tap any chip in the sequence
 * to change its type, remove it, or add one (the fix for "I can't edit the
 * number of drawers"). Appliance-bound chips (sink / dishwasher / oven /
 * fridge) re-derive from the measured appliance: they can be nudged along the
 * wall or removed WITH their appliance, so no orphan units exist. Every edit
 * writes the FloorPlan / UnitEdits and re-derives the tally through the ONE
 * assembler the builder seeds from — parity by construction.
 *
 * Without the editing props it's a read-only tally (the builder's confirm gate).
 */
const APPLIANCE_LABEL: Record<Locale, Record<FeatureKind, string>> = {
  'hr-HR': {
    sink: 'Sudoper',
    hob: 'Ploča za kuhanje',
    fridge: 'Hladnjak',
    dishwasher: 'Perilica posuđa',
    oven: 'Pećnica',
    hood: 'Napa',
  },
  'en-US': {
    sink: 'Sink',
    hob: 'Hob',
    fridge: 'Fridge',
    dishwasher: 'Dishwasher',
    oven: 'Oven',
    hood: 'Hood',
  },
}

/** Compact, homeowner-friendly names for each cabinet pattern, per row chip. */
const PATTERN_LABEL: Record<Locale, Record<CabinetPattern, string>> = {
  'hr-HR': {
    doors_shelf: 'ormarić',
    drawer_bank: 'ladice',
    pullouts_inside_doors: 'izvlačni',
    drawer_door_combo: 'ladica + vrata',
    sink_unit: 'sudoper',
    appliance_slot: 'perilica posuđa',
    trash_pullout: 'otpad',
    corner_magic: 'kut',
    corner_lazy: 'kut',
    oven_housing: 'pećnica',
    pullout_larder: 'smočnica',
    wine_pullout: 'vino',
    open_shelves: 'police',
  },
  'en-US': {
    doors_shelf: 'cabinet',
    drawer_bank: 'drawers',
    pullouts_inside_doors: 'pull-outs',
    drawer_door_combo: 'drawer + door',
    sink_unit: 'sink unit',
    appliance_slot: 'dishwasher',
    trash_pullout: 'bin',
    corner_magic: 'corner',
    corner_lazy: 'corner',
    oven_housing: 'oven',
    pullout_larder: 'larder',
    wine_pullout: 'wine',
    open_shelves: 'shelves',
  },
}

/** Inline editing-control labels (kept local, like the label maps above). */
const UI: Record<Locale, { upper: string; tall: string; remove: string; cm: string }> = {
  'hr-HR': { upper: 'Gornji ormarići', tall: 'Visoki/pećnica', remove: 'Ukloni zid', cm: 'cm' },
  'en-US': { upper: 'Upper cabinets', tall: 'Tall / oven', remove: 'Remove wall', cm: 'cm' },
}

/** Module-scope so the render-purity lint can see edits stamp time only on click. */
function nowMs(): number {
  return Date.now()
}

type SidePatch = Partial<FloorPlan['room']['sides']['top']>

/** Patch one wall's spec and re-validate (recomputes shape + island). */
function withSidePatch(plan: FloorPlan, wall: WallSide, patch: SidePatch): FloorPlan {
  return validate({
    ...plan,
    room: {
      ...plan.room,
      sides: { ...plan.room.sides, [wall]: { ...plan.room.sides[wall], ...patch } },
    },
  })
}

/** Set a wall's length (= the room dimension along that wall) and re-validate. */
function withWallLength(plan: FloorPlan, wall: WallSide, cm: number): FloorPlan {
  const horizontal = wall === 'top' || wall === 'bottom'
  const room = horizontal ? { ...plan.room, lengthCm: cm } : { ...plan.room, widthCm: cm }
  return validate({ ...plan, room })
}

function findFeature(plan: FloorPlan, wall: WallSide, kind: FeatureKind) {
  return plan.features.find((f) => f.wall === wall && f.kind === kind)
}

/** Nudge a measured appliance along its wall (validate clamps to the wall). */
function withFeatureNudged(plan: FloorPlan, wall: WallSide, kind: FeatureKind, deltaCm: number): FloorPlan {
  const f = findFeature(plan, wall, kind)
  if (!f) return plan
  return validate({
    ...plan,
    features: plan.features.map((x) =>
      x.id === f.id
        ? { ...x, centerCm: x.centerCm + deltaCm, confidence: 'H' as const, source: 'homeowner' as const }
        : x
    ),
  })
}

/** Removing a bound unit = removing its appliance from the plan (no orphans). */
function withFeatureRemoved(plan: FloorPlan, wall: WallSide, kind: FeatureKind): FloorPlan {
  const f = findFeature(plan, wall, kind)
  if (!f) return plan
  return validate({ ...plan, features: plan.features.filter((x) => x.id !== f.id) })
}

/** One labelled chip in a row sequence (cabinet unit OR a floor appliance). */
interface RowItem {
  id: string
  label: string
  pos: number
  pattern?: CabinetPattern
  /** Appliance this chip derives from (bound units + the fridge pseudo-chip). */
  boundTo?: FeatureKind
  /** Index within the row's FILLABLE sequence — undefined for bound chips. */
  seqIndex?: number
}

/** Which chip's inline editor panel is open. */
interface OpenPanel {
  runId: string
  row: RowKind
  /** Unit id, `add`, or `appl:<kind>` for appliance-bound chips/pills. */
  itemId: string
}

export function LayoutConfirm({
  contract,
  hypothesis,
  plan,
  onPlanChange,
  edits,
  onEditsChange,
  onConfirm,
}: {
  contract: LayoutContract
  /**
   * The render hypothesis, so the tally folds in the AI's unit hints + render-
   * seen tall towers — the SAME hints the builder seeds with. Without it the
   * tally could show fewer units than get priced (the old parity hole).
   */
  hypothesis?: BuilderHypothesis | null
  /** The live FloorPlan. With `onPlanChange`, the card becomes editable. */
  plan?: FloorPlan | null
  /** Persist an edit (and re-seed the canvas). Omit for a read-only tally. */
  onPlanChange?: (plan: FloorPlan) => void
  /** The homeowner's per-row unit edits (persisted to the profile on lock). */
  edits?: UnitEdits | null
  /** With this, every unit chip becomes editable (change type / remove / add). */
  onEditsChange?: (edits: UnitEdits) => void
  /** When provided, renders a confirm CTA; omit to render a read-only summary. */
  onConfirm?: () => void
}) {
  const { t, tDynamic, locale } = useTranslations()
  const editable = Boolean(plan && onPlanChange)
  const unitsEditable = editable && Boolean(onEditsChange)
  const [open, setOpen] = useState<OpenPanel | null>(null)

  // THE assembler — same call as builder seeding and computeBom (parity by
  // construction), edits applied last.
  const { assembled, summary } = useMemo(() => {
    const assembled = assembleUnits({
      contract,
      hints: hintsFromHypothesis(hypothesis ?? null),
      edits: edits ?? null,
    })
    return { assembled, summary: summarizeAssembly(contract, assembled) }
  }, [contract, hypothesis, edits])
  const { rows, totalCabinets, cornerCount } = summary
  const applianceWords = APPLIANCE_LABEL[locale]
  const patternWords = PATTERN_LABEL[locale]
  const ui = UI[locale]

  const toggle = (panel: OpenPanel) =>
    setOpen((cur) =>
      cur && cur.runId === panel.runId && cur.row === panel.row && cur.itemId === panel.itemId
        ? null
        : panel
    )

  /** Row units → chips, with fillable sequence indices matching displayedSequence. */
  function rowItems(units: CabinetUnit[], row: RowKind): RowItem[] {
    const sorted = units
      .filter((u) => u.type === row)
      .sort((a, b) => a.positionPctAlongRun - b.positionPctAlongRun)
    let seq = 0
    return sorted.map((u) => ({
      id: u.id,
      label: patternWords[u.pattern],
      pos: u.positionPctAlongRun,
      pattern: u.pattern,
      boundTo: u.boundTo,
      seqIndex: u.boundTo ? undefined : seq++,
    }))
  }

  function changePattern(runId: RunId, row: RowKind, seqIndex: number, pattern: CabinetPattern) {
    onEditsChange!(
      withPatternChanged(
        edits,
        displayedSequence(assembled.units, runId, row),
        runId,
        row,
        seqIndex,
        pattern,
        nowMs()
      )
    )
  }
  function addUnit(runId: RunId, row: RowKind, pattern: CabinetPattern) {
    onEditsChange!(
      withUnitAdded(edits, displayedSequence(assembled.units, runId, row), runId, row, pattern, nowMs())
    )
    setOpen(null)
  }
  function removeUnit(runId: RunId, row: RowKind, seqIndex: number) {
    onEditsChange!(
      withUnitRemoved(edits, displayedSequence(assembled.units, runId, row), runId, row, seqIndex, nowMs())
    )
    setOpen(null)
  }

  return (
    <section className="space-y-6 rounded-3xl border border-border bg-card/60 p-6 md:p-8">
      <header className="space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">
          {t('builder.confirm.eyebrow')}
        </p>
        <h2 className="text-2xl font-semibold leading-tight text-foreground md:text-3xl">
          {t('builder.confirm.title')}
        </h2>
        <p className="max-w-prose text-[14px] leading-relaxed text-muted-foreground">
          {t('builder.confirm.subtitle')}
        </p>
      </header>

      {/* Per-wall breakdown: appliances + the base/upper cabinet sequence. */}
      <div className="space-y-2">
        <h3 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Ruler className="size-3.5 stroke-[2.5]" aria-hidden />
          {t('builder.confirm.runsHeading')}
        </h3>
        <ul className="space-y-2.5">
          {rows.map((r) => {
            const run = contract.runs.find((x) => x.id === r.id)
            const isWall = r.id !== 'island'
            const wall = r.id as WallSide
            const appliances = contract.appliances.filter((a) => a.runId === r.id)
            const runWarnings = assembled.warnings.filter((w) => w.runId === r.id)

            // Base row = base units + any FRIDGE on this wall (full-height, sits on
            // the floor but carries no carcass — this is why it was "nowhere").
            const baseItems = [
              ...rowItems(r.units, 'base'),
              ...appliances
                .filter((a) => a.kind === 'fridge')
                .map((a, i) => ({
                  id: `fridge-${r.id}-${i}`,
                  label: applianceWords.fridge,
                  pos: a.positionPctAlongRun,
                  boundTo: 'fridge' as FeatureKind,
                })),
            ].sort((a, b) => a.pos - b.pos)
            const wallItems = rowItems(r.units, 'wall')
            const tallItems = rowItems(r.units, 'tall')
            const rowStat = (row: RowKind) =>
              assembled.rowStats.find((s) => s.runId === r.id && s.row === row)
            const canAdd = (row: RowKind) => {
              if (!unitsEditable) return false
              if (row === 'tall') {
                const count = tallItems.filter((it) => !it.boundTo).length
                return count < Math.min(3, Math.floor((r.lengthCm * 10) / 600))
              }
              const s = rowStat(row)
              return Boolean(s && s.fillableCapacityMm / (s.fillableCount + 1) >= 300)
            }

            const wallLen =
              editable && plan && isWall ? Math.round(wallLengthCm(wall, plan.room)) : r.lengthCm

            const renderRow = (row: RowKind, label: string, items: RowItem[]) => (
              <UnitRow
                label={label}
                items={items}
                editable={unitsEditable}
                showAdd={canAdd(row)}
                addLabel={t('builder.confirm.unitEditor.add')}
                openItemId={open && open.runId === r.id && open.row === row ? open.itemId : null}
                onItemTap={(it) =>
                  toggle({
                    runId: r.id,
                    row,
                    itemId: it.boundTo ? `appl:${it.boundTo}` : it.id,
                  })
                }
                onAddTap={() => toggle({ runId: r.id, row, itemId: 'add' })}
                panel={
                  open && open.runId === r.id && open.row === row ? (
                    open.itemId === 'add' ? (
                      <PatternPanel
                        patterns={FREE_PATTERNS_BY_ROW[row]}
                        onPick={(p) => addUnit(r.id, row, p)}
                        tDynamic={tDynamic}
                      />
                    ) : open.itemId.startsWith('appl:') ? (
                      isWall && plan && onPlanChange ? (
                        <BoundPanel
                          kind={open.itemId.slice(5) as FeatureKind}
                          explain={t('builder.confirm.unitEditor.boundExplain')}
                          nudgeLeftLabel={t('builder.confirm.unitEditor.nudgeLeft')}
                          nudgeRightLabel={t('builder.confirm.unitEditor.nudgeRight')}
                          removeLabel={t('builder.confirm.unitEditor.removeAppliance').replace(
                            '{name}',
                            applianceWords[open.itemId.slice(5) as FeatureKind].toLowerCase()
                          )}
                          confirmLabel={t('builder.confirm.unitEditor.confirmRemove')}
                          onNudge={(d) => onPlanChange(withFeatureNudged(plan, wall, open.itemId.slice(5) as FeatureKind, d))}
                          onRemove={() => {
                            onPlanChange(withFeatureRemoved(plan, wall, open.itemId.slice(5) as FeatureKind))
                            setOpen(null)
                          }}
                        />
                      ) : null
                    ) : (
                      (() => {
                        const unit = assembled.units.find((u) => u.id === open.itemId)
                        const item = items.find((it) => it.id === open.itemId)
                        if (!unit || item?.seqIndex === undefined) return null
                        const corner = isCornerPattern(unit.pattern)
                        return (
                          <PatternPanel
                            patterns={corner ? ['corner_magic', 'corner_lazy'] : FREE_PATTERNS_BY_ROW[row]}
                            selected={unit.pattern}
                            widthMm={unit.widthMm}
                            widthAutoLabel={t('builder.confirm.unitEditor.widthAuto').replace(
                              '{mm}',
                              String(unit.widthMm)
                            )}
                            onPick={(p) => changePattern(r.id, row, item.seqIndex!, p)}
                            onRemove={corner ? undefined : () => removeUnit(r.id, row, item.seqIndex!)}
                            removeLabel={t('builder.confirm.unitEditor.remove')}
                            tDynamic={tDynamic}
                          />
                        )
                      })()
                    )
                  ) : null
                }
              />
            )

            return (
              <li key={r.id} className="space-y-2 rounded-2xl border border-border bg-background p-3.5">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="truncate text-[14px] font-semibold text-foreground">{r.label}</p>
                  {editable && isWall ? (
                    <span className="inline-flex items-center gap-1">
                      <input
                        key={`${r.id}-len-${wallLen}`}
                        type="number"
                        inputMode="numeric"
                        min={120}
                        max={1200}
                        defaultValue={wallLen}
                        onBlur={(e) => {
                          const n = parseInt(e.target.value, 10)
                          if (Number.isFinite(n) && n > 0) onPlanChange!(withWallLength(plan!, wall, n))
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                        }}
                        className="w-16 rounded-lg border border-border bg-background px-2 py-1 text-right text-[13px] font-semibold tabular-nums text-foreground focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                      <span className="text-[12px] text-muted-foreground">{ui.cm}</span>
                    </span>
                  ) : (
                    <span className="shrink-0 text-[13px] font-semibold tabular-nums text-foreground">
                      {formatLength(r.lengthCm, contract.units)}
                    </span>
                  )}
                </div>

                {appliances.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {appliances.map((a, i) =>
                      unitsEditable && isWall ? (
                        <button
                          key={`${a.kind}-${i}`}
                          type="button"
                          onClick={() => toggle({ runId: r.id, row: 'base', itemId: `appl:${a.kind}` })}
                          className="rounded-full bg-primary/10 px-2 py-0.5 text-[11.5px] font-medium text-primary transition-colors hover:bg-primary/20"
                        >
                          {applianceWords[a.kind] ?? a.kind}
                        </button>
                      ) : (
                        <span
                          key={`${a.kind}-${i}`}
                          className="rounded-full bg-primary/10 px-2 py-0.5 text-[11.5px] font-medium text-primary"
                        >
                          {applianceWords[a.kind] ?? a.kind}
                        </span>
                      )
                    )}
                  </div>
                )}

                {renderRow('base', t('builder.confirm.baseRow'), baseItems)}
                {(wallItems.length > 0 || canAdd('wall')) &&
                  Boolean(run?.hasWall) &&
                  renderRow('wall', t('builder.confirm.wallRow'), wallItems)}
                {(tallItems.length > 0 || (unitsEditable && Boolean(run?.hasTall))) &&
                  renderRow('tall', t('builder.confirm.tallRow'), tallItems)}

                {runWarnings.length > 0 && (
                  <p className="rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[11.5px] font-medium text-amber-700 dark:text-amber-400">
                    {t(
                      runWarnings.some((w) => w.kind === 'run_too_short')
                        ? 'builder.confirm.unitEditor.warnTooShort'
                        : 'builder.confirm.unitEditor.warnTruncated'
                    )}
                  </p>
                )}

                {editable && isWall && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <ToggleChip
                      label={ui.upper}
                      on={Boolean(run?.hasWall)}
                      onClick={() => onPlanChange!(withSidePatch(plan!, wall, { hasWall: !run?.hasWall }))}
                    />
                    <ToggleChip
                      label={ui.tall}
                      on={Boolean(run?.hasTall)}
                      onClick={() => onPlanChange!(withSidePatch(plan!, wall, { hasTall: !run?.hasTall }))}
                    />
                    <button
                      type="button"
                      onClick={() => onPlanChange!(withSidePatch(plan!, wall, { hasCounter: false }))}
                      className="ml-auto inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
                    >
                      <X className="size-3 stroke-[2.5]" aria-hidden />
                      {ui.remove}
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
        <p className="px-1 text-[12px] text-muted-foreground">
          {t('builder.confirm.totalPrefix')}{' '}
          <span className="font-semibold text-foreground">
            {totalCabinets} {t('builder.confirm.cabinetsUnit')}
          </span>
          {cornerCount > 0 && (
            <>
              {' '}
              <CornerUpRight className="inline size-3.5 -translate-y-px stroke-[2.5] text-muted-foreground" aria-hidden />{' '}
              <span className="font-semibold text-foreground">{cornerCount}</span> {t('builder.confirm.cornersHeading')}
            </>
          )}
        </p>
      </div>

      {/* Layout shape + ceiling — the room-level facts that scale the tally. */}
      <p className="px-1 text-[12px] text-muted-foreground">
        {t('builder.confirm.layoutPrefix')}{' '}
        <span className="font-semibold text-foreground">{tDynamic(`layout.shape.${summary.shape}`)}</span>
        {summary.hasIsland && (
          <span className="font-semibold text-foreground"> {tDynamic('layout.suffix.island')}</span>
        )}
        {' · '}
        {t('builder.confirm.ceilingPrefix')}{' '}
        <span className="font-semibold text-foreground tabular-nums">
          {formatLength(summary.ceilingHeightCm, contract.units)}
        </span>
      </p>

      {/* Confirm CTA — only when used as a standalone gate; omitted when embedded
          in the capture "confirm everything" step (the step's own button locks it). */}
      {onConfirm && (
        <div className="space-y-2 pt-1">
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-md transition-all hover:brightness-[1.06]"
          >
            <Check className="size-4 stroke-[2.5]" aria-hidden />
            {t('builder.confirm.cta')}
          </button>
          <p className="text-[12px] leading-relaxed text-muted-foreground">{t('builder.confirm.editHint')}</p>
        </div>
      )}
    </section>
  )
}

/**
 * One cabinet row (base / upper / tall) as an ordered sequence of chips. In
 * editable mode every chip is a button (tap → inline panel below the row) and
 * a "+" chip appends a unit. Appliance-bound chips render primary-tinted.
 */
function UnitRow({
  label,
  items,
  editable,
  showAdd,
  addLabel,
  openItemId,
  onItemTap,
  onAddTap,
  panel,
}: {
  label: string
  items: RowItem[]
  editable: boolean
  showAdd: boolean
  addLabel: string
  openItemId: string | null
  onItemTap: (item: RowItem) => void
  onAddTap: () => void
  panel: React.ReactNode
}) {
  if (items.length === 0 && !showAdd) return null
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px]">
        <span className="font-medium text-muted-foreground">
          {label} ({items.length}):
        </span>
        {items.map((it) => {
          const isOpen = openItemId === (it.boundTo ? `appl:${it.boundTo}` : it.id)
          if (!editable) {
            return (
              <span key={it.id} className={it.boundTo ? 'font-medium text-primary' : 'text-foreground'}>
                {it.label}
              </span>
            )
          }
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => onItemTap(it)}
              aria-expanded={isOpen}
              className={
                'rounded-full border px-2 py-0.5 transition-colors ' +
                (isOpen
                  ? 'border-primary bg-primary/15 text-foreground'
                  : it.boundTo
                    ? 'border-primary/30 bg-primary/10 font-medium text-primary hover:bg-primary/20'
                    : 'border-border bg-card text-foreground hover:border-primary/40')
              }
            >
              {it.label}
            </button>
          )
        })}
        {editable && showAdd && (
          <button
            type="button"
            onClick={onAddTap}
            aria-expanded={openItemId === 'add'}
            title={addLabel}
            className={
              'inline-flex items-center gap-0.5 rounded-full border border-dashed px-2 py-0.5 transition-colors ' +
              (openItemId === 'add'
                ? 'border-primary bg-primary/15 text-foreground'
                : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground')
            }
          >
            <Plus className="size-3 stroke-[2.5]" aria-hidden />
          </button>
        )}
      </div>
      {panel}
    </div>
  )
}

/** Inline pattern picker for a fillable unit (or the "+" add flow). */
function PatternPanel({
  patterns,
  selected,
  widthAutoLabel,
  onPick,
  onRemove,
  removeLabel,
  tDynamic,
}: {
  patterns: readonly CabinetPattern[]
  selected?: CabinetPattern
  widthMm?: number
  widthAutoLabel?: string
  onPick: (p: CabinetPattern) => void
  onRemove?: () => void
  removeLabel?: string
  tDynamic: (key: string) => string
}) {
  return (
    <div className="space-y-2 rounded-xl border border-border bg-card/80 p-2.5">
      <div className="flex flex-wrap gap-1.5">
        {patterns.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPick(p)}
            className={
              'rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors ' +
              (p === selected
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background text-muted-foreground hover:text-foreground')
            }
          >
            {tDynamic(`builder.cabinetBoxes.pattern.${p}`)}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3">
        {widthAutoLabel && <p className="text-[11px] text-muted-foreground">{widthAutoLabel}</p>}
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="ml-auto inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
          >
            <Trash2 className="size-3 stroke-[2.5]" aria-hidden />
            {removeLabel}
          </button>
        )}
      </div>
    </div>
  )
}

/** Panel for appliance-bound chips: nudge along the wall or remove the appliance. */
function BoundPanel({
  kind,
  explain,
  nudgeLeftLabel,
  nudgeRightLabel,
  removeLabel,
  confirmLabel,
  onNudge,
  onRemove,
}: {
  kind: FeatureKind
  explain: string
  nudgeLeftLabel: string
  nudgeRightLabel: string
  removeLabel: string
  confirmLabel: string
  onNudge: (deltaCm: number) => void
  onRemove: () => void
}) {
  const [armed, setArmed] = useState(false)
  return (
    <div className="space-y-2 rounded-xl border border-primary/25 bg-primary/5 p-2.5">
      <p className="text-[11.5px] leading-relaxed text-muted-foreground">{explain}</p>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onNudge(-10)}
          aria-label={nudgeLeftLabel}
          className="inline-flex size-7 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-3.5 stroke-[2.5]" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => onNudge(10)}
          aria-label={nudgeRightLabel}
          className="inline-flex size-7 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronRight className="size-3.5 stroke-[2.5]" aria-hidden />
        </button>
        <span className="text-[11px] text-muted-foreground">±10 cm</span>
        <button
          type="button"
          data-kind={kind}
          onClick={() => (armed ? onRemove() : setArmed(true))}
          className={
            'ml-auto inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors ' +
            (armed
              ? 'border-destructive bg-destructive/10 text-destructive'
              : 'border-border text-muted-foreground hover:border-destructive/40 hover:text-destructive')
          }
        >
          <Trash2 className="size-3 stroke-[2.5]" aria-hidden />
          {armed ? confirmLabel : removeLabel}
        </button>
      </div>
    </div>
  )
}

/** Small on/off pill for the per-wall row toggles. */
function ToggleChip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={
        'rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors ' +
        (on
          ? 'border-primary bg-primary/10 text-foreground'
          : 'border-border bg-card text-muted-foreground hover:text-foreground')
      }
    >
      {label}
    </button>
  )
}
