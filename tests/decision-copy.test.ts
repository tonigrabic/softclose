/**
 * IMP-03 review round: what the maker is told and what the homeowner is shown
 * must match, and neither may promise what the other side does not get.
 *
 *  - Recording an amount puts "Ponuda poslana" on the customer's kitchen home,
 *    so the quote form says so, quoting the homeowner's pill verbatim.
 *  - A question is saved, not sent (no email until IMP-16): its button must
 *    not say "send".
 *  - Saving unmounts the form that held focus, so the panel keeps a live
 *    region in the DOM from the first paint, in both branches, and shows the
 *    clarify chip inside the panel while the brief stays open.
 *  - A closed kitchen home has no way into its summary, so the line under a
 *    decline mentions only the estimate, and only when one is on screen.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test, vi } from 'vitest'
import { hrHR } from '@/lib/i18n/locales/hr-HR'
import { enUS } from '@/lib/i18n/locales/en-US'
import { MAKER_DECISIONS } from '@/lib/project/decision'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh() {} }),
}))

// The panel's only server edge. Never called by a static render.
vi.mock('@/app/maker/[id]/actions', () => ({
  decideBrief: vi.fn(),
}))

import { DecisionPanel, FORM_HINT_KEY, SAVED_KEY, type DecisionView } from '@/app/maker/[id]/DecisionPanel'
import { decisionNextKey } from '@/app/kitchen/[projectId]/KitchenHome'

const BRIEF = '44444444-4444-4444-8444-444444444444'

function panel(decision: Partial<DecisionView>) {
  return renderToStaticMarkup(
    createElement(DecisionPanel, {
      briefId: BRIEF,
      decision: { status: 'viewed', note: null, quotedLabel: null, decidedLabel: null, ...decision },
    })
  )
}

describe('the maker is told what the customer will see', () => {
  test('the quote hint and the saved message quote the homeowner pill verbatim', () => {
    for (const dict of [hrHR, enUS]) {
      const pill = dict['kitchen.home.decision.pill.quoted']
      expect(dict[FORM_HINT_KEY.quoted]).toContain(pill)
      expect(dict[SAVED_KEY.quoted]).toContain(pill)
    }
  })

  test('the quote is recorded once it has gone out; its button says so', () => {
    expect(hrHR['maker.decision.submit.quote']).toMatch(/poslanu ponudu/)
    expect(enUS['maker.decision.submit.quote']).toMatch(/sent quote/)
  })

  test('a question is saved, not sent', () => {
    expect(hrHR['maker.decision.submit.clarify']).not.toMatch(/pošalji/i)
    expect(enUS['maker.decision.submit.clarify']).not.toMatch(/send/i)
    expect(hrHR[FORM_HINT_KEY.clarify]).toMatch(/kad otvori svoju kuhinju/)
  })

  test('every decision has a hint and a saved message in both locales', () => {
    for (const d of MAKER_DECISIONS) {
      for (const dict of [hrHR, enUS]) {
        expect(dict[FORM_HINT_KEY[d]]).toBeTruthy()
        expect(dict[SAVED_KEY[d]]).toBeTruthy()
      }
    }
  })
})

describe('DecisionPanel, first paint', () => {
  test('open, undecided: the live region is already there, empty; no chip', () => {
    const html = panel({ status: 'viewed' })
    expect(html).toMatch(/<p role="status"[^>]*><\/p>/)
    expect(html).not.toContain(hrHR['maker.decision.chip.clarify'].split(' ·')[0])
    expect(html).toContain(hrHR['maker.decision.visible'])
  })

  test('open after a question: the clarify chip with its date sits inside the panel, buttons still there', () => {
    const html = panel({ status: 'clarify', note: 'Visina stropa?', decidedLabel: '3. 10. 2026.' })
    expect(html).toContain(hrHR['maker.decision.chip.clarify'].replace('{date}', '3. 10. 2026.'))
    expect(html).toContain('tabindex="-1"')
    expect(html).toContain('role="status"')
    expect(html).toContain(hrHR['maker.action.quote'])
  })

  test('closed after a quote: chip, the same live region, the final line', () => {
    const html = panel({ status: 'quoted', quotedLabel: '6.200 €', decidedLabel: '3. 10. 2026.' })
    expect(html).toContain(
      hrHR['maker.decision.chip.quoted'].replace('{amount}', '6.200 €').replace('{date}', '3. 10. 2026.')
    )
    expect(html).toContain('role="status"')
    expect(html).toContain(hrHR['maker.decision.final'])
    expect(html).not.toContain(hrHR['maker.action.quote'])
  })
})

describe('the closed kitchen home promises only what it shows', () => {
  test('a decline mentions the estimate only when one is on screen', () => {
    expect(decisionNextKey('declined', true)).toBe('kitchen.home.decision.declinedNext')
    expect(decisionNextKey('declined', false)).toBeNull()
  })

  test('the decline line never offers the summary, which a closed home cannot open', () => {
    expect(hrHR['kitchen.home.decision.declinedNext']).not.toMatch(/sažetak/i)
    expect(enUS['kitchen.home.decision.declinedNext']).not.toMatch(/summary/i)
  })

  test('quote and question keep their next-step line whether or not there is a range', () => {
    for (const hasRange of [true, false]) {
      expect(decisionNextKey('quoted', hasRange)).toBe('kitchen.home.decision.quotedNext')
      expect(decisionNextKey('clarify', hasRange)).toBe('kitchen.home.decision.clarifyNext')
    }
  })
})
