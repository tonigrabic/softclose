'use client'

import { Lock, PencilRuler } from 'lucide-react'
import { useTranslations } from '@/lib/i18n'
import type { BuilderState } from '@/lib/builder/inventory'

/**
 * Read-only recap of the LOCKED layout contract, rendered from persisted
 * builder state (`state.layout.runs` × `state.cabinetBoxes.units`) — never a
 * re-derivation — so what it shows always equals what `computeBom` prices.
 * The one way to change it is the escape hatch back to Part 1's confirm step.
 */
export function ContractRecap({
  state,
  onEditLayout,
}: {
  state: BuilderState
  /** Escape hatch: jump back to Part 1's confirm_look. Omitted in contexts
   *  without funnel navigation (the dev harness). */
  onEditLayout?: () => void
}) {
  const { t } = useTranslations()
  const units = state.cabinetBoxes.units
  const total = units.length

  return (
    <section className="space-y-2.5 rounded-2xl border border-border bg-card/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Lock className="size-3.5 stroke-[2.5]" aria-hidden />
          {t('cabinetBoxes.recap.title')}
        </h3>
        {onEditLayout && (
          <button
            type="button"
            onClick={onEditLayout}
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary transition-colors hover:text-primary/80"
          >
            <PencilRuler className="size-3.5 stroke-[2.5]" aria-hidden />
            {t('cabinetBoxes.recap.editLayout')}
          </button>
        )}
      </div>

      <ul className="space-y-1">
        {state.layout.runs.map((run) => {
          const runUnits = units.filter((u) => u.runId === run.id)
          if (runUnits.length === 0 && !run.hasBase) return null
          const base = runUnits.filter((u) => u.type === 'base').length
          const wall = runUnits.filter((u) => u.type === 'wall').length
          const tall = runUnits.filter((u) => u.type === 'tall').length
          return (
            <li
              key={run.id}
              className="flex items-baseline justify-between gap-3 text-[13px] text-foreground"
            >
              <span className="min-w-0 truncate font-medium">
                {run.label} <span className="text-muted-foreground">· {run.lengthCm} cm</span>
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {[
                  base > 0 ? `${base} ${t('builder.confirm.baseRow').toLowerCase()}` : null,
                  wall > 0 ? `${wall} ${t('builder.confirm.wallRow').toLowerCase()}` : null,
                  tall > 0 ? `${tall} ${t('builder.confirm.tallRow').toLowerCase()}` : null,
                ]
                  .filter(Boolean)
                  .join(' / ')}
              </span>
            </li>
          )
        })}
      </ul>

      <p className="text-[12px] text-muted-foreground">
        {t('builder.confirm.totalPrefix')}{' '}
        <span className="font-semibold text-foreground tabular-nums">{total}</span>{' '}
        {t('builder.confirm.cabinetsUnit')}
      </p>
    </section>
  )
}
