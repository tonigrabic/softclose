/**
 * The maker's decision on a brief: which moves are allowed, and what a valid
 * decision carries.
 *
 * Pure and free of `server-only`, so the decision panel can check an amount
 * with exactly the rules the server action enforces — one function, two
 * callers, no drift between what the button allows and what gets saved.
 *
 * The transition table (IMP-03):
 *
 *   from \ to   quoted  clarify  declined
 *   new           ✓       ✓        ✓
 *   viewed        ✓       ✓        ✓
 *   clarify       ✓       ✓        ✓      (a new question replaces the old note)
 *   quoted        ✗       ✗        ✗
 *   declined      ✗       ✗        ✗
 *
 *  - `clarify` is a question, not an outcome: the brief stays open after it.
 *  - `quoted` is final for that brief. That is what makes `quoted_eur` the
 *    maker's FIRST formal quote (DoD #6) without a second column, and it means
 *    the homeowner never watches a quote turn into a decline (rule 8: one
 *    honest answer). A mistyped amount is caught before saving — the submit
 *    button repeats the parsed amount — and fixed by hand after it (WORKLOG).
 *  - `declined` is final.
 *  - The only way back to an open status is a re-submit, which creates a new
 *    brief at `new` (IMP-19).
 */

export const MAKER_DECISIONS = ['quoted', 'clarify', 'declined'] as const
export type MakerDecision = (typeof MAKER_DECISIONS)[number]

/** The statuses a decision may be made from. Everything else is closed. */
export const OPEN_STATUSES = ['new', 'viewed', 'clarify'] as const

/** Matches the `softclose_briefs_maker_note_len` check (0007). */
export const NOTE_MAX = 1000
/** Matches the `softclose_briefs_quoted_eur_range` check (0007). */
export const QUOTE_MAX_EUR = 1_000_000

export function isMakerDecision(v: unknown): v is MakerDecision {
  return typeof v === 'string' && (MAKER_DECISIONS as readonly string[]).includes(v)
}

/** True once the maker has answered: quoted, asked a question, or declined. */
export function isDecided(status: string | null | undefined): status is MakerDecision {
  return isMakerDecision(status)
}

export function isOpenStatus(status: string | null | undefined): boolean {
  return typeof status === 'string' && (OPEN_STATUSES as readonly string[]).includes(status)
}

export function canDecide(from: string | null | undefined, to: unknown): boolean {
  return isOpenStatus(from) && isMakerDecision(to)
}

/**
 * Length as Postgres' `char_length` counts it (code points), so a note the
 * client accepts is never refused by the database check — an emoji is one
 * character here and there, not two UTF-16 units.
 */
export function noteLength(note: string): number {
  return Array.from(note).length
}

export type DecisionError =
  | 'invalid_status'
  | 'transition'
  | 'amount_required'
  | 'amount_invalid'
  | 'note_required'
  | 'note_too_long'

export interface Decision {
  status: MakerDecision
  /** Trimmed; blank is null. */
  note: string | null
  /** Rounded to cents. Only ever set for `quoted`. */
  quotedEur: number | null
}

export type DecisionCheck = { ok: true; decision: Decision } | { ok: false; error: DecisionError }

/**
 * Round to cents without the binary-float trap: `6200.555 * 100` is
 * 620055.4999…, which `Math.round` takes down. Shifting the decimal point in
 * the number's own string form rounds the value as written.
 */
function roundCents(x: number): number {
  const shifted = Math.round(Number(`${x}e2`))
  return Number.isFinite(shifted) ? shifted / 100 : Math.round(x * 100) / 100
}

/**
 * Validate a decision exactly as it arrives — every argument is untrusted.
 *
 *  - `quotedEur` is required for `quoted`: a finite number (a string is
 *    refused, not coerced), > 0 and ≤ 1,000,000, rounded to cents. For
 *    `clarify` and `declined` it is ignored, so it is never written for them.
 *  - `note` is trimmed and blank becomes null. Required for `clarify` (the
 *    question IS the decision), optional otherwise, at most 1000 characters.
 *    Anything that is not a string is treated as no note.
 */
