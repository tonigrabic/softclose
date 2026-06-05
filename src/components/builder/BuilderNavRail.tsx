'use client'

import { useTranslations, tDynamic, type Locale } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { BUILDER_GROUPS, type BuilderGroupId, type BuilderState } from '@/lib/builder/inventory'

/**
 * The design's two-level "Your brief" rail (handoff/prototype Rail treatment).
 * Three acts; the current act expands to show its steps. In the builder we're in
 * the "Build" act — Capture is done, Close is still ahead — and the builder's
 * component groups are the steps of Build.
 *
 * (Funnel capture/close steps will nest under their acts in a later pass; for
 * now those acts render collapsed with a done/todo marker.)
 */
type Status = 'done' | 'current' | 'todo'

const ACTS: { id: string; num: number; labelKey: string; status: Status }[] = [
  { id: 'space', num: 1, labelKey: 'journey.act.space', status: 'done' },
  { id: 'build', num: 2, labelKey: 'journey.act.build', status: 'current' },
  { id: 'offer', num: 3, labelKey: 'journey.act.offer', status: 'todo' },
]

export function BuilderNavRail({
  currentId,
  onNavigate,
  state,
}: {
  currentId: BuilderGroupId
  onNavigate: (id: BuilderGroupId) => void
  state: BuilderState
}) {
  const { t, locale } = useTranslations()
  const currentOrder = BUILDER_GROUPS.find((g) => g.id === currentId)?.order ?? 0
  const buildDone = Math.max(0, currentOrder - 1)

  return (
    <nav aria-label="Your brief" className="space-y-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {t('journey.brief')}
      </p>

      <div className="space-y-1.5">
        {ACTS.map((act) => (
          <div key={act.id}>
            <div
              className={cn(
                'flex items-center gap-2.5 rounded-xl px-2 py-1.5',
                act.status === 'current' && 'bg-muted/40'
              )}
            >
              <ActMarker status={act.status} num={act.num} />
              <span
                className={cn(
                  'flex-1 text-[13px] font-semibold',
                  act.status === 'todo' ? 'text-muted-foreground/60' : 'text-foreground'
                )}
              >
                {tDynamic(act.labelKey, locale)}
              </span>
              {act.status === 'current' ? (
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                  {buildDone}/{BUILDER_GROUPS.length}
                </span>
              ) : act.status === 'done' ? (
                <span className="text-[11px] font-bold text-primary">✓</span>
              ) : null}
            </div>

            {act.status === 'current' && (
              <ol className="ml-3.5 mt-1 space-y-0.5 border-l border-border/60 pl-3">
                {BUILDER_GROUPS.map((g) => {
                  const st: Status =
                    g.order < currentOrder ? 'done' : g.order === currentOrder ? 'current' : 'todo'
                  const readback = st === 'done' ? groupReadback(g.id, state, locale) : null
                  return (
                    <li key={g.id}>
                      <button
                        type="button"
                        onClick={() => onNavigate(g.id)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] transition-colors',
                          st === 'current'
                            ? 'bg-primary/10 font-medium text-foreground'
                            : st === 'done'
                              ? 'text-foreground hover:bg-muted/50'
                              : 'text-muted-foreground/70 hover:bg-muted/40 hover:text-foreground'
                        )}
                      >
                        <StepMarker status={st} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{tDynamic(g.labelKey, locale)}</span>
                          {readback && (
                            <span className="block truncate text-[10.5px] font-normal text-muted-foreground/80">
                              {readback}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ol>
            )}
          </div>
        ))}
      </div>
    </nav>
  )
}

function ActMarker({ status, num }: { status: Status; num: number }) {
  if (status === 'done') {
    return (
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
        ✓
      </span>
    )
  }
  if (status === 'current') {
    return (
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
        {num}
      </span>
    )
  }
  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border text-[10px] font-bold text-muted-foreground/60">
      {num}
    </span>
  )
}

function StepMarker({ status }: { status: Status }) {
  return (
    <span className="flex w-3 shrink-0 justify-center">
      {status === 'done' ? (
        <span className="text-[11px] font-bold leading-none text-primary">✓</span>
      ) : status === 'current' ? (
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60" />
          <span className="relative inline-flex size-2 rounded-full bg-primary" />
        </span>
      ) : (
        <span className="size-2 rounded-full border border-muted-foreground/40" />
      )}
    </span>
  )
}

/** Short captured-value summary under a completed step (status visibility). */
function groupReadback(id: BuilderGroupId, state: BuilderState, locale: Locale): string | null {
  switch (id) {
    case 'cabinetBoxes':
      return tDynamic(`cabinetBoxes.carcass.${state.cabinetBoxes.carcassMaterial}`, locale)
    case 'doors':
      return tDynamic(`doors.style.${state.doors.style}`, locale)
    case 'worktop':
      return tDynamic(`worktop.family.${state.worktop.family}`, locale)
    case 'backsplash':
      return state.backsplash.kind === 'none'
        ? null
        : tDynamic(`backsplash.kind.${state.backsplash.kind}`, locale)
    case 'hardware':
      return tDynamic(`hardware.tier.${state.hardware.drawerSystemTier}`, locale)
    case 'sinkTaps':
      return tDynamic(`sinkTaps.material.${state.sinkTaps.sink.material}`, locale)
    case 'finishing':
      return tDynamic(`finishing.plinthMaterial.${state.finishing.plinthMaterial}`, locale)
    default:
      return null
  }
}
