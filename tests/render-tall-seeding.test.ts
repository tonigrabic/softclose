/**
 * Render-visible tall towers must seed (accuracy fix, 2026-06-21) — and since
 * the single-assembler rework they seed through `hintsFromHypothesis` →
 * `assembleUnits`, so the SAME tower shows in the Part-1 tally and the
 * builder's unit list (the old version folded it into the builder only).
 *
 * With no hypothesis (the fixture path) nothing changes, so the band/parity
 * fixtures stay the contract's sole authority — asserted here too.
 */
import { describe, expect, test } from 'vitest'
import { CONTRACT_FIXTURES } from '@/lib/builder/fixtures'
import { floorPlanToLayout } from '@/lib/contract/layout-contract'
import { hydrateFromHypothesis } from '@/lib/builder/state'
import type { BuilderHypothesis } from '@/lib/builder/hypothesis'

function lShapeContract() {
  return floorPlanToLayout(CONTRACT_FIXTURES.find((f) => f.id === 'l-shape')!.build())
}

describe('render tall towers seed into the builder', () => {
  test('a render run flagged hasTall seeds a tall unit on that run', () => {
    const contract = lShapeContract()
    const topId = contract.runs[0].id
    const hypothesis: BuilderHypothesis = {
      usable: true,
      layout: {
        runs: [{ id: topId, label: 'Top', lengthCm: { value: 360, confidence: 'M' }, hasTall: { value: true, confidence: 'M' } }],
      },
    }
    const state = hydrateFromHypothesis(hypothesis, { layoutContract: contract })
    expect(state.layout.runs.find((r) => r.id === topId)!.hasTall).toBe(true)
    const towers = state.cabinetBoxes.units.filter(
      (u) => u.runId === topId && u.type === 'tall' && !u.boundTo
    )
    expect(towers).toHaveLength(1)
    expect(towers[0].meta?.provenance).toBe('ai-vision')
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
    expect(
      state.cabinetBoxes.units.some((u) => u.runId === runId && u.type === 'tall' && !u.boundTo)
    ).toBe(true)
  })

  test('no hypothesis → contract authority unchanged (no towers)', () => {
    const contract = lShapeContract()
    const state = hydrateFromHypothesis(null, { layoutContract: contract })
    expect(state.layout.runs.every((r) => r.hasTall === false)).toBe(true)
    expect(state.cabinetBoxes.units.filter((u) => u.type === 'tall')).toHaveLength(0)
  })
})
