/**
 * The maker's "izmijenjeno" follows the kitchen, not every save (IMP-07
 * review, migration 0008).
 *
 * After a send, "Izmijeni kuhinju" opens the journey at the contact step with
 * the done flag off, and Continue goes back to the review — a walk that
 * changes the step, the done flag, a transcript turn, sign-off stamps, never
 * the kitchen. Each of those saves used to stamp `updated_at`, the maker's
 * list read `updated_at > brief.created_at` as "changed since the brief", and
 * a quoted project went back to the top as "izmijenjeno · v2" — while the
 * homeowner's review said the maker has this version and offered nothing to
 * send, so the flag could never clear.
 *
 * Now the checkpoint route stores `content_changed_at`: null while the saved
 * profile prints the same as the brief on file (`brief_print`, written by the
 * handoff from the profile it was sent), now once it differs. The route runs
 * for real against a one-row in-memory table, as in checkpoint-status.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { SNAPSHOT_VERSION, type ProjectSnapshot } from '@/lib/project/snapshot'
import { contentChangedAt, dashboardGroup, projectDisplayStatus } from '@/lib/project/status'
import { briefPrint, sentReviewFrom } from '@/lib/handoff/review'
import type { LeadProfile, WrapUpData } from '@/lib/types'

const h = vi.hoisted(() => {
  type Filter = [column: string, value: unknown]
  const state = {
    session: null as null | { accountId: string; role: 'customer' | 'maker'; email: string },
    row: null as Record<string, unknown> | null,
  }
  const matches = (filters: Filter[]) =>
    state.row !== null && filters.every(([column, value]) => state.row![column] === value)

  function builder() {
    let op: 'select' | 'update' = 'select'
    let payload: Record<string, unknown> | null = null
    const filters: Filter[] = []
    const b = {
      select() {
        return b
      },
      update(p: Record<string, unknown>) {
        op = 'update'
        payload = p
        return b
      },
      eq(column: string, value: unknown) {
        filters.push([column, value])
        return b
      },
      maybeSingle() {
        if (op === 'update') {
          if (!matches(filters)) return Promise.resolve({ data: null, error: null })
          Object.assign(state.row!, payload)
          return Promise.resolve({ data: { ...state.row! }, error: null })
        }
        return Promise.resolve({ data: matches(filters) ? { ...state.row! } : null, error: null })
      },
      then<T>(resolve: (v: { data: unknown; error: null }) => T, reject?: (e: unknown) => T) {
        if (op === 'update' && matches(filters)) Object.assign(state.row!, payload)
        return Promise.resolve({ data: null, error: null }).then(resolve, reject)
      },
    }
    return b
  }
  return { state, db: { from: () => builder() } }
})

vi.mock('@/lib/auth/dal', () => ({ apiAccount: async () => h.state.session }))
vi.mock('@/lib/db/supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/supabase')>()),
  supabaseAdmin: () => h.db,
}))
vi.mock('@/lib/rate-limit', () => ({ rateLimitKey: () => ({ ok: true, remaining: 1, retryAfterMs: 0 }) }))

import { POST } from '@/app/api/projects/[id]/checkpoint/route'

const CUSTOMER = '33333333-3333-4333-8333-333333333333'
const PROJECT = '55555555-5555-4555-8555-555555555555'
const BRIEF = '6f1c2a34-5b6d-4e7f-8a9b-0c1d2e3f4a5b'
const BRIEF_AT = '2026-10-04T09:00:00.000Z'

const KITCHEN: LeadProfile = {
  name: 'Ana',
  email: 'ana@example.test',
  timeline: '3_6_months',
  spacePhotos: ['omitted://image'],
  roomConfirmed: { at: 1_000, intent: 'keep', fingerprint: 'abc' },
  contractConfirmedAt: 2_000,
  mustHaves: [{ trade: 'Pull-out pantry', verbatim: 'izvlačna smočnica' }],
}
const PRINT = briefPrint(KITCHEN)
const REVIEW: WrapUpData = { thankYouMessage: 'Hvala', summaryLines: [], briefId: BRIEF, profilePrint: PRINT }

/** The server copy right after the send: the review, done. */
const SENT: ProjectSnapshot = {
  currentStepId: 'contact',
  profile: KITCHEN,
  transcript: [{ role: 'user', content: 'Contact: Ana (ana@example.test)' }],
  isDone: true,
  wrapUpData: REVIEW,
} as unknown as ProjectSnapshot

/**
 * "Izmijeni kuhinju": the restore, then startAt = contact with the done flag
 * off (KitchenIntake), carrying the brief on file as the restore derives it.
 */
const ENTERED: ProjectSnapshot = {
  ...SENT,
  currentStepId: 'contact',
  isDone: false,
  sentReview: sentReviewFrom(SENT, BRIEF) ?? undefined,
}

