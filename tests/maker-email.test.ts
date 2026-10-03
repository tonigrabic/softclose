import { describe, expect, test } from 'vitest'
import { buildMakerEmail } from '@/lib/notify/maker-email'
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
    expect(m.text).toContain(`S uređajima: 5.100${NBSP}€ – 7.500${NBSP}€`)
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
    expect(m.text).not.toContain('S uređajima')
    // No price basis: the old calculation had no margin, so the email does not claim one.
    expect(m.html).not.toContain('maržom')
  })

  test('a signed-in customer shows their account email and the optional phone', () => {
    const signedIn = {
      ...bundle,
      brief: { name: 'Ana', email: 'ana@example.com', phone: '+385 91 123 4567' },
    } as unknown as HandoffBundle
    const m = buildMakerEmail({ briefId: 'abc-123', bundle: signedIn, baseUrl: 'https://app.example' })
    expect(m.text).toContain('Homeowner: Ana · ana@example.com · +385 91 123 4567')
  })

  test('a brief sent without a build says there is no range — subject and body', () => {
    const noBuild = { ...bundle, estimate: null } as unknown as HandoffBundle
    const m = buildMakerEmail({ briefId: 'abc-123', bundle: noBuild, baseUrl: 'https://app.example' })
    expect(m.subject).toContain('raspon nije dostupan')
    // \s covers the non-breaking space Intl puts before €.
    expect(m.subject).not.toMatch(/\d\s€/)
    expect(m.text).toContain('Kuhinja (izrada i montaža): raspon nije dostupan')
    expect(m.text).not.toContain('Pretpostavke')
    expect(m.text).not.toContain('S uređajima')
    expect(m.text).not.toContain('Sve uključeno')
  })
})
