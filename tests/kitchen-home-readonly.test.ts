/**
 * The maker can look in at their customer's kitchen home (/kitchen/<projectId>,
 * readOnly when the session is not the customer's). It used to be the
 * homeowner's page word for word: "Stolarija te pozvao da opišeš svoju
 * kuhinju" or "Tvoj sažetak je kod Stolarija", under "TVOJA KUHINJA"; the
 * walkthrough of what to photograph and have ready; "javit ćemo ti kad ga
 * otvori"; and a button reading "Nastavi · korak 8/8" or "Izmijeni kuhinju"
 * into an intake the maker can only look at.
 *
 * Now the maker reads where the customer is (not started, still describing,
 * sent), the status about themselves, the range "ti potvrđuješ", and one
 * button: "Pogledaj kuhinju" — only once there is something of the
 * customer's to look at. The customer's page is unchanged.
 *
 * Rendered statically (no DOM), like tests/wrapup-readonly.test.ts.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { KitchenHome, type KitchenHomeProps } from '@/app/kitchen/[projectId]/KitchenHome'
import { hrHR } from '@/lib/i18n/locales/hr-HR'
import { enUS } from '@/lib/i18n/locales/en-US'

const MAKER = 'Stolarija Horvat'
const SENT_ON = '4. 10. 2026.'
const OPENED_ON = '5. 10. 2026.'

const NOT_STARTED: KitchenHomeProps = {
  projectId: 'p1',
  makerName: MAKER,
  stepLabel: null,
  submittedAt: null,
  makerViewedAt: null,
  briefId: null,
  range: null,
  decision: null,
  closed: false,
  started: false,
  revision: 1,
  readOnly: true,
  snapshot: null,
  customerEmail: 'kupac@example.test',
  customerName: 'Ana',
}
const IN_PROGRESS: KitchenHomeProps = { ...NOT_STARTED, started: true, stepLabel: 'korak 8/8' }
const SENT: KitchenHomeProps = {
  ...IN_PROGRESS,
  submittedAt: SENT_ON,
  briefId: 'b1',
  range: { low: 5291, high: 7376, bandPct: 14, assumptions: ['installIncluded', 'noTrades'] },
}

function home(props: KitchenHomeProps) {
  return renderToStaticMarkup(createElement(KitchenHome, props))
}

/** The homeowner's page: none of it reaches the maker. */
function expectNoHomeownerCopy(html: string) {
  expect(html).not.toContain(hrHR['kitchen.home.eyebrow'])
  expect(html).not.toContain('te pozvao')
  expect(html).not.toContain('Tvoj sažetak je kod')
  expect(html).not.toContain(hrHR['kitchen.home.what'])
  expect(html).not.toContain(hrHR['kitchen.home.act.space'])
  expect(html).not.toContain(hrHR['kitchen.home.need.title'])
  expect(html).not.toContain(hrHR['kitchen.home.time'])
  expect(html).not.toContain(hrHR['kitchen.home.cta.start'] + '<')
  expect(html).not.toContain('Nastavi ·')
  expect(html).not.toContain(hrHR['kitchen.home.cta.edit'])
  expect(html).not.toContain(hrHR['kitchen.home.cta.build'])
  expect(html).not.toContain('vidi tvoj napredak')
  expect(html).not.toContain('Ako nešto izmijeniš')
  expect(html).not.toContain('javit ćemo ti')
  // "your" about the customer's things, in any form.
  expect(html).not.toMatch(/\btvo[jgm]/i)
}

