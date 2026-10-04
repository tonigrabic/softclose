/**
 * IMP-07: review, then send — the pure rules.
 *
 * The wrap-up used to POST /api/handoff on mount, so the maker had the brief
 * before the homeowner read a line of "Pregledaj što šaljemo". Now arriving
 * sends nothing and only a button does; these are the rules that button and
 * the intake's finish follow (lib/handoff/review):
 *
 *  - a walk back through the steps that changes nothing keeps the review and
 *    its brief id (the print ignores sign-off stamps and images), so the
 *    review IS the brief the maker has and offers no send — never an
 *    identical second brief;
 *  - a real change is a new brief, and only then is "send the changes" offered;
 *  - the maker looking in, a send already made, and a closed project offer none;
 *  - the review prices its range with the handoff's own function, without the
 *    maker-only money.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  briefPrint,
  keepsReview,
  legacyReviewPrint,
  reviewState,
  sendOffer,
  type ReviewState,
} from '@/lib/handoff/review'
import { customerEstimate, estimateFromBuild } from '@/lib/handoff/estimate'
import { buildHandoffBundle, toCustomerBundle } from '@/lib/handoff/bundle'
import { OMITTED_IMAGE } from '@/lib/project/checkpoint'
import { CONTRACT_FIXTURES } from '@/lib/builder/fixtures'
import { hydrateFromHypothesis } from '@/lib/builder/state'
import { floorPlanToLayout } from '@/lib/contract/layout-contract'
import type { BuilderState } from '@/lib/builder/inventory'
import type { LeadProfile, WrapUpData } from '@/lib/types'

const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ=='

/** Built once: the fixture plan carries random element ids, so two builds
 *  are two different kitchens as far as any print is concerned. */
const L_SHAPE: BuilderState = (() => {
  const f = CONTRACT_FIXTURES.find((x) => x.id === 'l-shape')!
  return hydrateFromHypothesis(null, { layoutContract: floorPlanToLayout(f.build()) })
})()

function profile(): LeadProfile {
  return {
    name: 'Ana',
    email: 'ana@example.test',
    timeline: '3_6_months',
    spacePhotos: [PHOTO],
    roomConfirmed: { at: 1_000, intent: 'keep', fingerprint: 'abc' },
    contractConfirmedAt: 2_000,
    mustHaves: [{ trade: 'Pull-out pantry', verbatim: 'izvlačna smočnica' }],
    builderState: { ...L_SHAPE, lastUpdatedAt: '2026-10-04T08:00:00.000Z' },
  }
}

describe('briefPrint: the content of the brief, nothing a re-walk stamps on its own', () => {
  test('a data URL and the omitted-image marker print the same (this device vs a second one)', () => {
    expect(briefPrint({ ...profile(), spacePhotos: [OMITTED_IMAGE] })).toBe(briefPrint(profile()))
  })

  test('the room and contract sign-off times and the builder clock do not change it', () => {
    const p = profile()
    const rewalked: LeadProfile = {
      ...p,
      roomConfirmed: { ...p.roomConfirmed!, at: 9_999 },
      contractConfirmedAt: 8_888,
      builderState: { ...(p.builderState as BuilderState), lastUpdatedAt: '2026-10-05T12:00:00.000Z' },
    }
    expect(briefPrint(rewalked)).toBe(briefPrint(p))
  })

  test('key order does not change it', () => {
    const p = profile()
    const reordered = Object.fromEntries(Object.entries(p).reverse()) as LeadProfile
    expect(briefPrint(reordered)).toBe(briefPrint(p))
  })

  test('a pick, a wishlist item or the timeline does', () => {
    const p = profile()
    const build = p.builderState as BuilderState
    const base = briefPrint(p)
    expect(briefPrint({ ...p, builderState: { ...build, doors: { ...build.doors, decorCode: 'U999' } } })).not.toBe(base)
    expect(briefPrint({ ...p, mustHaves: [...p.mustHaves!, { trade: 'Bin drawer' }] })).not.toBe(base)
    expect(briefPrint({ ...p, timeline: 'asap' })).not.toBe(base)
    // The room itself (not its stamp) is content.
    expect(briefPrint({ ...p, roomConfirmed: { ...p.roomConfirmed!, fingerprint: 'other' } })).not.toBe(base)
  })
})

