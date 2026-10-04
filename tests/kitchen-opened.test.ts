/**
 * A kitchen is "opened" when its customer first loads it — however they got
 * there.
 *
 * `opened_at` used to be stamped only at sign-in: for an invite (its own
 * project), and for a /login link that activated a pending account. A customer
 * already active whom a maker invited a second time, and who signed in at
 * /login — or was still signed in and never signed in at all — landed on the
 * new kitchen through `/`, worked on it, and the maker's list went on saying
 * "Pozvano, još nije otvoreno" (rule 8: status visibility).
 *
 * Now the kitchen page stamps it, for the project's own customer only, and the
 * stamp moves no status but `invited`: a project archived under it stays
 * archived, a submitted one stays submitted.
 *
 * Real: the maker's invite action, sign-in, the `/` signpost, the kitchen
 * page, the checkpoint route, the DAL, the account and project stores' code,
 * and the maker's dashboard page. Faked: the tables (in memory, applying the
 * filters they are given), magic-link tokens, the cookie jar and request
 * headers, email, and next/navigation's redirect (thrown, then followed).
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { ConsumedToken } from '@/lib/auth/magic-link'

class Redirect extends Error {
  constructor(readonly url: string) {
    super(`redirect ${url}`)
  }
}
class NotFound extends Error {}

const h = vi.hoisted(() => {
  type Row = Record<string, unknown>
  interface Write {
    table: string
    payload: Row
    /** Ids of the rows the write landed on. */
    ids: unknown[]
  }
  const state = {
    tables: {} as Record<string, Row[]>,
    writes: [] as Write[],
    /** Runs once, after the next read of a project — to play a race. */
    afterProjectRead: null as null | (() => void),
    claim: { verdict: 'invalid' } as ConsumedToken,
    jar: new Map<string, string>(),
    path: '/',
    tick: 0,
  }
  /** Strictly increasing timestamps, so "newest first" never ties. */
  const now = () => new Date(Date.UTC(2026, 9, 4, 9, 0, state.tick++)).toISOString()

  function query(table: string) {
    const filters: Array<(row: Row) => boolean> = []
    let op: 'select' | 'insert' | 'update' = 'select'
    let payload: Row = {}
    let order: { column: string; ascending: boolean } | null = null
    let limit = Infinity
    const rows = () => (state.tables[table] ??= [])
    const run = (): Row[] => {
      if (op === 'insert') {
        const row: Row = {
          id: crypto.randomUUID(),
          created_at: now(),
          updated_at: now(),
          ...(table === 'softclose_projects'
            ? {
                step: null,
                revision: 0,
                snapshot: null,
                snapshot_version: 1,
                current_brief_id: null,
                brief_print: null,
                opened_at: null,
                submitted_at: null,
                content_changed_at: null,
              }
            : {}),
          ...payload,
        }
        rows().push(row)
        state.writes.push({ table, payload, ids: [row.id] })
        return [{ ...row }]
      }
      let hit = rows().filter((r) => filters.every((f) => f(r)))
      if (op === 'update') {
        for (const r of hit) Object.assign(r, payload)
        state.writes.push({ table, payload, ids: hit.map((r) => r.id) })
      } else if (table === 'softclose_projects' && state.afterProjectRead) {
        const hook = state.afterProjectRead
        state.afterProjectRead = null
        const copies = hit.map((r) => ({ ...r }))
        hook()
        hit = copies
      }
      if (order) {
        const { column, ascending } = order
        hit = [...hit].sort((a, b) => String(a[column]).localeCompare(String(b[column])) * (ascending ? 1 : -1))
      }
      return hit.slice(0, limit).map((r) => ({ ...r }))
    }
    const q = {
      select: () => q,
      insert: (p: Row) => ((op = 'insert'), (payload = p), q),
      update: (p: Row) => ((op = 'update'), (payload = p), q),
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
      neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), q),
      is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), q),
      in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), q),
      order: (c: string, o?: { ascending?: boolean }) => ((order = { column: c, ascending: o?.ascending ?? true }), q),
      limit: (n: number) => ((limit = n), q),
      maybeSingle: () => Promise.resolve({ data: run()[0] ?? null, error: null }),
      single: () => Promise.resolve({ data: run()[0] ?? null, error: null }),
      then: <T>(resolve: (v: { data: Row[]; error: null }) => T, reject?: (e: unknown) => T) =>
        Promise.resolve({ data: run(), error: null }).then(resolve, reject),
    }
    return q
  }

  return { state, now, db: { from: query } }
})

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Redirect(url)
  },
  notFound: () => {
    throw new NotFound('not found')
  },
}))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = h.state.jar.get(name)
      return value === undefined ? undefined : { name, value }
    },
    set: (name: string, value: string) => {
      h.state.jar.set(name, value)
    },
    delete: (name: string) => {
      h.state.jar.delete(name)
    },
  }),
  headers: async () => new Headers({ host: 'app.example', 'x-sc-path': h.state.path }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/db/supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/supabase')>()),
  supabaseAdmin: () => h.db,
}))
vi.mock('@/lib/auth/magic-link', () => ({
  consumeToken: async () => h.state.claim,
  recentTokenCount: async () => 0,
  revokeOpenInvites: async () => {},
  issueToken: async () => ({ raw: 'RAWTOKEN123', hash: 'h', expiresAt: new Date(Date.now() + 900_000) }),
}))
vi.mock('@/lib/notify/send', () => ({
  emailProvider: () => 'resend',
  sendEmail: async () => ({ ok: true, outcome: 'sent', provider: 'resend', status: 200 }),
}))