describe('the maker looking in at the kitchen home', () => {
  test('not started: the customer’s kitchen, "not started yet", what will appear — and nothing to open', () => {
    const html = home(NOT_STARTED)
    expect(html).toContain(hrHR['kitchen.home.readOnly.eyebrow'])
    expect(html).toContain(hrHR['kitchen.home.readOnly.title'])
    expect(html).toContain(hrHR['kitchen.home.readOnly.notStarted'])
    expect(html).not.toContain(hrHR['kitchen.home.readOnly.cta'])
    expect(html).not.toContain(hrHR['kitchen.home.readOnly.note'])
    expectNoHomeownerCopy(html)
  })

  test('in progress: still describing, where it was last saved, and "look at the kitchen", not "continue"', () => {
    const html = home(IN_PROGRESS)
    expect(html).toContain(hrHR['kitchen.home.readOnly.titleStarted'])
    expect(html).toContain('Zadnje spremljeno: korak 8/8.')
    expect(html).toContain(hrHR['kitchen.home.readOnly.cta'])
    expect(html).toContain(hrHR['kitchen.home.readOnly.note'])
    expectNoHomeownerCopy(html)
  })

  test('in progress without a known step: no empty "last saved"', () => {
    const html = home({ ...IN_PROGRESS, stepLabel: null })
    expect(html).toContain(hrHR['kitchen.home.readOnly.titleStarted'])
    expect(html).not.toContain('Zadnje spremljeno')
    expect(html).toContain(hrHR['kitchen.home.readOnly.cta'])
  })

  test('sent, not opened: "sent", where to open it, the range "you confirm", and "look", not "edit"', () => {
    const html = home(SENT)
    expect(html).toContain(hrHR['kitchen.home.readOnly.titleSubmitted'])
    expect(html).toContain(hrHR['kitchen.home.status.sent'].replace('{date}', SENT_ON))
    expect(html).toContain(hrHR['kitchen.home.readOnly.status.notSeen'])
    expect(html).toContain(hrHR['range.confirms.maker'])
    expect(html).not.toContain(MAKER)
    expect(html).toContain(hrHR['kitchen.home.readOnly.cta'])
    expect(html).toContain(hrHR['kitchen.home.readOnly.note'])
    expect(html).not.toContain(hrHR['kitchen.home.readOnly.titleStarted'])
    expectNoHomeownerCopy(html)
  })

  test('sent and opened: what the customer sees about it', () => {
    const html = home({ ...SENT, makerViewedAt: OPENED_ON })
    expect(html).toContain(`Kupac vidi da je sažetak otvoren ${OPENED_ON}`)
    expect(html).not.toContain(hrHR['kitchen.home.readOnly.status.notSeen'])
    expect(html).not.toContain('je otvorio sažetak')
    expectNoHomeownerCopy(html)
  })

  test('sent without a build: when the range comes, and no way into the builder', () => {
    const html = home({ ...SENT, range: null })
    expect(html).toContain(hrHR['kitchen.home.readOnly.status.noRange'])
    expect(html).not.toContain(hrHR['kitchen.home.status.noRange'])
    expect(html).not.toContain('€')
    expectNoHomeownerCopy(html)
  })

  test('a decision: the pill, and under it what the customer reads — in the maker’s words', () => {
    const cases = [
      { status: 'quoted', closed: false, next: 'kitchen.home.readOnly.decision.quotedNext' },
      { status: 'clarify', closed: false, next: 'kitchen.home.readOnly.decision.clarifyNext' },
      { status: 'declined', closed: true, next: 'kitchen.home.readOnly.decision.declinedNext' },
    ] as const
    for (const c of cases) {
      const html = home({ ...SENT, closed: c.closed, decision: { status: c.status, date: SENT_ON, note: null } })
      expect(html).toContain(hrHR[`kitchen.home.decision.pill.${c.status}`])
      expect(html).toContain(hrHR[c.next])
      expect(html).not.toContain(hrHR[`kitchen.home.decision.${c.status}Next`])
      expectNoHomeownerCopy(html)
    }
  })

  test('closed: the heading says so, and there is nothing to open', () => {
    const html = home({ ...SENT, closed: true, decision: { status: 'declined', date: SENT_ON, note: null } })
    expect(html).toContain(hrHR['kitchen.home.titleClosed'])
    expect(html).not.toContain(hrHR['kitchen.home.readOnly.cta'])
    expect(html).not.toContain(hrHR['kitchen.home.readOnly.titleSubmitted'])
  })
})

