/**
 * The maker looking in read-only (/kitchen/<projectId>, readOnly when the
 * session is not the customer's) gets the homeowner's wrap-up, and must never
 * send from it. Sending is the customer's act: /api/handoff answers anyone
 * else 404. The wrap-up used to POST on mount whenever the project had no
 * brief yet, and offered "Pošalji izmjene" whenever it had one, both to the
 * maker — two 404s, and a screen that said it was about to send.
 *
 * Since IMP-07 nothing sends on arrival for anyone, and a read-only wrap-up
 * has no send control at all; it says where the brief got to in one calm
 * line. Its header is the maker's too: the homeowner's — "Evo tvog sažetka",
 * the thank-you the interview stored, "Pregledaj što šaljemo — ispravi sve što
 * ne valja" — would offer a fix to someone who can only look.
 *
 * Ported from fix/wrapup-readonly-header (IMP-05 follow-up), whose mount-send
 * source checks IMP-07 replaces (tests/wrapup-review.test.ts).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { READ_ONLY_COPY, WrapUpScreen } from '@/components/kitchen-intake/WrapUpScreen'
import { CONTRACT_FIXTURES } from '@/lib/builder/fixtures'
import { hydrateFromHypothesis } from '@/lib/builder/state'
import { floorPlanToLayout } from '@/lib/contract/layout-contract'
import { hrHR } from '@/lib/i18n/locales/hr-HR'
import { enUS } from '@/lib/i18n/locales/en-US'
import type { ConceptRender, LeadProfile } from '@/lib/types'

/** The thank-you as the snapshot stores it: written for the homeowner, in the
 *  locale it was generated in. */
const THANK_YOU = 'Hvala — tvoj sažetak je spreman. Pogledaj ga u miru prije slanja.'
const BRIEF_ID = '6f1c2a34-5b6d-4e7f-8a9b-0c1d2e3f4a5b'

const PLAN = CONTRACT_FIXTURES.find((f) => f.id === 'l-shape')!.build()

/** A build on the profile, so the estimate card is past "build your kitchen". */
const BUILT = {
  builderState: hydrateFromHypothesis(null, {
    layoutContract: floorPlanToLayout(PLAN),
  }),
}

const RENDER: ConceptRender = {
  id: 'r1',
  imageDataUrl: 'data:image/png;base64,AAAA',
  prompt: '',
  modelVersion: 'test',
  anchorPhotoIndex: 0,
  nudges: [],
  inputs: [],
  generatedAt: '2026-10-04T08:00:00.000Z',
}

/** Everything the sections that said "tvoj" need: a chosen render, the plan,
 *  and a sink that moves to a spot nobody has drawn yet. */
const SECTIONS: LeadProfile = {
  ...BUILT,
  floorPlan: PLAN,
  conceptRenders: [RENDER],
  conceptRenderChosenId: RENDER.id,
  trades: { plumbing: { sinkPosition: 'moving' } },
}

function wrapUp(
  props: { readOnly?: boolean; onFileBriefId?: string | null; built?: boolean; closed?: boolean; profile?: LeadProfile } = {}
) {
  const { built = true, profile, ...rest } = props
  return renderToStaticMarkup(
    createElement(WrapUpScreen, {
      data: { thankYouMessage: THANK_YOU, summaryLines: [], briefId: BRIEF_ID },
      profile: profile ?? (built ? BUILT : {}),
      explorationRefs: [],
      transcript: [],
      projectId: 'p1',
      ...rest,
    })
  )
}

/** Nothing on the page sends, or says it is about to. */
function expectNoSendControls(html: string) {
  expect(html).not.toContain(hrHR['wrapup.send.title'])
  expect(html).not.toContain(hrHR['wrapup.send.cta'])
  expect(html).not.toContain(hrHR['wrapup.send.sending'])
  expect(html).not.toContain(hrHR['wrapup.changes.title'])
  expect(html).not.toContain(hrHR['wrapup.changes.cta'])
  expect(html).not.toContain(hrHR['wrapup.actions.download'])
}

