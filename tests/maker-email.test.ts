import { describe, expect, test } from 'vitest'
import { buildMakerEmail } from '@/lib/notify/maker-email'
import type { HandoffBundle } from '@/lib/types'

const bundle = {
  brief: { name: 'Ana <Test>', contactValue: 'ana@example.com', layoutShape: 'l_shape', timeline: '3_6_months' },
  moodBoard: [], floorPlan: null, explorationRefs: [], chosenRender: null, transcript: [], generatedAt: 'x',
  estimate: { low: 3035, high: 4286, withAppliances: { low: 5099, high: 7492 }, basis: '', placeholder: false, bandPct: 17 },
} as unknown as HandoffBundle

describe('maker email', () => {
  test('subject carries name + range, body links the brief and escapes html', () => {
    const m = buildMakerEmail({ briefId: 'abc-123', bundle, baseUrl: 'https://app.example' })
    expect(m.subject).toContain('Ana <Test>')
    expect(m.subject).toContain('3.035 € – 4.286 €')
    expect(m.html).toContain('https://app.example/maker/abc-123')
    expect(m.html).toContain('Ana &lt;Test&gt;')
    expect(m.html).not.toContain('<Test>')
    expect(m.text).toContain('Sve uključeno: 5.099 € – 7.492 €')
  })

  test('a signed-in customer shows their account email and the optional phone', () => {
    const signedIn = {
      ...bundle,
      brief: { name: 'Ana', email: 'ana@example.com', phone: '+385 91 123 4567' },
    } as unknown as HandoffBundle
    const m = buildMakerEmail({ briefId: 'abc-123', bundle: signedIn, baseUrl: 'https://app.example' })
    expect(m.text).toContain('Homeowner: Ana · ana@example.com · +385 91 123 4567')
  })
})
