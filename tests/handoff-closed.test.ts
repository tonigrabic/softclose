/**
 * IMP-03: a closed project takes no new brief.
 *
 * The maker's decline archives the project. An intake tab left open across
 * that decline could still POST /api/handoff, and the route's project update
 * would then un-archive the project and hand the maker who already said no a
 * fresh 'new' brief and another email. The route refuses with 409 'closed'.
 *
 * The archive is a second, best-effort write, so the refusal must not depend
 * on it: a declined current brief closes the project on its own, whatever the
 * project row says (review round: a failed archive, or an autosave that wrote
 * back a status it had read before the decline).
 *
 * The route runs for real; only its edges are faked — the session, the
 * database client (which records every query), media offload and the maker
 * email.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest'

const h = vi.hoisted(() => {
  interface Call {
    table: string
    op: 'select' | 'insert' | 'update'
    payload?: unknown
    filters: Array<[string, unknown]>
  }
  const state = {
    session: null as null | {
      accountId: string
      role: 'customer' | 'maker'
      email: string
      name: string | null
      locale: string | null
    },
    project: null as Record<string, unknown> | null,
    /** Briefs by id, as a lookup of the project's current brief sees them. */
    briefs: {} as Record<string, Record<string, unknown>>,
    briefReadError: null as null | { message: string },
    calls: [] as Call[],
    notified: 0,
  }

  function builder(table: string) {
    const call: Call = { table, op: 'select', filters: [] }
    state.calls.push(call)
    const single = () => {
      if (table === 'softclose_projects') return { data: state.project, error: null }
      if (table === 'softclose_accounts') return { data: { email: 'maker@example.test' }, error: null }
      if (table === 'softclose_briefs') {
        if (state.briefReadError) return { data: null, error: state.briefReadError }
        const id = call.filters.find(([column]) => column === 'id')?.[1] as string | undefined
        return { data: (id && state.briefs[id]) || null, error: null }
      }
      return { data: null, error: null }
    }
    const b = {
      select() {
        return b
      },
      insert(payload: unknown) {
        call.op = 'insert'
        call.payload = payload
        return b
      },
      update(payload: unknown) {
        call.op = 'update'
        call.payload = payload
        return b
      },
      eq(column: string, value: unknown) {
        call.filters.push([column, value])
        return b
      },
      maybeSingle() {
        return Promise.resolve(single())
      },
      single() {
        return Promise.resolve(single())
      },
      then<T>(resolve: (v: { data: null; error: null }) => T, reject?: (e: unknown) => T) {
        return Promise.resolve({ data: null, error: null }).then(resolve, reject)
      },
    }
    return b
  }

  return { state, db: { from: (table: string) => builder(table) } }
})

vi.mock('@/lib/auth/dal', () => ({
  apiAccount: async () => h.state.session,
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
  notifyMakerOfBrief: async () => {
    h.state.notified += 1
    return false
  },
}))

import { POST } from '@/app/api/handoff/route'

const CUSTOMER = '33333333-3333-4333-8333-333333333333'
const MAKER = '11111111-1111-4111-8111-111111111111'
const PROJECT = '55555555-5555-4555-8555-555555555555'
const DECLINED_BRIEF = '44444444-4444-4444-8444-444444444444'

function send() {
  return POST(
    new Request('http://localhost/api/handoff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brief: {}, projectId: PROJECT, locale: 'hr-HR' }),
    })
  )
}

const writes = () => h.state.calls.filter((c) => c.op !== 'select')

beforeEach(() => {
  h.state.session = { accountId: CUSTOMER, role: 'customer', email: 'kupac@example.test', name: null, locale: 'hr-HR' }
  h.state.project = { id: PROJECT, customer_id: CUSTOMER, maker_id: MAKER, status: 'submitted', current_brief_id: null }
  h.state.briefs = {}
  h.state.briefReadError = null
  h.state.calls = []
  h.state.notified = 0
})

describe('handoff into a closed project', () => {
  test('archived → 409 closed; no brief, no project write, no email', async () => {
    h.state.project = { ...h.state.project, status: 'archived' }
    const res = await send()
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'closed', code: 'closed' })
    expect(writes()).toEqual([])
    expect(h.state.notified).toBe(0)
  })

  test('current brief declined but the project still reads submitted → 409 closed; nothing written, no email', async () => {
    // The archive after the decline failed, or an autosave in flight across
    // the decline wrote 'submitted' back over it. Either way the maker said no.
    h.state.project = { ...h.state.project, status: 'submitted', current_brief_id: DECLINED_BRIEF }
    h.state.briefs = { [DECLINED_BRIEF]: { maker_status: 'declined' } }
    const res = await send()
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'closed', code: 'closed' })
    expect(writes()).toEqual([])
    expect(h.state.notified).toBe(0)
  })

  test('the current brief cannot be read → nothing stored, no email (unknown is not open)', async () => {
    h.state.project = { ...h.state.project, current_brief_id: DECLINED_BRIEF }
    h.state.briefReadError = { message: 'connection reset' }
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await send()
    // The homeowner still gets their summary back, without a briefId — the
    // wrap-up then says it was not saved.
    expect(res.status).toBe(200)
    expect(((await res.json()) as { briefId?: string }).briefId).toBeUndefined()
    expect(writes()).toEqual([])
    expect(h.state.notified).toBe(0)
    errorLog.mockRestore()
  })

  test('a current brief that is still open (viewed) does not block a re-send', async () => {
    h.state.project = { ...h.state.project, current_brief_id: DECLINED_BRIEF }
    h.state.briefs = { [DECLINED_BRIEF]: { maker_status: 'viewed' } }
    const res = await send()
    expect(res.status).toBe(200)
    expect(((await res.json()) as { briefId?: string }).briefId).toMatch(/^[0-9a-f-]{36}$/)
    expect(h.state.notified).toBe(1)
  })

  test('an open project still takes the brief (the check blocks nothing else)', async () => {
    const res = await send()
    expect(res.status).toBe(200)
    const body = (await res.json()) as { briefId?: string }
    expect(body.briefId).toMatch(/^[0-9a-f-]{36}$/)
    expect(writes().map((c) => `${c.op} ${c.table}`)).toEqual(
      expect.arrayContaining(['insert softclose_briefs', 'update softclose_projects'])
    )
    expect(h.state.notified).toBe(1)
  })
})
