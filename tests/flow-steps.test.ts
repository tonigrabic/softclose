/**
 * FLOW invariants + the computed homeowner-visible step numbers. The old
 * hardcoded "Korak N" eyebrow strings went stale whenever a step was added or
 * removed (the 'type' step removal left every number off by one) — stepNumber
 * is the single source both the eyebrows and the journey rail read.
 */
import { describe, expect, test } from 'vitest'
import { FLOW, flowIndex, nextStepId, prevStepId, stepNumber } from '@/lib/flow'

describe('stepNumber', () => {
  test('numbers every non-builder step 1..N in FLOW order', () => {
    const numbered = FLOW.filter((s) => s.id !== 'builder')
    numbered.forEach((s, i) => expect(stepNumber(s.id)).toBe(i + 1))
  })

  test('builder carries no number (it expands into its own groups)', () => {
    expect(stepNumber('builder')).toBe(0)
  })
})

describe('FLOW invariants', () => {
  test('step ids are unique', () => {
    const ids = FLOW.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('next/prev round-trip through the whole flow', () => {
    for (const s of FLOW) {
      const next = nextStepId(s.id)
      if (next) expect(prevStepId(next)).toBe(s.id)
    }
    expect(prevStepId(FLOW[0].id)).toBeNull()
    expect(nextStepId(FLOW[FLOW.length - 1].id)).toBeNull()
    expect(flowIndex(FLOW[0].id)).toBe(0)
  })
})