describe('the maker looking in never sends', () => {
  test('an unsent project: "not sent yet", no send controls', () => {
    const html = wrapUp({ readOnly: true })
    expect(html).toContain(hrHR['wrapup.readOnly.notSent'])
    expect(html).not.toContain(hrHR['wrapup.readOnly.sent'])
    expectNoSendControls(html)
    // Still a way back, worded for the maker.
    expect(html).toContain('href="/kitchen/p1"')
    expect(html).toContain(hrHR['wrapup.actions.backToKitchenMaker'])
  })

  test('a project with a brief: "sent", and no "send the changes"', () => {
    const html = wrapUp({ readOnly: true, onFileBriefId: BRIEF_ID })
    expect(html).toContain(hrHR['wrapup.readOnly.sent'])
    expect(html).not.toContain(hrHR['wrapup.readOnly.notSent'])
    expectNoSendControls(html)
  })

  test('a project whose brief is older than this review: still "sent", still nothing to send', () => {
    const html = wrapUp({ readOnly: true, onFileBriefId: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d' })
    expect(html).toContain(hrHR['wrapup.readOnly.sent'])
    expectNoSendControls(html)
  })

  test('no build either: the status line, not the homeowner’s "build your kitchen"', () => {
    const html = wrapUp({ readOnly: true, built: false })
    expect(html).toContain(hrHR['wrapup.readOnly.notSent'])
    expect(html).not.toContain(hrHR['wrapup.estimate.noBuild'])
    expect(html).not.toContain(hrHR['wrapup.estimate.openBuilder'])
    expectNoSendControls(html)
  })
})

/** The homeowner's header: nothing of it reaches the maker. */
function expectNoHomeownerHeader(html: string) {
  expect(html).not.toContain(hrHR['wrapup.title'])
  expect(html).not.toContain(THANK_YOU)
  expect(html).not.toContain(hrHR['wrapup.review'])
  expect(html).not.toContain('✓')
}

describe('the header speaks to the maker looking in', () => {
  test('an unsent project: the customer’s view, to look at — and "not sent yet" right under it', () => {
    const html = wrapUp({ readOnly: true })
    expect(html).toContain(hrHR['wrapup.readOnly.title'])
    expect(html).toContain(hrHR['wrapup.readOnly.lede'])
    expectNoHomeownerHeader(html)
    // The header comes first, the status line under it, and they agree.
    expect(html.indexOf(hrHR['wrapup.readOnly.lede'])).toBeLessThan(html.indexOf(hrHR['wrapup.readOnly.notSent']))
  })

  test('a project with a brief: the same header', () => {
    const html = wrapUp({ readOnly: true, onFileBriefId: BRIEF_ID })
    expect(html).toContain(hrHR['wrapup.readOnly.title'])
    expect(html).toContain(hrHR['wrapup.readOnly.lede'])
    expectNoHomeownerHeader(html)
  })

  test('no build either: the same header', () => {
    const html = wrapUp({ readOnly: true, built: false })
    expect(html).toContain(hrHR['wrapup.readOnly.title'])
    expectNoHomeownerHeader(html)
  })

  test('the customer keeps theirs: "here’s your brief" — with the thank-you while there is a send to make', () => {
    for (const html of [wrapUp(), wrapUp({ onFileBriefId: BRIEF_ID })]) {
      expect(html).toContain(hrHR['wrapup.title'])
      expect(html).not.toContain(hrHR['wrapup.readOnly.title'])
      expect(html).not.toContain(hrHR['wrapup.readOnly.lede'])
    }
    expect(wrapUp()).toContain(THANK_YOU)
    // The brief on file (a revisit): "look at it before sending" would sit
    // right above "nothing new to send" — see the round-2 test below.
    expect(wrapUp({ onFileBriefId: BRIEF_ID })).not.toContain(THANK_YOU)
  })
})

describe('the customer still sends — by pressing the button', () => {
  test('first arrival: the review asks for a look and offers "Pošalji izrađivaču"', () => {
    const html = wrapUp()
    expect(html).toContain(hrHR['wrapup.review'])
    expect(html).toContain(hrHR['wrapup.send.cta'])
    expect(html).not.toContain(hrHR['wrapup.readOnly.notSent'])
  })

  test('a newer review than the brief on file: "send the changes" is offered', () => {
    const html = wrapUp({ onFileBriefId: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d' })
    expect(html).toContain(hrHR['wrapup.changes.cta'])
    expect(html).not.toContain(hrHR['wrapup.readOnly.sent'])
  })
})

/**
 * Round 2 of the IMP-07 review: the thank-you is written for the moment
 * before a send ("…Pogledaj ga u miru prije slanja."), and was shown in every
 * homeowner state — next to the ✓ right after a send, and on every revisit
 * straight above "{maker} ima ovu verziju sažetka — nema ništa novo za
 * slanje". Now it shows only while there is a send to make.
 */
describe('the pre-send thank-you, only while there is a send to make', () => {
  test('first arrival, and a newer review than the brief on file: shown, with "Pregledaj što šaljemo"', () => {
    for (const html of [wrapUp(), wrapUp({ onFileBriefId: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d' })]) {
      expect(html).toContain(THANK_YOU)
      expect(html).toContain(hrHR['wrapup.review'])
    }
  })

  test('a revisit of the brief on file: ✓ and "nothing new to send" — no "look at it before sending"', () => {
    const html = wrapUp({ onFileBriefId: BRIEF_ID })
    expect(html).toContain('✓')
    expect(html).toContain(hrHR['wrapup.sent.line'].replace('{maker}', hrHR['kitchen.home.yourMaker']))
    expect(html).not.toContain(THANK_YOU)
  })

  test('a closed project, which takes no send: no thank-you asking for one', () => {
    expect(wrapUp({ onFileBriefId: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', closed: true })).not.toContain(THANK_YOU)
  })

  test('right after a send (the response held in the screen’s state): the same guard — `offer` is null once sent', () => {
    const screen = readFileSync(join(__dirname, '..', 'src/components/kitchen-intake/WrapUpScreen.tsx'), 'utf8')
    expect(screen).toMatch(/const offer = sendOffer\(state, \{ sentNow: bundle !== null, closed: isClosed \}\)/)
    expect(screen).toMatch(/\{offer \? <p className="mt-1 text-sm text-muted-foreground">\{data\.thankYouMessage\}<\/p> : null\}/)
    expect(screen.match(/data\.thankYouMessage/g)).toHaveLength(1)
  })
})

describe('the copy, hr-HR first, en-US the same keys', () => {
  test('the read-only header', () => {
    expect(hrHR['wrapup.readOnly.title']).toBe('Kupčev sažetak')
    expect(hrHR['wrapup.readOnly.lede']).toBe('Ovako ga vidi kupac — ti ga ovdje samo gledaš.')
    expect(enUS['wrapup.readOnly.title']).toBe("The customer's brief")
    expect(enUS['wrapup.readOnly.lede']).toBe("This is how the customer sees it — you're only looking here.")
  })

  test('the read-only status lines', () => {
    expect(hrHR['wrapup.readOnly.notSent']).toBe('Kupac još nije poslao sažetak.')
    expect(hrHR['wrapup.readOnly.sent']).toBe('Kupac je poslao sažetak — otvori ga s popisa.')
    expect(enUS['wrapup.readOnly.notSent']).toBe("The customer hasn't sent the brief yet.")
    expect(enUS['wrapup.readOnly.sent']).toBe('The customer has sent the brief — open it from your list.')
  })
})

/** Ported from the IMP-05 follow-up (fix/wrapup-readonly-maker-copy): the
 *  sections that said "tvoj" speak to the maker looking in. */
describe('the sections speak to the maker looking in', () => {
  test('the render, its note, the space, the plan’s caption and the sink: the maker’s words', () => {
    const html = wrapUp({ readOnly: true, onFileBriefId: BRIEF_ID, profile: SECTIONS })
    expect(html).toContain(hrHR['wrapup.readOnly.section.render'])
    expect(html).toContain(`alt="${hrHR['wrapup.readOnly.section.render']}"`)
    expect(html).toContain(hrHR['wrapup.readOnly.render.note'])
    expect(html).toContain(hrHR['wrapup.readOnly.section.space'])
    expect(html).toContain(hrHR['floorPlan.static.roughMaker'])
    expect(html).toContain(hrHR['wrapup.readOnly.trades.movesOpen'])

    expect(html).not.toContain(hrHR['wrapup.section.render'])
    expect(html).not.toContain(hrHR['wrapup.render.note'])
    expect(html).not.toContain(hrHR['wrapup.section.space'])
    expect(html).not.toContain(hrHR['floorPlan.static.rough'])
    expect(html).not.toContain(hrHR['wrapup.trades.movesOpen'])
  })

  test('a customer who chose not to measure: the maker takes the measurements', () => {
    const profile = { ...SECTIONS, floorPlan: { ...PLAN, measurementMethod: 'deferred_to_designer' as const } }
    const html = wrapUp({ readOnly: true, profile })
    expect(html).toContain(hrHR['floorPlan.static.deferredMaker'])
    expect(html).not.toContain(hrHR['floorPlan.static.deferred'])
  })

  test('nothing on the maker’s wrap-up says "tvoj" about the customer’s things', () => {
    for (const onFileBriefId of [null, BRIEF_ID]) {
      const html = wrapUp({ readOnly: true, onFileBriefId, profile: SECTIONS })
      expect(html).not.toMatch(/\btvo[jgm]/i)
      expect(html).not.toMatch(/\bsi podijelio\b/)
    }
  })

  test('the customer keeps theirs: "Tvoj koncept render", "Tvoj prostor", "što si podijelio"', () => {
    const html = wrapUp({ onFileBriefId: BRIEF_ID, profile: SECTIONS })
    expect(html).toContain(hrHR['wrapup.section.render'])
    expect(html).toContain(hrHR['wrapup.render.note'])
    expect(html).toContain(hrHR['wrapup.section.space'])
    expect(html).toContain(hrHR['floorPlan.static.rough'])
    expect(html).toContain(hrHR['wrapup.trades.movesOpen'])
    for (const makerKey of Object.values(READ_ONLY_COPY)) expect(html).not.toContain(hrHR[makerKey])
    expect(html).not.toContain(hrHR['floorPlan.static.roughMaker'])
  })

  test('every rewording is a different line, in both languages', () => {
    for (const [homeowner, maker] of Object.entries(READ_ONLY_COPY)) {
      expect(hrHR[maker]).not.toBe(hrHR[homeowner as keyof typeof READ_ONLY_COPY])
      expect(enUS[maker]).not.toBe(enUS[homeowner as keyof typeof READ_ONLY_COPY])
    }
  })
})
