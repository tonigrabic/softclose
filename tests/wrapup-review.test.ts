/**
 * IMP-07: the wrap-up is a review, and only a button sends.
 *
 * It used to POST /api/handoff on mount, so the brief was inserted and the
 * maker emailed before the homeowner read a line of "Pregledaj što šaljemo —
 * ispravi sve što ne valja". Now:
 *
 *  - a first finish shows the range from the build and "Pošalji izrađivaču",
 *    and nothing that says it went (no "Što slijedi", no download);
 *  - the brief the maker already has shows as sent, with no send at all;
 *  - a newer review offers "Pošalji izmjene";
 *  - the maker looking in and a closed project get no send control.
 *
 * Rendered statically (no DOM in this suite, so no effect would run anyway —
 * which is why the source is checked too: the component has no effect, and
 * the one POST in src/ sits in the handler only a click reaches).
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { WrapUpScreen } from '@/components/kitchen-intake/WrapUpScreen'
import { KitchenHome, type KitchenHomeProps } from '@/app/kitchen/[projectId]/KitchenHome'
import { estimateFromBuild } from '@/lib/handoff/estimate'
import { formatRange } from '@/lib/builder/range'
import { CONTRACT_FIXTURES } from '@/lib/builder/fixtures'
import { hydrateFromHypothesis } from '@/lib/builder/state'
import { floorPlanToLayout } from '@/lib/contract/layout-contract'
import { hrHR } from '@/lib/i18n/locales/hr-HR'
import { enUS } from '@/lib/i18n/locales/en-US'
import type { ProjectSnapshot } from '@/lib/project/snapshot'
import { changedSinceBrief, projectDisplayStatus } from '@/lib/project/status'
import type { HandoffEstimate, LeadProfile } from '@/lib/types'

const ROOT = join(__dirname, '..')
const source = (file: string) => readFileSync(join(ROOT, file), 'utf8')
const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#x27;/g, "'")

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name)
    if (e.isDirectory()) return sourceFiles(full)
    return /\.tsx?$/.test(e.name) ? [full] : []
  })
}

const BRIEF_ID = '6f1c2a34-5b6d-4e7f-8a9b-0c1d2e3f4a5b'
const OTHER_ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
const THANKS = 'Hvala — tvoj sažetak je spreman.'

const BUILT: LeadProfile = {
  name: 'Ana',
  email: 'ana@example.test',
  builderState: hydrateFromHypothesis(null, {
    layoutContract: floorPlanToLayout(CONTRACT_FIXTURES.find((f) => f.id === 'l-shape')!.build()),
  }),
}

type Props = Parameters<typeof WrapUpScreen>[0]

function review(props: Partial<Props> = {}) {
  return renderToStaticMarkup(
    createElement(WrapUpScreen, {
      data: { thankYouMessage: THANKS, summaryLines: [], briefId: BRIEF_ID },
      profile: BUILT,
      explorationRefs: [],
      transcript: [],
      projectId: 'p1',
      makerName: 'Stolarija Horvat',
      ...props,
    })
  )
}

const SEND = hrHR['wrapup.send.cta']
const CHANGES = hrHR['wrapup.changes.cta']

function expectNoSend(html: string) {
  expect(html).not.toContain(SEND)
  expect(html).not.toContain(CHANGES)
  expect(html).not.toContain(hrHR['wrapup.send.title'])
  expect(html).not.toContain(hrHR['wrapup.changes.title'])
  expect(html).not.toContain('data-send=')
}

describe('a first finish is a review, not a send', () => {
  const html = review()

  test('the range from the build is on screen before anything is sent', () => {
    const preview = estimateFromBuild(BUILT)!
    expect(text(html)).toContain(formatRange(preview))
    expect(html).toContain(hrHR['wrapup.estimate.bomBadge'])
  })

  test('"Pošalji izrađivaču", worded with the maker, after the brief', () => {
    expect(html).toContain(SEND)
    expect(html).toContain(hrHR['wrapup.send.title'])
    expect(text(html)).toContain('Stolarija Horvat dobiva sažetak i obavijest e-poštom čim ga pošalješ.')
    expect(html).toContain('data-send="first"')
    expect(html).not.toContain(CHANGES)
    // After the estimate (the brief is read first), before the way back.
    expect(html.indexOf(hrHR['wrapup.estimate.title'])).toBeLessThan(html.indexOf(SEND))
    expect(html.indexOf(SEND)).toBeLessThan(html.indexOf(hrHR['wrapup.actions.backToKitchen']))
  })

  test('the header asks for a review: no ✓, the thank-you, "Pregledaj što šaljemo"', () => {
    expect(html).toContain(hrHR['wrapup.title'])
    expect(html).toContain(THANKS)
    expect(html).toContain(hrHR['wrapup.review'])
    expect(html).not.toContain('✓')
  })

  test('nothing says it went: no "Što slijedi", no download', () => {
    expect(html).not.toContain(hrHR['wrapup.next.title'])
    expect(html).not.toContain(hrHR['wrapup.next.saved'])
    expect(html).not.toContain(hrHR['wrapup.actions.download'])
  })

  test('no build: the way to the builder, and the brief can still be sent', () => {
    const noBuild = review({ profile: { name: 'Ana' }, onOpenBuilder: () => {} })
    expect(noBuild).toContain(hrHR['wrapup.estimate.noBuild'])
    expect(noBuild).toContain(hrHR['wrapup.estimate.openBuilder'])
    expect(noBuild).not.toContain('€')
    expect(noBuild).toContain(SEND)
  })

  test('no maker name: "Tvoj izrađivač" heads the sentence', () => {
    expect(text(review({ makerName: null }))).toContain('Tvoj izrađivač dobiva sažetak')
  })
})

describe('the brief the maker already has is never offered again', () => {
  const html = review({ onFileBriefId: BRIEF_ID })

  test('no send, no "send the changes"', () => {
    expectNoSend(html)
  })

  test('it says the maker has this version, and what happens next, with the reference', () => {
    expect(text(html)).toContain('Stolarija Horvat ima ovu verziju sažetka — nema ništa novo za slanje.')
    expect(html).toContain(hrHR['wrapup.next.title'])
    expect(html).toContain(hrHR['wrapup.next.saved'])
    expect(html).toContain(hrHR['wrapup.next.ref'].replace('{id}', BRIEF_ID.slice(0, 8)))
    expect(html).toContain('✓')
    expect(html).not.toContain(hrHR['wrapup.review'])
  })

  test('the range is still on screen (no "estimate not available")', () => {
    expect(text(html)).toContain(formatRange(estimateFromBuild(BUILT)!))
  })
})

describe('a newer review than the maker’s', () => {
  const html = review({ onFileBriefId: OTHER_ID })

  test('"Pošalji izmjene", saying the maker has an earlier version', () => {
    expect(html).toContain(CHANGES)
    expect(html).toContain(hrHR['wrapup.changes.title'])
    expect(text(html)).toContain('Stolarija Horvat ima raniju verziju ovog sažetka.')
    expect(html).toContain('data-send="changes"')
    expect(html).not.toContain(SEND)
    expect(html).not.toContain(hrHR['wrapup.next.title'])
  })

  test('a review from before IMP-06 (no id) next to a brief on file is a newer one too', () => {
    const legacy = review({ data: { thankYouMessage: THANKS, summaryLines: [] }, onFileBriefId: OTHER_ID })
    expect(legacy).toContain(CHANGES)
  })
})

describe('no send control where nothing may be sent', () => {
  test.each([
    ['the maker looking in, unsent', { readOnly: true }],
    ['the maker looking in, sent', { readOnly: true, onFileBriefId: BRIEF_ID }],
    ['the maker looking in, an older brief on file', { readOnly: true, onFileBriefId: OTHER_ID }],
    ['a closed project, unsent', { closed: true }],
    ['a closed project, an older brief on file', { closed: true, onFileBriefId: OTHER_ID }],
  ] as const)('%s', (_, props) => {
    const html = review(props)
    expectNoSend(html)
    expect(html).not.toContain(hrHR['wrapup.actions.download'])
  })

  test('the maker looking in gets their header and a status line, no download', () => {
    for (const html of [review({ readOnly: true }), review({ readOnly: true, onFileBriefId: BRIEF_ID })]) {
      expect(html).toContain(hrHR['wrapup.readOnly.title'])
      expect(html).not.toContain(hrHR['wrapup.review'])
      expect(html).not.toContain(THANKS)
    }
  })
})

describe('nothing reaches /api/handoff before the button, at the source', () => {
  const wrapUp = source('src/components/kitchen-intake/WrapUpScreen.tsx')
  const intake = source('src/components/kitchen-intake/index.tsx')
  const HANDOFF_FETCH = /fetch\(\s*['"`]\/api\/handoff/g

  test('the wrap-up has no effect at all: arriving can do nothing', () => {
    expect(wrapUp).not.toMatch(/\buseEffect\b/)
    expect(wrapUp).not.toMatch(/\buseLayoutEffect\b/)
  })

  test('its one POST is inside sendBrief, behind the offer check', () => {
    expect(wrapUp.match(HANDOFF_FETCH)).toHaveLength(1)
    const body = wrapUp.match(/async function sendBrief\(\) \{[\s\S]*?\n {2}\}\n/)
    expect(body).not.toBeNull()
    expect(body![0]).toMatch(/^async function sendBrief\(\) \{\s*if \(!offer \|\| inflight\.current\) return/)
    expect(body![0].match(HANDOFF_FETCH)).toHaveLength(1)
  })

  test('sendBrief is only ever called from a click', () => {
    // Each mention, from the start of its line up to the name.
    const refs = [...wrapUp.matchAll(/\bsendBrief\b/g)].map((m) =>
      wrapUp.slice(wrapUp.lastIndexOf('\n', m.index!) + 1, m.index! + 'sendBrief'.length)
    )
    const declarations = refs.filter((r) => /^\s*async function sendBrief$/.test(r))
    const clicks = refs.filter((r) => /onClick=\{\(\) => void sendBrief$/.test(r))
    const comments = refs.filter((r) => /^\s*(\/\/|\*|\/\*|\{\/\*)/.test(r))
    expect(declarations).toHaveLength(1)
    expect(clicks.length).toBeGreaterThanOrEqual(1)
    // Nothing else: no effect, no callback, no prop hands it to anyone.
    expect(declarations.length + clicks.length + comments.length).toBe(refs.length)
  })

  test('no other file under src/ posts to /api/handoff; the intake never does', () => {
    const posting = sourceFiles(join(ROOT, 'src'))
      .filter((f) => HANDOFF_FETCH.test(readFileSync(f, 'utf8')))
      .map((f) => relative(ROOT, f).split(sep).join('/'))
    expect(posting).toEqual(['src/components/kitchen-intake/WrapUpScreen.tsx'])
    expect(intake).not.toMatch(HANDOFF_FETCH)
  })

  test('a 409 closed takes the offer away (the send button is the retry otherwise)', () => {
    expect(wrapUp).toMatch(/const isClosed = closed \|\| bundleError === 'api\.error\.closed'/)
    expect(wrapUp).toMatch(/sendOffer\(state, \{ sentNow: bundle !== null, closed: isClosed \}\)/)
  })

  test('the intake hands the maker no beforeSubmit and no onSent', () => {
    const mount = intake.match(/<WrapUpScreen[\s\S]*?\/>/)
    expect(mount).not.toBeNull()
    expect(mount![0]).toMatch(/beforeSubmit=\{\s*readOnly\s*\?\s*undefined/)
    expect(mount![0]).toMatch(/onSent=\{\s*readOnly\s*\?\s*undefined/)
    expect(mount![0]).toMatch(/onFileBriefId=\{sentReview\?\.briefId \?\? currentBriefId\}/)
  })

  test('right after a send, what happens next takes the send card’s place and is announced', () => {
    expect(wrapUp).toMatch(/\{done && !bundle && nextSteps\}/)
    expect(wrapUp).toMatch(/\{bundle && nextSteps\}\s*\{\/\* Send —/)
    expect(wrapUp).toMatch(/role=\{bundle \? 'status' : undefined\}/)
  })

  test('the summary is written for a review the homeowner has not sent yet', () => {
    const route = source('src/app/api/summarize-brief/route.ts')
    expect(route).toContain('shown above the review BEFORE the homeowner sends; never say it was sent')
    expect(source('src/lib/api/mock-fixtures/summarize-brief.ts')).not.toMatch(/na putu|poslan/)
  })
})

describe('the copy, hr-HR first, en-US the same keys', () => {
  const REMOVED = [
    'wrapup.resubmit.title',
    'wrapup.resubmit.body',
    'wrapup.resubmit.cta',
    'wrapup.resubmit.sending',
    'wrapup.estimate.loading',
    'wrapup.estimate.unavailable',
    'wrapup.estimate.afterResend',
    'nav.send',
  ]
  const NEW = [
    'wrapup.send.title',
    'wrapup.send.body',
    'wrapup.send.cta',
    'wrapup.send.sending',
    'wrapup.changes.title',
    'wrapup.changes.body',
    'wrapup.changes.cta',
    'wrapup.sent.line',
    'nav.review',
    'kitchen.home.titleReady',
    'kitchen.home.status.ready',
    'kitchen.home.cta.review',
    'kitchen.home.editNote',
    'funnel.builderEntry.skip',
    'wrapup.next.saved',
    'wrapup.next.contact',
  ] as const

  test('the send-on-mount and re-submit keys are gone from both locales', () => {
    for (const dict of [hrHR, enUS] as Record<string, string>[]) {
      for (const key of REMOVED) expect(dict, key).not.toHaveProperty(key)
    }
  })

  test('the new keys, in both locales, with the same slots', () => {
    const slots = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join()
    for (const key of NEW) {
      expect(hrHR[key], key).toBeTruthy()
      expect(enUS[key], key).toBeTruthy()
      expect(slots(enUS[key]), key).toBe(slots(hrHR[key]))
    }
    for (const key of ['wrapup.send.body', 'wrapup.changes.body', 'wrapup.sent.line'] as const) {
      // {maker} heads the sentence, so "Tvoj izrađivač" stays capitalised.
      expect(hrHR[key].startsWith('{maker} '), key).toBe(true)
      expect(enUS[key].startsWith('{maker} '), key).toBe(true)
    }
  })

  test('maker vocabulary and the ti-form: no "dizajner", no "Vi"/"Vaš"', () => {
    for (const key of NEW) {
      expect(hrHR[key], key).not.toMatch(/dizajner/i)
      expect(hrHR[key], key).not.toMatch(/\bV(i|aš|aša|aše|ama)\b/)
      expect(enUS[key], key).not.toMatch(/designer/i)
    }
  })

  test('the hr-HR copy', () => {
    expect(hrHR['wrapup.send.title']).toBe('Sve u redu?')
    expect(hrHR['wrapup.send.cta']).toBe('Pošalji izrađivaču')
    expect(hrHR['wrapup.changes.cta']).toBe('Pošalji izmjene')
    expect(hrHR['nav.review']).toBe('Pregledaj sažetak')
    expect(hrHR['kitchen.home.cta.review']).toBe('Pregledaj i pošalji')
    expect(hrHR['kitchen.home.editNote']).toBe('Izmjene odlaze izrađivaču tek kad ih pregledaš i pošalješ.')
    expect(hrHR['funnel.builderEntry.skip']).toBe('Preskoči — sažetak bez raspona')
    expect(enUS['wrapup.send.cta']).toBe('Send to your maker')
    expect(enUS['nav.review']).toBe('Review your brief')
  })
})

describe('the kitchen home: finished, not sent', () => {
  const home = (props: Partial<KitchenHomeProps>) =>
    text(
      renderToStaticMarkup(
        createElement(KitchenHome, {
          projectId: 'p1',
          makerName: 'Stolarija Horvat',
          stepLabel: 'Korak 8/8',
          submittedAt: null,
          makerViewedAt: null,
          briefId: null,
          range: null,
          savedEstimate: null,
          decision: null,
          closed: false,
          started: true,
          revision: 3,
          readOnly: false,
          snapshot: {
            isDone: true,
            wrapUpData: { thankYouMessage: THANKS, summaryLines: [], briefId: BRIEF_ID },
          } as unknown as ProjectSnapshot,
          customerEmail: 'ana@example.test',
          customerName: 'Ana',
          ...props,
        })
      )
    )

  test('says the brief waits for them, and offers the review', () => {
    const out = home({})
    expect(out).toContain(hrHR['kitchen.home.titleReady'])
    expect(out).toContain(hrHR['kitchen.home.status.ready'])
    expect(out).toContain(hrHR['kitchen.home.cta.review'])
    expect(out).not.toContain(hrHR['kitchen.home.what'])
  })

  test('not while still walking the steps', () => {
    const out = home({ snapshot: { isDone: false, wrapUpData: null } as unknown as ProjectSnapshot })
    expect(out).not.toContain(hrHR['kitchen.home.titleReady'])
    expect(out).toContain('Nastavi · Korak 8/8')
  })

  test('not once sent: the sent status, "Izmijeni kuhinju" and the calm edit note', () => {
    const out = home({ submittedAt: '3. 10. 2026.', briefId: BRIEF_ID })
    expect(out).not.toContain(hrHR['kitchen.home.titleReady'])
    expect(out).not.toContain(hrHR['kitchen.home.cta.review'])
    expect(out).toContain(hrHR['kitchen.home.cta.edit'])
    expect(out).toContain(hrHR['kitchen.home.editNote'])
  })

  test('not on a closed project', () => {
    const out = home({ closed: true })
    expect(out).not.toContain(hrHR['kitchen.home.titleReady'])
    expect(out).not.toContain(hrHR['kitchen.home.cta.review'])
  })

  test('not for the maker looking in: no "send it", no "Pregledaj i pošalji" — sending is the customer’s act', () => {
    const out = home({ readOnly: true })
    expect(out).not.toContain(hrHR['kitchen.home.titleReady'])
    expect(out).not.toContain(hrHR['kitchen.home.status.ready'])
    expect(out).not.toContain(hrHR['kitchen.home.cta.review'])
    expect(out).not.toMatch(/pošalj/i)
  })

  test('the maker looking in is told it is the customer’s page, gets a look-only button and no edit note', () => {
    for (const props of [{ readOnly: true }, { readOnly: true, submittedAt: '3. 10. 2026.', briefId: 'b1' }]) {
      const out = home(props)
      expect(out).toContain(hrHR['kitchen.home.readOnly.eyebrow'])
      expect(out).toContain(hrHR['kitchen.home.readOnly.lede'])
      expect(out).toContain(hrHR['kitchen.home.cta.look'])
      expect(out).not.toContain(hrHR['kitchen.home.cta.edit'])
      expect(out).not.toContain(hrHR['kitchen.home.editNote'])
      expect(out).not.toMatch(/pošalj/i)
    }
    // The homeowner keeps their own words.
    const own = home({ submittedAt: '3. 10. 2026.', briefId: 'b1' })
    expect(own).toContain(hrHR['kitchen.home.eyebrow'])
    expect(own).not.toContain(hrHR['kitchen.home.readOnly.lede'])
  })
})

/**
 * Round 2 of the IMP-07 review: a homeowner who changed the kitchen after the
 * send and left before "Pošalji izmjene" came back to "Tvoj sažetak je kod
 * {maker}", the old range and the generic edit note — nothing said the
 * changes were not sent. The maker's list meanwhile said "izmijenjeno", over
 * the old brief. Each waited for the other. Now the home says so, calmly, and
 * opens the review of the changes.
 */
