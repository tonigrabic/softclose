/**
 * The range is what the homeowner will pay (IMP-04, Decision 1 2026-10-03).
 *
 *  - Every Elgrad source includes PDV, and its catalog file says so, so
 *    computeBom grosses nothing up. A source that turned net would understate
 *    the range by 25 %; the metadata is the tripwire.
 *  - The workshop margin from the rate card goes on material + make, as ONE
 *    factor on both ends of each line, so it moves the money without widening
 *    the band. Install and goods carry none.
 *  - The net cost and the margin are maker-only: computed, stored with the
 *    brief, and stripped from every response the homeowner's client receives.
 */
import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { CONTRACT_FIXTURES } from '@/lib/builder/fixtures'
import { floorPlanToLayout } from '@/lib/contract/layout-contract'
import { hydrateFromHypothesis } from '@/lib/builder/state'
import { computeBom, type BomEstimate, type BomLineItem } from '@/lib/builder/bom'
import { DEFAULT_RATE_CARD, LABOUR_RATES, appliedMargin, withoutMargin } from '@/lib/catalog/rate-card'
import { buildHandoffBundle, toCustomerBundle } from '@/lib/handoff/bundle'
import type { BuilderState } from '@/lib/builder/inventory'

const ROOT = resolve(__dirname, '..')
const NET = withoutMargin(DEFAULT_RATE_CARD)
const FACTOR = 1 + appliedMargin(DEFAULT_RATE_CARD)

function fixtureState(id: string, makerSupplies = false): BuilderState {
  const f = CONTRACT_FIXTURES.find((x) => x.id === id)!
  const s = hydrateFromHypothesis(null, { layoutContract: floorPlanToLayout(f.build()) })
  if (!makerSupplies) return s
  return {
    ...s,
    appliances: { ...s.appliances, supply: 'maker_supplies' },
    sinkTaps: { ...s.sinkTaps, supply: 'maker_supplies' },
  }
}

function confirmEverything(state: BuilderState): BuilderState {
  const s = structuredClone(state)
  for (const group of Object.values(s)) {
    if (group && typeof group === 'object' && 'meta' in group) {
      const meta = (group as { meta: Record<string, { confidence: 'H'; provenance: string }> }).meta
      for (const k of Object.keys(meta)) meta[k] = { confidence: 'H', provenance: 'homeowner-confirmed' }
    }
  }
  return s
}

const takesMargin = (l: BomLineItem) =>
  l.section === 'works' && (l.worksKind === 'material' || l.worksKind === 'make')
const sumWorks = (bom: BomEstimate) =>
  bom.lineItems
    .filter((l) => l.section === 'works')
    .reduce((a, l) => ({ low: a.low + l.low, high: a.high + l.high }), { low: 0, high: 0 })

describe('rate card defaults', () => {
  test('applied margin is the midpoint of the band, 30 % on cost', () => {
    expect(DEFAULT_RATE_CARD.workshopMargin).toMatchObject({ low: 0.25, high: 0.35, basis: 'markup_on_cost' })
    expect(appliedMargin(DEFAULT_RATE_CARD)).toBeCloseTo(0.3, 10)
    expect(appliedMargin(NET)).toBe(0)
  })

  test('labour rates moved unchanged from bom.ts (IMP-21 seeds its default row from them)', () => {
    expect(DEFAULT_RATE_CARD.labour).toBe(LABOUR_RATES)
    expect(LABOUR_RATES).toEqual({
      designPerHour: 30,
      designHoursPerCarcass: 0.8,
      cncPerPosition: 1,
      positionsPerCarcass: 8,
      assemblyPerCarcass: 15,
      installPerMetre: 75,
    })
  })
})

describe('margin on material + make, nothing else', () => {
  for (const f of CONTRACT_FIXTURES) {
    test(`${f.id}: each material/make line = round(net line × ${FACTOR}); install and goods untouched`, () => {
      const state = fixtureState(f.id, true)
      const gross = computeBom(state)
      const net = computeBom(state, undefined, { rates: NET })
      expect(gross.lineItems.map((l) => l.key)).toEqual(net.lineItems.map((l) => l.key))
      expect(gross.lineItems.some((l) => l.section === 'goods')).toBe(true)
      gross.lineItems.forEach((g, i) => {
        const n = net.lineItems[i]
        if (takesMargin(g)) {
          expect([g.low, g.high], g.key).toEqual([Math.round(n.low * FACTOR), Math.round(n.high * FACTOR)])
        } else {
          expect([g.low, g.high], g.key).toEqual([n.low, n.high])
        }
      })
      // Goods are the homeowner's products at shelf price, incl. PDV already.
      expect(gross.sections.goods).toEqual(net.sections.goods)
    })
  }
})

