'use client'

import { useId, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { useTranslations } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import {
  WALL_LETTER,
  counterWalls,
  tradeMoves,
  withIsland,
  withSinkAsToday,
  withSinkOnWall,
  type FloorPlan,
  type SinkAnswer,
} from '@/lib/floor-plan'
import type { LayoutIntent } from '@/lib/types'

export interface ConfirmTogglesProps {
  /** The working plan on the confirm step. */
  plan: FloorPlan
  /** The room as it is today (room step) — where the sink is now. */
  existing?: FloorPlan | null
  existingRoom?: 'kitchen' | 'empty'
  intent?: LayoutIntent
  /** `trades.plumbing.sinkPosition`, as stored. */
  sinkAnswer?: SinkAnswer
  onPlanChange: (plan: FloorPlan) => void
  onSinkAnswer: (answer: 'same' | 'moving') => void
}

/**
 * The light confirm's own controls (IMP-32): the island on or off, and whether
 * the sink stays. The uppers per wall live on the tally card below. Nothing is
 * written until a tap: the sink chips show what `tradeMoves` reads from the
 * plans, the answer and the intent, so "Zadrži raspored" opens on "Ostaje gdje
 * je" and "Premjesti sudoper" on "Seli se" without storing anything.
 */
export function ConfirmToggles({
  plan,
  existing,
  existingRoom,
  intent,
  sinkAnswer,
  onPlanChange,
  onSinkAnswer,
}: ConfirmTogglesProps) {
  const { t } = useTranslations()
  const labelId = useId()
  const island = Boolean(plan.island)
  const sink = tradeMoves(existing, plan, intent, { existingRoom, sinkAnswer }).sink
  const todayWall = existing?.features.find((f) => f.kind === 'sink')?.wall ?? null
  const planHasSink = plan.features.some((f) => f.kind === 'sink')
  const targets = counterWalls(plan).filter((w) => w !== todayWall)
  const showWhere = sink.status === 'moves' && planHasSink && targets.length > 0

  function stays() {
    const next = withSinkAsToday(plan, existing)
    if (next !== plan) onPlanChange(next)
    onSinkAnswer('same')
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap gap-2">
        <Pill pressed={island} onClick={() => onPlanChange(withIsland(plan, !island))}>
          {t('confirm.toggle.island')}
        </Pill>
      </div>

      {existingRoom !== 'empty' && (
        <div className="space-y-2.5">
          <p id={labelId} className="text-sm font-semibold text-foreground">
            {t('confirm.sink.label')}
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby={labelId}>
            <Pill pressed={sink.status === 'stays'} onClick={stays}>
              {t('confirm.sink.stays')}
            </Pill>
            <Pill pressed={sink.status === 'moves'} onClick={() => onSinkAnswer('moving')}>
              {t('confirm.sink.moves')}
            </Pill>
          </div>
          {showWhere && (
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('confirm.sink.where')}>
              <span className="text-xs font-medium text-muted-foreground">{t('confirm.sink.where')}</span>
              {targets.map((w) => (
                <Pill key={w} pressed={sink.toWall === w} onClick={() => onPlanChange(withSinkOnWall(plan, w))}>
                  {t('room.measure.wall').replace('{a}', WALL_LETTER[w])}
                </Pill>
              ))}
            </div>
          )}
          <p className="text-xs leading-relaxed text-muted-foreground">{t('confirm.sink.help')}</p>
        </div>
      )}
    </section>
  )
}

/**
 * "Promijeni raspored": the full plan editor, folded away on the measured path
 * (the room step owns the walls) and open where the plan still needs hands —
 * the 'change' intent, no plan, or a plan from before the room step. A tap
 * overrides the default for as long as the step is open.
 */
export function EditPlanDisclosure({
  label,
  defaultOpen,
  children,
}: {
  label: string
  defaultOpen: boolean
  children: ReactNode
}) {
  const [userOpen, setUserOpen] = useState<boolean | null>(null)
  const open = userOpen ?? defaultOpen
  const panelId = useId()
  return (
    <section className="rounded-2xl border border-border bg-card/40">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setUserOpen(!open)}
        className="flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold text-foreground transition-colors hover:bg-card"
      >
        {label}
        <ChevronDown
          className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>
      {open && (
        <div id={panelId} className="border-t border-border p-4">
          {children}
        </div>
      )}
    </section>
  )
}

function Pill({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'rounded-full border px-3.5 py-2 text-[13px] font-medium transition-colors',
        pressed
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-card text-foreground hover:border-primary/50'
      )}
    >
      {children}
    </button>
  )
}
