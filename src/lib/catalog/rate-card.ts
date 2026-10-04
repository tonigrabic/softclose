/**
 * The workshop's rate card: the numbers a maker prices a kitchen with that are
 * not catalog prices. That covers labour rates, the workshop margin and how
 * narrow a range may get.
 *
 * IMP-04 ships them as code defaults (`DEFAULT_RATE_CARD`). IMP-21 moves them
 * to one row per maker in the database, seeded from exactly these values, and
 * `computeBom(state, locale, { rates })` then takes the owning maker's card.
 * Until then every estimate is priced with the defaults below.
 *
 * Price basis (Decision 1, Toni 2026-10-03): the homeowner's range is what
 * they will pay, so VAT and the workshop margin are inside the number. Every
 * Elgrad source already includes PDV (see `vatBasis` in the catalog JSON), so
 * nothing is grossed up; the margin is the only thing added on top of cost.
 */

/** Manual-work rates from the maker's cost sheet (EUR). Each labour line is
 * driven by a concrete quantity (design hours, CNC positions, carcasses,
 * install metres), not a vague % of materials. Moved here unchanged from
 * bom.ts so IMP-21's seeded default row has one source. */
export interface LabourRates {
  readonly designPerHour: number
  readonly designHoursPerCarcass: number
  readonly cncPerPosition: number
  readonly positionsPerCarcass: number
  readonly assemblyPerCarcass: number
  readonly installPerMetre: number
}

export const LABOUR_RATES: LabourRates = {
  designPerHour: 30,
  designHoursPerCarcass: 0.8,
  cncPerPosition: 1,
  positionsPerCarcass: 8,
  assemblyPerCarcass: 15,
  installPerMetre: 75,
}

/**
 * The workshop margin: a markup on net cost, applied to the material and make
 * lines (not to install, not to goods the homeowner buys through the maker).
 * Fractions: 0.30 = 30 % on cost.
 *
 * A band, because it is a maker's setting with a sensible spread, but the
 * estimate applies ONE figure (`appliedMargin`, the midpoint) to both ends of
 * every line. The margin is the maker's choice, not uncertainty: applying the
 * low end to `low` and the high end to `high` would widen the homeowner's
 * band for no reason the homeowner could resolve.
 */
export interface WorkshopMargin {
  readonly low: number
  readonly high: number
  readonly basis: 'markup_on_cost'
}

export interface RateCard {
  readonly workshopMargin: WorkshopMargin
  /**
   * Narrowest displayed band, as a half-width in percent (10 = never tighter
   * than ±10 %). Decision 2 (Toni 2026-10-03): ±10 % until a maker's own rates
   * are in. A range tighter than that would claim a precision default rates do
   * not have.
   */
  readonly bandFloorHalfPct: number
  /**
   * Whether the labour rates include PDV. Only 'gross' is supported: computeBom
   * grosses nothing up (Decision 1). It is an ASSUMPTION for labour. Toni's
   * "all gross" covers Elgrad's lists, and the labour sheet's basis is not
   * known yet (WORKLOG IMP-04, open question 1). If it turns out net, widen
   * this type and gross the labour lines up in computeBom in the same change.
   */
  readonly labourVatBasis: 'gross'
  readonly labour: LabourRates
}

/**
 * Defaults until IMP-21 loads a maker's own card.
 *
 * Margin 25–35 %, applied at 30 %: a PLACEHOLDER. No maker margin or overhead
 * figure exists in context/, LOOP, PLAN, WORKLOG or data/. The only number in
 * the repo is the 2026-10-02 audit's unsourced example (30–45 % on material +
 * make). Its lower bound is applied, and the top of the band is kept under its
 * 45 %, because hardware, accessories and lighting are already retail prices
 * with VAT (a margin on them sits on top of a retailer's margin) and labour's
 * VAT basis is unconfirmed. See WORKLOG 2026-10-03 IMP-04.
 */
export const DEFAULT_RATE_CARD: RateCard = {
  workshopMargin: { low: 0.25, high: 0.35, basis: 'markup_on_cost' },
  bandFloorHalfPct: 10,
  labourVatBasis: 'gross',
  labour: LABOUR_RATES,
}

/** The one margin figure the estimate applies: the band's midpoint. */
export function appliedMargin(rc: RateCard): number {
  return (rc.workshopMargin.low + rc.workshopMargin.high) / 2
}

/** The same card with no workshop margin: what the kitchen costs the shop.
 * Used for the maker-only cost basis, never for a homeowner figure. */
export function withoutMargin(rc: RateCard): RateCard {
  return { ...rc, workshopMargin: { ...rc.workshopMargin, low: 0, high: 0 } }
}
