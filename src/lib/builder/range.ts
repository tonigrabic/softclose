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
  /** The maker supplies the appliances but none are selected, so no row prices them. */
  'appliancesNotIncluded',
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

/**
 * The groups a priced build reads in, in the order a kitchen is quoted: the
 * three parts of the works range (material, make, install), then the goods the
 * homeowner may buy through the maker, then any legacy project allowance.
 */
export const ESTIMATE_GROUPS = ['material', 'make', 'install', 'goods', 'project'] as const
export type EstimateGroupId = (typeof ESTIMATE_GROUPS)[number]

/** The fields grouping needs; structurally a `BomLineItem` (kept loose so this
 *  module stays free of the BOM calculator and its catalog). */
export interface GroupableLine {
  section: 'works' | 'goods' | 'project'
  worksKind?: 'material' | 'make' | 'install'
  exact?: boolean
  low: number
  high: number
}

export interface EstimateGroup<L extends GroupableLine> {
  id: EstimateGroupId
  /** Part of the headline (works) range: material, make, install. Goods and
   *  project allowances are priced alongside it, never inside it. */
  inRange: boolean
  lines: L[]
  /** The sum of this group's lines. */
  low: number
  high: number
  /** Every line is a picked catalog price: print the sum as is, not as a range. */
  exact: boolean
}

/**
 * The stored lines of an estimate, grouped (`ESTIMATE_GROUPS` order, the
 * lines' own order inside a group). A line priced at 0 € (the homeowner buys
 * it) is dropped, and so is a group left with no lines, so nobody reads
 * "0 € – 0 €". Each group carries its own subtotal. The material, make and
 * install groups add up to the headline range (computeBom carries a cap or a
 * floor down to the lines), so there is no separate sum row: the headline is
 * it. Goods and project groups sit outside that range (`inRange: false`).
 * Missing lines (a brief sent before they were stored) → no groups.
 */
export function groupEstimateLines<L extends GroupableLine>(
  lines: readonly L[] | null | undefined
): EstimateGroup<L>[] {
  if (!lines) return []
  const groupOf = (l: L): EstimateGroupId => (l.section === 'works' ? (l.worksKind ?? 'material') : l.section)
  return ESTIMATE_GROUPS.flatMap((id) => {
    const inGroup = lines.filter((l) => l.high > 0 && groupOf(l) === id)
    if (inGroup.length === 0) return []
    return [
      {
        id,
        inRange: id === 'material' || id === 'make' || id === 'install',
        lines: inGroup,
        low: inGroup.reduce((s, l) => s + l.low, 0),
        high: inGroup.reduce((s, l) => s + l.high, 0),
        exact: inGroup.every((l) => l.exact === true),
      },
    ]
  })
}

/**
 * What the figure "with appliances" actually adds to the kitchen (IMP-04
 * review): the goods lines the maker supplies. The homeowner may buy the
 * appliances and leave only the sink and tap with the maker, and that figure
 * must not then say "with appliances" under "appliances bought by the
 * homeowner". Every surface labels it `range.withGoods.<held>`.
 */
export const GOODS_HELD = ['appliances', 'sinkTaps', 'both'] as const
export type GoodsHeld = (typeof GOODS_HELD)[number]

/** The fields `goodsHeld` reads; structurally a `BomLineItem`. */
export interface GoodsLine {
  key: string
  section: 'works' | 'goods' | 'project'
  high: number
}

/**
 * Which goods are priced (above 0 €) among the lines. A brief stored before
 * its lines were (no `lines`) gets 'appliances', the label it was sent with;
 * so does a set of lines with no priced goods, which carries no figure to label.
 */
export function goodsHeld(lines: readonly GoodsLine[] | null | undefined): GoodsHeld {
  const priced = (key: string) => !!lines?.some((l) => l.section === 'goods' && l.key === key && l.high > 0)
  const appliances = priced('appliances')
  const sinkTaps = priced('sinkTaps')
  if (appliances && sinkTaps) return 'both'
  return sinkTaps ? 'sinkTaps' : 'appliances'
}

/** The locale key for the figure with goods: "Kuhinja s uređajima", "… sa sudoperom i slavinom", or both. */
export function withGoodsKey(lines: readonly GoodsLine[] | null | undefined): TranslationKey {
  return `range.withGoods.${goodsHeld(lines)}`
}