import { inviteCustomer } from '@/app/dashboard/actions'
import DashboardPage from '@/app/dashboard/page'
import type { DashboardItem } from '@/app/dashboard/DashboardList'
import { completeSignIn } from '@/app/auth/verify/actions'
import Home from '@/app/page'
import KitchenPage from '@/app/kitchen/[projectId]/page'
import { POST as checkpoint } from '@/app/api/projects/[id]/checkpoint/route'
import type { Role } from '@/lib/auth/session'
import { SESSION_COOKIE, signSession } from '@/lib/auth/session'

const MAKER = { id: 'maker-1', email: 'studio@example.com', role: 'maker' as Role, name: 'Stolarija Horvat' }
const CUSTOMER = { id: 'cust-1', email: 'ana.kovac@example.com', role: 'customer' as Role, name: 'Ana' }
/** Ana's first kitchen: opened long ago, sent, quoted. */
const FIRST = '11111111-1111-4111-8111-111111111111'
const FIRST_OPENED = '2026-09-01T10:00:00.000Z'
const FIRST_BRIEF = '99999999-9999-4999-8999-999999999999'

function account(a: { id: string; email: string; role: Role; name: string }, status: string) {
  return { ...a, email_norm: a.email, status, locale: 'hr-HR', session_epoch: 0 }
}