describe('keepsReview', () => {
  const print = briefPrint(profile())
  const review = (over: Partial<WrapUpData>): WrapUpData => ({ thankYouMessage: '', summaryLines: [], ...over })

  test.each([
    ['same print, with an id', review({ briefId: 'X', profilePrint: print }), true],
    ['a different print', review({ briefId: 'X', profilePrint: 'other' }), false],
    ['no id (a snapshot from before IMP-06)', review({ profilePrint: print }), false],
    ['no print (a snapshot from before IMP-07)', review({ briefId: 'X' }), false],
  ])('%s → %s', (_, prev, expected) => {
    expect(keepsReview(prev, print)).toBe(expected)
  })

  test('no review yet', () => {
    expect(keepsReview(null, print)).toBe(false)
  })

  test('a review from before IMP-07 is kept by the print its snapshot vouches for', () => {
    expect(keepsReview(review({ briefId: 'X' }), print, print)).toBe(true)
    expect(keepsReview(review({ briefId: 'X' }), print, 'other')).toBe(false)
    // Its own print wins over any legacy one.
    expect(keepsReview(review({ briefId: 'X', profilePrint: 'other' }), print, print)).toBe(false)
    // Still no id, still nothing to keep.
    expect(keepsReview(review({}), print, print)).toBe(false)
  })
})

describe('legacyReviewPrint: what a snapshot from before IMP-07 can vouch for', () => {
  const wrapUpData: WrapUpData = { thankYouMessage: '', summaryLines: [], briefId: 'X' }

  test('saved on the review: its profile is the reviewed one', () => {
    expect(legacyReviewPrint({ isDone: true, wrapUpData, profile: profile() })).toBe(briefPrint(profile()))
  })

  test('saved mid-edit, without an id, or with a print of its own: nothing', () => {
    expect(legacyReviewPrint({ isDone: false, wrapUpData, profile: profile() })).toBeNull()
    expect(legacyReviewPrint({ isDone: true, wrapUpData: { ...wrapUpData, briefId: undefined }, profile: profile() })).toBeNull()
    expect(legacyReviewPrint({ isDone: true, wrapUpData: { ...wrapUpData, profilePrint: 'p' }, profile: profile() })).toBeNull()
    expect(legacyReviewPrint({ isDone: true, wrapUpData: null, profile: profile() })).toBeNull()
    expect(legacyReviewPrint(null)).toBeNull()
  })

  test('the intake holds it in memory from the restore, and finishes with it', () => {
    const intake = readFileSync(join(__dirname, '..', 'src/components/kitchen-intake/index.tsx'), 'utf8')
    expect(intake).toMatch(/legacyPrint\.current = legacyReviewPrint\(d\)/)
    expect(intake).toMatch(/keepsReview\(wrapUpData, print, legacyPrint\.current\)/)
    // Never written into the snapshot (a write on arrival would flag the brief).
    expect(intake).not.toMatch(/profilePrint: legacyPrint/)
  })
})

describe('reviewState', () => {
  test.each([
    [{ readOnly: true, onFileBriefId: null, reviewBriefId: 'X' }, 'readOnly'],
    [{ readOnly: true, onFileBriefId: 'X', reviewBriefId: 'X' }, 'readOnly'],
    [{ readOnly: true, onFileBriefId: 'X', reviewBriefId: 'Y' }, 'readOnly'],
    [{ readOnly: false, onFileBriefId: null, reviewBriefId: 'X' }, 'first'],
    [{ readOnly: false, onFileBriefId: undefined, reviewBriefId: undefined }, 'first'],
    [{ readOnly: false, onFileBriefId: 'X', reviewBriefId: 'X' }, 'sent'],
    [{ readOnly: false, onFileBriefId: 'X', reviewBriefId: 'Y' }, 'changed'],
    // A review from before IMP-06 carries no id: it cannot be the brief on file.
    [{ readOnly: false, onFileBriefId: 'X', reviewBriefId: undefined }, 'changed'],
  ] as const)('%o → %s', (input, expected) => {
    expect(reviewState(input)).toBe(expected)
  })
})

describe('sendOffer', () => {
  const states: ReviewState[] = ['readOnly', 'first', 'sent', 'changed']

  test('the first send, or the changes', () => {
    expect(sendOffer('first', { sentNow: false, closed: false })).toBe('first')
    expect(sendOffer('changed', { sentNow: false, closed: false })).toBe('changes')
  })

  test('the maker looking in is never offered a send', () => {
    for (const sentNow of [false, true]) for (const closed of [false, true]) {
      expect(sendOffer('readOnly', { sentNow, closed })).toBeNull()
    }
  })

  test('the brief the maker already has is not offered again', () => {
    expect(sendOffer('sent', { sentNow: false, closed: false })).toBeNull()
  })

  test('nothing after a send from this screen, nothing on a closed project', () => {
    for (const s of states) {
      expect(sendOffer(s, { sentNow: true, closed: false })).toBeNull()
      expect(sendOffer(s, { sentNow: false, closed: true })).toBeNull()
    }
  })
})

