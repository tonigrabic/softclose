/**
 * The submit stores its own snapshot as the project's copy (IMP-06 review).
 *
 * /api/handoff used to set `updated_at` to the brief's time and leave the
 * journey copy to the client's pre-submit flush. When that flush failed — a
 * dropped connection at wrap-up — the brief went out over the pre-wrap-up
 * copy, and the next visit wrote the real one, moving `updated_at` past a
 * brief nothing had changed since (the maker's "changed since the brief"
 * flag). Now the route writes the snapshot it is sent in that same update,
 * on the revision it read, so the copy and the brief always agree.
 *
 * The route runs for real; only its edges are faked — the session, a database
 * that keeps one project row and applies conditional updates the way
 * PostgREST does, media offload and the maker email.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { OMITTED_IMAGE, snapshotFingerprint, stripImages } from '@/lib/project/checkpoint'
import { SNAPSHOT_VERSION } from '@/lib/project/snapshot'

const h = vi.hoisted(() => {
  type Row = Record<string, unknown>
  const state = {
    project: null as Row | null,
    brief: null as Row | null,
    /** Runs once, just before the route's first revision-conditional write. */
    beforeConditionalWrite: null as null | (() => void),
    projectUpdates: [] as Row[],
  }

  function builder(table: string) {
    let op: 'select' | 'insert' | 'update' = 'select'
    let payload: Row | null = null
    let returning = false
    const filters: Array<[string, unknown]> = []

    const applyUpdate = () => {
      const row = state.project
      if (!row || !payload) return null
      if (filters.some(([c]) => c === 'revision') && state.beforeConditionalWrite) {
        const hook = state.beforeConditionalWrite
        state.beforeConditionalWrite = null
        hook()
      }
      if (!filters.every(([c, v]) => row[c] === v)) return null
      state.projectUpdates.push(payload)
      Object.assign(row, payload)
      return row
    }

    const settle = (): { data: unknown; error: null } => {
      if (table === 'softclose_projects') {
        if (op === 'update') {
          const row = applyUpdate()
          return { data: returning && row ? { revision: row.revision } : null, error: null }
        }
        return { data: state.project ? { ...state.project } : null, error: null }
      }
      if (table === 'softclose_briefs' && op === 'insert') {
        state.brief = payload
        return { data: null, error: null }
      }
      if (table === 'softclose_accounts') return { data: { email: 'maker@example.test' }, error: null }
      return { data: null, error: null }
    }

    const b = {
      select() {
        if (op !== 'select') returning = true
        return b
      },
      insert(p: Row) {
        op = 'insert'
        payload = p
        return b
      },
      update(p: Row) {
        op = 'update'
        payload = p
        return b
      },
      eq(column: string, value: unknown) {
        filters.push([column, value])
        return b
      },
      maybeSingle() {
        return Promise.resolve(settle())
      },
      single() {
        return Promise.resolve(settle())
      },
      then<T>(resolve: (v: { data: unknown; error: null }) => T, reject?: (e: unknown) => T) {
        return Promise.resolve(settle()).then(resolve, reject)
      },
    }
    return b
  }

  return { state, db: { from: (table: string) => builder(table) } }
})

vi.mock('@/lib/auth/dal', () => ({
  apiAccount: async () => ({
    accountId: '33333333-3333-4333-8333-333333333333',
    role: 'customer',
    email: 'kupac@example.test',
    name: null,
    locale: 'hr-HR',
  }),
}))

vi.mock('@/lib/db/supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/supabase')>()),
  supabaseAdmin: () => h.db,
}))

vi.mock('@/lib/db/media', () => ({
  storageUploader: () => null,
  offloadMedia: async (value: unknown) => ({ value, count: 0, bytes: 0 }),
}))

vi.mock('@/lib/notify/maker-email', () => ({
  notifyMakerOfBrief: async () => false,
}))

import { POST } from '@/app/api/handoff/route'

const CUSTOMER = '33333333-3333-4333-8333-333333333333'
const PROJECT = '55555555-5555-4555-8555-555555555555'

