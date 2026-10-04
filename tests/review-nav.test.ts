/**
 * IMP-07: fix anything from the review.
 *
 * "Izmijeni kuhinju" used to land on the done screen, whose only control sent
 * an identical brief; every review section passed onFix={null}; the rail on
 * the review had nothing to click. Now a section, Back and a done rail step
 * reopen a step, and Continue from an edited step comes back to the review —
 * except where the change has to travel (a new room through the confirm step,
 * a new layout through the builder, which relocks the build to it).
 *
 * Pure (lib/review-nav).
 */
import { describe, expect, test } from 'vitest'
import {
  REVIEW_FIX,
  afterCommit,
  continueKey,
  editEntryStep,
  needsTranslate,
  wishlistSource,
  type ReviewSection,
} from '@/lib/review-nav'
import { FLOW, nextStepId, type FlowStepId } from '@/lib/flow'
import { isBuilderScreenId } from '@/lib/builder/inventory'

const STEPS = FLOW.map((s) => s.id)

describe('REVIEW_FIX: each section opens the step that asks it', () => {
  test('every target is a live step; builder targets carry a builder group, others none', () => {
    for (const [section, target] of Object.entries(REVIEW_FIX)) {
      if (!target) continue
      expect(STEPS, section).toContain(target.step)
      if (target.step === 'builder') expect(isBuilderScreenId(target.group), section).toBe(true)
      else expect(target.group, section).toBeUndefined()
    }
  })

  test('the map', () => {
    const expected: Record<ReviewSection, string | null> = {
      render: 'concept_render',
      space: 'confirm_look',
      basics: 'logistics',
      scope: null,
      style: 'builder/doors',
      trades: 'confirm_look',
      lighting: 'builder/lighting',
      wishlist: 'wishlist',
      logistics: 'logistics',
      confidence: null,
      moodboard: 'inspiration',
      contact: 'contact',
    }
    const actual = Object.fromEntries(
      Object.entries(REVIEW_FIX).map(([k, t]) => [k, t ? [t.step, t.group].filter(Boolean).join('/') : null])
    )
    expect(actual).toEqual(expected)
  })

  test('no fix where no step asks it any more: the retired scope step, legacy decision confidence', () => {
    expect(REVIEW_FIX.scope).toBeNull()
    expect(REVIEW_FIX.confidence).toBeNull()
  })
})

describe('afterCommit', () => {
  test('the first walk: the next step, then the review after contact', () => {
    for (const hasBuild of [false, true]) {
      for (const step of STEPS) {
        expect(afterCommit(step, { editing: false, hasBuild }), step).toBe(nextStepId(step) ?? 'review')
      }
    }
    expect(afterCommit('contact', { editing: false, hasBuild: false })).toBe('review')
  })

  test.each([
    // [step, without a build, with a build]
    ['space_photos', 'review', 'review'],
    ['room', 'confirm_look', 'confirm_look'],
    ['inspiration', 'review', 'review'],
    ['concept_render', 'review', 'review'],
    ['confirm_look', 'review', 'builder'],
    ['builder', 'review', 'review'],
    ['wishlist', 'review', 'review'],
    ['logistics', 'review', 'review'],
    ['contact', 'review', 'review'],
  ] as const)('editing from %s → %s without a build, %s with one', (step, noBuild, withBuild) => {
    expect(afterCommit(step as FlowStepId, { editing: true, hasBuild: false })).toBe(noBuild)
    expect(afterCommit(step as FlowStepId, { editing: true, hasBuild: true })).toBe(withBuild)
  })

  test('the matrix covers every step', () => {
    expect(STEPS).toHaveLength(9)
  })
})

describe('continueKey: Continue says where it goes', () => {
  test('contact always reads "Pregledaj sažetak"', () => {
    for (const editing of [false, true]) for (const hasBuild of [false, true]) {
      expect(continueKey('contact', { editing, hasBuild })).toBe('nav.review')
    }
  })

  test('the first walk reads "Nastavi" until contact', () => {
    for (const step of STEPS.filter((s) => s !== 'contact')) {
      expect(continueKey(step, { editing: false, hasBuild: true }), step).toBe('nav.continue')
    }
  })

  test('editing: every step reads "Pregledaj sažetak", except the room, and the confirm step with a build', () => {
    for (const step of STEPS) {
      const withBuild = continueKey(step, { editing: true, hasBuild: true })
      const noBuild = continueKey(step, { editing: true, hasBuild: false })
      expect(withBuild, step).toBe(step === 'room' || step === 'confirm_look' ? 'nav.continue' : 'nav.review')
      expect(noBuild, step).toBe(step === 'room' ? 'nav.continue' : 'nav.review')
    }
  })
})

describe('the wishlist is translated again only when its text changed', () => {
  test('wishlistSource trims, and keeps the fields apart', () => {
    expect(wishlistSource(' smočnica ', 'kutak za kavu\n', '')).toBe(wishlistSource('smočnica', 'kutak za kavu', ''))
    expect(wishlistSource('a', '', '')).not.toBe(wishlistSource('', 'a', ''))
    expect(wishlistSource('a', 'b', 'c')).not.toBe(wishlistSource('a', 'b', 'd'))
  })

  test('needsTranslate', () => {
    const src = wishlistSource('smočnica', '', '')
    expect(needsTranslate(src, src, true)).toBe(false)
    expect(needsTranslate(src, wishlistSource('smočnica uz hladnjak', '', ''), true)).toBe(true)
    // Lists from a snapshot before IMP-07: no record of their text, so once more.
    expect(needsTranslate(src, undefined, true)).toBe(true)
    // Same text but no lists in the profile (a translation that never landed).
    expect(needsTranslate(src, src, false)).toBe(true)
  })
})

describe('editEntryStep: where "Izmijeni kuhinju" opens', () => {
  test('a customer whose brief went out: the contact step, never the done screen', () => {
    expect(editEntryStep({ submitted: true, readOnly: false })).toBe('contact')
  })

  test('everyone else resumes where the journey was left', () => {
    // The maker looking in (the read-only review, if finished).
    expect(editEntryStep({ submitted: true, readOnly: true })).toBeUndefined()
    expect(editEntryStep({ submitted: false, readOnly: true })).toBeUndefined()
    // Finished, unsent: the review, as left. Not started, or mid-walk: the step left on.
    expect(editEntryStep({ submitted: false, readOnly: false })).toBeUndefined()
  })
})
