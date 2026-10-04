/**
 * The maker's side of IMP-04: the dashboard row and the brief print the same
 * range line as every homeowner surface (rounded, ±, "raspon koji ti
 * potvrđuješ", the assumptions), and the brief alone shows what the range is
 * made of: the works at cost, the workshop margin, the homeowner's range.
 *
 *  - the maker-only block renders only from the stored bundle; the customer's
 *    copy (toCustomerBundle) has nothing to render it from;
 *  - a brief priced before IMP-04 (no priceBasis) is flagged as the old,
 *    no-margin calculation;
 *  - no compact "5k €" headline and no per-surface rounding left.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { MakerDashboardPreview } from '@/components/kitchen-intake/MakerDashboardPreview'
import { DashboardListRow, type DashboardItem } from '@/app/dashboard/DashboardList'
import { buildHandoffBundle, toCustomerBundle } from '@/lib/handoff/bundle'
import { formatRange, LEGACY_ASSUMPTIONS } from '@/lib/builder/range'
import { CONTRACT_FIXTURES } from '@/lib/builder/fixtures'
import { floorPlanToLayout } from '@/lib/contract/layout-contract'
import { hydrateFromHypothesis } from '@/lib/builder/state'
import { hrHR } from '@/lib/i18n/locales/hr-HR'
import type { BuilderState } from '@/lib/builder/inventory'
import type { HandoffBundle } from '@/lib/types'

const NBSP = ' '
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/[ \t\n\r]+/g, ' ')

function lShape(makerSupplies = false): BuilderState {
  const f = CONTRACT_FIXTURES.find((x) => x.id === 'l-shape')!
  const s = hydrateFromHypothesis(null, { layoutContract: floorPlanToLayout(f.build()) })
  if (!makerSupplies) return s
  return { ...s, appliances: { ...s.appliances, supply: 'maker_supplies' } }
}

const brief = (bundle: HandoffBundle) =>
  renderToStaticMarkup(createElement(MakerDashboardPreview, { bundle, hideActions: true }))

describe('the brief', () => {
  const stored = buildHandoffBundle({ brief: { name: 'Ana', builderState: lShape() } })
  const e = stored.estimate!

  test('the range line in the maker voice, with the same rounding as the homeowner', () => {
    const out = text(brief(stored))
    expect(out).toContain(formatRange(e))
    expect(out).toContain(`±${e.bandPct}${NBSP}%`)
    expect(out).toContain(hrHR['range.confirms.maker'])
    expect(out).toContain(hrHR['range.assumption.installIncluded'])
    expect(out).toContain(hrHR['range.assumption.noDemolition'])
    // The compact "5k €" headline is gone.
    expect(out).not.toMatch(/\dk €/)
  })

  test('the stored brief shows net cost, margin and the homeowner range', () => {
    const html = brief(stored)
    expect(html).toContain('data-maker-only-money')
    const out = text(html)
    const m = e.maker!
    expect(out).toContain(hrHR['maker.estimate.net'])
    expect(out).toContain(formatRange(m.net))
    expect(out).toContain(hrHR['maker.estimate.margin'].replace('{pct}', String(m.marginPct)))
    expect(out).toContain(formatRange(m.margin))
    expect(out).toContain(hrHR['maker.estimate.homeownerRange'])
    expect(out).toContain(hrHR['maker.estimate.marginNote'])
    expect(html).not.toContain('data-legacy-basis')
  })

  test('the customer copy of the bundle renders no maker-only money (the funnel demo)', () => {
    const html = brief(toCustomerBundle(stored))
    expect(html).not.toContain('data-maker-only-money')
    expect(text(html)).not.toContain(hrHR['maker.estimate.net'])
    // Still the same range line.
    expect(text(html)).toContain(formatRange(e))
  })

  test('a brief priced before IMP-04 is flagged as the old calculation, with the legacy assumptions', () => {
    const legacy: HandoffBundle = {
      ...stored,
      estimate: { low: e.low, high: e.high, withAppliances: null, basis: e.basis, bandPct: e.bandPct, lines: e.lines },
    }
    const html = brief(legacy)
    expect(html).toContain('data-legacy-basis')
    const out = text(html)
    expect(out).toContain(hrHR['maker.estimate.legacyBasis'])
    expect(out).toContain(hrHR['maker.estimate.legacyBasisNote'])
    for (const a of LEGACY_ASSUMPTIONS) expect(out).toContain(hrHR[`range.assumption.${a}`])
    expect(html).not.toContain('data-maker-only-money')
  })

  test('the figure with appliances prints through formatRange', () => {
    const withGoods = buildHandoffBundle({ brief: { name: 'Ana', builderState: lShape(true) } })
    expect(withGoods.estimate!.withAppliances).not.toBeNull()
    const out = text(brief(withGoods))
    expect(out).toContain(hrHR['maker.estimate.kitchenOnly'])
    expect(out).toContain(hrHR['range.withGoods.appliances'])
    expect(out).toContain(formatRange(withGoods.estimate!.withAppliances!))
  })

  // IMP-04 review: only the sink and tap are the maker's; the brief said "S nabavom uređaja".
  test('only the sink and tap with the maker: the figure says so, not "appliances"', () => {
    const s = lShape()
    const sinkOnly = buildHandoffBundle({
      brief: { name: 'Ana', builderState: { ...s, sinkTaps: { ...s.sinkTaps, supply: 'maker_supplies' } } },
    })
    const out = text(brief(sinkOnly))
    expect(out).toContain(`${hrHR['range.withGoods.sinkTaps']} ${formatRange(sinkOnly.estimate!.withAppliances!)}`)
    expect(out).toContain(hrHR['range.assumption.appliancesByHomeowner'])
    expect(out).not.toContain(hrHR['range.withGoods.appliances'])
    expect(out).not.toMatch(/nabav\w* uređaja/i)
  })

  test('no build: no range line, the no-range copy', () => {
    const noBuild = buildHandoffBundle({ brief: { name: 'Ana' } })
    const html = brief(noBuild)
    expect(html).not.toContain('data-range-line')
    expect(text(html)).toContain(hrHR['maker.estimate.noneLive'])
  })
})

describe('the dashboard row', () => {
  const item = (range: DashboardItem['range']): DashboardItem => ({
    projectId: 'p1',
    customerName: 'Ana',
    customerEmail: 'ana@example.com',
    display: 'submitted',
    stepLabel: null,
    updatedLabel: 'prije 5 minuta',
    briefId: 'b1',
    range,
    quoted: false,
    decision: null,
    quotedLabel: null,
    group: 'attention',
  })
  const row = (range: DashboardItem['range']) =>
    renderToStaticMarkup(createElement(DashboardListRow, { item: item(range) }))

  test('the compact range line: rounded, ±, the maker voice, the assumptions', () => {
    const html = row({ low: 5291, high: 7376, bandPct: 14, assumptions: ['installIncluded', 'noTrades'] })
    expect(html).toContain('data-range-line="compact"')
    const out = text(html)
    expect(out).toContain(`5.300${NBSP}€ – 7.400${NBSP}€`)
    expect(out).toContain(`±14${NBSP}%`)
    expect(out).toContain(hrHR['range.confirms.maker'])
    expect(out).toContain(hrHR['range.assumption.noTrades'])
    // Was "5.291 – 7.376 €": printed to the euro.
    expect(out).not.toContain('5.291')
  })

  test('no range (no build or no brief): nothing, never 0 €', () => {
    const html = row(null)
    expect(html).not.toContain('data-range-line')
    expect(html).not.toContain('€')
  })
})
