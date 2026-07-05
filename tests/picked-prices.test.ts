/**
 * Picked models pin prices (product direction 2026-06-12).
 *
 * The estimate splits into `works` (the kitchen — always a range, the ±20%
 * promise lives there) and `goods` (appliances, sink + tap — exact once
 * every model is picked). Picking must therefore: (1) carry a catalog
 * price, (2) collapse the picked component to that exact price, (3) tighten
 * the total. The catalog itself must never ship a priceless product again —
 * that gap is why picking changed nothing for months.
 */
import { describe, expect, test } from 'vitest'
import { schachermayerProducts } from '@/lib/catalog/hardware'
import { assembleUnits } from '@/lib/builder/unit-assembly'
import { CONTRACT_FIXTURES } from '@/lib/builder/fixtures'
import { floorPlanToLayout } from '@/lib/contract/layout-contract'
import { hydrateFromHypothesis } from '@/lib/builder/state'
import { computeBom } from '@/lib/builder/bom'
import type { BuilderState } from '@/lib/builder/inventory'

function lShapeState(): BuilderState {
  const f = CONTRACT_FIXTURES.find((x) => x.id === 'l-shape')!
  return hydrateFromHypothesis(null, { layoutContract: floorPlanToLayout(f.build()) })
}

describe('catalog — every product carries a reference price', () => {
  for (const kind of ['hardware', 'sink_tap', 'appliance'] as const) {
    test(`${kind}: all products priced`, () => {
      const products = schachermayerProducts(kind)
      expect(products.length).toBeGreaterThan(0)
      for (const p of products) {
        expect(p.priceEur, `${p.brand ?? ''} ${p.name}`).toBeGreaterThan(0)
      }
    })
  }
})

describe('picked models make goods exact', () => {
  test('all appliances picked → appliances line is one exact number', () => {
    const state = structuredClone(lShapeState())
    state.appliances.selections = state.appliances.selections.map((s, i) => ({
      ...s,
      pickedSku: `sku-${i}`,
      pickedName: `Model ${i}`,
      pickedBrand: 'Test',
      pickedPriceEur: 400 + i * 100,
    }))
    const bom = computeBom(state)
    const line = bom.lineItems.find((l) => l.key === 'appliances')!
    const expected = state.appliances.selections.reduce((s, x) => s + (x.pickedPriceEur ?? 0), 0)
    expect(line.exact).toBe(true)
    expect(line.low).toBe(expected)
    expect(line.high).toBe(expected)
  })

  test('sink + tap picked → line exact; goods.allPicked once appliances follow', () => {
    const state = structuredClone(lShapeState())
    state.sinkTaps.sink.pickedPriceEur = 219
    state.sinkTaps.tap.pickedPriceEur = 119
    let bom = computeBom(state)
    const line = bom.lineItems.find((l) => l.key === 'sinkTaps')!
    expect(line.exact).toBe(true)
    expect(line.low).toBe(338)
    expect(line.high).toBe(338)
    expect(bom.sections.goods.allPicked).toBe(false) // appliances still estimated

    state.appliances.selections = state.appliances.selections.map((s) => ({
      ...s,
      pickedPriceEur: 500,
    }))
    bom = computeBom(state)
    expect(bom.sections.goods.allPicked).toBe(true)
    expect(bom.sections.goods.low).toBe(bom.sections.goods.high)
  })

  test('one pick already tightens — partial picks narrow the total band', () => {
    const base = lShapeState()
    const unpicked = computeBom(base)

    const picked = structuredClone(base)
    picked.sinkTaps.sink.pickedPriceEur = 219
    const after = computeBom(picked)
    expect(after.total.high - after.total.low).toBeLessThan(unpicked.total.high - unpicked.total.low)
  })
})

describe('picked hardware tightens the works line', () => {
  test('drawer system + hinge picked → hardware line strictly narrower', () => {
    const base = lShapeState()
    // Seed units the way the builder does, so the unit model is in play.
    const f = CONTRACT_FIXTURES.find((x) => x.id === 'l-shape')!
    const contract = floorPlanToLayout(f.build())
    base.cabinetBoxes.units = assembleUnits({ contract }).units
    const before = computeBom(base)
    const hwBefore = before.lineItems.find((l) => l.key === 'hardware')!

    const picked = structuredClone(base)
    picked.hardware.drawerSystemPriceEur = 38
    picked.hardware.hingePriceEur = 6.2
    const after = computeBom(picked)
    const hwAfter = after.lineItems.find((l) => l.key === 'hardware')!

    expect(hwAfter.high - hwAfter.low).toBeLessThan(hwBefore.high - hwBefore.low)
  })
})

describe('the works band keeps the ±20% promise on its own', () => {
  for (const f of CONTRACT_FIXTURES) {
    test(`${f.id}: works band ≤ ±20%`, () => {
      const contract = floorPlanToLayout(f.build())
      const bom = computeBom(hydrateFromHypothesis(null, { layoutContract: contract }))
      const w = bom.sections.works
      expect(Math.round(w.bandWidthPct / 2)).toBeLessThanOrEqual(20)
    })
  }
})
