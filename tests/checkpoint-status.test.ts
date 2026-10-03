/**
 * A checkpoint never writes back a project status it read earlier (IMP-03
 * review round).
 *
 * The route used to send `status: project.status` with every save, filtered
 * only on `revision`. A decline archives the project and a send marks it
 * submitted, and neither bumps `revision` — so an autosave that read the
 * status just before the maker clicked Odbij wrote 'submitted' back over
 * 'archived' and re-opened the project, and the customer's next send reached
 * the maker who had already said no.
 *
 * The route runs for real against a one-row in-memory table that applies the
 * filters it is given; `afterRead` lets a test change the row between the
 * route's read and its write, which is exactly the race.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { SNAPSHOT_VERSION } from '@/lib/project/snapshot'

const h = vi.hoisted(() => {
  type Filter = [column: string, value: unknown]
  interface Call {
    op: 'select' | 'update'
    payload?: Record<string, unknown>
    filters: Filter[]
  }
  const state = {
    session: null as null | { accountId: string; role: 'customer' | 'maker'; email: string },
    row: null as Record<string, unknown> | null,
    /** Runs once, after the route's first read of the project. */
    afterRead: null as null | (() => void),
    calls: [] as Call[],
  }

  function matches(filters: Filter[]): boolean {
    return state.row !== null && filters.every(([column, value]) => state.row![column] === value)
  }

  function builder() {
    const call: Call = { op: 'select', filters: [] }
    state.calls.push(call)
    // An update applies once, when it is awaited — like a real request.
    let applied: Record<string, unknown> | null | undefined
    const apply = () => {
      if (applied !== undefined) return applied
      applied = null
      if (call.op === 'update' && matches(call.filters)) {
        Object.assign(state.row!, call.payload)
        applied = { ...state.row! }
      }
      return applied
    }
    const b = {
      select() {
        return b
      },
      update(payload: Record<string, unknown>) {
        call.op = 'update'
        call.payload = payload
        return b
      },
      eq(column: string, value: unknown) {
        call.filters.push([column, value])
        return b
      },
      maybeSingle() {
        if (call.op === 'update') return Promise.resolve({ data: apply(), error: null })
        const data = matches(call.filters) ? { ...state.row! } : null
        const hook = state.afterRead
        state.afterRead = null
        hook?.()
        return Promise.resolve({ data, error: null })
      },
      then<T>(resolve: (v: { data: unknown; error: null }) => T, reject?: (e: unknown) => T) {
        return Promise.resolve({ data: apply(), error: null }).then(resolve, reject)
      },
    }
    return b
  }

  return { state, db: { from: () => builder() } }
})

vi.mock('@/lib/auth/dal', () => ({
  apiAccount: async () => h.state.session,
}))

vi.mock('@/lib/db/supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/supabase')>()),
  supabaseAdmin: () => h.db,
}))

vi.mock('@/lib/rate-limit', () => ({
  rateLimitKey: () => ({ ok: true, remaining: 1, retryAfterMs: 0 }),
}))

import { POST } from '@/app/api/projects/[id]/checkpoint/route'

const CUSTOMER = '33333333-3333-4333-8333-333333333333'
const PROJECT = '55555555-5555-4555-8555-555555555555'

function save(baseRevision = 3) {
  return POST(
    new Request(`http://localhost/api/projects/${PROJECT}/checkpoint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseRevision, snapshot: { profile: { name: 'Ana' } }, step: 'builder' }),
    }),
    { params: Promise.resolve({ id: PROJECT }) }
  )
}

const updates = () => h.state.calls.filter((c) => c.op === 'update')

beforeEach(() => {
  h.state.session = { accountId: CUSTOMER, role: 'customer', email: 'kupac@example.test' }
  h.state.row = {
    id: PROJECT,
    customer_id: CUSTOMER,
    revision: 3,
    status: 'submitted',
    snapshot_version: SNAPSHOT_VERSION,
    snapshot: null,
  }
  h.state.afterRead = null
  h.state.calls = []
})

describe('checkpoint and the project status', () => {
  test('a save in flight across a decline does not re-open the project', async () => {
    // The route reads 'submitted'; the maker declines before its write lands.
    h.state.afterRead = () => {
      h.state.row!.status = 'archived'
    }
    const res = await save()
    expect(res.status).toBe(200)
    expect(h.state.row!.status).toBe('archived')
    expect(h.state.row!.revision).toBe(4)
    expect(h.state.row!.snapshot).toEqual({ profile: { name: 'Ana' } })
  })

  test('a save in flight across a send does not undo submitted', async () => {
    h.state.row!.status = 'in_progress'
    h.state.afterRead = () => {
      h.state.row!.status = 'submitted'
    }
    expect((await save()).status).toBe(200)
    expect(h.state.row!.status).toBe('submitted')
  })

  test('an ordinary save carries no status at all', async () => {
    expect((await save()).status).toBe(200)
    expect(updates()).toHaveLength(1)
    expect(updates()[0].payload).not.toHaveProperty('status')
    expect(updates()[0].filters).toEqual([
      ['id', PROJECT],
      ['revision', 3],
    ])
  })

  test('the first save moves invited → in_progress, as its own write conditional on invited', async () => {
    h.state.row!.status = 'invited'
    expect((await save()).status).toBe(200)
    expect(h.state.row!.status).toBe('in_progress')
    expect(updates()).toHaveLength(2)
    expect(updates()[0].payload).not.toHaveProperty('status')
    expect(updates()[1].payload).toEqual({ status: 'in_progress' })
    expect(updates()[1].filters).toEqual([
      ['id', PROJECT],
      ['status', 'invited'],
    ])
  })

  test('read as invited but archived meanwhile → the move leaves archived alone', async () => {
    h.state.row!.status = 'invited'
    h.state.afterRead = () => {
      h.state.row!.status = 'archived'
    }
    expect((await save()).status).toBe(200)
    expect(h.state.row!.status).toBe('archived')
  })

  test('a stale revision is a conflict and writes no status either', async () => {
    h.state.row!.status = 'invited'
    const res = await save(2)
    expect(res.status).toBe(409)
    expect(h.state.row!.status).toBe('invited')
    expect(updates()).toHaveLength(1)
  })
})
