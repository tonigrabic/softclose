/**
 * How a range is printed, on every surface (IMP-04): the builder panel and
 * dock, the wrap-up, the kitchen home, the maker dashboard and brief, and the
 * maker email. One helper, so the same estimate never reads 5.291 € on one
 * screen and 5.300 € on the next.
 *
 * Server-safe on purpose: no React, no catalog. The email and the server pages
 * import it; the BOM calculator re-exports `formatEUR` from here.
 */

import type { TranslationKey } from '@/lib/i18n/core'

/** Format an EUR amount as "12.450 €" (Croatian convention: dot thousands). */
export function formatEUR(amount: number, locale: 'hr-HR' | 'en-US' = 'hr-HR'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(amount)
}

/**
 * Round one end of a range to a step that matches the precision a ±10–20 %
 * band actually has: 10 € below 2,500 €, 50 € up to 9,999 €, 100 € from
 * 10,000 €. Half a step is at most 1 % of any amount from 500 € up, so the
 * printed ends never move the implied ± by more than a point. Monotonic: a
 * larger amount never rounds to a smaller figure, so low ≤ high survives.
 */
export function roundRangeEnd(amount: number): number {
  const step = amount < 2500 ? 10 : amount < 10000 ? 50 : 100
  return Math.round(amount / step) * step
}

/**
 * "5.300 € – 7.400 €": both ends rounded independently (`roundRangeEnd`).
 * When both ends land on the same figure the range prints as one amount.
 * Exact sums (picked goods) are not ranges: print those with `formatEUR`.
 */
export function formatRange(
  range: { low: number; high: number },
  locale: 'hr-HR' | 'en-US' = 'hr-HR'
): string {
  const a = roundRangeEnd(Math.min(range.low, range.high))
  const b = roundRangeEnd(Math.max(range.low, range.high))
  if (a === b) return formatEUR(a, locale)
  return `${formatEUR(a, locale)} – ${formatEUR(b, locale)}`
}

/**
 * What the range assumes, stated next to it everywhere it is shown. Stored as
 * keys, not prose: the handoff computes the estimate in hr-HR, and the
 * homeowner, the maker and the email each read it in their own language.
 * Rendered through `range.assumption.<key>`, in this order.
 */
export const BOM_ASSUMPTIONS = [
  /** The install line is in the range. */
  'installIncluded',
  /** Legacy: a brief whose scope took installation out. */
  'installExcluded',
  /** Removing and disposing of the old kitchen is not priced. */
  'noDemolition',
  /** Electrical and plumbing work is not priced. */
  'noTrades',
  /** The homeowner buys the appliances. */
  'appliancesByHomeowner',
  /** The maker supplies the appliances, priced on their own row, outside the headline. */
  'appliancesSeparate',
  /** The homeowner buys the sink and tap. */
  'sinkTapsByHomeowner',
  /** Delivery and the final measure (templating) are priced nowhere: agreed with the maker. */
  'siteCheckByMaker',
] as const

export type BomAssumption = (typeof BOM_ASSUMPTIONS)[number]

/**
 * Briefs saved before IMP-04 carry no assumptions. Their estimate was built
 * the same way (install line in, no trades, nothing for delivery), so they get
 * the default list rather than none: a range shown without its exclusions is
 * the problem this fixes.
 */
export const LEGACY_ASSUMPTIONS: readonly BomAssumption[] = [
  'installIncluded',
  'noDemolition',
  'noTrades',
  'siteCheckByMaker',
]

export function isBomAssumption(v: unknown): v is BomAssumption {
  return typeof v === 'string' && (BOM_ASSUMPTIONS as readonly string[]).includes(v)
}

/**
 * The assumptions to print for a stored estimate. Not an array (a brief from
 * before IMP-04) → `LEGACY_ASSUMPTIONS`. Otherwise the known keys, in the
 * canonical order; unknown keys (a newer deploy's) are dropped, not printed raw.
 */
export function normalizeAssumptions(raw: unknown): BomAssumption[] {
  if (!Array.isArray(raw)) return [...LEGACY_ASSUMPTIONS]
  const known = new Set(raw.filter(isBomAssumption))
  return BOM_ASSUMPTIONS.filter((a) => known.has(a))
}

/** The locale key an assumption renders through. */
export function assumptionKey(a: BomAssumption): TranslationKey {
  return `range.assumption.${a}`
}
