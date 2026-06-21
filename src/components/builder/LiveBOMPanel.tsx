'use client'

import { useMemo } from 'react'
import { computeBom, formatEUR } from '@/lib/builder/bom'
import { useTranslations } from '@/lib/i18n'
import { tDynamic } from '@/lib/i18n'
import type { BuilderState } from '@/lib/builder/inventory'

/**
 * Sticky right-side panel with the live cost range. Updates on every
 * BuilderState change. Always shows a range, never a single number — the
 * range is itself a signal of certainty.
 */
export function LiveBOMPanel({ state }: { state: BuilderState }) {
  const { t, locale } = useTranslations()
  const bom = useMemo(() => computeBom(state, locale), [state, locale])

  return (
    <aside className="sticky top-6 flex h-fit w-80 shrink-0 flex-col gap-4 rounded-3xl border border-border bg-card/70 p-5 shadow-sm backdrop-blur">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t('builder.shell.bom.title')}
        </p>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums text-foreground">
            {formatEUR(bom.sections.works.low, locale)}
          </span>
          <span className="text-sm text-muted-foreground">–</span>
          <span className="text-2xl font-semibold tabular-nums text-foreground">
            {formatEUR(bom.sections.works.high, locale)}
          </span>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {t('builder.shell.bom.works')} · ±{Math.round(bom.sections.works.bandWidthPct / 2)}%
        </p>

        {/* The headline IS the kitchen (material + make + install — the three
            things the maker actually quotes), without appliances. The goods
            ride below and collapse to an exact sum once models are picked;
            the all-in total closes the section. */}
        <dl className="mt-3 space-y-1 border-t border-border/50 pt-3 text-[11.5px]">
          {(['material', 'make', 'install'] as const).map((k) => (
            <div key={k} className="flex items-baseline justify-between gap-2">
              <dt className="text-muted-foreground">{t(`builder.shell.bom.${k}`)}</dt>
              <dd className="shrink-0 tabular-nums text-muted-foreground">
                {formatEUR(bom.sections.works.breakdown[k].low, locale)} –{' '}
                {formatEUR(bom.sections.works.breakdown[k].high, locale)}
              </dd>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-2 pt-1.5">
            <dt className="font-medium text-foreground">{t('builder.shell.bom.goods')}</dt>
            <dd className="shrink-0 tabular-nums font-semibold text-foreground">
              {bom.sections.goods.allPicked
                ? formatEUR(bom.sections.goods.low, locale)
                : `${formatEUR(bom.sections.goods.low, locale)} – ${formatEUR(bom.sections.goods.high, locale)}`}
            </dd>
          </div>
          {bom.sections.goods.allPicked && (
            <p className="text-[10px] text-muted-foreground/80">{t('builder.shell.bom.goodsExact')}</p>
          )}
          <div className="flex items-baseline justify-between gap-2 border-t border-border/50 pt-2">
            <dt className="font-medium text-foreground">{t('builder.shell.bom.totalWithGoods')}</dt>
            <dd className="shrink-0 tabular-nums font-semibold text-foreground">
              {formatEUR(bom.total.low, locale)} – {formatEUR(bom.total.high, locale)}
            </dd>
          </div>
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
              {formatEUR(item.low, locale)} – {formatEUR(item.high, locale)}
            </span>
          </li>
        ))}
      </ul>

      <p className="text-[10.5px] leading-relaxed text-muted-foreground/80">
        {t('builder.shell.bom.disclaimer')}
      </p>
    </aside>
  )
}
