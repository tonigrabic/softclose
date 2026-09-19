/** The ±20% promise is enforced in code, not hoped for: capBand narrows toward the midpoint. */
import { describe, expect, test } from 'vitest'
import { capBand, MAX_WORKS_BAND_WIDTH_PCT } from '@/lib/builder/bom'

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
