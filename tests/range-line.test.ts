/**
 * The one range line (IMP-04): `low – high · ±pct · who confirms it`, then the
 * assumptions. The live panel, the mobile dock, the wrap-up and the kitchen
 * home render it; the dashboard and the brief follow.
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
import { WrapUpEstimate } from '@/components/kitchen-intake/WrapUpScreen'
import { KitchenHome, type KitchenHomeProps } from '@/app/kitchen/[projectId]/KitchenHome'
import { buildHandoffBundle, toCustomerBundle } from '@/lib/handoff/bundle'
import { formatRange, goodsHeld, groupEstimateLines, withGoodsKey } from '@/lib/builder/range'
import type { BomLineItem } from '@/lib/builder/bom'
import type { HandoffEstimate } from '@/lib/types'
import { CONTRACT_FIXTURES } from '@/lib/builder/fixtures'
import { floorPlanToLayout } from '@/lib/contract/layout-contract'
import { hydrateFromHypothesis } from '@/lib/builder/state'
import { hrHR } from '@/lib/i18n/locales/hr-HR'
import { enUS } from '@/lib/i18n/locales/en-US'
import { formatDecisionDate } from '@/lib/project/decision'
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

/** The homeowner buys the appliances (the default) and leaves only the sink and tap with the maker. */
function lShapeSinkOnly(): BuilderState {
  const s = lShape()
  return { ...s, sinkTaps: { ...s.sinkTaps, supply: 'maker_supplies' } }
}

