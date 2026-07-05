'use client'

import { useMemo } from 'react'
import { Check, Ruler, CornerUpRight, X } from 'lucide-react'
import { useTranslations, type Locale } from '@/lib/i18n'
import { formatLength, validate, wallLengthCm } from '@/lib/floor-plan'
import type { FeatureKind, FloorPlan } from '@/lib/floor-plan'
import type { WallSide } from '@/lib/types'
import type { LayoutContract } from '@/lib/contract/layout-contract'
import { summarizeContract } from '@/lib/builder/cabinet-suggest'
import type { CabinetPattern, CabinetUnit } from '@/lib/builder/inventory'

/**
 * The contract — what we'll build and price — and the place the homeowner
 * confirms it. When given a `plan` + `onPlanChange` it is fully EDITABLE: per
 * wall they change the length, toggle the upper / tall rows, or drop the wall
 * entirely (the fix for "the AI added a wall I can't remove"). Every edit writes
 * the FloorPlan and re-derives the contract — and re-seeds the canvas above —
 * so the two views can never disagree. Without those props it's a read-only
 * tally (the builder's confirm gate).
 *
 * The per-run tally goes through the same `summarizeContract` →
 * `suggestCabinetsForRun` the builder seeds from (confirm-tally-parity test).
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

/** One labelled item in a row sequence (cabinet unit OR a floor appliance). */
interface RowItem {
  id: string
  label: string
  pos: number
}

export function LayoutConfirm({
  contract,
  plan,
  onPlanChange,
  onConfirm,
}: {
  contract: LayoutContract
  /** The live FloorPlan. With `onPlanChange`, the card becomes editable. */
  plan?: FloorPlan | null
  /** Persist an edit (and re-seed the canvas). Omit for a read-only tally. */
  onPlanChange?: (plan: FloorPlan) => void
  /** When provided, renders a confirm CTA; omit to render a read-only summary. */
  onConfirm?: () => void
}) {
  const { t, tDynamic, locale } = useTranslations()
  const editable = Boolean(plan && onPlanChange)

  const summary = useMemo(() => summarizeContract(contract), [contract])
  const { rows, totalCabinets, cornerCount } = summary
  const applianceWords = APPLIANCE_LABEL[locale]
  const patternWords = PATTERN_LABEL[locale]
  const ui = UI[locale]

  function unitItems(units: CabinetUnit[]): RowItem[] {
    return units
      .map((u) => ({ id: u.id, label: patternWords[u.pattern], pos: u.positionPctAlongRun }))
      .sort((a, b) => a.pos - b.pos)
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

            // Base row = base units + any FRIDGE on this wall (full-height, sits on
            // the floor but carries no carcass — this is why it was "nowhere").
            const baseItems = [
              ...unitItems(r.units.filter((u) => u.type === 'base')),
              ...appliances
                .filter((a) => a.kind === 'fridge')
                .map((a, i) => ({
                  id: `fridge-${r.id}-${i}`,
                  label: applianceWords.fridge,
                  pos: a.positionPctAlongRun,
                })),
            ].sort((a, b) => a.pos - b.pos)
            const wallItems = unitItems(r.units.filter((u) => u.type === 'wall'))
            const tallItems = unitItems(r.units.filter((u) => u.type === 'tall'))

            const wallLen =
              editable && plan && isWall ? Math.round(wallLengthCm(wall, plan.room)) : r.lengthCm

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
                    {appliances.map((a, i) => (
                      <span
                        key={`${a.kind}-${i}`}
                        className="rounded-full bg-primary/10 px-2 py-0.5 text-[11.5px] font-medium text-primary"
                      >
                        {applianceWords[a.kind] ?? a.kind}
                      </span>
                    ))}
                  </div>
                )}

                <UnitRow label={t('builder.confirm.baseRow')} items={baseItems} />
                {wallItems.length > 0 && <UnitRow label={t('builder.confirm.wallRow')} items={wallItems} />}
                {tallItems.length > 0 && <UnitRow label={t('builder.confirm.tallRow')} items={tallItems} />}

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
          <span className="font-semibold text-foreground"> + {tDynamic('layout.shape.island')}</span>
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

/** One cabinet row (base / upper / tall) as an ordered sequence of item chips. */
function UnitRow({ label, items }: { label: string; items: RowItem[] }) {
  if (items.length === 0) return null
  return (
    <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-[12px]">
      <span className="font-medium text-muted-foreground">
        {label} ({items.length}):
      </span>
      {items.map((it, i) => (
        <span key={it.id} className="text-foreground">
          {it.label}
          {i < items.length - 1 && <span className="text-muted-foreground/50"> ·</span>}
        </span>
      ))}
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
