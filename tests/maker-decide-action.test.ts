/**
 * IMP-03 Done-when: the decideBrief action checks ownership and moves the
 * status only along the allowed transitions.
 *
 * The real DAL (`requireBriefAccess`) runs here — it is the part that decides
 * who may decide — with only its edges faked: the cookie jar, the session
 * signature, the account lookup and the database client. The fake client
 * records every query, so "no write" is asserted on what was actually sent,
 * not inferred from a return value.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest'

const h = vi.hoisted(() => {
  class RedirectSentinel extends Error {
    constructor(public url: string) {
      super(`NEXT_REDIRECT ${url}`)
    }
  }
  class NotFoundSentinel extends Error {
    constructor() {
      super('NEXT_NOT_FOUND')
    }
  }

  type Filter = [op: 'eq' | 'in' | 'is' | 'neq', column: string, value: unknown]
  interface Call {
    table: string
    op: 'select' | 'update'
    payload?: Record<string, unknown>
    columns?: string
    filters: Filter[]
  }
  interface Account {
    id: string
    role: 'maker' | 'customer'
    email: string
    name: string | null
    locale: string | null
    status: 'active'
    sessionEpoch: number
  }

  const state = {
    cookie: undefined as string | undefined,
    claims: null as null | { sub: string; role: 'maker' | 'customer'; epoch: number; iat: number; exp: number },
    account: null as Account | null,
    brief: null as Record<string, unknown> | null,
    project: null as Record<string, unknown> | null,
    /** What the conditional brief update returns; null means "the row matched". */
    briefUpdateRows: null as Array<{ id: string }> | null,
    calls: [] as Call[],
    revalidated: [] as string[],
  }

  function builder(table: string) {
    const call: Call = { table, op: 'select', filters: [] }
    state.calls.push(call)
    const resultMany = () => {
      if (call.op === 'update' && table === 'softclose_briefs') {
        const id = call.filters.find((f) => f[0] === 'eq' && f[1] === 'id')?.[2] as string
        return { data: state.briefUpdateRows ?? [{ id }], error: null }
      }
      return { data: null, error: null }
    }
    const resultSingle = () => {
      if (table === 'softclose_briefs') return { data: state.brief, error: null }
      if (table === 'softclose_projects') return { data: state.project, error: null }
      return { data: null, error: null }
    }
    const b = {
      select(columns: string) {
        if (call.op === 'select') call.columns = columns
        return b
      },
      update(payload: Record<string, unknown>) {
        call.op = 'update'
        call.payload = payload
        return b
      },
      eq(column: string, value: unknown) {
        call.filters.push(['eq', column, value])
        return b
      },
      in(column: string, value: unknown) {
        call.filters.push(['in', column, value])
        return b
      },
      maybeSingle() {
        return Promise.resolve(resultSingle())
      },
      then<T>(resolve: (v: ReturnType<typeof resultMany>) => T, reject?: (e: unknown) => T) {
        return Promise.resolve(resultMany()).then(resolve, reject)
      },
    }
    return b
  }

  return {
    state,
    RedirectSentinel,
    NotFoundSentinel,
    db: { from: (table: string) => builder(table) },
  }
})

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (h.state.cookie ? { name, value: h.state.cookie } : undefined),
  }),
  headers: async () => ({
    get: (name: string) => (name === 'x-sc-path' ? '/maker/somewhere' : null),
  }),
}))

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new h.NotFoundSentinel()
  },
  redirect: (url: string) => {
    throw new h.RedirectSentinel(url)
  },
}))

vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => {
    h.state.revalidated.push(path)
  },
}))

vi.mock('@/lib/auth/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/session')>()),
  verifySession: async (token: string | undefined) => (token ? h.state.claims : null),
}))

vi.mock('@/lib/auth/accounts', () => ({
  findAccountById: async (id: string) => (h.state.account?.id === id ? h.state.account : null),
}))

vi.mock('@/lib/db/supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/supabase')>()),
  supabaseAdmin: () => h.db,
}))

import { decideBrief } from '@/app/maker/[id]/actions'

const MAKER = '11111111-1111-4111-8111-111111111111'
const OTHER_MAKER = '22222222-2222-4222-8222-222222222222'
const CUSTOMER = '33333333-3333-4333-8333-333333333333'
const BRIEF = '44444444-4444-4444-8444-444444444444'
const PROJECT = '55555555-5555-4555-8555-555555555555'
const NEWER_BRIEF = '66666666-6666-4666-8666-666666666666'

