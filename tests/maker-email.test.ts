import { describe, expect, test } from 'vitest'
import { buildMakerEmail } from '@/lib/notify/maker-email'
import { escapeHtml } from '@/lib/notify/html'
import { hrHR } from '@/lib/i18n/locales/hr-HR'
import { enUS } from '@/lib/i18n/locales/en-US'
import { buildHandoffBundle } from '@/lib/handoff/bundle'
import { formatRange } from '@/lib/builder/range'
import { CONTRACT_FIXTURES } from '@/lib/builder/fixtures'
import { floorPlanToLayout } from '@/lib/contract/layout-contract'
import { hydrateFromHypothesis } from '@/lib/builder/state'
import type { BuilderState } from '@/lib/builder/inventory'
import type { HandoffBundle } from '@/lib/types'

// Intl puts a non-breaking space between the amount and the euro sign.
const NBSP = ' '

const bundle = {
  brief: { name: 'Ana <Test>', contactValue: 'ana@example.com', layoutShape: 'l_shape', timeline: '3_6_months' },
  moodBoard: [], floorPlan: null, explorationRefs: [], chosenRender: null, transcript: [], generatedAt: 'x',
  estimate: {
    low: 3035,
    high: 4286,
    withAppliances: { low: 5099, high: 7492 },
    basis: '',
    bandPct: 17,
    priceBasis: 'gross-margin-v1',
    assumptions: ['installIncluded', 'noDemolition', 'noTrades', 'appliancesSeparate', 'siteCheckByMaker'],
  },
} as unknown as HandoffBundle

describe('maker email', () => {
  test('subject carries name + range, body links the brief and escapes html', () => {
    const m = buildMakerEmail({ briefId: 'abc-123', bundle, baseUrl: 'https://app.example' })
    expect(m.subject).toContain('Ana <Test>')
    // formatRange (IMP-04): 50 € steps between 2,500 and 9,999 €, and the ±.
    expect(m.subject).toContain(`3.050${NBSP}€ – 4.300${NBSP}€ · ±17${NBSP}%`)
    expect(m.html).toContain('https://app.example/maker/abc-123')
    expect(m.html).toContain('Ana &lt;Test&gt;')
    expect(m.html).not.toContain('<Test>')
    // No stored lines to tell what the goods hold: the label the brief was sent with.
    expect(m.text).toContain(`Kuhinja s uređajima: 5.100${NBSP}€ – 7.500${NBSP}€`)
    expect(m.text).not.toContain('Sve uključeno')
  })

  test('the range line: who confirms it, then one line of what it assumes', () => {
    const m = buildMakerEmail({ briefId: 'abc-123', bundle, baseUrl: 'https://app.example' })
    expect(m.text).toContain(
      `Kuhinja (izrada i montaža): 3.050${NBSP}€ – 4.300${NBSP}€ · ±17${NBSP}% · raspon koji ti potvrđuješ`
    )
    expect(m.text).toContain(
      'Pretpostavke: montaža uključena · bez rušenja i odvoza · bez elektro i vodoinstalaterskih radova · ' +
        'uređaji se obračunavaju zasebno · dostava i završna izmjera po dogovoru s izrađivačem'
    )
    // The maker is told the range is the homeowner's price, margin and PDV in.
    expect(m.html).toContain('s PDV-om i zadanom maržom radionice')
  })

  test('a brief stored without assumptions states the legacy ones; no band, no ±', () => {
    const legacy = {
      ...bundle,
      estimate: { low: 3035, high: 4286, withAppliances: null, basis: '' },
    } as unknown as HandoffBundle
    const m = buildMakerEmail({ briefId: 'abc-123', bundle: legacy, baseUrl: 'https://app.example' })
    expect(m.text).toContain(`Kuhinja (izrada i montaža): 3.050${NBSP}€ – 4.300${NBSP}€ · raspon koji ti potvrđuješ`)
    expect(m.text).not.toContain('±')
    expect(m.text).toContain('Pretpostavke: montaža uključena · bez rušenja i odvoza')
    expect(m.text).not.toContain('s uređajima')
    // No price basis: the old calculation had no margin, so the email does not claim one.
    expect(m.html).not.toContain('maržom')
  })

  test('a signed-in customer shows their account email and the optional phone', () => {
    const signedIn = {
      ...bundle,
      brief: { name: 'Ana', email: 'ana@example.com', phone: '+385 91 123 4567' },
    } as unknown as HandoffBundle
    const m = buildMakerEmail({ briefId: 'abc-123', bundle: signedIn, baseUrl: 'https://app.example' })
    expect(m.text).toContain('Kupac: Ana · ana@example.com · +385 91 123 4567')
  })

  test('a brief sent without a build says there is no range — subject and body', () => {
    const noBuild = { ...bundle, estimate: null } as unknown as HandoffBundle
    const m = buildMakerEmail({ briefId: 'abc-123', bundle: noBuild, baseUrl: 'https://app.example' })
    expect(m.subject).toContain('raspon nije dostupan')
    // \s covers the non-breaking space Intl puts before €.
    expect(m.subject).not.toMatch(/\d\s€/)
    expect(m.text).toContain('Kuhinja (izrada i montaža): raspon nije dostupan')
    expect(m.text).not.toContain('Pretpostavke')
    expect(m.text).not.toContain('s uređajima')
    expect(m.text).not.toContain('Sve uključeno')
  })

  // IMP-04 review: the homeowner buys the appliances and the maker only the
  // sink and tap. The row said "S uređajima" under "uređaje nabavlja kupac".
  test('the figure with goods is labelled by what the maker supplies', () => {
    const f = CONTRACT_FIXTURES.find((x) => x.id === 'l-shape')!
    const s = hydrateFromHypothesis(null, { layoutContract: floorPlanToLayout(f.build()) })
    const email = (state: BuilderState) => {
      const built = buildHandoffBundle({ brief: { name: 'Ana', builderState: state } })
      return { e: built.estimate!, m: buildMakerEmail({ briefId: 'b1', bundle: built, baseUrl: 'https://app.example' }) }
    }

    const sinkOnly = email({ ...s, sinkTaps: { ...s.sinkTaps, supply: 'maker_supplies' } })
    expect(sinkOnly.m.text).toContain('uređaje nabavlja kupac')
    expect(sinkOnly.m.text).toContain(`Kuhinja sa sudoperom i slavinom: ${formatRange(sinkOnly.e.withAppliances!)}`)
    expect(sinkOnly.m.text).not.toContain('s uređajima')

    const appliancesOnly = email({ ...s, appliances: { ...s.appliances, supply: 'maker_supplies' } })
    expect(appliancesOnly.m.text).toContain(`Kuhinja s uređajima: ${formatRange(appliancesOnly.e.withAppliances!)}`)

    const both = email({
      ...s,
      appliances: { ...s.appliances, supply: 'maker_supplies' },
      sinkTaps: { ...s.sinkTaps, supply: 'maker_supplies' },
    })
    expect(both.m.text).toContain(`Kuhinja s uređajima, sudoperom i slavinom: ${formatRange(both.e.withAppliances!)}`)
  })
})

