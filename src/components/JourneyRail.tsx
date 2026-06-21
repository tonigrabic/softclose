'use client'

import { cn } from '@/lib/utils'

/**
 * The design's two-level "Your brief" rail — shared by the funnel (capture /
 * close acts) and the builder (build act with its component groups). Three acts;
 * the current one expands to show its steps with done/current/todo markers and
 * captured-value read-backs. Steps with an `onSelect` are clickable.
 */
export type RailStatus = 'done' | 'current' | 'todo'

export interface RailStep {
  id: string
  label: string
  status: RailStatus
  readback?: string | null
  onSelect?: () => void
}

export interface RailAct {
  id: string
  num: number
  label: string
  status: RailStatus
  count?: { done: number; total: number }
  steps?: RailStep[]
}

export function JourneyRail({ brief, acts }: { brief: string; acts: RailAct[] }) {
  return (
    <nav aria-label={brief} className="space-y-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{brief}</p>

      <div className="space-y-1.5">
        {acts.map((act) => (
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
                {act.label}
              </span>
              {act.status === 'current' && act.count ? (
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                  {act.count.done}/{act.count.total}
                </span>
              ) : act.status === 'done' ? (
                <span className="text-[11px] font-bold text-primary">✓</span>
              ) : null}
            </div>

            {act.status === 'current' && act.steps && act.steps.length > 0 && (
              <ol className="ml-3.5 mt-1 space-y-0.5 border-l border-border/60 pl-3">
                {act.steps.map((step) => (
                  <li key={step.id}>
                    <StepRow step={step} />
                  </li>
                ))}
              </ol>
            )}
          </div>
        ))}
      </div>
    </nav>
  )
}

function StepRow({ step }: { step: RailStep }) {
  const cls = cn(
    'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] transition-colors',
    step.status === 'current'
      ? 'bg-primary/10 font-medium text-foreground'
      : step.status === 'done'
        ? 'text-foreground'
        : 'text-muted-foreground/70'
  )
  const inner = (
    <>
      <StepMarker status={step.status} />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{step.label}</span>
        {step.readback && (
          <span className="block truncate text-[10.5px] font-normal text-muted-foreground/80">
            {step.readback}
          </span>
        )}
      </span>
    </>
  )
  if (step.onSelect) {
    return (
      <button type="button" onClick={step.onSelect} className={cn(cls, 'hover:bg-muted/50')}>
        {inner}
      </button>
    )
  }
  return <div className={cls}>{inner}</div>
}

function ActMarker({ status, num }: { status: RailStatus; num: number }) {
  if (status === 'todo') {
    return (
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border text-[10px] font-bold text-muted-foreground/60">
        {num}
      </span>
    )
  }
  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
      {status === 'done' ? '✓' : num}
    </span>
  )
}

function StepMarker({ status }: { status: RailStatus }) {
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