function signInAs(id: string, role: 'maker' | 'customer') {
  const now = Math.floor(Date.now() / 1000)
  h.state.cookie = 'signed-cookie'
  h.state.claims = { sub: id, role, epoch: 1, iat: now, exp: now + 3600 }
  h.state.account = {
    id,
    role,
    email: `${role}@example.test`,
    name: null,
    locale: 'hr-HR',
    status: 'active',
    sessionEpoch: 1,
  }
}

function briefRow(over: Record<string, unknown> = {}) {
  return {
    id: BRIEF,
    created_at: '2026-10-01T10:00:00.000Z',
    bundle: {},
    maker_status: 'viewed',
    maker_viewed_at: '2026-10-01T11:00:00.000Z',
    project_id: PROJECT,
    maker_id: MAKER,
    maker_note: null,
    decided_at: null,
    quoted_eur: null,
    ...over,
  }
}

const writes = () => h.state.calls.filter((c) => c.op === 'update')
const briefWrites = () => writes().filter((c) => c.table === 'softclose_briefs')
const projectWrites = () => writes().filter((c) => c.table === 'softclose_projects')

beforeEach(() => {
  h.state.cookie = undefined
  h.state.claims = null
  h.state.account = null
  h.state.brief = briefRow()
  h.state.project = { id: PROJECT, current_brief_id: BRIEF, status: 'submitted' }
  h.state.briefUpdateRows = null
  h.state.calls = []
  h.state.revalidated = []
})

describe('decideBrief — who may decide', () => {
  test('signed out → redirected to login, nothing written', async () => {
    await expect(decideBrief(BRIEF, 'quoted', null, 6200)).rejects.toBeInstanceOf(h.RedirectSentinel)
    expect(h.state.calls).toEqual([])
  })

  test('a customer → notFound, nothing written', async () => {
    signInAs(CUSTOMER, 'customer')
    await expect(decideBrief(BRIEF, 'quoted', null, 6200)).rejects.toBeInstanceOf(h.NotFoundSentinel)
    expect(writes()).toEqual([])
  })

  test("another maker's brief → notFound, nothing written", async () => {
    signInAs(OTHER_MAKER, 'maker')
    await expect(decideBrief(BRIEF, 'quoted', null, 6200)).rejects.toBeInstanceOf(h.NotFoundSentinel)
    expect(writes()).toEqual([])
  })

  test('an ownerless brief → notFound for every maker, nothing written', async () => {
    signInAs(MAKER, 'maker')
    h.state.brief = briefRow({ maker_id: null })
    await expect(decideBrief(BRIEF, 'declined')).rejects.toBeInstanceOf(h.NotFoundSentinel)
    expect(writes()).toEqual([])
  })

  test('a malformed id → notFound before any query', async () => {
    signInAs(MAKER, 'maker')
    await expect(decideBrief('not-a-uuid', 'quoted', null, 6200)).rejects.toBeInstanceOf(h.NotFoundSentinel)
    await expect(decideBrief(42, 'quoted', null, 6200)).rejects.toBeInstanceOf(h.NotFoundSentinel)
    expect(h.state.calls).toEqual([])
  })
})

