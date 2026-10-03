/**
 * IMP-03: the rules behind the maker's three buttons.
 *
 * The table is the product decision — quoted and declined are final for a
 * brief, a question keeps it open — so every cell is pinned here rather than
 * left to whoever next edits the panel. The amount rules matter for a second
 * reason: `quoted_eur` is the denominator of the ±20% hit rate, and a quote
 * that saved as 62 € instead of 6,200 € is a wrong data point nobody notices.
 */
import { describe, expect, it } from 'vitest'
import {
  canDecide,
  formatDecisionDate,
  formatQuoteEur,
  isDecided,
  isMakerDecision,
  MAKER_DECISIONS,
  NOTE_MAX,
  OPEN_STATUSES,
  parseEurInput,
  QUOTE_MAX_EUR,
  validateDecision,
} from '@/lib/project/decision'

const FROM = ['new', 'viewed', 'clarify', 'quoted', 'declined'] as const

/** The minimum valid extras for each decision, so a cell tests the transition only. */
const EXTRAS = {
  quoted: { quotedEur: 6200 },
  clarify: { note: 'Koja je visina stropa?' },
  declined: {},
} as const

const ALLOWED: Record<(typeof FROM)[number], boolean> = {
  new: true,
  viewed: true,
  clarify: true,
  quoted: false,
  declined: false,
}

describe('transition table', () => {
  for (const from of FROM) {
    for (const to of MAKER_DECISIONS) {
      const allowed = ALLOWED[from]
      it(`${from} → ${to}: ${allowed ? 'allowed' : 'refused'}`, () => {
        const r = validateDecision({ from, to, ...EXTRAS[to] })
        expect(canDecide(from, to)).toBe(allowed)
        if (allowed) {
          expect(r).toMatchObject({ ok: true, decision: { status: to } })
        } else {
          expect(r).toEqual({ ok: false, error: 'transition' })
        }
      })
    }
  }

  it('open statuses are exactly new, viewed and clarify', () => {
    expect([...OPEN_STATUSES]).toEqual(['new', 'viewed', 'clarify'])
  })

  for (const to of ['viewed', 'new', 'x', 42, null, undefined] as const) {
    it(`refuses ${JSON.stringify(to)} as a decision`, () => {
      expect(validateDecision({ from: 'viewed', to, quotedEur: 6200, note: 'n' })).toEqual({
        ok: false,
        error: 'invalid_status',
      })
      expect(isMakerDecision(to)).toBe(false)
    })
  }

  it('reports invalid_status before transition, even from a closed status', () => {
    expect(validateDecision({ from: 'quoted', to: 'viewed' })).toEqual({ ok: false, error: 'invalid_status' })
  })

  it('isDecided is true for exactly the three decisions', () => {
    expect(MAKER_DECISIONS.every((d) => isDecided(d))).toBe(true)
    expect(isDecided('new')).toBe(false)
    expect(isDecided('viewed')).toBe(false)
    expect(isDecided(null)).toBe(false)
    expect(isDecided(undefined)).toBe(false)
  })
})

describe('amount', () => {
  it('is required for a quote', () => {
    expect(validateDecision({ from: 'viewed', to: 'quoted' })).toEqual({ ok: false, error: 'amount_required' })
    expect(validateDecision({ from: 'viewed', to: 'quoted', quotedEur: null })).toEqual({
      ok: false,
      error: 'amount_required',
    })
  })

  for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, '6200', 1_000_001, 0.004, {}, true] as const) {
    it(`refuses ${String(bad)} (${typeof bad})`, () => {
      expect(validateDecision({ from: 'viewed', to: 'quoted', quotedEur: bad })).toEqual({
        ok: false,
        error: 'amount_invalid',
      })
    })
  }

  it('accepts the bounds: one cent and the maximum', () => {
    expect(validateDecision({ from: 'viewed', to: 'quoted', quotedEur: 0.01 })).toMatchObject({
      ok: true,
      decision: { quotedEur: 0.01 },
    })
    expect(validateDecision({ from: 'viewed', to: 'quoted', quotedEur: QUOTE_MAX_EUR })).toMatchObject({
      ok: true,
      decision: { quotedEur: QUOTE_MAX_EUR },
    })
  })

  it('rounds to cents as written, not as the float rounds', () => {
    // 6200.555 * 100 is 620055.4999… in binary; a naive Math.round gives .55.
    expect(validateDecision({ from: 'viewed', to: 'quoted', quotedEur: 6200.555 })).toMatchObject({
      ok: true,
      decision: { quotedEur: 6200.56 },
    })
    expect(validateDecision({ from: 'viewed', to: 'quoted', quotedEur: 6200 })).toMatchObject({
      ok: true,
      decision: { quotedEur: 6200 },
    })
  })

  it('is ignored for clarify and declined, so it is never written for them', () => {
    expect(validateDecision({ from: 'viewed', to: 'clarify', note: 'Pitanje', quotedEur: 6200 })).toEqual({
      ok: true,
      decision: { status: 'clarify', note: 'Pitanje', quotedEur: null },
    })
    // Even an invalid one: it is not part of these decisions at all.
    expect(validateDecision({ from: 'viewed', to: 'declined', quotedEur: -5 })).toEqual({
      ok: true,
      decision: { status: 'declined', note: null, quotedEur: null },
    })
  })
})

