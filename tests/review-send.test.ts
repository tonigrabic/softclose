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
  keptReview,
  legacyReviewPrint,
  reviewState,
  sendOffer,
  sentReviewFrom,
  type ReviewState,
} from '@/lib/handoff/review'
import type { ProjectSnapshot } from '@/lib/project/snapshot'
import { customerEstimate, estimateFromBuild } from '@/lib/handoff/estimate'
import { buildHandoffBundle, toCustomerBundle } from '@/lib/handoff/bundle'
import { OMITTED_IMAGE, stripImages } from '@/lib/project/checkpoint'
import { contentChangedAt } from '@/lib/project/status'
import { CONTRACT_FIXTURES } from '@/lib/builder/fixtures'
import { builderReducer, hydrateFromHypothesis } from '@/lib/builder/state'
import { builderSaveKey, createSaveGate } from '@/lib/builder/autosave'
import {
  assembleUnits,
  displayedSequence,
  withPatternChanged,
  withUnitAdded,
  withUnitRemoved,
  type UnitEdits,
} from '@/lib/builder/unit-assembly'
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

  test('the intake holds it from the restore, and finishes with it and the brief on file', () => {
    const intake = readFileSync(join(__dirname, '..', 'src/components/kitchen-intake/index.tsx'), 'utf8')
    expect(intake).toMatch(/legacyPrint\.current = legacyReviewPrint\(d\)/)
    expect(intake).toMatch(/setSentReview\(sentReviewFrom\(d, currentBriefId\) \?\? undefined\)/)
    expect(intake).toMatch(
      /keptReview\(print, \{ prev: wrapUpData, sent: sentReview \?\? null, legacyPrint: legacyPrint\.current \}\)/
    )
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

describe('sentReviewFrom: the brief on file, as a restored journey knows it', () => {
  const p = profile()
  const print = briefPrint(p)
  const review: WrapUpData = { thankYouMessage: 'Hvala', summaryLines: ['a'], briefId: 'X', profilePrint: print }
  const snap = (over: Partial<ProjectSnapshot>) =>
    ({ isDone: true, wrapUpData: null, profile: p, ...over }) as Pick<
      ProjectSnapshot,
      'isDone' | 'wrapUpData' | 'profile' | 'sentReview'
    >

  test('its own record, while it names the current brief', () => {
    const sent = { ...review, briefId: 'X' }
    expect(sentReviewFrom(snap({ isDone: false, sentReview: sent }), 'X')).toBe(sent)
    expect(sentReviewFrom(snap({ isDone: false, sentReview: sent }), 'Y')).toBeNull()
  })

  test('else its review, when that review IS the current brief', () => {
    expect(sentReviewFrom(snap({ wrapUpData: review }), 'X')).toEqual(review)
    expect(sentReviewFrom(snap({ wrapUpData: review }), 'Y')).toBeNull()
  })

  test('a review from before IMP-07: the print its snapshot vouches for — only while on the review', () => {
    const old: WrapUpData = { thankYouMessage: 'Hvala', summaryLines: [], briefId: 'X' }
    expect(sentReviewFrom(snap({ wrapUpData: old }), 'X')).toEqual({ ...old, profilePrint: print })
    expect(sentReviewFrom(snap({ isDone: false, wrapUpData: old }), 'X')).toBeNull()
  })

  test('nothing on file (never sent, the anonymous funnel), or no snapshot: null', () => {
    expect(sentReviewFrom(snap({ wrapUpData: review }), null)).toBeNull()
    expect(sentReviewFrom(null, 'X')).toBeNull()
  })
})

describe('keptReview', () => {
  const print = briefPrint(profile())
  const sent: WrapUpData = { thankYouMessage: 'Hvala', summaryLines: ['x'], briefId: 'X', profilePrint: print }
  const other: WrapUpData = { thankYouMessage: 'Hvala', summaryLines: ['y'], briefId: 'Y', profilePrint: 'p2' }

  test('the brief on file wins whenever the kitchen is it again', () => {
    expect(keptReview(print, { prev: other, sent })).toBe(sent)
    expect(keptReview(print, { prev: null, sent })).toBe(sent)
  })

  test('else the review on screen, unchanged', () => {
    expect(keptReview('p2', { prev: other, sent })).toBe(other)
    expect(keptReview('p3', { prev: other, sent })).toBeNull()
  })

  test('a legacy review kept by its vouched print gets the print written in', () => {
    const old: WrapUpData = { thankYouMessage: 'Hvala', summaryLines: [], briefId: 'X' }
    expect(keptReview(print, { prev: old, sent: null, legacyPrint: print })).toEqual({ ...old, profilePrint: print })
    expect(keptReview(print, { prev: old, sent: null, legacyPrint: 'other' })).toBeNull()
  })
})

describe('the brief on file is never sent again, whatever happens in between', () => {
  let n = 0
  const mint = () => `brief-${++n}`
  /** The intake's finish (finalise) with the brief on file, minus the summary call. */
  function finish(prev: WrapUpData | null, sent: WrapUpData | null, p: LeadProfile, legacyPrint: string | null = null) {
    const print = briefPrint(p)
    return (
      keptReview(print, { prev, sent, legacyPrint }) ?? {
        thankYouMessage: 'Hvala',
        summaryLines: [],
        briefId: mint(),
        profilePrint: print,
      }
    )
  }
  const offerFor = (review: WrapUpData, onFile: string | null) =>
    sendOffer(reviewState({ readOnly: false, onFileBriefId: onFile, reviewBriefId: review.briefId }), {
      sentNow: false,
      closed: false,
    })
  /** What onSent records: the review, with the print of the profile actually sent. */
  const sentFrom = (review: WrapUpData, sentProfile: LeadProfile): WrapUpData => ({
    ...review,
    profilePrint: briefPrint(sentProfile),
  })

  test('a change, then the change undone: back to the brief the maker has, nothing to send', () => {
    n = 0
    const a = profile()
    const x = finish(null, null, a)
    const sent = sentFrom(x, a)
    // "Nešto ispraviti?" → another timeline: a new review, the changes offered.
    const y = finish(x, sent, { ...a, timeline: 'asap' })
    expect(y.briefId).toBe('brief-2')
    expect(offerFor(y, sent.briefId!)).toBe('changes')
    // Back again, the timeline as it was: the brief on file, not brief-3.
    const z = finish(y, sent, { ...a, contractConfirmedAt: 4_444 })
    expect(z).toBe(sent)
    expect(offerFor(z, sent.briefId!)).toBeNull()
    expect(n).toBe(2)
  })

  test('…and across a reload: the snapshot keeps the brief on file next to the newer review', () => {
    n = 0
    const a = profile()
    const sent = sentFrom(finish(null, null, a), a)
    const y = finish(sent, sent, { ...a, timeline: 'asap' })
    // Saved mid-edit with review Y on screen; reloaded with brief-1 on file.
    const saved = { isDone: false, wrapUpData: y, profile: { ...a, timeline: 'asap' }, sentReview: sent }
    const restored = sentReviewFrom(saved, sent.briefId)
    expect(restored).toBe(sent)
    expect(offerFor(finish(y, restored, a), sent.briefId!)).toBeNull()
  })

  test('a brief sent before IMP-07: a visit that leaves on a step keeps it recognisable for the next', () => {
    n = 0
    const a = profile()
    const old: WrapUpData = { thankYouMessage: 'Hvala', summaryLines: [], briefId: 'old-brief' }
    // Visit 1: restored on the review (isDone) — the brief on file, derived.
    const visit1 = { isDone: true, wrapUpData: old, profile: a }
    const onFile = sentReviewFrom(visit1, 'old-brief')
    expect(onFile).toEqual({ ...old, profilePrint: briefPrint(a) })
    // "Izmijeni kuhinju" → contact, then the tab is closed there: the save
    // holds the done flag off — and the record of the brief on file.
    const left = { isDone: false, wrapUpData: old, profile: a, sentReview: onFile ?? undefined }
    expect(legacyReviewPrint(left)).toBeNull()
    // Visit 2: Continue with nothing changed — the brief on file, no send.
    const visit2 = sentReviewFrom(left, 'old-brief')
    const review = finish(old, visit2, { ...a, contractConfirmedAt: 5_555 }, legacyReviewPrint(left))
    expect(review.briefId).toBe('old-brief')
    expect(offerFor(review, 'old-brief')).toBeNull()
    expect(n).toBe(0)
  })

  test('the sent profile, not the review’s print, is what the brief on file is recognised by', () => {
    n = 0
    const a = profile()
    const x = finish(null, null, a)
    // A pick landed while the summary loaded: the review's print is of `a`,
    // the profile sent under its id is `b`.
    const build = a.builderState as BuilderState
    const b: LeadProfile = { ...a, builderState: { ...build, doors: { ...build.doors, decorCode: 'U999' } } }
    const sent = sentFrom(x, b)
    expect(sent.profilePrint).not.toBe(x.profilePrint)
    // Next visit, nothing changed: the kitchen is `b`, which is the brief on file.
    const again = finish(x, sent, b)
    expect(again).toBe(sent)
    expect(offerFor(again, sent.briefId!)).toBeNull()
    expect(n).toBe(1)
  })

  test('the intake records the send that way', () => {
    const intake = readFileSync(join(__dirname, '..', 'src/components/kitchen-intake/index.tsx'), 'utf8')
    expect(intake).toMatch(/\(briefId\) => setSentReview\(\{ \.\.\.wrapUpData, briefId, profilePrint: briefPrint\(profile\) \}\)/)
    expect(intake).toMatch(/onFileBriefId=\{sentReview\?\.briefId \?\? currentBriefId\}/)
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

/**
 * Round 2 of the IMP-07 review: two things a homeowner can do after a send
 * changed the print — so the maker's list said "izmijenjeno · v2" and the
 * review offered "Pošalji izmjene" for a brief identical in every field the
 * maker sees, and sending it emailed the maker a duplicate.
 */
describe('briefPrint: what neither surface shows is no change', () => {
  const NOW = '2026-10-05T09:00:00.000Z'
  /** The checkpoint's verdict on a saved profile, against the brief sent from `sentProfile`. */
  const flag = (sentProfile: LeadProfile, saved: LeadProfile) =>
    contentChangedAt({ currentBriefId: 'B1', briefPrint: briefPrint(sentProfile) }, { profile: stripImages(saved) }, NOW)
  const sentOf = (p: LeadProfile): WrapUpData => ({
    thankYouMessage: 'Hvala',
    summaryLines: [],
    briefId: 'B1',
    profilePrint: briefPrint(p),
  })

  test('the builder preview: a re-render, then "Vrati na original" — the brief on file, nothing flagged or offered', () => {
    const sent = profile()
    const build = sent.builderState as BuilderState
    // A re-render made after the send (push_rerender switches the preview to it)…
    const rerendered = builderReducer(build, { type: 'push_rerender', trigger: 'doors', imageDataUrl: PHOTO })
    // …then "Vrati na original", then the re-render picked again.
    const original = builderReducer(rerendered, { type: 'set_active_render', id: null })
    const picked = builderReducer(original, { type: 'set_active_render', id: rerendered.activeRenderId })
    // Each is a save: the builder's gate passes the preview change.
    const gate = createSaveGate()
    gate(builderSaveKey(build, 'doors'))
    for (const b of [rerendered, original, picked]) {
      expect(gate(builderSaveKey(b, 'doors'))).toBe(true)
      const saved: LeadProfile = { ...sent, builderState: b }
      expect(briefPrint(saved)).toBe(briefPrint(sent))
      expect(flag(sent, saved)).toBeNull()
      expect(keptReview(briefPrint(saved), { prev: null, sent: sentOf(sent) })?.briefId).toBe('B1')
    }
    // Sent with the re-render showing, then back to the original: the same.
    expect(flag({ ...sent, builderState: rerendered }, { ...sent, builderState: original })).toBeNull()
    // The range does not read the preview either.
    expect(estimateFromBuild({ ...sent, builderState: original })).toEqual(estimateFromBuild(sent))
  })

  test('a pick made in the builder is still a change', () => {
    const sent = profile()
    const build = sent.builderState as BuilderState
    const saved: LeadProfile = { ...sent, builderState: builderReducer(build, { type: 'patch_doors', patch: { decorCode: 'U999' } }) }
    expect(flag(sent, saved)).toBe(NOW)
  })

  describe('the confirm step’s unit edits: an edit undone is no edit', () => {
    const LAYOUT = floorPlanToLayout(CONTRACT_FIXTURES.find((f) => f.id === 'l-shape')!.build())
    const run = LAYOUT.runs[0].id
    const units = (edits: UnitEdits | null) => assembleUnits({ contract: LAYOUT, edits }).units
    const shown = (edits: UnitEdits | null, row: 'base' | 'wall' = 'base') => displayedSequence(units(edits), run, row)
    const otherThan = (p: string) => (p === 'trash_pullout' ? 'doors_shelf' : 'trash_pullout')
    // Before the send: the base row edited at t=100, the wall row at t=200.
    const SENT_EDITS = (() => {
      const base = withPatternChanged(null, shown(null), run, 'base', 1, otherThan(shown(null)[1]), 100)
      return withPatternChanged(base, shown(base, 'wall'), run, 'wall', 0, otherThan(shown(base, 'wall')[0]), 200)
    })()
    const sent: LeadProfile = { ...profile(), unitEdits: SENT_EDITS }

    test('a pattern changed and changed back after the send: new stamps, rows reordered, the same kitchen and print', () => {
      const original = shown(SENT_EDITS)[1]
      const changed = withPatternChanged(SENT_EDITS, shown(SENT_EDITS), run, 'base', 1, otherThan(original), 5_000)
      const undone = withPatternChanged(changed, shown(changed), run, 'base', 1, original, 6_000)
      expect(units(undone)).toEqual(units(SENT_EDITS))
      expect(undone).not.toEqual(SENT_EDITS)
      const saved: LeadProfile = { ...sent, unitEdits: undone, contractConfirmedAt: 7_000 }
      expect(briefPrint(saved)).toBe(briefPrint(sent))
      expect(flag(sent, saved)).toBeNull()
      expect(keptReview(briefPrint(saved), { prev: null, sent: sentOf(sent) })?.briefId).toBe('B1')
      // While it was changed, it was a change.
      expect(flag(sent, { ...sent, unitEdits: changed })).toBe(NOW)
    })

    test('a unit added and removed again: the same print', () => {
      const added = withUnitAdded(SENT_EDITS, shown(SENT_EDITS), run, 'base', 'doors_shelf', 5_000)
      const shownAdded = shown(added)
      const removed = withUnitRemoved(added, shownAdded, run, 'base', shownAdded.length - 1, 6_000)
      expect(units(removed)).toEqual(units(SENT_EDITS))
      expect(flag(sent, { ...sent, unitEdits: removed })).toBeNull()
      expect(flag(sent, { ...sent, unitEdits: added })).toBe(NOW)
    })
  })
})