describe('the kitchen home: changed since the brief went out, not sent', () => {
  const home = (props: Partial<KitchenHomeProps>) =>
    text(
      renderToStaticMarkup(
        createElement(KitchenHome, {
          projectId: 'p1',
          makerName: 'Stolarija Horvat',
          stepLabel: 'Korak 8/8',
          submittedAt: '3. 10. 2026.',
          makerViewedAt: null,
          briefId: BRIEF_ID,
          unsentChanges: true,
          range: null,
          savedEstimate: null,
          decision: null,
          closed: false,
          started: true,
          revision: 3,
          readOnly: false,
          snapshot: { isDone: false, wrapUpData: null } as unknown as ProjectSnapshot,
          customerEmail: 'ana@example.test',
          customerName: 'Ana',
          ...props,
        })
      )
    )
  const UNSENT = hrHR['kitchen.home.status.unsent'].replace('{maker}', 'Stolarija Horvat')

  test('the sent status, then "changes not sent yet", and the CTA opens their review', () => {
    const out = home({})
    expect(out).toContain(hrHR['kitchen.home.titleSubmitted'].replace('{maker}', 'Stolarija Horvat'))
    expect(out.indexOf(hrHR['kitchen.home.status.sent'].replace('{date}', '3. 10. 2026.'))).toBeLessThan(out.indexOf(UNSENT))
    expect(out).toContain(hrHR['kitchen.home.cta.reviewChanges'])
    expect(out).not.toContain(hrHR['kitchen.home.cta.edit'])
  })

  test('nothing changed since the brief: as before — "Izmijeni kuhinju", no unsent line', () => {
    const out = home({ unsentChanges: false })
    expect(out).not.toContain(UNSENT)
    expect(out).not.toContain(hrHR['kitchen.home.cta.reviewChanges'])
    expect(out).toContain(hrHR['kitchen.home.cta.edit'])
  })

  test('not for the maker looking in, and not on a closed project (no send either way)', () => {
    for (const out of [home({ readOnly: true }), home({ closed: true })]) {
      expect(out).not.toContain(UNSENT)
      expect(out).not.toContain(hrHR['kitchen.home.cta.reviewChanges'])
    }
  })

  test('the same test as the maker’s "izmijenjeno", so the two sides agree', () => {
    const brief = '2026-10-03T10:00:00.000Z'
    expect(changedSinceBrief('2026-10-04T08:00:00.000Z', brief)).toBe(true)
    expect(changedSinceBrief(null, brief)).toBe(false)
    expect(changedSinceBrief('2026-10-03T09:00:00.000Z', brief)).toBe(false)
    expect(changedSinceBrief('2026-10-04T08:00:00.000Z', null)).toBe(false)
    for (const changed of ['2026-10-04T08:00:00.000Z', null]) {
      const status = projectDisplayStatus({
        status: 'submitted',
        openedAt: brief,
        step: 'contact',
        contentChangedAt: changed,
        currentBriefCreatedAt: brief,
      })
      expect(status === 'changed_since_submit').toBe(changedSinceBrief(changed, brief))
    }
    const page = source('src/app/kitchen/[projectId]/page.tsx')
    expect(page).toMatch(/unsentChanges=\{changedSinceBrief\(project\.contentChangedAt, brief\?\.createdAt \?\? null\)\}/)
  })

  test('the intake opens at the review for it: queued from the restored journey, through any step still owed', () => {
    const intake = source('src/components/kitchen-intake/index.tsx')
    expect(intake).toMatch(
      /if \(startAt === 'review'\) \{[\s\S]{0,400}if \(!\(applied\?\.isDone && applied\.wrapUpData\)\) setReviewQueued\(true\)\s*\} else if \(startAt\)/
    )
  })

  test('the copy, hr-HR first — calm, no urgency', () => {
    expect(hrHR['kitchen.home.status.unsent']).toBe('Imaš izmjene koje još nisu poslane — {maker} ima raniju verziju sažetka.')
    expect(hrHR['kitchen.home.cta.reviewChanges']).toBe('Pregledaj i pošalji izmjene')
    expect(enUS['kitchen.home.status.unsent']).toBe("You have changes that aren't sent yet — {maker} has the earlier version of your brief.")
    expect(enUS['kitchen.home.cta.reviewChanges']).toBe('Review and send the changes')
  })
})

