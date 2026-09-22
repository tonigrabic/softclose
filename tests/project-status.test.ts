/**
 * The maker's triage, as a function.
 *
 * The case that earns this file is `changed_since_submit`: a customer editing
 * after the maker already has a brief — possibly after they quoted it — is the
 * one transition that is both easy to miss in a list and expensive to miss in
 * a business. It is derived from timestamps rather than stored, so it is also
 * the one most likely to break silently when the checkpoint logic changes.
 */
import { describe, expect, it } from 'vitest'
import { FLOW } from '@/lib/flow'
import { needsAttention, projectDisplayStatus, stepProgress } from '@/lib/project/status'

const T0 = '2026-09-20T10:00:00.000Z'
const T1 = '2026-09-21T10:00:00.000Z'
const T2 = '2026-09-22T10:00:00.000Z'

const base = {
  status: 'invited',
  openedAt: null,
  step: null,
  updatedAt: T0,
  currentBriefCreatedAt: null,
}

describe('projectDisplayStatus', () => {
  it('invited: the link was never opened', () => {
    expect(projectDisplayStatus(base)).toBe('invited')
  })

  it('opened: they clicked and stopped at the first step', () => {
    expect(projectDisplayStatus({ ...base, status: 'in_progress', openedAt: T0 })).toBe('opened')
    expect(projectDisplayStatus({ ...base, status: 'in_progress', openedAt: T0, step: FLOW[0].id })).toBe('opened')
  })

  it('in_progress: they moved past the first step', () => {
    expect(projectDisplayStatus({ ...base, status: 'in_progress', openedAt: T0, step: 'builder' })).toBe('in_progress')
  })

  it('submitted: a brief exists and nothing changed after it', () => {
    expect(
      projectDisplayStatus({
        ...base,
        status: 'submitted',
        openedAt: T0,
        step: 'contact',
        updatedAt: T1,
        currentBriefCreatedAt: T1,
      })
    ).toBe('submitted')
  })

  it('changed_since_submit: they edited after the brief was made', () => {
    expect(
      projectDisplayStatus({
        ...base,
        status: 'submitted',
        openedAt: T0,
        step: 'contact',
        updatedAt: T2,
        currentBriefCreatedAt: T1,
      })
    ).toBe('changed_since_submit')
  })

  it('does not report a change when the project was only touched before the brief', () => {
    // Guards the off-by-one that would put every submitted project in the
    // "they changed something" pile and make the signal worthless.
    expect(
      projectDisplayStatus({
        ...base,
        status: 'submitted',
        openedAt: T0,
        step: 'contact',
        updatedAt: T0,
        currentBriefCreatedAt: T1,
      })
    ).toBe('submitted')
  })

  it('treats a brief as submitted even if the row status lags behind', () => {
    expect(
      projectDisplayStatus({ ...base, status: 'in_progress', openedAt: T0, updatedAt: T1, currentBriefCreatedAt: T1 })
    ).toBe('submitted')
  })

  it('archived wins over everything', () => {
    expect(
      projectDisplayStatus({ ...base, status: 'archived', openedAt: T0, updatedAt: T2, currentBriefCreatedAt: T1 })
    ).toBe('archived')
  })
})

describe('needsAttention', () => {
  it('is exactly the two states with a brief waiting on the maker', () => {
    expect(needsAttention('submitted')).toBe(true)
    expect(needsAttention('changed_since_submit')).toBe(true)
    expect(needsAttention('invited')).toBe(false)
    expect(needsAttention('opened')).toBe(false)
    expect(needsAttention('in_progress')).toBe(false)
    expect(needsAttention('archived')).toBe(false)
  })
})

describe('stepProgress', () => {
  it('matches the numbering the homeowner sees', () => {
    expect(stepProgress('space_photos')).toMatchObject({ current: 1 })
    const last = stepProgress('contact')!
    expect(last.current).toBe(last.total)
  })

  it('never reports step 0 for the builder, which is outside the numbering', () => {
    const p = stepProgress('builder')!
    expect(p.current).toBeGreaterThan(0)
    expect(p.current).toBeLessThanOrEqual(p.total)
  })

  it('returns null for no step and for a step id that no longer exists', () => {
    expect(stepProgress(null)).toBeNull()
    expect(stepProgress('a_step_we_deleted')).toBeNull()
  })

  it('counts every homeowner-visible step', () => {
    expect(stepProgress('space_photos')!.total).toBe(FLOW.filter((s) => s.id !== 'builder').length)
  })
})
