/**
 * The range a brief carries, priced from the homeowner's build — one function
 * for the submit route (via buildHandoffBundle) and the wrap-up's review
 * (IMP-07), which shows the range BEFORE anything is sent. Two callers pricing
 * a build two ways is how the review would end up showing one range and the
 * maker receiving another.
 *
 * Client-safe: computeBom and the default rate card only (the live panel
 * already prices in the browser). Nothing here reads the maker's B2B prices;
 * those are computed on the maker's brief page (makerCostFor).
 */
import { computeBom } from '@/lib/builder/bom'
import { DEFAULT_RATE_CARD } from '@/lib/catalog/rate-card'
import type { BuilderState } from '@/lib/builder/inventory'
import type { HandoffEstimate, LeadProfile } from '@/lib/types'

/**
 * The range comes from the homeowner's build and from nothing else. Skip the
 * builder and there is no range: a number derived from no inputs, shown as if
 * it were ±20%, is exactly the dishonesty rule 6 rules out. Every surface
 * renders the null case as "no range yet — build your kitchen to get one".
 */
export function estimateFromBuild(brief: LeadProfile): HandoffEstimate | null {
  if (!brief.builderState) return null
  // The rate card (labour, workshop margin, band floor). IMP-21 loads the
  // owning maker's row here; until then every brief uses the defaults.
  const rates = DEFAULT_RATE_CARD
  const bom = computeBom(brief.builderState as BuilderState, undefined, { scope: brief.scope, rates })
  // Headline range is kitchen-only (works); the goods the maker supplies
  // (appliances and/or sink + tap) ride alongside as the figure with them,
  // labelled by what they hold (withGoodsKey). Band applies to the works range.
  // Every figure is what the homeowner pays: PDV and the margin are inside.
  const hasGoods = bom.sections.goods.high > 0
  return {
    low: bom.sections.works.low,
    high: bom.sections.works.high,
    withAppliances: hasGoods ? { low: bom.total.low, high: bom.total.high } : null,
    basis: `Estimated from your build — ±${Math.round(bom.sections.works.bandWidthPct / 2)}%. An estimate your maker confirms, never a final quote.`,
    bandPct: Math.round(bom.sections.works.bandWidthPct / 2),
    lines: bom.lineItems,
    // What the range assumes and leaves out; printed next to it everywhere.
    assumptions: bom.assumptions,
    priceBasis: 'gross-margin-v1',
    // Maker-only: net cost and margin for the brief page. The stored brief
    // keeps them; the customer's copy does not (customerEstimate).
    maker: bom.makerOnly,
  }
  // No B2B cost basis here (IMP-05): this runs at submit, and whatever it
  // puts in the bundle is stored with the brief and sent back to the
  // homeowner's client. The maker's brief page computes it (makerCostFor).
}

/**
 * The estimate as the homeowner's client may hold it: without the maker-only
 * money (net cost and workshop margin, and the B2B cost basis should one ever
 * be attached). Every customer-facing copy goes through this — the handoff's
 * response (toCustomerBundle), the review's preview and the saved range.
 */
export function customerEstimate(estimate: HandoffEstimate | null): HandoffEstimate | null {
  if (!estimate) return null
  const out: HandoffEstimate = { ...estimate }
  delete out.maker
  delete out.makerCost
  return out
}
