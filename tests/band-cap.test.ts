/**
 * The ±20% promise is enforced in code, not hoped for: capBand narrows toward
 * the midpoint. The ±10% floor (Decision 2, 2026-10-03) is its mirror:
 * floorBand widens a range tighter than default rates can honestly claim.
 */
import { describe, expect, test } from 'vitest'
import { capBand, floorBand, MAX_WORKS_BAND_WIDTH_PCT } from '@/lib/builder/bom'
import { DEFAULT_RATE_CARD } from '@/lib/catalog/rate-card'

describe('capBand', () => {
  test('leaves a range inside the promise alone', () => {
    const r = capBand({ low: 9000, high: 11000 }, MAX_WORKS_BAND_WIDTH_PCT) // ±10%
    expect(r.capped).toBe(false)
    expect(r.range).toEqual({ low: 9000, high: 11000 })
  })
  test('narrows a ±22% range to exactly ±20% around the same midpoint', () => {
    const r = capBand({ low: 11319, high: 17731 }, MAX_WORKS_BAND_WIDTH_PCT) // the real-run builder entry
    expect(r.capped).toBe(true)
    const mid = (11319 + 17731) / 2
    expect((r.range.low + r.range.high) / 2).toBeCloseTo(mid, 6)
    expect(((r.range.high - r.range.low) / mid) * 100).toBeCloseTo(40, 6)
  })
  test('is a no-op on empty ranges', () => {
    expect(capBand({ low: 0, high: 0 }, 40)).toEqual({ range: { low: 0, high: 0 }, capped: false })
  })
})

describe('floorBand', () => {
  const FLOOR_WIDTH = DEFAULT_RATE_CARD.bandFloorHalfPct * 2 // ±10% ⇒ full width 20%

  test('leaves a range at or above the floor alone', () => {
    const r = floorBand({ low: 9000, high: 11000 }, FLOOR_WIDTH) // exactly ±10%
    expect(r.floored).toBe(false)
    expect(r.range).toEqual({ low: 9000, high: 11000 })
    expect(floorBand({ low: 8500, high: 11500 }, FLOOR_WIDTH).floored).toBe(false) // ±15%
  })

  test('widens a ±8.5% range to exactly ±10% around the same midpoint', () => {
    const r = floorBand({ low: 4667, high: 5537 }, FLOOR_WIDTH)
    expect(r.floored).toBe(true)
    const mid = (4667 + 5537) / 2
    expect((r.range.low + r.range.high) / 2).toBeCloseTo(mid, 6)
    expect(((r.range.high - r.range.low) / mid) * 100).toBeCloseTo(20, 6)
  })

  test('is a no-op on empty ranges and with no floor', () => {
    expect(floorBand({ low: 0, high: 0 }, FLOOR_WIDTH)).toEqual({ range: { low: 0, high: 0 }, floored: false })
    expect(floorBand({ low: 100, high: 101 }, 0)).toEqual({ range: { low: 100, high: 101 }, floored: false })
  })

  test('an exact single number becomes a range', () => {
    const r = floorBand({ low: 5000, high: 5000 }, FLOOR_WIDTH)
    expect(r).toEqual({ range: { low: 4500, high: 5500 }, floored: true })
  })
})