describe('maker-only net cost and margin', () => {
  for (const f of CONTRACT_FIXTURES) {
    test(`${f.id}: net = the works at cost; net + margin = the works lines`, () => {
      const state = fixtureState(f.id)
      const gross = computeBom(state)
      const net = computeBom(state, undefined, { rates: NET })
      expect(gross.makerOnly.net).toEqual(sumWorks(net))
      const lines = sumWorks(gross)
      expect(gross.makerOnly.margin).toEqual({
        low: lines.low - gross.makerOnly.net.low,
        high: lines.high - gross.makerOnly.net.high,
      })
      expect(gross.makerOnly.margin.low).toBeGreaterThan(0)
      expect(gross.makerOnly.marginPct).toBe(30)
      expect(net.makerOnly.margin).toEqual({ low: 0, high: 0 })
    })
  }
})

describe('the lines add up to the headline unless the band was clamped', () => {
  for (const f of CONTRACT_FIXTURES) {
    for (const [label, build] of [
      ['untouched', (s: BuilderState) => s],
      ['confirmed', confirmEverything],
    ] as const) {
      test(`${f.id} ${label}`, () => {
        const bom = computeBom(build(fixtureState(f.id)))
        const w = bom.sections.works
        if (w.bandCapped || w.bandFloored) {
          // Clamped to the cap (±20) or the floor (±10): the lines are the
          // honest components, the headline is the clamped band around them.
          const half = Math.round(w.bandWidthPct / 2)
          expect(w.bandFloored ? half === 10 : half === 20).toBe(true)
        } else {
          expect({ low: w.low, high: w.high }).toEqual(sumWorks(bom))
        }
      })
    }
  }
})

describe('every Elgrad source is gross (incl. PDV)', () => {
  const files = [
    'src/lib/catalog/elgrad-decors.json',
    'src/lib/catalog/elgrad-decors-raw.json',
    'src/lib/catalog/elgrad-services.json',
    'src/lib/catalog/elgrad-products.json',
  ]
  for (const file of files) {
    test(file, () => {
      const json = JSON.parse(readFileSync(resolve(ROOT, file), 'utf8'))
      expect(json.source.vatBasis).toBe('gross')
      expect(json.source.vatBasisSource).toMatch(/2026-10-03/)
    })
  }

  // The generated files are rewritten by scripts; each writer must keep the basis.
  for (const script of ['scripts/parse-elgrad-cjenik.mjs', 'scripts/build-elgrad-catalog.mjs']) {
    test(`${script} writes vatBasis: 'gross'`, () => {
      expect(readFileSync(resolve(ROOT, script), 'utf8')).toMatch(/vatBasis:\s*'gross'/)
    })
  }
  test('scripts/refresh-elgrad-curated.mjs carries the basis from the raw parse', () => {
    expect(readFileSync(resolve(ROOT, 'scripts/refresh-elgrad-curated.mjs'), 'utf8')).toMatch(
      /vatBasis:\s*raw\.source\?\.vatBasis/
    )
  })
})

describe('maker-only money never reaches the homeowner client', () => {
  test('the stored bundle carries net cost and margin; the customer copy does not', () => {
    const bundle = buildHandoffBundle({ brief: { builderState: fixtureState('l-shape', true) } })
    expect(bundle.estimate!.maker).toBeDefined()
    expect(bundle.estimate!.priceBasis).toBe('gross-margin-v1')
    // makerCost only exists once a maker pricelist is in; set it to prove the strip.
    bundle.estimate!.makerCost = { low: 1, high: 2 }

    const customer = toCustomerBundle(bundle)
    expect(customer.estimate).not.toHaveProperty('maker')
    expect(customer.estimate).not.toHaveProperty('makerCost')
    expect(JSON.stringify(customer)).not.toMatch(/"maker(Cost)?":/)
    // The homeowner's figures are untouched, and the original is not mutated.
    expect(customer.estimate!.low).toBe(bundle.estimate!.low)
    expect(customer.estimate!.lines).toEqual(bundle.estimate!.lines)
    expect(customer.estimate!.priceBasis).toBe('gross-margin-v1')
    expect(bundle.estimate!.maker).toBeDefined()
    expect(bundle.estimate!.makerCost).toBeDefined()
  })

  test('no estimate: the bundle passes through', () => {
    const bundle = buildHandoffBundle({ brief: {} })
    expect(toCustomerBundle(bundle).estimate).toBeNull()
  })

  test('/api/handoff answers only with the customer copy', () => {
    const route = readFileSync(resolve(ROOT, 'src/app/api/handoff/route.ts'), 'utf8')
    const responses = route.match(/Response\.json\(\s*[^{(][^)]*\)/g) ?? []
    expect(responses.length).toBeGreaterThan(0)
    for (const r of responses) expect(r).toMatch(/^Response\.json\(toCustomerBundle\(/)
    expect(route).not.toMatch(/Response\.json\(\s*bundle\s*\)/)
  })
})