describe('fix anything from the review (IMP-07 step 2)', () => {
  /** A profile that fills every review section. */
  const FULL: LeadProfile = {
    ...BUILT,
    floorPlan: CONTRACT_FIXTURES.find((f) => f.id === 'l-shape')!.build(),
    conceptRenders: [
      {
        id: 'r1',
        imageDataUrl: 'data:image/jpeg;base64,AAAA',
        prompt: '',
        modelVersion: 'mock',
        anchorPhotoIndex: 0,
        nudges: [],
        inputs: [],
        generatedAt: '2026-10-04T08:00:00.000Z',
      },
    ],
    conceptRenderChosenId: 'r1',
    projectType: 'full_remodel',
    timeline: '3_6_months',
    scope: { cabinets: true },
    stylePreferences: ['modern'],
    trades: { electrical: { cookerType: 'induction' } },
    lighting: { taskLayer: true },
    mustHaves: [{ trade: 'Pull-out pantry' }],
    logistics: { siteAccess: 'lift' },
    decisionConfidence: { layout: 'locked' },
    moodBoardItems: [{ id: 'm1', source: 'upload', imageUrl: 'data:image/jpeg;base64,BBBB' }],
    phone: '+385 91 000 0000',
  }
  const FIXABLE = [
    'wrapup.section.render',
    'wrapup.section.space',
    'wrapup.section.basics',
    'wrapup.section.style',
    'wrapup.section.materials',
    'wrapup.section.trades',
    'wrapup.section.lighting',
    'wrapup.section.wishlist',
    'wrapup.section.logistics',
    'wrapup.section.moodboard',
    'wrapup.section.contact',
  ] as const
  const fixButtons = (html: string) => (html.match(/data-fix=/g) ?? []).length

  test('one "Nešto ispraviti?" per section that a step still asks — not scope, not decision confidence', () => {
    const html = review({ profile: FULL, onFix: () => {} })
    // Every section renders…
    for (const key of [...FIXABLE, 'wrapup.section.scope', 'wrapup.section.confidence'] as const) {
      expect(html, key).toContain(hrHR[key])
    }
    // …and the fixable ones, only, carry a button labelled with their title.
    expect(fixButtons(html)).toBe(FIXABLE.length)
    const label = (key: (typeof FIXABLE)[number] | 'wrapup.section.scope' | 'wrapup.section.confidence') =>
      `aria-label="${hrHR['wrapup.fixAnything']}: ${hrHR[key]}`
    for (const key of FIXABLE) expect(html, key).toContain(label(key))
    expect(html).not.toContain(label('wrapup.section.scope'))
    expect(html).not.toContain(label('wrapup.section.confidence'))
  })

  test('style and materials are two sections: the tags fix at inspiration, the picks in the builder', () => {
    const label = (key: 'wrapup.section.style' | 'wrapup.section.materials') =>
      `aria-label="${hrHR['wrapup.fixAnything']}: ${hrHR[key]}"`
    // Tags, no build (the "Sastavi kuhinju" path): only the style section.
    const tagsOnly = review({ profile: { name: 'Ana', stylePreferences: ['modern'] }, onFix: () => {} })
    expect(tagsOnly).toContain(label('wrapup.section.style'))
    expect(tagsOnly).not.toContain(label('wrapup.section.materials'))
    // A build, no tags: only the materials section.
    const picksOnly = review({ profile: BUILT, onFix: () => {} })
    expect(picksOnly).toContain(label('wrapup.section.materials'))
    expect(picksOnly).not.toContain(label('wrapup.section.style'))
    expect(hrHR['wrapup.section.style']).toBe('Stil')
    expect(hrHR['wrapup.section.materials']).toBe('Materijali')
    expect(enUS['wrapup.section.materials']).toBe('Materials')
  })

  test('the contact section: the name and how to reach them', () => {
    const out = text(review({ profile: FULL, onFix: () => {} }))
    expect(out).toContain(hrHR['wrapup.row.name'])
    expect(out).toContain('Ana')
    expect(out).toContain('ana@example.test · +385 91 000 0000')
  })

  test('no fix buttons for the maker looking in, nor without onFix', () => {
    expect(fixButtons(review({ profile: FULL, onFix: () => {}, readOnly: true }))).toBe(0)
    expect(fixButtons(review({ profile: FULL }))).toBe(0)
  })

  test('Back to the steps only when the intake wires it, and never for the maker', () => {
    const back = hrHR['wrapup.actions.backToSteps']
    expect(review({ onBack: () => {} })).toContain(back)
    expect(review({})).not.toContain(back)
    expect(review({ onBack: () => {}, readOnly: true })).not.toContain(back)
    // Back comes first, above the header.
    const html = review({ onBack: () => {} })
    expect(html.indexOf(back)).toBeLessThan(html.indexOf(hrHR['wrapup.title']))
  })

  test('after a send, editing stays open: the fix buttons and Back are still there', () => {
    const html = review({ profile: FULL, onFix: () => {}, onBack: () => {}, onFileBriefId: BRIEF_ID })
    expect(fixButtons(html)).toBe(FIXABLE.length)
    expect(html).toContain(hrHR['wrapup.actions.backToSteps'])
  })
})

