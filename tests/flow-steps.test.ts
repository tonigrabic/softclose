/**
 * FLOW invariants + the computed homeowner-visible step numbers. The old
 * hardcoded "Korak N" eyebrow strings went stale whenever a step was added or
 * removed (the 'type' step removal left every number off by one) — stepNumber
 * is the single source both the eyebrows and the journey rail read.
 */
import { describe, expect, test } from 'vitest'
import { FLOW, flowIndex, nextStepId, prevStepId, resumeStepId, stepNumber } from '@/lib/flow'
import { hrHR } from '@/lib/i18n/locales/hr-HR'
import { enUS } from '@/lib/i18n/locales/en-US'

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

describe('room first (IMP-31)', () => {
  test('photos, then the room, then the look', () => {
    expect(FLOW[0].id).toBe('space_photos')
    expect(FLOW[1].id).toBe('room')
    expect(nextStepId('space_photos')).toBe('room')
    expect(nextStepId('room')).toBe('inspiration')
    // The render is only reachable through the room step.
    expect(flowIndex('room')).toBeLessThan(flowIndex('concept_render'))
  })

  test('every step has a rail label in both languages (read through tDynamic, so tsc cannot check it)', () => {
    for (const s of FLOW) {
      expect(hrHR, s.id).toHaveProperty(`flow.${s.id}.label`)
      expect(enUS, s.id).toHaveProperty(`flow.${s.id}.label`)
    }
  })
})

describe('resumeStepId', () => {
  const unmeasured = { roomMeasured: false, contractConfirmed: false }
  const measured = { roomMeasured: true, contractConfirmed: false }

  test('a journey saved on the old order, before the room was measured, resumes at the room step', () => {
    for (const step of ['inspiration', 'concept_render', 'confirm_look']) {
      expect(resumeStepId(step, unmeasured), step).toBe('room')
    }
  })

  test('a measured room resumes where it was', () => {
    expect(resumeStepId('concept_render', measured)).toBe('concept_render')
    expect(resumeStepId('inspiration', measured)).toBe('inspiration')
  })

  test('a journey that already confirmed its layout stays put', () => {
    expect(resumeStepId('confirm_look', { roomMeasured: false, contractConfirmed: true })).toBe('confirm_look')
    expect(resumeStepId('builder', unmeasured)).toBe('builder')
    expect(resumeStepId('contact', unmeasured)).toBe('contact')
  })

  test('earlier steps, retired steps and garbage', () => {
    expect(resumeStepId('space_photos', unmeasured)).toBe('space_photos')
    expect(resumeStepId('room', unmeasured)).toBe('room')
    expect(resumeStepId('scope', unmeasured)).toBe('wishlist')
    expect(resumeStepId('nonsense', unmeasured)).toBe('space_photos')
  })
})