beforeEach(() => {
  vi.stubEnv('AUTH_SECRET', 'test-secret-at-least-32-characters-long')
  vi.stubEnv('APP_URL', 'https://app.example')
  for (const level of ['info', 'warn', 'error'] as const) vi.spyOn(console, level).mockImplementation(() => {})
  h.state.tick = 0
  h.state.tables = {
    softclose_accounts: [account(MAKER, 'active'), account(CUSTOMER, 'active')],
    softclose_projects: [
      {
        id: FIRST,
        maker_id: MAKER.id,
        customer_id: CUSTOMER.id,
        title: 'Ana',
        status: 'submitted',
        step: 'contact',
        revision: 12,
        snapshot: null,
        snapshot_version: 1,
        current_brief_id: FIRST_BRIEF,
        brief_print: null,
        opened_at: FIRST_OPENED,
        submitted_at: '2026-09-03T10:00:00.000Z',
        content_changed_at: null,
        created_at: '2026-09-01T09:00:00.000Z',
        updated_at: '2026-09-03T10:00:00.000Z',
      },
    ],
    softclose_briefs: [
      {
        id: FIRST_BRIEF,
        project_id: FIRST,
        maker_id: MAKER.id,
        created_at: '2026-09-03T10:00:00.000Z',
        maker_status: 'quoted',
        maker_viewed_at: '2026-09-03T12:00:00.000Z',
        estimate_low: null,
        estimate_high: null,
        band_pct: null,
        decided_at: '2026-09-04T10:00:00.000Z',
        quoted_eur: 9000,
        maker_note: null,
      },
    ],
  }
  h.state.writes = []
  h.state.afterProjectRead = null
  h.state.claim = { verdict: 'invalid' }
  h.state.jar = new Map()
  h.state.path = '/'
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

const project = (id: string) => h.state.tables.softclose_projects.find((p) => p.id === id)!
const projectWrites = () => h.state.writes.filter((w) => w.table === 'softclose_projects')

async function signedInAs(who: { id: string; role: Role }) {
  h.state.jar = new Map([[SESSION_COOKIE, (await signSession({ sub: who.id, role: who.role, epoch: 0 }))!]])
}

/** The maker sends Ana a second invite, from the dashboard. Returns the new kitchen's id. */
async function inviteAnaAgain(): Promise<string> {
  await signedInAs(MAKER)
  const f = new FormData()
  f.set('email', CUSTOMER.email)
  f.set('name', 'Ana — kupaonica')
  const state = await inviteCustomer({ status: 'idle' }, f)
  expect(state.status).toBe('created')
  const created = h.state.tables.softclose_projects.filter((p) => p.id !== FIRST)
  expect(created).toHaveLength(1)
  return created[0].id as string
}

/** Ana signs in through /login's link (not the invite): where the action sends her. */
async function signInAtLogin(): Promise<string> {
  h.state.jar = new Map()
  h.state.claim = { verdict: 'ok', accountId: CUSTOMER.id, purpose: 'login', projectId: null, redirectTo: null }
  const f = new FormData()
  f.set('token', 'RAWTOKEN123')
  try {
    await completeSignIn({ failed: false }, f)
  } catch (e) {
    if (e instanceof Redirect) return e.url
    throw e
  }
  throw new Error('sign-in did not redirect')
}

/** Load a page as the current cookie, following its redirects: where it rendered. */
async function visit(start: string): Promise<string> {
  let url = start
  for (let i = 0; i < 5; i++) {
    h.state.path = url
    try {
      const kitchen = url.match(/^\/kitchen\/([^/?]+)$/)
      if (kitchen) await KitchenPage({ params: Promise.resolve({ projectId: kitchen[1] }) })
      else if (url === '/') await Home()
      else throw new Error(`no page for ${url}`)
      return url
    } catch (e) {
      if (!(e instanceof Redirect)) throw e
      url = e.url
    }
  }
  throw new Error(`redirect loop from ${start}`)
}

/** What the maker's dashboard says about each kitchen. */
async function makerSees(): Promise<Record<string, DashboardItem['display']>> {
  await signedInAs(MAKER)
  const el = (await DashboardPage()) as { props: { items: DashboardItem[] } }
  return Object.fromEntries(el.props.items.map((i) => [i.projectId, i.display]))
}

/** One autosave from Ana's journey. */
async function save(projectId: string, step: string) {
  await signedInAs(CUSTOMER)
  const res = await checkpoint(
    new Request(`https://app.example/api/projects/${projectId}/checkpoint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseRevision: project(projectId).revision, snapshot: { profile: {} }, step }),
    }),
    { params: Promise.resolve({ id: projectId }) }
  )
  expect(res.status).toBe(200)
}

describe('an active customer a maker invites a second time', () => {
  test('signing in at /login: lands on the new kitchen, which the maker then reads as opened', async () => {
    const second = await inviteAnaAgain()
    expect(project(second)).toMatchObject({ status: 'invited', opened_at: null })
    expect((await makerSees())[second]).toBe('invited')

    expect(await signInAtLogin()).toBe('/')
    // Sign-in stamps nothing itself; the kitchen she lands on does.
    expect(project(second).opened_at).toBeNull()
    expect(await visit('/')).toBe(`/kitchen/${second}`)

    expect(project(second)).toMatchObject({ status: 'in_progress' })
    expect(project(second).opened_at).not.toBeNull()
    expect(project(FIRST)).toMatchObject({ status: 'submitted', opened_at: FIRST_OPENED })

    const seen = await makerSees()
    expect(seen[second]).toBe('opened')
    expect(seen[FIRST]).toBe('submitted')

    await save(second, 'builder')
    expect((await makerSees())[second]).toBe('in_progress')
  })

  test('still signed in, never signing in at all: the first load stamps it', async () => {
    const second = await inviteAnaAgain()
    await signedInAs(CUSTOMER)
    expect(await visit('/')).toBe(`/kitchen/${second}`)
    expect(project(second).opened_at).not.toBeNull()
    expect((await makerSees())[second]).toBe('opened')
  })

  test('a kitchen already worked on without the stamp reads as in progress before she comes back', async () => {
    // The rows this bug left behind: saved past the first step, opened_at null.
    const second = await inviteAnaAgain()
    Object.assign(project(second), { status: 'in_progress', step: 'builder' })
    expect((await makerSees())[second]).toBe('in_progress')
  })
})

describe('only the customer, only the first load', () => {
  test('the maker looking in stamps nothing', async () => {
    const second = await inviteAnaAgain()
    h.state.writes = []
    await signedInAs(MAKER)
    expect(await visit(`/kitchen/${second}`)).toBe(`/kitchen/${second}`)
    expect(projectWrites()).toEqual([])
    expect(project(second)).toMatchObject({ status: 'invited', opened_at: null })
    expect((await makerSees())[second]).toBe('invited')
  })

  test('a later load writes nothing, and the first open keeps its time', async () => {
    const second = await inviteAnaAgain()
    await signedInAs(CUSTOMER)
    await visit(`/kitchen/${second}`)
    const opened = project(second).opened_at
    h.state.writes = []
    await visit(`/kitchen/${second}`)
    await visit(`/kitchen/${FIRST}`)
    expect(projectWrites()).toEqual([])
    expect(project(second).opened_at).toBe(opened)
  })

  test('clicking the invite itself still ends opened, now that the page stamps it rather than sign-in', async () => {
    const second = await inviteAnaAgain()
    h.state.jar = new Map()
    h.state.claim = {
      verdict: 'ok',
      accountId: CUSTOMER.id,
      purpose: 'invite',
      projectId: second,
      redirectTo: `/kitchen/${second}`,
    }
    const f = new FormData()
    f.set('token', 'RAWTOKEN123')
    const to = await completeSignIn({ failed: false }, f).catch((e: unknown) => (e as Redirect).url)
    expect(to).toBe(`/kitchen/${second}`)
    await visit(to as string)
    expect(project(second)).toMatchObject({ status: 'in_progress' })
    expect(project(second).opened_at).not.toBeNull()
  })
})

describe('the stamp moves no status but invited', () => {
  test('archived between the page reading it and the stamp: it stays archived', async () => {
    const second = await inviteAnaAgain()
    await signedInAs(CUSTOMER)
    // The page reads 'invited'; the maker archives before the stamp lands.
    h.state.afterProjectRead = () => {
      project(second).status = 'archived'
    }
    await visit(`/kitchen/${second}`)
    expect(project(second).status).toBe('archived')
    expect((await makerSees())[second]).toBe('archived')
  })

  test('submitted without a stamp (sent before this fix): it stays submitted', async () => {
    Object.assign(project(FIRST), { opened_at: null })
    await signedInAs(CUSTOMER)
    await visit(`/kitchen/${FIRST}`)
    expect(project(FIRST).status).toBe('submitted')
    expect(project(FIRST).opened_at).not.toBeNull()
  })
})