export function validateDecision(input: {
  from: string | null | undefined
  to: unknown
  note?: unknown
  quotedEur?: unknown
}): DecisionCheck {
  const { from, to } = input
  if (!isMakerDecision(to)) return { ok: false, error: 'invalid_status' }
  if (!canDecide(from, to)) return { ok: false, error: 'transition' }

  let quotedEur: number | null = null
  if (to === 'quoted') {
    const raw = input.quotedEur
    if (raw === undefined || raw === null) return { ok: false, error: 'amount_required' }
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return { ok: false, error: 'amount_invalid' }
    if (raw <= 0 || raw > QUOTE_MAX_EUR) return { ok: false, error: 'amount_invalid' }
    quotedEur = roundCents(raw)
    // 0.004 rounds to 0, which the database would refuse.
    if (quotedEur <= 0) return { ok: false, error: 'amount_invalid' }
  }

  const trimmed = typeof input.note === 'string' ? input.note.trim() : ''
  const note = trimmed === '' ? null : trimmed
  if (to === 'clarify' && note === null) return { ok: false, error: 'note_required' }
  if (note !== null && noteLength(note) > NOTE_MAX) return { ok: false, error: 'note_too_long' }

  return { ok: true, decision: { status: to, note, quotedEur } }
}

/**
 * Read an amount as a Croatian (or English) maker types it.
 *
 * Spaces and `€` are dropped. Then:
 *  - both `.` and `,` present → the LAST one is the decimal separator and the
 *    other must group thousands properly: `6.200,50`, `6,200.50` → 6200.5;
 *  - one kind present, every group after it exactly 3 digits and the first
 *    1–3 digits → thousands: `6.200`, `6,200`, `1.000.000`;
 *  - one occurrence followed by 1–2 digits → decimal: `6200,5`, `6200.50`;
 *  - anything else → null. `1234.567` is ambiguous, so it is refused rather
 *    than guessed — the submit button repeats the parsed amount, and a wrong
 *    guess there is a wrong quote in the hit-rate data.
 *
 * Returns the number as typed; the range check is `validateDecision`'s.
 */
export function parseEurInput(raw: string): number | null {
  if (typeof raw !== 'string') return null
  const s = raw.replace(/[\s  €]/g, '')
  if (!/^\d[\d.,]*$/.test(s)) return null

  const hasDot = s.includes('.')
  const hasComma = s.includes(',')

  if (!hasDot && !hasComma) return Number(s)

  if (hasDot && hasComma) {
    const dec = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ','
    const thou = dec === '.' ? ',' : '.'
    const at = s.lastIndexOf(dec)
    const intPart = s.slice(0, at)
    const frac = s.slice(at + 1)
    const grouped = new RegExp(`^\\d{1,3}(\\${thou}\\d{3})*$`)
    if (!grouped.test(intPart) || !/^\d{1,2}$/.test(frac)) return null
    return Number(`${intPart.split(thou).join('')}.${frac}`)
  }

  const sep = hasDot ? '.' : ','
  const parts = s.split(sep)
  const [head, ...rest] = parts
  if (/^\d{1,3}$/.test(head) && rest.every((g) => /^\d{3}$/.test(g))) return Number(parts.join(''))
  if (parts.length === 2 && /^\d{1,2}$/.test(rest[0])) return Number(`${head}.${rest[0]}`)
  return null
}

/**
 * A quoted amount as the maker typed it back: whole euros without decimals,
 * cents only when there are some — `6.200 €`, `6.200,50 €` (hr), `€6,200` (en).
 *
 * The same function labels the submit button ("Zabilježi ponudu: 6.200 €") on
 * the client and the saved chip on the server, so the confirmation the maker
 * reads before saving is character for character what the chip shows after.
 */
export function formatQuoteEur(amount: number, locale: string): string {
  const cents = !Number.isInteger(amount)
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

/**
 * When a decision was made, as a date. Formatted on the server (see the note
 * on DashboardList), pinned to Croatian time: the server runs in UTC, and a
 * decision at 00:30 in Zagreb must not read as the previous day.
 */
export function formatDecisionDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    timeZone: 'Europe/Zagreb',
  })
}
