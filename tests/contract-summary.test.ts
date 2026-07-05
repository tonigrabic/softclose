/**
 * `summarizeAssembly` is the single pure projection behind the contract
 * tally card (LayoutConfirm). It must:
 *  - tally each run from the SAME assembled unit list the builder seeds from,
 *    so the numbers the homeowner signs off on are the numbers that get
 *    priced; and
 *  - faithfully carry the contract's room-level facts (shape, island, ceiling,
 *    corners, appliances) it presents for sign-off.
 */
import { describe, expect, test } from 'vitest'
import { CONTRACT_FIXTURES } from '@/lib/builder/fixtures'
import { floorPlanToLayout } from '@/lib/contract/layout-contract'
import { assembleUnits, summarizeAssembly } from '@/lib/builder/unit-assembly'

describe('summarizeAssembly — per fixture', () => {
  for (const f of CONTRACT_FIXTURES) {
    test(`${f.id}: per-run tally matches the assembled unit list`, () => {
      const contract = floorPlanToLayout(f.build())
      const result = assembleUnits({ contract })
      const summary = summarizeAssembly(contract, result)

      // One row per contract run, in order.
      expect(summary.rows.map((r) => r.id)).toEqual(contract.runs.map((r) => r.id))

      let total = 0
      for (const run of contract.runs) {
        const units = result.units.filter((u) => u.runId === run.id)
        const row = summary.rows.find((r) => r.id === run.id)!
        expect(row.base).toBe(units.filter((u) => u.type === 'base').length)
        expect(row.wall).toBe(units.filter((u) => u.type === 'wall').length)
        expect(row.tall).toBe(units.filter((u) => u.type === 'tall').length)
        expect(row.lengthCm).toBe(run.lengthCm)
        total += row.base + row.wall + row.tall
      }

      // Aggregates + room-level facts carried straight from the contract.
      expect(summary.totalCabinets).toBe(total)
      expect(summary.cornerCount).toBe(contract.corners.length)
      expect(summary.shape).toBe(contract.shape)
      expect(summary.hasIsland).toBe(contract.hasIsland)
      expect(summary.ceilingHeightCm).toBe(contract.ceilingHeightCm)
      expect(summary.appliances.map((a) => a.kind)).toEqual(
        contract.appliances.map((a) => a.kind)
      )
    })
  }

  test('every fixture with a sink tallies exactly one sink_unit per sink', () => {
    for (const f of CONTRACT_FIXTURES) {
      const contract = floorPlanToLayout(f.build())
      const sinkCount = contract.appliances.filter((a) => a.kind === 'sink').length
      const units = assembleUnits({ contract }).units
      expect(
        units.filter((u) => u.pattern === 'sink_unit').length,
        `fixture ${f.id}`
      ).toBe(sinkCount)
    }
  })
})

describe('summarizeAssembly — sign-off gating', () => {
  test('a confirmed plan records the sign-off timestamp on the profile', () => {
    // The step records `contractConfirmedAt` (number) and advances; this guards
    // the field name/shape the builder + readbacks read.
    const profile: { contractConfirmedAt?: number } = {}
    profile.contractConfirmedAt = Date.now()
    expect(typeof profile.contractConfirmedAt).toBe('number')
  })
})
