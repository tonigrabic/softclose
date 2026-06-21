/**
 * Maker B2B pricing override (LOOP.md Q7 drop-in). Decision 2026-06-21:
 * homeowner sees retail, the maker side gets a cost basis. These guard the
 * SEAM's two invariants:
 *  1. It ships DORMANT — the pricelist is empty, so `pricing: 'maker'` is
 *     byte-for-byte identical to retail (no behaviour change until the maker
 *     populates maker-pricing.json).
 *  2. The lookup is null-safe for missing / unknown SKUs.
 * (The "with data" path can't be unit-tested without committing fake prices;
 * it's exercised by hand once the maker's real pricelist lands.)
 */
import { describe, expect, test } from 'vitest'
import { CONTRACT_FIXTURES } from '@/lib/builder/fixtures'
import { floorPlanToLayout } from '@/lib/contract/layout-contract'
import { hydrateFromHypothesis } from '@/lib/builder/state'
import { computeBom } from '@/lib/builder/bom'
import { makerPriceForSku, makerPricingEntryCount } from '@/lib/catalog/maker-pricing'

describe('maker pricing override — dormant by default', () => {
  test('the pricelist ships empty', () => {
    expect(makerPricingEntryCount()).toBe(0)
  })

  test('lookups are null-safe', () => {
    expect(makerPriceForSku(undefined)).toBeNull()
    expect(makerPriceForSku('Br.art.does-not-exist')).toBeNull()
  })

  test("maker mode equals retail while the pricelist is empty", () => {
    for (const f of CONTRACT_FIXTURES) {
      const state = hydrateFromHypothesis(null, { layoutContract: floorPlanToLayout(f.build()) })
      const retail = computeBom(state)
      const maker = computeBom(state, undefined, { pricing: 'maker' })
      expect(maker.total, f.id).toEqual(retail.total)
      expect(maker.sections.goods, f.id).toEqual(retail.sections.goods)
    }
  })
})
