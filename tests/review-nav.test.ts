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
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  REVIEW_FIX,
  afterCommit,
  continueKey,
  editEntryStep,
  needsTranslate,
  owedAfterCommit,
  owedAfterLeave,
  restoredWishlistSource,
  spacePhotosChanged,
  stepDraftPrint,
  wishlistSource,
  type CommitContext,
  type ReviewSection,
  type StepDrafts,
} from '@/lib/review-nav'
import { FLOW, nextStepId, type FlowStepId } from '@/lib/flow'
import { isBuilderScreenId } from '@/lib/builder/inventory'
import { OMITTED_IMAGE } from '@/lib/project/checkpoint'
import type { ProjectSnapshot } from '@/lib/project/snapshot'
import type { SpaceVisionResult } from '@/lib/types'

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
      // The tags come from the inspiration tiles; the picks from the builder.
      style: 'inspiration',
      materials: 'builder/doors',
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

  test('editing from the photos with new photos (or a new read): through the room step, which reads them as one room', () => {
    for (const hasBuild of [false, true]) {
      expect(afterCommit('space_photos', { editing: true, hasBuild, photosChanged: true })).toBe('room')
      expect(afterCommit('space_photos', { editing: true, hasBuild, photosChanged: false })).toBe('review')
      expect(continueKey('space_photos', { editing: true, hasBuild, photosChanged: true })).toBe('nav.continue')
    }
    // The first walk goes to the room step anyway.
    expect(afterCommit('space_photos', { editing: false, hasBuild: false, photosChanged: true })).toBe('room')
  })
})