describe('the edits reach their step, at the source', () => {
  const intake = source('src/components/kitchen-intake/index.tsx')

  test('the review’s Back reopens the contact step; its fixes go through openStep', () => {
    const mount = intake.match(/<WrapUpScreen[\s\S]*?\/>/)![0]
    expect(mount).toMatch(/onBack=\{\s*readOnly\s*\?\s*undefined\s*:\s*\(\) => \{\s*setIsDone\(false\)\s*goTo\('contact'\)\s*\}/)
    expect(mount).toMatch(/onFix=\{readOnly \? undefined : openStep\}/)
    expect(intake).toMatch(
      /function openStep\(target: ReviewTarget\) \{\s*leaveStep\(\)\s*if \(target\.step === 'builder' && !profile\.builderState\) setBuilderGroupId\(undefined\)\s*else if \(target\.group\) setBuilderGroupId\(target\.group\)\s*setIsDone\(false\)\s*goTo\(target\.step\)/
    )
  })

  test('both rails reopen done steps, and nothing does for the maker', () => {
    const rails = [...intake.matchAll(/<JourneyNavRail[\s\S]*?\/>/g)].map((m) => m[0])
    expect(rails).toHaveLength(2)
    for (const rail of rails) expect(rail).toMatch(/onStepSelect=\{readOnly \? undefined : openStep\}/)
    expect(rails[0]).toMatch(/expandDone=\{readOnly \? undefined : true\}/)
    expect(rails[1]).toMatch(/expandDone=\{readOnly \? undefined : editing\}/)
  })

  test('Continue goes through afterCommit, and the review is built only by the queued effect', () => {
    expect(intake).toMatch(
      /const commitContext = \{ editing, hasBuild: Boolean\(profile\.builderState\), photosChanged, owed: owedSteps \}/
    )
    expect(intake).toMatch(/const next = afterCommit\(state\.currentStepId, commitContext\)/)
    expect(intake).toMatch(/continueLabel=\{continueKey\(state\.currentStepId, commitContext\)\}/)
    // finalise() is called in exactly one place: the effect that consumes the queue.
    const calls = [...intake.matchAll(/(?<!function )\bfinalise\(\)/g)]
    expect(calls).toHaveLength(1)
    expect(intake).toMatch(/if \(!reviewQueued\) return[\s\S]{0,200}setReviewQueued\(false\)[\s\S]{0,300}void finalise\(\)/)
    // The contact step no longer builds the review from a stale closure itself.
    expect(intake).not.toMatch(/await finalise\(/)
  })

  test('the builder goes back to the review only while editing, saving first', () => {
    expect(intake).toMatch(/onBackToReview=\{\s*editing && !readOnly/)
    const shell = source('src/components/builder/BuilderShell.tsx')
    expect(shell).toMatch(/autosave\.cancel\(\)\s*onBackToReview\(s, currentId\)/)
  })

  test('the kitchen home opens "Izmijeni kuhinju" through editEntryStep', () => {
    const home = source('src/app/kitchen/[projectId]/KitchenHome.tsx')
    expect(home).toMatch(
      /setStartAt\(editEntryStep\(\{ submitted, readOnly: props\.readOnly, unsentChanges: unsent \}\)\)\s*setEntered\(true\)/
    )
  })

  test('the step-2 copy, hr-HR first', () => {
    expect(hrHR['wrapup.actions.backToSteps']).toBe('Natrag na korake')
    expect(hrHR['nav.backToReview']).toBe('Natrag na pregled')
    expect(hrHR['wrapup.section.contact']).toBe('Kontakt')
    expect(hrHR['wrapup.row.name']).toBe('Ime')
    expect(hrHR['wrapup.row.channels']).toBe('E-pošta / telefon')
    expect(enUS['wrapup.actions.backToSteps']).toBe('Back to the steps')
    expect(enUS['nav.backToReview']).toBe('Back to the review')
  })
})

describe('a revisit shows the saved range (IMP-07 step 3)', () => {
  /** The brief on file, as the kitchen page hands it over (savedEstimate). */
  const SAVED: HandoffEstimate = {
    low: 8_100,
    high: 9_900,
    withAppliances: null,
    basis: '',
    bandPct: 11,
    lines: [],
    assumptions: ['installIncluded', 'noTrades'],
  }
  const NBSP = ' '
  const SAVED_FIGURES = `8.100${NBSP}€ – 9.900${NBSP}€`

  test('the review is the brief on file: its stored figures, "sent", what happens next, the download — no send', () => {
    const html = review({ onFileBriefId: BRIEF_ID, initialResult: { briefId: BRIEF_ID, estimate: SAVED } })
    const out = text(html)
    expect(out).toContain(SAVED_FIGURES)
    expect(out).toContain(`±11${NBSP}%`)
    expect(out).not.toContain(formatRange(estimateFromBuild(BUILT)!))
    expect(html).toContain(hrHR['wrapup.estimate.sentBadge'])
    expect(html).not.toContain(hrHR['wrapup.estimate.bomBadge'])
    expect(html).toContain(hrHR['wrapup.next.title'])
    expect(html).toContain(hrHR['wrapup.next.ref'].replace('{id}', BRIEF_ID.slice(0, 8)))
    expect(html).toContain(hrHR['wrapup.actions.download'])
    expectNoSend(html)
    expect(out).not.toContain('Procjena još nije dostupna')
  })

  test('a newer review than the brief on file: the build’s figures and "Pošalji izmjene", no download', () => {
    const html = review({ onFileBriefId: OTHER_ID, initialResult: { briefId: OTHER_ID, estimate: SAVED } })
    const out = text(html)
    expect(out).not.toContain(SAVED_FIGURES)
    expect(out).toContain(formatRange(estimateFromBuild(BUILT)!))
    expect(html).toContain(CHANGES)
    expect(html).toContain(hrHR['wrapup.estimate.bomBadge'])
    expect(html).not.toContain(hrHR['wrapup.actions.download'])
  })

  test('sent from this tab earlier (the page loaded with an older brief): sent, the build’s figures, the download', () => {
    const html = review({ onFileBriefId: BRIEF_ID, initialResult: { briefId: OTHER_ID, estimate: SAVED } })
    expect(text(html)).not.toContain(SAVED_FIGURES)
    expect(html).toContain(hrHR['wrapup.estimate.sentBadge'])
    expect(html).toContain(hrHR['wrapup.actions.download'])
    expectNoSend(html)
  })

  test('the brief went out without a range: no figures, the way to the builder, still sent', () => {
    const html = review({
      profile: { name: 'Ana' },
      onOpenBuilder: () => {},
      onFileBriefId: BRIEF_ID,
      initialResult: { briefId: BRIEF_ID, estimate: null },
    })
    expect(html).not.toContain('€')
    expect(html).toContain(hrHR['wrapup.estimate.noBuild'])
    expect(html).toContain(hrHR['wrapup.next.title'])
    expectNoSend(html)
  })

  test('the maker looking in: still only the status line, no download', () => {
    const html = review({ readOnly: true, onFileBriefId: BRIEF_ID, initialResult: { briefId: BRIEF_ID, estimate: SAVED } })
    expect(text(html)).not.toContain(SAVED_FIGURES)
    expect(html).toContain(hrHR['wrapup.readOnly.sent'])
    expect(html).not.toContain(hrHR['wrapup.actions.download'])
  })

  test('the saved figures come from one JSON path of the brief, never the whole bundle', () => {
    const page = source('src/app/kitchen/[projectId]/page.tsx')
    expect(page).toContain('estimate:bundle->estimate')
    expect(page).not.toMatch(/['"`,\s]bundle\s*[,'"`]/)
    // And reach the client only through savedEstimate (no maker-only money).
    expect(page).toMatch(/estimate: savedEstimate\(data\.estimate,/)
  })

  test('the download reads the brief on file only on the click, from the customer’s route', () => {
    const wrapUp = source('src/components/kitchen-intake/WrapUpScreen.tsx')
    const download = wrapUp.match(/async function downloadHandoff\(\) \{[\s\S]*?\n {2}\}\n/)![0]
    expect(download).toContain('fetch(`/api/projects/${projectId}/brief`')
    expect(wrapUp.match(/\/api\/projects\/\$\{projectId\}\/brief/g)).toHaveLength(1)
    expect(wrapUp).toMatch(/onClick=\{downloadHandoff\}/)
  })

  test('the copy', () => {
    expect(hrHR['wrapup.estimate.sentBadge']).toBe('Poslano izrađivaču')
    expect(enUS['wrapup.estimate.sentBadge']).toBe('Sent to your maker')
  })
})