const WITH_APPLIANCES = hrHR['range.withGoods.appliances']
const WITH_SINK = hrHR['range.withGoods.sinkTaps']
const WITH_BOTH = hrHR['range.withGoods.both']

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

  // The rail (AppShell) is the sticky, scrolling box. A sticky panel inside it
  // stayed pinned over the cards below and took the re-render button's clicks,
  // and the open line list alone was taller than a laptop screen.
  test('the panel is not sticky in the rail, and its lines fold away under their count', () => {
    const html = panel(lShape())
    expect(html.match(/<aside[^>]*>/)![0]).not.toMatch(/\bsticky\b/)
    const details = html.match(/<details\b[^>]*>[\s\S]*<\/details>/)![0]
    expect(details).not.toMatch(/^<details[^>]*\bopen\b/)
    const lines = (details.match(/<li\b/g) ?? []).length
    expect(lines).toBeGreaterThan(0)
    expect(text(details)).toContain(hrHR['builder.shell.bom.lines'].replace('{n}', String(lines)))
  })

  test('homeowner buys the appliances: no goods row, no "0 € – 0 €", no total with appliances', () => {
    const out = text(panel(lShape()))
    expect(out).not.toContain(hrHR['builder.shell.bom.goods'])
    for (const label of [WITH_APPLIANCES, WITH_SINK, WITH_BOTH]) expect(out).not.toContain(label)
    expect(out).not.toContain(`0${NBSP}€ – 0${NBSP}€`)
  })

  test('maker supplies them: the goods row and the total come back, labelled by what they hold', () => {
    const out = text(panel(lShape(true)))
    expect(out).toContain(hrHR['builder.shell.bom.goods'])
    expect(out).toContain(WITH_BOTH)
    expect(out).toContain('uređaji se obračunavaju zasebno')
  })

  // IMP-04 review: the homeowner buys the appliances, the maker only the sink
  // and tap. The total must not say "with appliances" under "uređaje nabavlja kupac".
  test('maker supplies only the sink and tap: "with sink and tap", never "with appliances"', () => {
    const state = lShapeSinkOnly()
    for (const html of [panel(state), renderToStaticMarkup(createElement(MobileRangeDock, { state }))]) {
      const out = text(html)
      expect(out).toContain('uređaje nabavlja kupac')
      expect(out).not.toContain('uređaji se obračunavaju zasebno')
      expect(out).not.toContain(WITH_APPLIANCES)
      expect(out).not.toContain(WITH_BOTH)
    }
    // The dock's total sits in its collapsed drawer; the panel prints it.
    expect(text(panel(state))).toContain(WITH_SINK)
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

describe('groupEstimateLines', () => {
  const line = (l: Partial<BomLineItem> & Pick<BomLineItem, 'key' | 'section'>): BomLineItem => ({
    detail: '',
    quantity: '',
    low: 100,
    high: 120,
    ...l,
  })

  test('material, make, install, goods, project — in that order, lines in their own order', () => {
    const groups = groupEstimateLines([
      line({ key: 'install', section: 'works', worksKind: 'install' }),
      line({ key: 'appliances', section: 'goods', low: 900, high: 1200 }),
      line({ key: 'fronts', section: 'works', worksKind: 'material' }),
      line({ key: 'cnc', section: 'works', worksKind: 'make' }),
      line({ key: 'boards', section: 'works', worksKind: 'material', low: 200, high: 260 }),
      line({ key: 'demolition', section: 'project', low: 400, high: 1500 }),
    ])
    expect(groups.map((g) => g.id)).toEqual(['material', 'make', 'install', 'goods', 'project'])
    // Only material, make and install make up the headline range.
    expect(groups.map((g) => g.inRange)).toEqual([true, true, true, false, false])
    expect(groups[0].lines.map((l) => l.key)).toEqual(['fronts', 'boards'])
    expect(groups[0]).toMatchObject({ low: 300, high: 380, exact: false })
  })

  test('0 € lines and empty groups are dropped; no lines → no groups', () => {
    const groups = groupEstimateLines([
      line({ key: 'fronts', section: 'works', worksKind: 'material' }),
      line({ key: 'sinkTaps', section: 'goods', low: 0, high: 0 }),
    ])
    expect(groups.map((g) => g.id)).toEqual(['material'])
    expect(groupEstimateLines(undefined)).toEqual([])
    expect(groupEstimateLines(null)).toEqual([])
  })

  test('a group of picked catalog prices is exact', () => {
    const [goods] = groupEstimateLines([
      line({ key: 'appliances', section: 'goods', exact: true, low: 1500, high: 1500 }),
      line({ key: 'sinkTaps', section: 'goods', exact: true, low: 320, high: 320 }),
    ])
    expect(goods).toMatchObject({ id: 'goods', low: 1820, high: 1820, exact: true })
  })
})

describe('goodsHeld: the figure with goods is labelled by what it adds', () => {
  const goods = (key: string, high = 300) => ({ key, section: 'goods' as const, high })
  test('appliances, sink and tap, or both; 0 € lines do not count', () => {
    expect(goodsHeld([goods('appliances')])).toBe('appliances')
    expect(goodsHeld([goods('sinkTaps')])).toBe('sinkTaps')
    expect(goodsHeld([goods('appliances'), goods('sinkTaps')])).toBe('both')
    expect(goodsHeld([goods('appliances', 0), goods('sinkTaps')])).toBe('sinkTaps')
    expect(withGoodsKey([goods('sinkTaps')])).toBe('range.withGoods.sinkTaps')
  })
  test('a brief stored without lines keeps the label it was sent with', () => {
    expect(goodsHeld(undefined)).toBe('appliances')
    expect(goodsHeld(null)).toBe('appliances')
  })
})

describe('wrap-up', () => {
  const estimateFor = (state: BuilderState): HandoffEstimate =>
    toCustomerBundle(buildHandoffBundle({ brief: { builderState: state } })).estimate!
  const wrapUp = (estimate: HandoffEstimate, makerName?: string) =>
    renderToStaticMarkup(createElement(WrapUpEstimate, { estimate, makerName }))

  test('the headline is the range line: rounded, ±, the maker named, the assumptions', () => {
    const est = estimateFor(lShape())
    const html = wrapUp(est, 'Stolarija Horvat')
    expect(html).toContain('data-range-line="lg"')
    const out = text(html)
    expect(out).toContain(hrHR['wrapup.estimate.kitchenLabel'])
    expect(out).toContain(formatRange(est))
    expect(out).toContain(`±${est.bandPct}${NBSP}%`)
    expect(out).toContain('raspon koji Stolarija Horvat potvrđuje')
    expect(out).toContain('uređaje nabavlja kupac')
    expect(out).toContain(hrHR['range.assumption.siteCheckByMaker'])
  })

  test('the build line by line, grouped material → make → install, each group with its subtotal', () => {
    const est = estimateFor(lShape())
    const html = wrapUp(est)
    const order = [...html.matchAll(/data-estimate-group="(\w+)"/g)].map((m) => m[1])
    expect(order).toEqual(['material', 'make', 'install'])
    const out = text(html)
    expect(out).toContain(hrHR['wrapup.estimate.linesTitle'])
    for (const g of groupEstimateLines(est.lines)) {
      expect(out).toContain(`${hrHR[`builder.shell.bom.${g.id}` as const]}${formatRange(g)}`)
    }
    // Every priced line, by name and quantity.
    for (const l of est.lines!.filter((x) => x.high > 0)) {
      expect(out).toContain(hrHR[`bom.lineItem.${l.key}` as keyof typeof hrHR])
      expect(out).toContain(l.quantity)
    }
  })

  test('homeowner buys the appliances: no goods group, no figure with appliances, no "0 € – 0 €"', () => {
    const html = wrapUp(estimateFor(lShape()))
    const out = text(html)
    expect(out).not.toContain(hrHR['builder.shell.bom.goods'])
    expect(out).not.toContain(hrHR['wrapup.estimate.outsideTitle'])
    expect(html).not.toContain('data-estimate-outside')
    for (const label of [WITH_APPLIANCES, WITH_SINK, WITH_BOTH]) expect(out).not.toContain(label)
    expect(out).not.toContain(`0${NBSP}€ – 0${NBSP}€`)
  })

  test('maker supplies them: the goods sit outside the range, closed by the kitchen with them; never "Sve uključeno"', () => {
    const est = estimateFor(lShape(true))
    const html = wrapUp(est)
    const out = text(html)
    expect(out).toContain(`${WITH_BOTH}${formatRange(est.withAppliances!)}`)
    expect(out).toContain(hrHR['builder.shell.bom.goods'])
    expect(out).toContain('uređaji se obračunavaju zasebno')
    expect(out).not.toMatch(/Sve uključeno|PDV|\bVAT\b|marž|margin/i)
  })

  // IMP-04 review: "Od čega se raspon sastoji" listed the goods too, so the
  // homeowner was told appliances both make up the range and are priced apart.
  test('"what makes up the range" holds material, make and install only; the goods come after, under their own heading', () => {
    const est = estimateFor(lShape(true))
    const html = wrapUp(est)
    const inRange = html.slice(html.indexOf('data-estimate-lines'), html.indexOf('data-estimate-outside'))
    const outside = html.slice(html.indexOf('data-estimate-outside'))
    expect([...inRange.matchAll(/data-estimate-group="(\w+)"/g)].map((m) => m[1])).toEqual([
      'material',
      'make',
      'install',
    ])
    expect(text(inRange)).toContain(hrHR['wrapup.estimate.linesTitle'])
    expect(text(inRange)).not.toContain(hrHR['builder.shell.bom.goods'])
    expect([...outside.matchAll(/data-estimate-group="(\w+)"/g)].map((m) => m[1])).toEqual(['goods'])
    const outText = text(outside)
    expect(outText.indexOf(hrHR['wrapup.estimate.outsideTitle'])).toBeGreaterThanOrEqual(0)
    expect(outText.indexOf(hrHR['builder.shell.bom.goods'])).toBeGreaterThan(
      outText.indexOf(hrHR['wrapup.estimate.outsideTitle'])
    )
    expect(outText.indexOf(WITH_BOTH)).toBeGreaterThan(outText.indexOf(hrHR['builder.shell.bom.goods']))
  })

  test('maker supplies only the sink and tap: "Kuhinja sa sudoperom i slavinom", never "s uređajima"', () => {
    const est = estimateFor(lShapeSinkOnly())
    expect(est.withAppliances).not.toBeNull()
    expect(est.assumptions).toContain('appliancesByHomeowner')
    const out = text(wrapUp(est))
    expect(out).toContain('uređaje nabavlja kupac')
    expect(out).toContain(`${WITH_SINK}${formatRange(est.withAppliances!)}`)
    expect(out).not.toContain(WITH_APPLIANCES)
    expect(out).not.toContain(WITH_BOTH)
  })

  test('a brief without a band or lines: no invented ±20, no lines block, the legacy assumptions', () => {
    const out = text(wrapUp({ low: 5291, high: 7376, withAppliances: null, basis: '' }))
    expect(out).toContain(`5.300${NBSP}€ – 7.400${NBSP}€`)
    expect(out).not.toContain('±')
    expect(out).not.toContain(hrHR['wrapup.estimate.linesTitle'])
    expect(out).toContain(hrHR['range.assumption.noDemolition'])
  })
})

describe('kitchen home', () => {
  const home = (props: Partial<KitchenHomeProps>) =>
    text(
      renderToStaticMarkup(
        createElement(KitchenHome, {
          projectId: 'p1',
          makerName: 'Stolarija Horvat',
          stepLabel: null,
          submittedAt: '2026-10-03T09:00:00Z',
          makerViewedAt: null,
          briefId: 'b1',
          range: { low: 5291, high: 7376, bandPct: 14, assumptions: ['installIncluded', 'noTrades'] },
          savedEstimate: null,
          decision: null,
          closed: false,
          started: true,
          revision: 1,
          readOnly: false,
          snapshot: null,
          customerEmail: null,
          customerName: null,
          ...props,
        })
      )
    )

  test('the stored range prints as the range line: rounded, ±, the maker, the assumptions', () => {
    const out = home({})
    expect(out).toContain(hrHR['kitchen.home.status.rangeLabel'])
    expect(out).toContain(`5.300${NBSP}€ – 7.400${NBSP}€`)
    expect(out).toContain(`±14${NBSP}%`)
    expect(out).toContain('raspon koji Stolarija Horvat potvrđuje')
    expect(out).toContain('bez elektro i vodoinstalaterskih radova')
  })

  test('no maker name: the heading says "Tvoj izrađivač", the range line "tvoj izrađivač"', () => {
    const out = home({ makerName: null })
    expect(out).toContain('Tvoj izrađivač ga još nije otvorio')
    expect(out).toContain('raspon koji tvoj izrađivač potvrđuje')
  })

  test('no range: the way to the builder, never a number', () => {
    const out = home({ range: null })
    expect(out).toContain(hrHR['kitchen.home.status.noRange'])
    expect(out).toContain(hrHR['kitchen.home.cta.build'])
    expect(out).not.toContain('€')
  })

  test('no range on a closed project: nothing to build, so nothing at all', () => {
    const out = home({ range: null, closed: true })
    expect(out).not.toContain(hrHR['kitchen.home.status.noRange'])
    expect(out).not.toContain('€')
  })

  // Seen 2026-10-04: "Poslano 04. 10. 2026.." — a Croatian date ends in a
  // full stop, and the line added its own.
  test('a date ends its sentence once: no ".." after the sent, seen or decision date', () => {
    const at = '2026-10-03T22:30:00Z' // 00:30 on the 4th in Zagreb
    const out = home({
      submittedAt: at,
      makerViewedAt: at,
      decision: { status: 'quoted', date: at, note: null },
    })
    const day = formatDecisionDate(at, 'hr-HR')
    expect(day).toMatch(/^0?4\. 10\. 2026\.$/)
    expect(out).toContain(`Poslano ${day}`)
    expect(out).toContain(`Stolarija Horvat je otvorio sažetak ${day}`)
    expect(out).toContain(`Stolarija Horvat: ponuda je poslana ${day}`)
    expect(out).not.toMatch(/\d\.\s?\./)
  })

  // The home dates in the language on screen, so each language's lines meet
  // only that language's dates.
  test('every {date} line, filled with its own language\'s date, ends in one full stop at most', () => {
    const day = (locale: string) => formatDecisionDate('2026-10-03T22:30:00Z', locale)
    for (const [locale, dict] of [['hr-HR', hrHR], ['en-US', enUS]] as const) {
      for (const [key, value] of Object.entries(dict)) {
        if (!value.includes('{date}')) continue
        expect(value.replace('{date}', day(locale)), `${locale} ${key}`).not.toContain('..')
      }
    }
  })
})
