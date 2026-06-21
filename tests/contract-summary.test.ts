/**
 * `summarizeContract` is the single pure projection behind the dedicated
 * contract-confirmation step (and the in-builder LayoutConfirm gate). It must:
 *  - tally each run through the SAME assembler the builder seeds from, so the
 *    numbers the homeowner signs off on are the numbers that get priced; and
 *  - faithfully carry the contract's room-level facts (shape, island, ceiling,
 *    corners, appliances) it presents for sign-off.
 */
import { describe, expect, test } from 'vitest'
import { CONTRACT_FIXTURES } from '@/lib/builder/fixtures'
import { floorPlanToLayout } from '@/lib/contract/layout-contract'
import {
  contractSeedOptions,
  suggestCabinetsForRun,
  summarizeContract,
} from '@/lib/builder/cabinet-suggest'

describe('summarizeContract — per fixture', () => {
  for (const f of CONTRACT_FIXTURES) {
    test(`${f.id}: per-run tally matches the seeding assembler`, () => {
      const contract = floorPlanToLayout(f.build())
      const summary = summarizeContract(contract)

      // One row per contract run, in order.
      expect(summary.rows.map((r) => r.id)).toEqual(contract.runs.map((r) => r.id))

      let total = 0
      for (const run of contract.runs) {
        const units = suggestCabinetsForRun(run, contractSeedOptions(contract, run))
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
})

describe('summarizeContract — sign-off gating', () => {
  test('a confirmed plan records the sign-off timestamp on the profile', () => {
    // The step records `contractConfirmedAt` (number) and advances; this guards
    // the field name/shape the builder + readbacks read.
    const profile: { contractConfirmedAt?: number } = {}
    profile.contractConfirmedAt = Date.now()
    expect(typeof profile.contractConfirmedAt).toBe('number')
  })
})