describe('spacePhotosChanged: what the photo step must hand to the room step', () => {
  const A = 'data:image/jpeg;base64,AAAA'
  const B = 'data:image/jpeg;base64,BBBB'
  const C = 'data:image/jpeg;base64,CCCC'
  const READ = { summary: 'L-shaped kitchen' } as unknown as SpaceVisionResult

  test('unchanged: the same photos and read — also as a resumed journey’s markers', () => {
    expect(spacePhotosChanged({ photos: [A, B], vision: READ }, { spacePhotos: [A, B], spaceVisionResult: READ })).toBe(false)
    expect(
      spacePhotosChanged(
        { photos: [OMITTED_IMAGE], vision: { ...READ } },
        { spacePhotos: [OMITTED_IMAGE], spaceVisionResult: READ }
      )
    ).toBe(false)
  })

  test('one photo swapped for another (same count, so the same image-stripped print): changed', () => {
    expect(spacePhotosChanged({ photos: [A, C], vision: READ }, { spacePhotos: [A, B], spaceVisionResult: READ })).toBe(true)
  })

  test('a photo removed (its read cleared), or a new read: changed', () => {
    expect(spacePhotosChanged({ photos: [A], vision: null }, { spacePhotos: [A, B], spaceVisionResult: READ })).toBe(true)
    expect(spacePhotosChanged({ photos: [A, B], vision: null }, { spacePhotos: [A, B], spaceVisionResult: READ })).toBe(true)
    expect(
      spacePhotosChanged(
        { photos: [A, B], vision: { summary: 'galley' } as unknown as SpaceVisionResult },
        { spacePhotos: [A, B], spaceVisionResult: READ }
      )
    ).toBe(true)
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

describe('restoredWishlistSource: a journey from before IMP-07 keeps its lists', () => {
  const lists = { mustHaves: [{ trade: 'Pull-out pantry' }] }
  const snap = (over: Partial<ProjectSnapshot>) =>
    ({
      isDone: true,
      wrapUpData: { thankYouMessage: '', summaryLines: [], briefId: 'X' },
      profile: lists,
      mustHavesText: 'izvlačna smočnica',
      niceToHavesText: '',
      dealBreakersText: '',
      ...over,
    }) as ProjectSnapshot

  test('its own record wins', () => {
    expect(restoredWishlistSource(snap({ wishlistSource: 'recorded' }))).toBe('recorded')
  })

  test('sent before IMP-07, on its review: the stored text — so passing the step unchanged translates nothing', () => {
    const source = restoredWishlistSource(snap({}))
    expect(source).toBe(wishlistSource('izvlačna smočnica', '', ''))
    expect(needsTranslate(wishlistSource('izvlačna smočnica', '', ''), source, true)).toBe(false)
    // A real edit still translates.
    expect(needsTranslate(wishlistSource('smočnica uz hladnjak', '', ''), source, true)).toBe(true)
  })

  test('the intake restores through it', () => {
    const intake = readFileSync(join(__dirname, '..', 'src/components/kitchen-intake/index.tsx'), 'utf8')
    expect(intake).toMatch(/setWishlistTranslatedFrom\(restoredWishlistSource\(d\)\)/)
  })

  test('nothing to vouch for (mid-walk, no brief id, a print of its own): unknown', () => {
    expect(restoredWishlistSource(snap({ isDone: false }))).toBeUndefined()
    expect(restoredWishlistSource(snap({ wrapUpData: null }))).toBeUndefined()
    expect(
      restoredWishlistSource(snap({ wrapUpData: { thankYouMessage: '', summaryLines: [], briefId: 'X', profilePrint: 'p' } }))
    ).toBeUndefined()
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
    expect(editEntryStep({ submitted: true, readOnly: true, unsentChanges: true })).toBeUndefined()
    // Finished, unsent: the review, as left. Not started, or mid-walk: the step left on.
    expect(editEntryStep({ submitted: false, readOnly: false })).toBeUndefined()
  })

  test('changes made since the brief went out, not sent: "Pregledaj i pošalji izmjene" opens their review', () => {
    expect(editEntryStep({ submitted: true, readOnly: false, unsentChanges: true })).toBe('review')
    expect(editEntryStep({ submitted: true, readOnly: false, unsentChanges: false })).toBe('contact')
  })
})

/**
 * Round 2 of the IMP-07 review: while editing, Continue went to the review
 * from every step, and nothing remembered what was still on its way.
 *  - The forced path was only a Continue destination: after a new room the
 *    rail (Kontakt → Pregledaj sažetak), or Back and Continue again, reached
 *    the review with the new plan priced from the build of the old one — and
 *    "Pošalji izmjene" sent the maker a plan and a range that disagree.
 *  - An edit left on a step by Back or the rail (a new phone, a typed
 *    must-have) never reached the profile: the review and the send went out
 *    without it, while the step showed it as saved.
 * Now the steps still owed their Continue are a state, and every Continue
 * leads to the first of them before the review is built.
 */
describe('owed steps: what a change still has to pass before the review', () => {
  const editing = (over: Partial<CommitContext> = {}): CommitContext => ({ editing: true, hasBuild: true, ...over })

  test('a new room: confirm step, then builder — and no rail jump or Back skips either', () => {
    let owed = owedAfterCommit('room', editing())
    expect(owed).toEqual(['confirm_look'])
    // The rail to "Kontakt" and its "Pregledaj sažetak": the confirm step, and Continue says so.
    expect(afterCommit('contact', editing({ owed }))).toBe('confirm_look')
    expect(continueKey('contact', editing({ owed }))).toBe('nav.continue')
    // Back from the confirm step to the concept render, Continue there: the confirm step again.
    expect(afterCommit('concept_render', editing({ owed }))).toBe('confirm_look')
    owed = owedAfterCommit('confirm_look', editing({ owed }))
    expect(owed).toEqual(['builder'])
    expect(afterCommit('logistics', editing({ owed }))).toBe('builder')
    // The builder hands its build back (the last Continue, "Natrag na pregled"): now the review.
    expect(afterCommit('builder', editing({ owed }))).toBe('review')
    expect(owedAfterCommit('builder', editing({ owed }))).toEqual([])
  })

  test('without a build the confirm step settles it', () => {
    const owed = owedAfterCommit('room', editing({ hasBuild: false }))
    expect(afterCommit('confirm_look', editing({ hasBuild: false, owed }))).toBe('review')
  })

  test('new photos: Back and Continue again on the photo step still leads to the room step', () => {
    const owed = owedAfterCommit('space_photos', editing({ photosChanged: true }))
    expect(owed).toEqual(['room'])
    // Committed now, so the photo step no longer sees a change — the room step is still owed.
    expect(afterCommit('space_photos', editing({ photosChanged: false, owed }))).toBe('room')
    expect(afterCommit('wishlist', editing({ owed }))).toBe('room')
  })

  test('the earliest owed step comes first, and a later commit never drops it', () => {
    // New photos owe the room step; the confirm step committed meanwhile (with a build) adds the builder.
    expect(owedAfterCommit('confirm_look', editing({ owed: ['room'] }))).toEqual(['room', 'builder'])
    expect(afterCommit('confirm_look', editing({ owed: ['room'] }))).toBe('room')
  })

  test('the first walk owes nothing, and walks on as before', () => {
    for (const step of STEPS) {
      expect(owedAfterCommit(step, { editing: false, hasBuild: true, photosChanged: true }), step).toEqual([])
      expect(afterCommit(step, { editing: false, hasBuild: true, owed: ['room'] }), step).toBe(nextStepId(step) ?? 'review')
    }
  })

  describe('an edit left on a step by Back or the rail is owed its Continue', () => {
    const drafts = (over: Partial<StepDrafts> = {}): StepDrafts => ({
      profile: { existingRoom: 'kitchen', layoutIntent: 'keep' },
      spacePhotos: ['data:image/jpeg;base64,AAAA'],
      spaceVision: null,
      roomPlan: null,
      inspirationStyles: ['modern'],
      inspirationRefs: [],
      inspirationVision: null,
      floorPlan: null,
      unitEdits: null,
      mustHavesText: 'izvlačna smočnica',
      niceToHavesText: '',
      dealBreakersText: '',
      siteAccess: 'lift',
      contactDraft: { name: 'Ana', contactType: 'email', contactValue: '', phone: '091 111 1111' },
      ...over,
    })
    const ENTRY = drafts()

    test('a new phone, Back to logistics, "Pregledaj sažetak": the contact step first, with the phone on it', () => {
      const left = drafts({ contactDraft: { ...ENTRY.contactDraft, phone: '091 222 2222' } })
      const owed = owedAfterLeave('contact', [], stepDraftPrint('contact', left) !== stepDraftPrint('contact', ENTRY))
      expect(owed).toEqual(['contact'])
      expect(afterCommit('logistics', editing({ owed }))).toBe('contact')
      expect(continueKey('logistics', editing({ owed }))).toBe('nav.continue')
      // Its own Continue commits it: then the review.
      expect(afterCommit('contact', editing({ owed }))).toBe('review')
    })

    test('a must-have typed, then the rail: the wishlist step (translated on its Continue) before the review', () => {
      const left = drafts({ mustHavesText: 'izvlačna smočnica, kutak za kavu' })
      const owed = owedAfterLeave('wishlist', [], stepDraftPrint('wishlist', left) !== stepDraftPrint('wishlist', ENTRY))
      expect(afterCommit('logistics', editing({ owed }))).toBe('wishlist')
    })

    test('a step left as it was entered owes nothing; one already owed stays owed', () => {
      expect(owedAfterLeave('contact', [], stepDraftPrint('contact', drafts()) !== stepDraftPrint('contact', ENTRY))).toEqual([])
      expect(owedAfterLeave('contact', ['contact'], false)).toEqual(['contact'])
      expect(owedAfterLeave('wishlist', ['contact'], true)).toEqual(['wishlist', 'contact'])
    })

    test('each step reads its own drafts, and only those', () => {
      const edits: [FlowStepId, Partial<StepDrafts>][] = [
        ['space_photos', { spacePhotos: ['data:image/jpeg;base64,BBBB'] }],
        ['room', { profile: { existingRoom: 'kitchen', layoutIntent: 'add_island' } }],
        ['inspiration', { inspirationStyles: ['modern', 'scandi'] }],
        ['confirm_look', { unitEdits: { schemaVersion: 1, rows: [] } }],
        ['wishlist', { dealBreakersText: 'bez sjaja' }],
        ['logistics', { siteAccess: 'street_level' }],
        ['contact', { contactDraft: { ...ENTRY.contactDraft, name: 'Ana Horvat' } }],
      ]
      for (const [step, over] of edits) {
        for (const other of STEPS) {
          const moved = stepDraftPrint(other, drafts(over)) !== stepDraftPrint(other, ENTRY)
          expect(moved, `${step} edit seen by ${other}`).toBe(other === step)
        }
      }
      // The concept render patches the profile on a pick; the builder autosaves.
      expect(stepDraftPrint('concept_render', ENTRY)).toBe('')
      expect(stepDraftPrint('builder', ENTRY)).toBe('')
    })
  })

  describe('the intake keeps them', () => {
    const intake = readFileSync(join(__dirname, '..', 'src/components/kitchen-intake/index.tsx'), 'utf8')

    test('every Continue records them; the queued review goes to the first one instead', () => {
      expect(intake).toMatch(/setOwedSteps\(owedAfterCommit\(state\.currentStepId, commitContext\)\)/)
      expect(intake).toMatch(
        /setReviewQueued\(false\)\s*\/\/[^\n]*\n[\s\S]{0,160}if \(owedSteps\.length > 0\) \{\s*setIsDone\(false\)\s*goTo\(owedSteps\[0\]\)\s*return\s*\}\s*void finalise\(\)/
      )
    })

    test('Back, the rail and "Izmjeri" leave a step through leaveStep; the builder goes back through goNext', () => {
      expect(intake).toMatch(/if \(!prev\) return\s*leaveStep\(\)\s*goTo\(prev\)/)
      expect(intake).toMatch(/function openStep\(target: ReviewTarget\) \{\s*leaveStep\(\)/)
      expect(intake).toMatch(/onMeasureRoom=\{\(\) => \{\s*leaveStep\(\)/)
      expect(intake).toMatch(/const changed = stepDraftPrint\(step, snapshot\) !== stepEntry\.current/)
      const back = intake.match(/onBackToReview=\{[\s\S]*?: undefined\s*\}/)![0]
      expect(back).toMatch(/goNext\(\)/)
      expect(back).not.toMatch(/setReviewQueued/)
    })

    test('they ride the snapshot, so a reload cannot reach the review past them', () => {
      expect(intake).toMatch(/owedSteps: owedSteps\.length > 0 \? owedSteps : undefined/)
      expect(intake).toMatch(/setOwedSteps\(\s*Array\.isArray\(d\.owedSteps\)/)
    })
  })
})