describe('no identical resend, as a sequence', () => {
  /** What the intake's finish does with the review (finalise), minus the summary call. */
  function finish(prev: WrapUpData | null, p: LeadProfile, mint: () => string): WrapUpData {
    const print = briefPrint(p)
    return keepsReview(prev, print)
      ? prev!
      : { thankYouMessage: 'Hvala', summaryLines: [], briefId: mint(), profilePrint: print }
  }
  const offerFor = (review: WrapUpData, onFile: string | null, sentNow = false) =>
    sendOffer(reviewState({ readOnly: false, onFileBriefId: onFile, reviewBriefId: review.briefId }), {
      sentNow,
      closed: false,
    })

  test('finish → send → walk back unchanged → nothing to send; change → send the changes → nothing to send', () => {
    let n = 0
    const mint = () => `brief-${++n}`
    let onFile: string | null = null

    // First finish: a review nobody has, offering the first send.
    const a = profile()
    const first = finish(null, a, mint)
    expect(first.briefId).toBe('brief-1')
    expect(offerFor(first, onFile)).toBe('first')

    // Sent: the maker has brief-1; this screen offers nothing more.
    onFile = first.briefId!
    expect(offerFor(first, onFile, true)).toBeNull()

    // "Izmijeni kuhinju" → contact → Continue, nothing changed (the room and
    // contract were re-confirmed, the builder relocked): the same review.
    const rewalked: LeadProfile = {
      ...a,
      roomConfirmed: { ...a.roomConfirmed!, at: 5_000 },
      contractConfirmedAt: 6_000,
      builderState: { ...(a.builderState as BuilderState), lastUpdatedAt: '2026-10-06T09:00:00.000Z' },
      spacePhotos: [OMITTED_IMAGE],
    }
    const again = finish(first, rewalked, mint)
    expect(again).toBe(first)
    expect(again.briefId).toBe('brief-1')
    expect(offerFor(again, onFile)).toBeNull()

    // A real change is a new brief, and only now is a send offered.
    const changed = finish(again, { ...rewalked, timeline: 'asap' }, mint)
    expect(changed.briefId).toBe('brief-2')
    expect(changed.briefId).not.toBe(onFile)
    expect(offerFor(changed, onFile)).toBe('changes')

    // Sent: the maker has brief-2; finishing again unchanged offers nothing.
    onFile = changed.briefId!
    expect(offerFor(changed, onFile, true)).toBeNull()
    expect(offerFor(finish(changed, { ...rewalked, timeline: 'asap' }, mint), onFile)).toBeNull()
    expect(n).toBe(2)
  })

  test('a brief sent before IMP-07: walking back unchanged keeps it, so nothing to send', () => {
    let n = 0
    const mint = () => `brief-${++n}`
    // The snapshot as the old wrap-up left it: on the review, an id, no print.
    const old: WrapUpData = { thankYouMessage: 'Hvala', summaryLines: [], briefId: 'old-brief' }
    const legacy = legacyReviewPrint({ isDone: true, wrapUpData: old, profile: profile() })
    const print = briefPrint({ ...profile(), contractConfirmedAt: 7_777 })
    expect(keepsReview(old, print, legacy)).toBe(true)
    const kept = keepsReview(old, print, legacy) ? old : finish(old, profile(), mint)
    expect(offerFor(kept, 'old-brief')).toBeNull()
    expect(n).toBe(0)
  })

  test('a change before the first send is still the first send, under a new id', () => {
    let n = 0
    const mint = () => `brief-${++n}`
    const first = finish(null, profile(), mint)
    const edited = finish(first, { ...profile(), timeline: 'no_rush' }, mint)
    expect(edited.briefId).toBe('brief-2')
    expect(offerFor(edited, null)).toBe('first')
  })
})

describe('the review prices the range the way the handoff does', () => {
  test('estimateFromBuild is exactly the bundle’s estimate (l-shape)', () => {
    const brief = profile()
    expect(estimateFromBuild(brief)).toEqual(buildHandoffBundle({ brief }).estimate)
  })

  test('no build, no range', () => {
    expect(estimateFromBuild({ name: 'Ana' })).toBeNull()
    expect(buildHandoffBundle({ brief: { name: 'Ana' } }).estimate).toBeNull()
  })

  test('customerEstimate drops the maker-only money and keeps the rest', () => {
    const full = estimateFromBuild(profile())!
    expect(full.maker).toBeDefined()
    const customer = customerEstimate({ ...full, makerCost: { low: 1, high: 2 } })!
    expect(customer).not.toHaveProperty('maker')
    expect(customer).not.toHaveProperty('makerCost')
    expect(customer.low).toBe(full.low)
    expect(customer.high).toBe(full.high)
    expect(customer.lines).toEqual(full.lines)
    expect(customer.assumptions).toEqual(full.assumptions)
    expect(customerEstimate(null)).toBeNull()
  })

  test('the handoff’s customer response strips through the same function', () => {
    const bundle = buildHandoffBundle({ brief: profile() })
    expect(toCustomerBundle(bundle).estimate).toEqual(customerEstimate(bundle.estimate))
  })
})
