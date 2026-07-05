/**
 * Mock-AI fixtures stay production-shaped. The one silent failure mode of the
 * mock/hypothesis path is run-id drift: a hypothesis whose runIds don't match
 * the contract is ignored by seeding without an error. These pin the echo, the
 * catalog-validity of mock decor codes, and the space-vision sanity bands the
 * real route enforces (drifting outside them would make the mock read get
 * silently dropped server-side).
 */
import { describe, expect, test } from 'vitest'
import { CONTRACT_FIXTURES } from '@/lib/builder/fixtures'
import { floorPlanToLayout } from '@/lib/contract/layout-contract'
import { HYPOTHESIS_FIXTURES } from '@/lib/builder/hypothesis-fixtures'
import { mockHypothesis } from '@/lib/api/mock-fixtures/builder-hypothesis'
import { MOCK_SPACE_VISION } from '@/lib/api/mock-fixtures/space-vision'
import { mockTranslate } from '@/lib/api/mock-fixtures/translate-wishlist'
import { findDecor } from '@/lib/catalog'

describe('hypothesis fixtures echo contract run ids', () => {
  for (const cf of CONTRACT_FIXTURES) {
    test(`${cf.id}: every fixture's runIds ⊆ contract run ids`, () => {
      const contract = floorPlanToLayout(cf.build())
      const contractIds = new Set<string>(contract.runs.map((r) => r.id))
      for (const hf of HYPOTHESIS_FIXTURES) {
        const hyp = hf.build(contract)
        if (!hyp) continue
        for (const run of hyp.layout?.runs ?? []) {
          expect(contractIds.has(run.id), `${hf.id} run ${run.id}`).toBe(true)
        }
        for (const p of hyp.cabinetBoxes?.unitPatterns ?? []) {
          expect(contractIds.has(p.runId), `${hf.id} pattern @ ${p.runId}`).toBe(true)
        }
        if (hyp.features?.tallPantry?.runId) {
          expect(contractIds.has(hyp.features.tallPantry.runId)).toBe(true)
        }
      }
    })
  }

  test('mockHypothesis decor codes exist in the live catalog', () => {
    const contract = floorPlanToLayout(CONTRACT_FIXTURES[0].build())
    const hyp = mockHypothesis(contract)
    const doorCode = hyp.doors?.decorCode?.value
    const worktopCode = hyp.worktop?.decorCode?.value
    expect(doorCode).toBeTruthy()
    expect(worktopCode).toBeTruthy()
    expect(findDecor(doorCode!)).not.toBeNull()
    expect(findDecor(worktopCode!)).not.toBeNull()
  })

  test('mockHypothesis without a contract still returns a usable hypothesis', () => {
    const hyp = mockHypothesis(null)
    expect(hyp.usable).toBe(true)
    expect(hyp.layout?.shape?.value).toBeTruthy()
  })
})

describe('mock space vision', () => {
  test('dims sit inside the l_shape sanity band the real route enforces', () => {
    // Bands from /api/space-vision system prompt: l_shape 240–600 × 200–500.
    expect(MOCK_SPACE_VISION.layoutShape).toBe('l_shape')
    expect(MOCK_SPACE_VISION.lengthCm!).toBeGreaterThanOrEqual(240)
    expect(MOCK_SPACE_VISION.lengthCm!).toBeLessThanOrEqual(600)
    expect(MOCK_SPACE_VISION.widthCm!).toBeGreaterThanOrEqual(200)
    expect(MOCK_SPACE_VISION.widthCm!).toBeLessThanOrEqual(500)
  })

  test('every feature sits on a wall the vision saw a run on', () => {
    const runWalls = new Set(MOCK_SPACE_VISION.wallRuns!.map((r) => r.wall))
    for (const [kind, pos] of Object.entries(MOCK_SPACE_VISION.features!)) {
      if (!pos || kind === 'island') continue
      expect(runWalls.has((pos as { wall: 'top' | 'bottom' | 'left' | 'right' }).wall), kind).toBe(
        true
      )
    }
  })
})

describe('mock wishlist translation', () => {
  test('splits buckets on commas/newlines and echoes verbatim', () => {
    const out = mockTranslate({
      mustHaves: 'duboke ladice, puno radne površine\nsmeće skriveno',
      applianceNotes: 'zadržati postojeću pećnicu',
    })
    expect(out.mustHaves).toHaveLength(3)
    expect(out.mustHaves![0]).toEqual({ trade: 'duboke ladice', verbatim: 'duboke ladice' })
    expect(out.applianceNotes?.verbatim).toBe('zadržati postojeću pećnicu')
    expect(out.niceToHaves).toBeUndefined()
    expect(out.dealBreakers).toBeUndefined()
  })
})