// IMP-08: the maker reads their own language end to end — no English row
// label in the Croatian email, no stored option id anywhere — and the email
// links the customer's kitchen next to the brief.
describe('maker email speaks the maker\'s language', () => {
  /** A stored option id: lower-case words joined by underscores (l_shape,
   *  3_6_months, single_wall). */
  const RAW_ID = /\b[a-z0-9]+(?:_[a-z0-9]+)+\b/
  const PROJECT_ID = '55555555-5555-4555-8555-555555555555'
  const withPlan = {
    ...bundle,
    brief: {
      ...bundle.brief,
      layoutShape: 'galley',
      floorPlan: { layoutShape: 'single_wall', room: { lengthCm: 380.4, widthCm: 259.6 } },
    },
  } as unknown as HandoffBundle
  const all = (m: { subject: string; html: string; text: string }) => `${m.subject}\n${m.html}\n${m.text}`

  test.each([
    ['hr-HR', undefined],
    ['hr-HR', 'hr-HR'],
    ['en-US', 'en-US'],
  ] as const)('%s (locale %s): no raw ids, no "Homeowner"', (_, locale) => {
    for (const b of [bundle, withPlan]) {
      const m = buildMakerEmail({ briefId: 'abc-123', projectId: PROJECT_ID, bundle: b, baseUrl: 'https://app.example', locale })
      expect(all(m)).not.toMatch(RAW_ID)
      expect(all(m)).not.toMatch(/homeowner/i)
    }
  })

  test('hr-HR: Croatian labels, the layout and the timeline in words', () => {
    const m = buildMakerEmail({ briefId: 'abc-123', bundle, baseUrl: 'https://app.example' })
    expect(m.text).toContain(`${hrHR['makerEmail.row.customer']}: Ana <Test> · ana@example.com`)
    expect(m.text).toContain(`Raspored: ${hrHR['layout.shape.l_shape']}`)
    expect(m.text).toContain(`Rok: ${hrHR['option.timeline.3_6_months']}`)
    expect(m.html).toContain('<td style="padding:6px 0;color:#666;width:44%">Kupac</td>')
    expect(m.html).toContain('lang="hr"')
    // The drawn plan wins over the profile's pick, with its measured room.
    const planned = buildMakerEmail({ briefId: 'abc-123', bundle: withPlan, baseUrl: 'https://app.example' })
    expect(planned.text).toContain(`Raspored: ${hrHR['layout.shape.single_wall']} · 380 × 260 cm`)
  })

  test('en-US: every label and value in English, nothing Croatian left over', () => {
    const m = buildMakerEmail({
      briefId: 'abc-123',
      projectId: PROJECT_ID,
      bundle: withPlan,
      baseUrl: 'https://app.example',
      locale: 'en-US',
    })
    expect(m.subject).toContain(`${enUS['makerEmail.subject'].split(' — ')[0]} — Ana <Test>`)
    expect(m.subject).toContain(`€3,050 – €4,300 · ±17%`)
    expect(m.text).toContain(`${enUS['makerEmail.row.customer']}: Ana <Test>`)
    expect(m.text).toContain(`${enUS['makerEmail.row.layout']}: ${enUS['layout.shape.single_wall']} · 380 × 260 cm`)
    expect(m.text).toContain(`${enUS['makerEmail.row.timeline']}: ${enUS['option.timeline.3_6_months']}`)
    expect(m.text).toContain(`${enUS['makerEmail.row.kitchen']}: €3,050 – €4,300 · ±17% · ${enUS['range.confirms.maker']}`)
    expect(m.text).toContain(`${enUS['makerEmail.row.assumptions']}: ${enUS['range.assumption.installIncluded']}`)
    expect(m.text).toContain(`${enUS['range.withGoods.appliances']}: €5,100 – €7,500`)
    expect(m.html).toContain(escapeHtml(enUS['makerEmail.cta.brief']))
    expect(m.html).toContain(escapeHtml(enUS['makerEmail.cta.project']))
    expect(m.html).toContain(escapeHtml(enUS['makerEmail.priceBasis']))
    // Not one Croatian label from the hr-HR email.
    for (const key of [
      'makerEmail.row.customer',
      'makerEmail.row.layout',
      'makerEmail.row.timeline',
      'makerEmail.row.kitchen',
      'makerEmail.row.assumptions',
      'makerEmail.cta.brief',
      'makerEmail.heading',
      'range.confirms.maker',
    ] as const) {
      expect(all(m)).not.toContain(hrHR[key])
    }
  })

  test('an unknown locale falls back to Croatian', () => {
    const m = buildMakerEmail({ briefId: 'abc-123', bundle, baseUrl: 'https://app.example', locale: 'de-DE' })
    expect(m.text).toContain('Kupac: Ana <Test>')
  })

  test('an option id the locale does not know is left out, never printed', () => {
    const odd = {
      ...bundle,
      brief: { ...bundle.brief, layoutShape: 'z_shape', timeline: 'next_decade' },
    } as unknown as HandoffBundle
    const m = buildMakerEmail({ briefId: 'abc-123', bundle: odd, baseUrl: 'https://app.example' })
    expect(all(m)).not.toMatch(/z_shape|next_decade|layout\.shape|option\.timeline/)
    expect(m.text).toContain('Raspored: —')
    expect(m.text).toContain('Rok: —')
  })

  test('"unsure" reads as an open question to the maker, not the homeowner\'s "Nisam siguran"', () => {
    const unsure = { ...bundle, brief: { ...bundle.brief, layoutShape: 'unsure' } } as unknown as HandoffBundle
    const m = buildMakerEmail({ briefId: 'abc-123', bundle: unsure, baseUrl: 'https://app.example' })
    expect(m.text).toContain(`Raspored: ${hrHR['makerEmail.layout.unsure']}`)
    expect(m.text).not.toContain(hrHR['layout.shape.unsure'])
  })

  test('the customer\'s kitchen is linked next to the brief, absolute, when the brief has a project', () => {
    const m = buildMakerEmail({ briefId: 'abc-123', projectId: PROJECT_ID, bundle, baseUrl: 'https://app.example' })
    const brief = 'https://app.example/maker/abc-123'
    const project = `https://app.example/kitchen/${PROJECT_ID}`
    expect(m.html).toContain(`href="${brief}"`)
    expect(m.html).toContain(`href="${project}"`)
    // Side by side: the project link follows the brief button in one paragraph.
    expect(m.html).toMatch(new RegExp(`href="${brief}"[^]*?</a> <a href="${project}"`))
    expect(m.text).toContain(`${hrHR['makerEmail.cta.brief']}: ${brief}\n${hrHR['makerEmail.cta.project']}: ${project}`)

    // No project (a legacy, ownerless brief): only the brief.
    const legacy = buildMakerEmail({ briefId: 'abc-123', bundle, baseUrl: 'https://app.example' })
    expect(legacy.html).not.toContain('/kitchen/')
    expect(legacy.text).not.toContain(hrHR['makerEmail.cta.project'])
    expect(legacy.text).toContain(`${hrHR['makerEmail.cta.brief']}: ${brief}`)
  })

  test('a "$&" in a name is kept as typed in the subject', () => {
    const dollar = { ...bundle, brief: { ...bundle.brief, name: 'Ana $& Ivo' } } as unknown as HandoffBundle
    const m = buildMakerEmail({ briefId: 'abc-123', bundle: dollar, baseUrl: 'https://app.example' })
    expect(m.subject).toContain('Ana $& Ivo')
  })
})