/** Continue on contact with nothing changed: back on the review, sign-offs re-stamped by an earlier walk. */
const CONTINUED: ProjectSnapshot = {
  ...ENTERED,
  isDone: true,
  profile: { ...KITCHEN, contractConfirmedAt: 9_999, roomConfirmed: { ...KITCHEN.roomConfirmed!, at: 8_888 } },
}

async function save(snapshot: unknown) {
  const res = await POST(
    new Request(`http://localhost/api/projects/${PROJECT}/checkpoint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseRevision: h.state.row!.revision, snapshot, step: 'contact' }),
    }),
    { params: Promise.resolve({ id: PROJECT }) }
  )
  expect(res.status).toBe(200)
}

/** What the maker's list shows for the row, with the maker's quote on the brief. */
const listed = () => {
  const display = projectDisplayStatus({
    status: h.state.row!.status as string,
    openedAt: BRIEF_AT,
    step: 'contact',
    contentChangedAt: (h.state.row!.content_changed_at as string | null) ?? null,
    currentBriefCreatedAt: BRIEF_AT,
  })
  return { display, group: dashboardGroup(display, 'quoted') }
}

beforeEach(() => {
  h.state.session = { accountId: CUSTOMER, role: 'customer', email: 'ana@example.test' }
  // As /api/handoff leaves it: the brief's print, nothing changed since.
  h.state.row = {
    id: PROJECT,
    customer_id: CUSTOMER,
    revision: 4,
    status: 'submitted',
    snapshot_version: SNAPSHOT_VERSION,
    snapshot: SENT,
    current_brief_id: BRIEF,
    brief_print: PRINT,
    updated_at: BRIEF_AT,
    content_changed_at: null,
  }
})

describe('a walk back after a send is saved, never flagged', () => {
  test('"Izmijeni kuhinju" → contact → Continue unchanged: saved twice, the flag stays down', async () => {
    await save(ENTERED)
    expect(h.state.row!.revision).toBe(5)
    expect(h.state.row!.updated_at).not.toBe(BRIEF_AT) // activity, for the resume and "last seen"
    expect(h.state.row!.content_changed_at).toBeNull()

    await save(CONTINUED)
    expect(h.state.row!.revision).toBe(6)
    expect(h.state.row!.content_changed_at).toBeNull()
    // The quoted project stays where the maker's answer put it.
    expect(listed()).toEqual({ display: 'submitted', group: 'decided' })
  })

  test('a real change raises it; undoing the change lowers it again', async () => {
    await save({ ...ENTERED, profile: { ...KITCHEN, timeline: 'asap' } })
    const changedAt = h.state.row!.content_changed_at as string
    expect(changedAt).toBe(h.state.row!.updated_at)
    expect(Date.parse(changedAt)).toBeGreaterThan(Date.parse(BRIEF_AT))
    expect(listed()).toEqual({ display: 'changed_since_submit', group: 'attention' })

    await save(CONTINUED)
    expect(h.state.row!.content_changed_at).toBeNull()
    expect(listed().display).toBe('submitted')
  })

  test('a brief sent before 0008 (no brief_print): the journey’s record of it stands in', async () => {
    h.state.row!.brief_print = null
    await save(ENTERED)
    expect(h.state.row!.content_changed_at).toBeNull()
    // No record of the brief anywhere: every save counts, as before.
    await save({ ...ENTERED, sentReview: undefined })
    expect(h.state.row!.content_changed_at).not.toBeNull()
  })
})

describe('contentChangedAt', () => {
  const NOW = '2026-10-05T10:00:00.000Z'
  const project = { currentBriefId: BRIEF, briefPrint: PRINT }

  test('the brief’s kitchen, whatever the step, the done flag or the stamps: null', () => {
    expect(contentChangedAt(project, ENTERED, NOW)).toBeNull()
    expect(contentChangedAt(project, CONTINUED, NOW)).toBeNull()
    expect(contentChangedAt(project, { ...ENTERED, currentStepId: 'builder', builderGroupId: 'lighting' }, NOW)).toBeNull()
  })

  test('another kitchen: now', () => {
    expect(contentChangedAt(project, { ...ENTERED, profile: { ...KITCHEN, name: 'Anna' } }, NOW)).toBe(NOW)
  })

  test('no brief yet: null; a record naming another brief is not this one’s', () => {
    expect(contentChangedAt({ currentBriefId: null, briefPrint: null }, ENTERED, NOW)).toBeNull()
    const other = { ...REVIEW, briefId: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d' }
    expect(contentChangedAt({ currentBriefId: BRIEF, briefPrint: null }, { ...ENTERED, sentReview: other }, NOW)).toBe(NOW)
  })

  test('no snapshot, or no profile in it: now (nothing to compare)', () => {
    expect(contentChangedAt(project, null, NOW)).toBe(NOW)
    expect(contentChangedAt(project, { currentStepId: 'contact' }, NOW)).toBe(NOW)
  })
})
