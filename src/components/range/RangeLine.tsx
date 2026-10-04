'use client'

import type { ReactNode } from 'react'
import { useTranslations } from '@/lib/i18n'
import { assumptionKey, formatRange, normalizeAssumptions } from '@/lib/builder/range'
import { cn } from '@/lib/utils'

/**
 * The one way a range is shown (IMP-04): `low – high · ±pct · who confirms it`,
 * then what it assumes and leaves out. The builder panel and dock, the
 * wrap-up, the kitchen home, the maker dashboard and the brief all render it,
 * so the figures, the rounding and the caveats never differ between screens.
 *
 * Every figure is what the homeowner pays (PDV and the workshop margin are
 * inside it), so there is deliberately no VAT or margin line here: this
 * component never sees the maker-only money.
 */

export interface RangeLineValue {
  low: number
  high: number
  /** Half-width in percent (13 = ±13 %). Missing → no ± at all, never a guessed 20. */
  bandPct?: number | null
  /**
   * Assumption keys (`BomAssumption`), as computeBom produced them or as the
   * brief stored them. Missing → the legacy list (a brief priced before IMP-04).
   */
  assumptions?: readonly string[] | null
}

export interface RangeLineProps {
  /** Null when there is no range (no build yet): `fallback` renders instead. */
  range: RangeLineValue | null
  /** The homeowner reads "a range {maker} confirms"; the maker reads "a range you confirm". */
  voice: 'homeowner' | 'maker'
  /** The maker's display name. Missing (dev harness, anonymous funnel) → "your maker". */
  makerName?: string | null
  /** `lg`: headline figures and the assumptions as a dotted list. `compact`: one
   *  line of figures and one muted line of caveats, clamped. */
  size?: 'lg' | 'compact'
  /** What the range covers, shown above the figures (e.g. "Kitchen, made and installed"). */
  label?: ReactNode
  /** What to show when `range` is null. Default: nothing. */
  fallback?: ReactNode
  /** Compact only: let the caveat line wrap instead of clamping (e.g. an opened dock). */
  wrap?: boolean
  className?: string
}

export function RangeLine({
  range,
  voice,
  makerName,
  size = 'lg',
  label,
  fallback = null,
  wrap = false,
  className,
}: RangeLineProps) {
  const { t, locale } = useTranslations()
  if (!range) return <>{fallback}</>

  const figures = formatRange(range, locale)
  const band =
    range.bandPct != null && Number.isFinite(range.bandPct)
      ? t('range.band').replace('{pct}', String(Math.round(range.bandPct)))
      : null
  const confirms =
    voice === 'maker'
      ? t('range.confirms.maker')
      : t('range.confirms.homeowner').replace('{maker}', makerName?.trim() || t('range.yourMaker'))
  const assumptions = normalizeAssumptions(range.assumptions).map((a) => t(assumptionKey(a)))

  if (size === 'compact') {
    const caveats = [confirms, ...assumptions].join(' · ')
    // Phrasing elements only: the dock renders this inside its toggle button.
    return (
      <span className={cn('block min-w-0', className)} data-range-line="compact">
        {label ? <span className="block text-[10px] text-muted-foreground">{label}</span> : null}
        <span className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold tabular-nums text-foreground">
          <span>{figures}</span>
          {band ? <span className="text-[10px] font-normal text-muted-foreground">{band}</span> : null}
        </span>
        <span
          className={cn('block text-[10px] leading-snug text-muted-foreground', !wrap && 'truncate')}
          title={wrap ? undefined : caveats}
        >
          {caveats}
        </span>
      </span>
    )
  }

  return (
    <div className={cn('min-w-0', className)} data-range-line="lg">
      {label ? <p className="text-[11px] text-muted-foreground">{label}</p> : null}
      <p className="mt-0.5 text-2xl font-semibold tabular-nums text-foreground">{figures}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {band ? (
          <>
            <span className="tabular-nums">{band}</span>
            <span aria-hidden> · </span>
          </>
        ) : null}
        {confirms}
      </p>
      {assumptions.length > 0 ? (
        <ul
          aria-label={t('range.assumptions.label')}
          className="mt-2 flex flex-wrap gap-x-1.5 gap-y-0.5 text-[11px] leading-snug text-muted-foreground/90"
        >
          {assumptions.map((text, i) => (
            <li key={text}>
              {i > 0 ? (
                <span aria-hidden className="mr-1.5">
                  ·
                </span>
              ) : null}
              {text}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
