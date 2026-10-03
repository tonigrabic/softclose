/**
 * The one range line (IMP-04): `low – high · ±pct · who confirms it`, then the
 * assumptions. The live panel and the mobile dock render it today; the
 * wrap-up, kitchen home, dashboard and brief follow.
 *
 *  - no range (the builder was skipped, IMP-01) renders the fallback, never 0 €;
 *  - a missing band leaves the ± out instead of inventing ±20;
 *  - a brief without assumptions still states the legacy ones;
 *  - no VAT or margin line, and no "0 € – 0 €" goods row when the homeowner
 *    buys the appliances.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { RangeLine, type RangeLineProps } from '@/components/range/RangeLine'
import { LiveBOMPanel } from '@/components/builder/LiveBOMPanel'
import { MobileRangeDock } from '@/components/builder/MobileRangeDock'
import { CONTRACT_FIXTURES } from '@/lib/builder/fixtures'
import { floorPlanToLayout } from '@/lib/contract/layout-contract'
import { hydrateFromHypothesis } from '@/lib/builder/state'
import { hrHR } from '@/lib/i18n/locales/hr-HR'
import type { BuilderState } from '@/lib/builder/inventory'

const NBSP = ' '
const RANGE = { low: 5291, high: 7376, bandPct: 14, assumptions: ['installIncluded', 'noTrades'] }

// Static render: the locale store answers with its server snapshot, hr-HR.
const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&')
const line = (props: Partial<RangeLineProps>) =>
  text(renderToStaticMarkup(createElement(RangeLine, { range: RANGE, voice: 'homeowner', ...props })))

function lShape(makerSupplies = false): BuilderState {
  const f = CONTRACT_FIXTURES.find((x) => x.id === 'l-shape')!
  const s = hydrateFromHypothesis(null, { layoutContract: floorPlanToLayout(f.build()) })
  if (!makerSupplies) return s
  return {
    ...s,
    appliances: { ...s.appliances, supply: 'maker_supplies' },
    sinkTaps: { ...s.sinkTaps, supply: 'maker_supplies' },
  }
}

describe('RangeLine', () => {
  test('rounded figures, the ±, who confirms it, then the assumptions', () => {
    const out = line({ makerName: 'Stolarija Horvat' })
    expect(out).toContain(`5.300${NBSP}€ – 7.400${NBSP}€`)
    expect(out).toContain(`±14${NBSP}%`)
    expect(out).toContain('raspon koji Stolarija Horvat potvrđuje')
    expect(out).toContain('montaža uključena')
    expect(out).toContain('bez elektro i vodoinstalaterskih radova')
    expect(out.indexOf('potvrđuje')).toBeLessThan(out.indexOf('montaža uključena'))
  })

  test('no maker name: "your maker", lower case mid-sentence', () => {
    expect(line({})).toContain('raspon koji tvoj izrađivač potvrđuje')
    expect(line({ makerName: '   ' })).toContain('raspon koji tvoj izrađivač potvrđuje')
  })

  test('the maker reads it in the second person', () => {
    const out = line({ voice: 'maker', makerName: 'Stolarija Horvat' })
    expect(out).toContain(hrHR['range.confirms.maker'])
    expect(out).not.toContain('Stolarija Horvat')
  })

  test('no range renders the fallback, and nothing by default', () => {
    expect(renderToStaticMarkup(createElement(RangeLine, { range: null, voice: 'homeowner' }))).toBe('')
    const fb = renderToStaticMarkup(
      createElement(RangeLine, { range: null, voice: 'homeowner', fallback: createElement('p', null, 'nema raspona') })
    )
    expect(fb).toBe('<p>nema raspona</p>')
  })

  test('a missing band leaves the ± out rather than guessing 20', () => {
    const out = line({ range: { low: 5291, high: 7376 } })
    expect(out).not.toContain('±')
    expect(out).toContain('raspon koji tvoj izrađivač potvrđuje')
  })

  test('a brief stored without assumptions states the legacy ones', () => {
    const out = line({ range: { low: 5291, high: 7376, bandPct: 14 } })
    for (const k of ['installIncluded', 'noDemolition', 'noTrades', 'siteCheckByMaker'] as const) {
      expect(out).toContain(hrHR[`range.assumption.${k}`])
    }
  })

  test('compact: one line of figures, one clamped line of caveats', () => {
    const html = renderToStaticMarkup(
      createElement(RangeLine, { range: RANGE, voice: 'homeowner', size: 'compact' })
    )
    expect(html).toContain('data-range-line="compact"')
    expect(html).toMatch(/class="[^"]*truncate[^"]*"[^>]*>raspon koji tvoj izrađivač potvrđuje · montaža uključena/)
    // Phrasing elements only: the dock puts it inside a <button>.
    expect(html).not.toMatch(/<(div|p|ul|li)[ >]/)
  })

  test('never a VAT or margin line', () => {
    expect(line({ makerName: 'Stolarija Horvat' })).not.toMatch(/PDV|\bVAT\b|marž|margin/i)
  })
})

describe('live panel and dock', () => {
  const panel = (state: BuilderState, makerName?: string) =>
    renderToStaticMarkup(createElement(LiveBOMPanel, { state, makerName }))
  const dock = (state: BuilderState, makerName?: string) =>
    renderToStaticMarkup(createElement(MobileRangeDock, { state, makerName }))

  test('the panel headline is the range line, with the maker named', () => {
    const html = panel(lShape(), 'Stolarija Horvat')
    expect(html).toContain('data-range-line="lg"')
    expect(text(html)).toContain('raspon koji Stolarija Horvat potvrđuje')
    expect(text(html)).toContain('uređaje nabavlja kupac')
  })

  test('homeowner buys the appliances: no goods row, no "0 € – 0 €", no total with appliances', () => {
    const out = text(panel(lShape()))
    expect(out).not.toContain(hrHR['builder.shell.bom.goods'])
    expect(out).not.toContain(hrHR['builder.shell.bom.totalWithGoods'])
    expect(out).not.toContain(`0${NBSP}€ – 0${NBSP}€`)
  })

  test('maker supplies them: the goods row and the total come back', () => {
    const out = text(panel(lShape(true)))
    expect(out).toContain(hrHR['builder.shell.bom.goods'])
    expect(out).toContain(hrHR['builder.shell.bom.totalWithGoods'])
    expect(out).toContain('uređaji se obračunavaju zasebno')
  })

  test('the dock shows the same range line, compact', () => {
    const html = dock(lShape(), 'Stolarija Horvat')
    expect(html).toContain('data-range-line="compact"')
    expect(text(html)).toContain('raspon koji Stolarija Horvat potvrđuje')
  })

  test('neither prints a VAT or margin line, or the old disclaimer', () => {
    for (const html of [panel(lShape(true)), dock(lShape(true))]) {
      expect(text(html)).not.toMatch(/PDV|\bVAT\b|marž|margin|konačnu cijenu/i)
    }
  })
})