const journey = (picks: number) => ({
  currentStepId: 'contact',
  isDone: true,
  profile: { picks },
  spacePhotos: ['data:image/jpeg;base64,AAAA'],
})

async function send(snapshot?: unknown) {
  const res = await POST(
    new Request('http://localhost/api/handoff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brief: {}, projectId: PROJECT, locale: 'hr-HR', snapshot }),
    })
  )
  expect(res.status).toBe(200)
  return res.json()
}

const project = () => h.state.project!

beforeEach(() => {
  h.state.project = {
    id: PROJECT,
    customer_id: CUSTOMER,
    maker_id: null,
    status: 'in_progress',
    current_brief_id: null,
    revision: 7,
    snapshot: stripImages(journey(1)),
    snapshot_version: SNAPSHOT_VERSION,
    step: 'builder',
    updated_at: '2026-10-04T09:00:00.000Z',
  }
  h.state.brief = null
  h.state.beforeConditionalWrite = null
  h.state.projectUpdates = []
})

describe('the submit stores the brief’s snapshot as the project’s copy', () => {
  test('a stale copy (the pre-submit flush failed) is replaced in the update that stamps the brief’s time', async () => {
    const out = await send(stripImages(journey(9)))
    expect(out.briefId).toBeTruthy()
    expect(snapshotFingerprint(project().snapshot)).toBe(snapshotFingerprint(stripImages(journey(9))))
    expect(project().revision).toBe(8)
    expect(project().step).toBe('contact')
    expect(project().current_brief_id).toBe(out.briefId)
    // One update, one timestamp: the maker's "changed since the brief" flag stays down.
    expect(h.state.projectUpdates).toHaveLength(1)
    expect(project().updated_at).toBe(h.state.brief!.created_at)
  })

  test('a copy that already is the snapshot (the flush landed) is left alone — no revision bump for the client to trip on', async () => {
    h.state.project!.snapshot = stripImages(journey(9))
    await send(stripImages(journey(9)))
    expect(project().revision).toBe(7)
    expect(h.state.projectUpdates[0]).not.toHaveProperty('snapshot')
    expect(h.state.projectUpdates[0]).not.toHaveProperty('revision')
    expect(project().updated_at).toBe(h.state.brief!.created_at)
  })

  test('a checkpoint landing between the read and the write moves the revision: the route reads again and writes on top', async () => {
    h.state.beforeConditionalWrite = () => {
      // The retry of the failed flush, landing mid-submit.
      Object.assign(h.state.project!, { revision: 8, snapshot: stripImages(journey(5)), updated_at: 'later' })
    }
    await send(stripImages(journey(9)))
    expect(project().revision).toBe(9)
    expect(snapshotFingerprint(project().snapshot)).toBe(snapshotFingerprint(stripImages(journey(9))))
    expect(project().updated_at).toBe(h.state.brief!.created_at)
  })

  test('an inline image that slipped through is stored as a marker, never as pixels', async () => {
    await send(journey(9))
    expect(JSON.stringify(project().snapshot)).not.toContain('data:image/')
    expect((project().snapshot as { spacePhotos: string[] }).spacePhotos).toEqual([OMITTED_IMAGE])
  })

  test('a copy written by newer code is not clobbered; the brief still gets its project update', async () => {
    h.state.project!.snapshot_version = SNAPSHOT_VERSION + 1
    const out = await send(stripImages(journey(9)))
    expect(project().revision).toBe(7)
    expect(snapshotFingerprint(project().snapshot)).toBe(snapshotFingerprint(stripImages(journey(1))))
    expect(project().current_brief_id).toBe(out.briefId)
  })

  test('an older client that sends no snapshot gets the update it always got', async () => {
    const out = await send()
    expect(h.state.projectUpdates).toHaveLength(1)
    expect(h.state.projectUpdates[0]).not.toHaveProperty('snapshot')
    expect(project().revision).toBe(7)
    expect(project().current_brief_id).toBe(out.briefId)
    expect(project().updated_at).toBe(h.state.brief!.created_at)
  })
})