describe('the customer’s home is unchanged', () => {
  const customer = (props: KitchenHomeProps) => home({ ...props, readOnly: false })
  const READ_ONLY_KEYS = (Object.keys(hrHR) as (keyof typeof hrHR)[]).filter((k) =>
    k.startsWith('kitchen.home.readOnly.')
  )
  const expectNoMakerCopy = (html: string) => {
    for (const k of READ_ONLY_KEYS) {
      const fixed = hrHR[k].split(/\{\w+\}/)[0]
      if (fixed) expect(html, k).not.toContain(fixed)
    }
  }

  test('not started: invited by the maker, the walkthrough, "Počni"', () => {
    const html = customer(NOT_STARTED)
    expect(html).toContain(hrHR['kitchen.home.eyebrow'])
    expect(html).toContain(hrHR['kitchen.home.title'].replace('{maker}', MAKER))
    expect(html).toContain(hrHR['kitchen.home.what'])
    expect(html).toContain(hrHR['kitchen.home.cta.start'])
    expect(html).toContain(hrHR['kitchen.makerSees'].replace('{maker}', MAKER))
    expectNoMakerCopy(html)
  })

  test('in progress: "Nastavi · korak 8/8"', () => {
    const html = customer(IN_PROGRESS)
    expect(html).toContain('Nastavi · korak 8/8')
    expect(html).toContain(hrHR['kitchen.home.what'])
    expectNoMakerCopy(html)
  })

  test('sent: with the maker, "not opened yet — we’ll tell you", "Izmijeni kuhinju"', () => {
    const html = customer(SENT)
    expect(html).toContain(hrHR['kitchen.home.titleSubmitted'].replace('{maker}', MAKER))
    expect(html).toContain(hrHR['kitchen.home.status.notSeen'].replace('{maker}', MAKER))
    expect(html).toContain(`raspon koji ${MAKER} potvrđuje`)
    expect(html).toContain(hrHR['kitchen.home.cta.edit'])
    expect(html).toContain(hrHR['kitchen.home.editNote'].replace('{maker}', MAKER))
    expectNoMakerCopy(html)
  })

  test('a decision: the homeowner’s "what next"', () => {
    const html = customer({ ...SENT, decision: { status: 'quoted', date: SENT_ON, note: null } })
    expect(html).toContain(hrHR['kitchen.home.decision.quotedNext'])
    expectNoMakerCopy(html)
  })
})

describe('the copy, hr-HR first, en-US the same keys', () => {
  test('the maker’s heading, status and button', () => {
    expect(hrHR['kitchen.home.readOnly.eyebrow']).toBe('Kuhinja kupca')
    expect(hrHR['kitchen.home.readOnly.title']).toBe('Kupac još nije počeo')
    expect(hrHR['kitchen.home.readOnly.titleStarted']).toBe('Kupac još opisuje kuhinju')
    expect(hrHR['kitchen.home.readOnly.titleSubmitted']).toBe('Kupac je poslao sažetak')
    expect(hrHR['kitchen.home.readOnly.notStarted']).toBe(
      'Kad počne, ovdje ćeš vidjeti kuhinju onako kako je opisuje.'
    )
    expect(hrHR['kitchen.home.readOnly.lastSaved']).toBe('Zadnje spremljeno: {step}.')
    expect(hrHR['kitchen.home.readOnly.cta']).toBe('Pogledaj kuhinju')
    expect(hrHR['kitchen.home.readOnly.note']).toBe('Samo za gledanje — kuhinju mijenja kupac.')
    expect(hrHR['kitchen.home.readOnly.status.seen']).toBe('Kupac vidi da je sažetak otvoren {date}')
    expect(hrHR['kitchen.home.readOnly.status.notSeen']).toBe('Sažetak još nije otvoren — otvori ga s popisa.')
    expect(hrHR['kitchen.home.readOnly.status.noRange']).toBe('Raspon stiže kad kupac sastavi kuhinju.')

    expect(enUS['kitchen.home.readOnly.eyebrow']).toBe("The customer's kitchen")
    expect(enUS['kitchen.home.readOnly.title']).toBe("The customer hasn't started yet")
    expect(enUS['kitchen.home.readOnly.titleStarted']).toBe('The customer is still describing the kitchen')
    expect(enUS['kitchen.home.readOnly.titleSubmitted']).toBe('The customer has sent the brief')
    expect(enUS['kitchen.home.readOnly.cta']).toBe('Look at the kitchen')
    expect(enUS['kitchen.home.readOnly.note']).toBe('Only for looking — the customer makes the changes.')
    expect(enUS['kitchen.home.readOnly.status.notSeen']).toBe(
      "You haven't opened the brief yet — open it from your list."
    )
  })

  test('the hr date ends in a full stop, so no line puts another after {date}', () => {
    expect(hrHR['kitchen.home.readOnly.status.seen']).toMatch(/\{date\}$/)
    expect(enUS['kitchen.home.readOnly.status.seen']).toMatch(/\{date\}\.$/)
  })

  test('no maker line says "tvoj", and none speaks of the maker in the third person', () => {
    const keys = (Object.keys(hrHR) as (keyof typeof hrHR)[]).filter((k) => k.startsWith('kitchen.home.readOnly.'))
    expect(keys.length).toBeGreaterThan(10)
    for (const k of keys) {
      expect(hrHR[k], k).not.toMatch(/\btvo[jgm]|\{maker\}|izrađivač/i)
      expect(enUS[k], k).not.toMatch(/\{maker\}|\bthe maker\b/i)
    }
  })
})
