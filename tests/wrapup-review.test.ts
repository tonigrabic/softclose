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
import type { LeadProfile } from '@/lib/types'

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
    expect(mount![0]).toMatch(/onSent=\{readOnly \? undefined/)
    expect(mount![0]).toMatch(/onFileBriefId=\{sentBriefId \?\? currentBriefId\}/)
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
})
