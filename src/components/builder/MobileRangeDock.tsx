'use client'

import { useMemo, useState } from 'react'
import { ChevronUp } from 'lucide-react'
import { computeBom, formatEUR } from '@/lib/builder/bom'
import { tDynamic, useTranslations } from '@/lib/i18n'
import type { BuilderState } from '@/lib/builder/inventory'
import type { LeadProfile } from '@/lib/types'
import { cn } from '@/lib/utils'

/**
 * Pinned bottom bar for mobile (handoff/IMPLEMENTATION.md §2): the live range
 * stays in view from the moment a build exists; tap to expand the per-line
 * breakdown and the maker-confirms disclaimer. Desktop shows the full
 * LiveBOMPanel in the right rail instead — this is the same numbers, compacted.
 */
export function MobileRangeDock({ state, scope }: { state: BuilderState; scope?: LeadProfile['scope'] }) {
  const { t, locale } = useTranslations()
  const [open, setOpen] = useState(false)
  const bom = useMemo(() => computeBom(state, locale, { scope }), [state, locale, scope])

  return (
    <div className="border-t border-border bg-background/95 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-2.5"
      >
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {t('builder.shell.bom.title')}
        </span>
        <span className="flex items-center gap-2">
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {formatEUR(bom.sections.works.low, locale)} – {formatEUR(bom.sections.works.high, locale)}
          </span>
          <span className="text-[10px] tabular-nums text-muted-foreground">
            ±{Math.round(bom.sections.works.bandWidthPct / 2)}%
          </span>
          <ChevronUp
            className={cn(
              'size-4 stroke-[2] text-muted-foreground transition-transform',
              open && 'rotate-180'
            )}
            aria-hidden
          />
        </span>
      </button>
      {open && (
        <div className="max-h-[45dvh] overflow-y-auto border-t border-border/60 px-4 pb-4 pt-1">
          <ul className="divide-y divide-border/50">
            {bom.lineItems.map((item) => (
              <li
                key={item.key}
                className="flex items-baseline justify-between gap-3 py-2 text-[12px]"
              >
                <p className="min-w-0 flex-1 truncate font-medium text-foreground">
                  {tDynamic(`bom.lineItem.${item.key}`, locale)}
                </p>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {formatEUR(item.low, locale)} – {formatEUR(item.high, locale)}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex items-baseline justify-between gap-3 border-t border-border/50 py-2 text-[12px]">
            <p className="font-medium text-foreground">{t('builder.shell.bom.totalWithGoods')}</p>
            <span className="shrink-0 tabular-nums font-semibold text-foreground">
              {formatEUR(bom.total.low, locale)} – {formatEUR(bom.total.high, locale)}
            </span>
          </div>
          <p className="mt-2 text-[10.5px] leading-relaxed text-muted-foreground/80">
            {t('builder.shell.bom.disclaimer')}
          </p>
        </div>
      )}
    </div>
  )
}
