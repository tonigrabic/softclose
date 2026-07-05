/**
 * Defensibility guard for the unpicked-appliance estimate bands (bom.ts
 * APPLIANCE_PRICE). For every appliance type the Schachermayer reference-RRP
 * scrape actually covers (≥3 real, noise-floored products), the estimate band
 * MUST contain the catalog's central tendency — its median and inter-quartile
 * middle. This catches the class of bug we fixed in iteration 3, where the
 * invented oven band (500–850) excluded every mainstream catalog oven and the
 * microwave band (180–320) excluded the one real product: an estimate that
 * can't cover the products we'd actually sell is not defensible.
 *
 * Types the scrape doesn't cover (fridge, wine fridge, coffee) are domain
 * estimates pending the maker's B2B pricelist and are intentionally not gated.
 */
import { describe, expect, test } from 'vitest'
import { appliancesForType } from '@/lib/catalog/hardware'

// Mirror of bom.ts APPLIANCE_PRICE (kept in sync by review — this test fails
// loudly if a band drifts off the real catalog, which is the whole point).
const APPLIANCE_PRICE: Record<string, { low: number; high: number }> = {
  hob: { low: 280, high: 470 },
  oven: { low: 340, high: 780 },
  extractor: { low: 150, high: 470 },
  dishwasher: { low: 420, high: 760 },
  microwave: { low: 200, high: 380 },
}

const NOISE_FLOOR_EUR = 50 // drop accessories (couplings, reducers) from grouping

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function catalogPrices(type: Parameters<typeof appliancesForType>[0]): number[] {
  return appliancesForType(type)
    .map((p) => p.priceEur)
    .filter((x): x is number => typeof x === 'number' && x >= NOISE_FLOOR_EUR)
    .sort((a, b) => a - b)
}

describe('appliance estimate bands are grounded in the real catalog', () => {
  for (const type of ['hob', 'oven', 'extractor', 'dishwasher', 'microwave'] as const) {
    test(`${type}: band is centered on, and covers most of, the real catalog`, () => {
      const prices = catalogPrices(type)
      // Only enforce for types the scrape actually covers; sparse types are
      // documented domain estimates, not gated.
      if (prices.length < 3) return

      const band = APPLIANCE_PRICE[type]
      const med = median(prices)
      const inBand = prices.filter((p) => p >= band.low && p <= band.high).length

      // The estimate must be centered in the real product space…
      expect(med, `${type} median €${med} in [${band.low}, ${band.high}]`).toBeGreaterThanOrEqual(band.low)
      expect(med).toBeLessThanOrEqual(band.high)
      // …and cover the bulk of real products (a premium outlier — e.g. a Miele
      // — is allowed to sit above the band; it's pinned exactly when picked).
      expect(inBand / prices.length, `${type}: only ${inBand}/${prices.length} in band`).toBeGreaterThanOrEqual(0.5)
      // And the band must not be absurdly wide to "pass" trivially.
      expect(band.high / band.low).toBeLessThanOrEqual(3.5)
    })
  }
})
