'use client'

import { useMemo, useState } from 'react'
import { ChevronUp } from 'lucide-react'
import { computeBom, formatEUR } from '@/lib/builder/bom'
import { formatRange, withGoodsKey } from '@/lib/builder/range'
import { tDynamic, useTranslations } from '@/lib/i18n'
import { RangeLine } from '@/components/range/RangeLine'
import type { BuilderState } from '@/lib/builder/inventory'
import type { LeadProfile } from '@/lib/types'
import { cn } from '@/lib/utils'

/**
 * Pinned bottom bar for mobile (handoff/IMPLEMENTATION.md §2): the live range
 * stays in view from the moment a build exists, as the same RangeLine the
 * desktop panel shows (compact: the figures, then one clamped line saying who
 * confirms it and what it leaves out). Tap to expand the per-line breakdown;
 * the caveat line then wraps in full. Same numbers as LiveBOMPanel, compacted.
 */
export function MobileRangeDock({
  state,
  scope,
  makerName,
}: {
  state: BuilderState
  scope?: LeadProfile['scope']
  /** The maker's display name for "a range {maker} confirms"; absent → "your maker". */
  makerName?: string | null
}) {
  const { t, locale } = useTranslations()
  const [open, setOpen] = useState(false)
  const bom = useMemo(() => computeBom(state, locale, { scope }), [state, locale, scope])
  const works = bom.sections.works
  // Homeowner supplies everything → no goods, and no total with them.
  const hasGoods = bom.sections.goods.high > 0

  return (
    <div className="border-t border-border bg-background/95 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-4 py-2.5 text-left"
      >
        <RangeLine
          className="flex-1"
          size="compact"
          wrap={open}
          voice="homeowner"
          makerName={makerName}
          label={
            <span className="font-semibold uppercase tracking-[0.14em]">{t('builder.shell.bom.title')}</span>
          }
          range={{
            low: works.low,
            high: works.high,
            bandPct: Math.round(works.bandWidthPct / 2),
            assumptions: bom.assumptions,
          }}
        />
        <ChevronUp
          className={cn(
            'mt-0.5 size-4 shrink-0 stroke-[2] text-muted-foreground transition-transform',
            open && 'rotate-180'
          )}
          aria-hidden
        />
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
                  {item.exact ? formatEUR(item.low, locale) : formatRange(item, locale)}
                </span>
              </li>
            ))}
          </ul>
          {hasGoods && (
            <div className="flex items-baseline justify-between gap-3 border-t border-border/50 py-2 text-[12px]">
              <p className="font-medium text-foreground">{t(withGoodsKey(bom.lineItems))}</p>
              <span className="shrink-0 tabular-nums font-semibold text-foreground">
                {formatRange(bom.total, locale)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