describe('note', () => {
  it('is required for clarify — the question is the decision', () => {
    expect(validateDecision({ from: 'viewed', to: 'clarify' })).toEqual({ ok: false, error: 'note_required' })
    expect(validateDecision({ from: 'viewed', to: 'clarify', note: '   \n ' })).toEqual({
      ok: false,
      error: 'note_required',
    })
  })

  it('treats a non-string as no note', () => {
    expect(validateDecision({ from: 'viewed', to: 'clarify', note: 42 })).toEqual({ ok: false, error: 'note_required' })
    expect(validateDecision({ from: 'viewed', to: 'declined', note: { x: 1 } })).toEqual({
      ok: true,
      decision: { status: 'declined', note: null, quotedEur: null },
    })
  })

  it(`refuses more than ${NOTE_MAX} characters, after trimming`, () => {
    expect(validateDecision({ from: 'viewed', to: 'clarify', note: 'a'.repeat(NOTE_MAX + 1) })).toEqual({
      ok: false,
      error: 'note_too_long',
    })
    expect(validateDecision({ from: 'viewed', to: 'declined', note: 'a'.repeat(NOTE_MAX + 1) })).toEqual({
      ok: false,
      error: 'note_too_long',
    })
    expect(validateDecision({ from: 'viewed', to: 'clarify', note: `  ${'a'.repeat(NOTE_MAX)}  ` })).toMatchObject({
      ok: true,
    })
  })

  it('counts characters the way Postgres does, not UTF-16 units', () => {
    // 1000 emoji are 2000 UTF-16 units but 1000 characters to char_length().
    expect(validateDecision({ from: 'viewed', to: 'clarify', note: '🙂'.repeat(NOTE_MAX) })).toMatchObject({ ok: true })
  })

  it('is trimmed, and blank becomes null on a quote', () => {
    expect(validateDecision({ from: 'viewed', to: 'quoted', quotedEur: 6200, note: '  ' })).toEqual({
      ok: true,
      decision: { status: 'quoted', note: null, quotedEur: 6200 },
    })
    expect(validateDecision({ from: 'viewed', to: 'quoted', quotedEur: 6200, note: '  Rok 8 tjedana. ' })).toEqual({
      ok: true,
      decision: { status: 'quoted', note: 'Rok 8 tjedana.', quotedEur: 6200 },
    })
  })
})

describe('parseEurInput', () => {
  const cases: Array<[string, number | null]> = [
    ['6200', 6200],
    ['6.200', 6200],
    ['6,200', 6200],
    ['6 200', 6200],
    ['6 200 €', 6200],
    ['€6200', 6200],
    ['6 200,50', 6200.5],
    ['6.200,50', 6200.5],
    ['6,200.50', 6200.5],
    ['6200,5', 6200.5],
    ['6200.50', 6200.5],
    ['1.000.000', 1_000_000],
    ['1,000,000.00', 1_000_000],
    ['0,50', 0.5],
    // Ambiguous or malformed: refused, never guessed.
    ['1234.567', null],
    ['6.2000', null],
    ['6.200.50', null],
    ['62.00,50', null],
    ['6.200,505', null],
    ['6200.', null],
    ['.50', null],
    ['-6200', null],
    ['6200 kn', null],
    ['', null],
    ['   ', null],
    ['€', null],
  ]
  for (const [raw, expected] of cases) {
    it(`${JSON.stringify(raw)} → ${expected}`, () => {
      expect(parseEurInput(raw)).toBe(expected)
    })
  }

  it('feeds validateDecision: what the button shows is what gets saved', () => {
    const parsed = parseEurInput('6.200')
    expect(validateDecision({ from: 'viewed', to: 'quoted', quotedEur: parsed })).toMatchObject({
      ok: true,
      decision: { quotedEur: 6200 },
    })
  })
})

describe('formatQuoteEur', () => {
  // Intl separates the number and the symbol with a no-break space.
  const fmt = (n: number, locale: string) => formatQuoteEur(n, locale).replace(/\s/g, ' ')

  it('whole euros without decimals, cents only when there are some', () => {
    expect(fmt(6200, 'hr-HR')).toBe('6.200 €')
    expect(fmt(6200.5, 'hr-HR')).toBe('6.200,50 €')
    expect(fmt(1_000_000, 'hr-HR')).toBe('1.000.000 €')
    expect(fmt(6200, 'en-US')).toBe('€6,200')
    expect(fmt(6200.5, 'en-US')).toBe('€6,200.50')
  })

  it('labels the rounded amount validateDecision will save, not the raw input', () => {
    const check = validateDecision({ from: 'viewed', to: 'quoted', quotedEur: 6200.555 })
    expect(check.ok && check.decision.quotedEur !== null && fmt(check.decision.quotedEur, 'hr-HR')).toBe('6.200,56 €')
  })
})

describe('formatDecisionDate', () => {
  it('is a date in Croatian time, whatever the server clock says', () => {
    // 23:30 UTC on 2 October is 01:30 on 3 October in Zagreb (CEST).
    expect(formatDecisionDate('2026-10-02T23:30:00Z', 'hr-HR').replace(/\s/g, ' ')).toBe('03. 10. 2026.')
    expect(formatDecisionDate('2026-10-02T23:30:00Z', 'en-US')).toBe('10/3/2026')
  })
})