describe('decideBrief — what gets written', () => {
  test('the owner quotes 6,200 € → status, amount and time on the brief; no project write', async () => {
    signInAs(MAKER, 'maker')
    const r = await decideBrief(BRIEF, 'quoted', '   ', 6200)
    expect(r).toEqual({ ok: true, status: 'quoted' })

    expect(briefWrites()).toHaveLength(1)
    const [w] = briefWrites()
    expect(w.payload).toMatchObject({ maker_status: 'quoted', quoted_eur: 6200, maker_note: null })
    expect(new Date(w.payload!.decided_at as string).toISOString()).toBe(w.payload!.decided_at)
    expect(w.filters).toEqual([
      ['eq', 'id', BRIEF],
      ['eq', 'maker_id', MAKER],
      ['in', 'maker_status', ['new', 'viewed', 'clarify']],
    ])
    expect(projectWrites()).toEqual([])
    expect(h.state.revalidated).toEqual([`/maker/${BRIEF}`, '/dashboard', `/kitchen/${PROJECT}`])
  })

  test('decline with a note → brief first, then the project is archived, guarded by current_brief_id', async () => {
    signInAs(MAKER, 'maker')
    const r = await decideBrief(BRIEF, 'declined', ' Ne radimo masivno drvo. ')
    expect(r).toEqual({ ok: true, status: 'declined' })

    const updates = writes()
    expect(updates.map((c) => c.table)).toEqual(['softclose_briefs', 'softclose_projects'])
    expect(updates[0].payload).toMatchObject({ maker_status: 'declined', maker_note: 'Ne radimo masivno drvo.' })
    expect(updates[0].payload).not.toHaveProperty('quoted_eur')
    expect(updates[1].payload).toEqual({ status: 'archived' })
    expect(updates[1].filters).toEqual([
      ['eq', 'id', PROJECT],
      ['eq', 'current_brief_id', BRIEF],
    ])
  })

  test('decline on an already archived project does not write the project again', async () => {
    signInAs(MAKER, 'maker')
    h.state.project = { id: PROJECT, current_brief_id: BRIEF, status: 'archived' }
    expect(await decideBrief(BRIEF, 'declined')).toEqual({ ok: true, status: 'declined' })
    expect(projectWrites()).toEqual([])
  })

  test('clarify writes the question and no amount, even if one is sent', async () => {
    signInAs(MAKER, 'maker')
    expect(await decideBrief(BRIEF, 'clarify', 'Koja je visina stropa?', 9999)).toEqual({
      ok: true,
      status: 'clarify',
    })
    const [w] = briefWrites()
    expect(w.payload).toMatchObject({ maker_status: 'clarify', maker_note: 'Koja je visina stropa?' })
    expect(w.payload).not.toHaveProperty('quoted_eur')
  })

  test('clarify, then quoted → allowed: a question keeps the brief open', async () => {
    signInAs(MAKER, 'maker')
    h.state.brief = briefRow({ maker_status: 'clarify', maker_note: 'Visina?', decided_at: '2026-10-02T09:00:00.000Z' })
    expect(await decideBrief(BRIEF, 'quoted', null, 7400.5)).toEqual({ ok: true, status: 'quoted' })
    expect(briefWrites()[0].payload).toMatchObject({ maker_status: 'quoted', quoted_eur: 7400.5, maker_note: null })
  })

  test('a brief without a project is decided without touching projects', async () => {
    signInAs(MAKER, 'maker')
    h.state.brief = briefRow({ project_id: null })
    expect(await decideBrief(BRIEF, 'declined')).toEqual({ ok: true, status: 'declined' })
    expect(h.state.calls.filter((c) => c.table === 'softclose_projects')).toEqual([])
    expect(h.state.revalidated).toEqual([`/maker/${BRIEF}`, '/dashboard'])
  })
})

describe('decideBrief — what is refused', () => {
  test('quoted → declined is a transition error; nothing written', async () => {
    signInAs(MAKER, 'maker')
    h.state.brief = briefRow({ maker_status: 'quoted', quoted_eur: '6200.00', decided_at: '2026-10-02T09:00:00.000Z' })
    expect(await decideBrief(BRIEF, 'declined')).toEqual({ ok: false, error: 'transition' })
    expect(writes()).toEqual([])
    expect(h.state.revalidated).toEqual([])
  })

  test('declined → quoted is a transition error; nothing written', async () => {
    signInAs(MAKER, 'maker')
    h.state.brief = briefRow({ maker_status: 'declined', decided_at: '2026-10-02T09:00:00.000Z' })
    expect(await decideBrief(BRIEF, 'quoted', null, 6200)).toEqual({ ok: false, error: 'transition' })
    expect(writes()).toEqual([])
  })

  test('a superseded brief → superseded; nothing written', async () => {
    signInAs(MAKER, 'maker')
    h.state.project = { id: PROJECT, current_brief_id: NEWER_BRIEF, status: 'submitted' }
    expect(await decideBrief(BRIEF, 'quoted', null, 6200)).toEqual({ ok: false, error: 'superseded' })
    expect(writes()).toEqual([])
    expect(h.state.revalidated).toEqual([])
  })

  test('another tab decided first (conditional update matched nothing) → stale; no project write', async () => {
    signInAs(MAKER, 'maker')
    h.state.briefUpdateRows = []
    expect(await decideBrief(BRIEF, 'declined')).toEqual({ ok: false, error: 'stale' })
    expect(projectWrites()).toEqual([])
    expect(h.state.revalidated).toEqual([])
  })

  test('quoted with no amount → amount_required; nothing written', async () => {
    signInAs(MAKER, 'maker')
    expect(await decideBrief(BRIEF, 'quoted')).toEqual({ ok: false, error: 'amount_required' })
    expect(writes()).toEqual([])
  })

  test('an amount sent as a string is refused, not coerced', async () => {
    signInAs(MAKER, 'maker')
    expect(await decideBrief(BRIEF, 'quoted', null, '6200')).toEqual({ ok: false, error: 'amount_invalid' })
    expect(writes()).toEqual([])
  })

  test("'viewed' is not a decision a caller may set", async () => {
    signInAs(MAKER, 'maker')
    expect(await decideBrief(BRIEF, 'viewed')).toEqual({ ok: false, error: 'invalid_status' })
    expect(writes()).toEqual([])
  })
})
