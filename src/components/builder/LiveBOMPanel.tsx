'use client'

import { useMemo } from 'react'
import { computeBom, formatEUR } from '@/lib/builder/bom'
import { formatRange } from '@/lib/builder/range'
import { useTranslations } from '@/lib/i18n'
import { tDynamic } from '@/lib/i18n'
import { RangeLine } from '@/components/range/RangeLine'
import type { BuilderState } from '@/lib/builder/inventory'
import type { LeadProfile } from '@/lib/types'

/**
 * Sticky right-side panel with the live cost range. Updates on every
 * BuilderState change. Always shows a range, never a single number — the
 * range is itself a signal of certainty. `scope` (once the homeowner sets it)
 * drops out-of-scope lines so the range reflects the actual project.
 *
 * The headline is the shared RangeLine (IMP-04): what the homeowner pays, the
 * ±, who confirms it and what it leaves out. Every sub-range below prints
 * through the same `formatRange`; an exact sum (picked models) prints as is.
 */
export function LiveBOMPanel({
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
  const bom = useMemo(() => computeBom(state, locale, { scope }), [state, locale, scope])
  const works = bom.sections.works
  // Homeowner supplies everything → no goods, and no "0 € – 0 €" row.
  const hasGoods = bom.sections.goods.high > 0

  return (
    <aside className="sticky top-6 flex h-fit w-80 shrink-0 flex-col gap-4 rounded-3xl border border-border bg-card/70 p-5 shadow-sm backdrop-blur">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t('builder.shell.bom.title')}
        </p>
        <RangeLine
          className="mt-2"
          voice="homeowner"
          makerName={makerName}
          label={t('builder.shell.bom.works')}
          range={{
            low: works.low,
            high: works.high,
            bandPct: Math.round(works.bandWidthPct / 2),
            assumptions: bom.assumptions,
          }}
        />

        {/* The headline IS the kitchen (material + make + install — the three
            things the maker actually quotes), without appliances. The goods
            ride below and collapse to an exact sum once models are picked;
            the total with them closes the section. */}
        <dl className="mt-3 space-y-1 border-t border-border/50 pt-3 text-[11.5px]">
          {(['material', 'make', 'install'] as const).map((k) => (
            <div key={k} className="flex items-baseline justify-between gap-2">
              <dt className="text-muted-foreground">{t(`builder.shell.bom.${k}`)}</dt>
              <dd className="shrink-0 tabular-nums text-muted-foreground">
                {formatRange(works.breakdown[k], locale)}
              </dd>
            </div>
          ))}
          {hasGoods && (
            <>
              <div className="flex items-baseline justify-between gap-2 pt-1.5">
                <dt className="font-medium text-foreground">{t('builder.shell.bom.goods')}</dt>
                <dd className="shrink-0 tabular-nums font-semibold text-foreground">
                  {bom.sections.goods.allPicked
                    ? formatEUR(bom.sections.goods.low, locale)
                    : formatRange(bom.sections.goods, locale)}
                </dd>
              </div>
              {bom.sections.goods.allPicked && (
                <p className="text-[10px] text-muted-foreground/80">{t('builder.shell.bom.goodsExact')}</p>
              )}
            </>
          )}
          {bom.sections.project.high > 0 && (
            <div className="flex items-baseline justify-between gap-2">
              <dt className="font-medium text-foreground">{t('builder.shell.bom.project')}</dt>
              <dd className="shrink-0 tabular-nums font-semibold text-foreground">
                {formatRange(bom.sections.project, locale)}
              </dd>
            </div>
          )}
          {hasGoods && (
            <div className="flex items-baseline justify-between gap-2 border-t border-border/50 pt-2">
              <dt className="font-medium text-foreground">{t('builder.shell.bom.totalWithGoods')}</dt>
              <dd className="shrink-0 tabular-nums font-semibold text-foreground">
                {formatRange(bom.total, locale)}
              </dd>
            </div>
          )}
        </dl>
      </header>

      <ul className="divide-y divide-border/50">
        {bom.lineItems.map((item) => (
          <li key={item.key} className="flex items-baseline justify-between gap-3 py-2 text-[12px]">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-foreground">
                {tDynamic(`bom.lineItem.${item.key}`, locale)}
              </p>
              <p className="truncate text-[10px] text-muted-foreground">
                {item.detail} · {item.quantity}
              </p>
            </div>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {item.exact ? formatEUR(item.low, locale) : formatRange(item, locale)}
            </span>
          </li>
        ))}
      </ul>
    </aside>
  )
}
