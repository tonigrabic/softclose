/**
 * Render-visible tall towers must seed (accuracy fix, 2026-06-21).
 *
 * The floor plan / contract can't model tall units, so the contract always
 * reports hasTall=false. Hydration must fold in the render hypothesis's per-run
 * hasTall (and any pinned tall pantry) or a render clearly showing a pantry
 * tower seeds ZERO towers — a real under-count on L/U kitchens.
 *
 * With no hypothesis (the fixture path) nothing changes, so the band/parity
 * fixtures stay the contract's sole authority — asserted here too.
 */
import { describe, expect, test } from 'vitest'
import { CONTRACT_FIXTURES } from '@/lib/builder/fixtures'
import { floorPlanToLayout } from '@/lib/contract/layout-contract'
import { hydrateFromHypothesis } from '@/lib/builder/state'
import { contractSeedOptions, suggestCabinetsForRun } from '@/lib/builder/cabinet-suggest'
import type { BuilderHypothesis } from '@/lib/builder/hypothesis'

function lShapeContract() {
  return floorPlanToLayout(CONTRACT_FIXTURES.find((f) => f.id === 'l-shape')!.build())
}

describe('render tall towers seed into the builder', () => {
  test('a render run flagged hasTall makes that run seed a tall unit', () => {
    const contract = lShapeContract()
    const topId = contract.runs[0].id
    const hypothesis: BuilderHypothesis = {
      usable: true,
      layout: {
        runs: [{ id: topId, label: 'Top', lengthCm: { value: 360, confidence: 'M' }, hasTall: { value: true, confidence: 'M' } }],
      },
    }
    const state = hydrateFromHypothesis(hypothesis, { layoutContract: contract })
    const topRun = state.layout.runs.find((r) => r.id === topId)!
    expect(topRun.hasTall).toBe(true)
    const units = suggestCabinetsForRun(topRun, contractSeedOptions(contract, topRun))
    expect(units.some((u) => u.type === 'tall')).toBe(true)
  })

  test('a tall pantry pinned to a run seeds a tower there', () => {
    const contract = lShapeContract()
    const runId = contract.runs[1].id
    const hypothesis: BuilderHypothesis = {
      usable: true,
      features: { tallPantry: { present: { value: true, confidence: 'M' }, runId } },
    }
    const state = hydrateFromHypothesis(hypothesis, { layoutContract: contract })
    expect(state.layout.runs.find((r) => r.id === runId)!.hasTall).toBe(true)
  })

  test('no hypothesis → contract authority unchanged (no towers)', () => {
    const contract = lShapeContract()
    const state = hydrateFromHypothesis(null, { layoutContract: contract })
    expect(state.layout.runs.every((r) => r.hasTall === false)).toBe(true)
  })
})
