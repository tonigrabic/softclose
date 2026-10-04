/**
 * "Izbriši moju kuhinju" — who may erase (IMP-09).
 *
 * The real DAL (`requireProjectAccess`) runs, with only its edges faked: the
 * cookie jar (with a `delete` spy), the session signature, the account lookup
 * and the database client that returns the project row. The erase itself is
 * mocked — tests/erase-project.test.ts covers what it deletes; this file
 * covers that only the project's own customer ever reaches it, and what the
 * action does with the outcome.
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
    project: null as Record<string, unknown> | null,
    deletedCookies: [] as string[],
    revalidated: [] as string[],
    queries: 0,
    erase: vi.fn(),
  }
  const db = {
    from: () => {
      state.queries += 1
      const b = {
        select: () => b,
        eq: () => b,
        maybeSingle: async () => ({ data: state.project, error: null }),
      }
      return b
    },
    storage: {},
  }
  return { state, db, RedirectSentinel, NotFoundSentinel }
})

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (h.state.cookie ? { name, value: h.state.cookie } : undefined),
    delete: (name: string) => {
      h.state.deletedCookies.push(name)
    },
  }),
  headers: async () => ({
    get: (name: string) => (name === 'x-sc-path' ? '/kitchen/somewhere' : null),
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

vi.mock('@/lib/project/erase', () => ({
  eraseCustomerProject: h.state.erase,
}))

import { deleteMyKitchen } from '@/app/kitchen/[projectId]/actions'

const MAKER = '11111111-1111-4111-8111-111111111111'
const CUSTOMER = '33333333-3333-4333-8333-333333333333'
const OTHER_CUSTOMER = '44444444-4444-4444-8444-444444444444'
const PROJECT = '55555555-5555-4555-8555-555555555555'

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

beforeEach(() => {
  h.state.cookie = undefined
  h.state.claims = null
  h.state.account = null
  h.state.project = {
    id: PROJECT,
    maker_id: MAKER,
    customer_id: CUSTOMER,
    status: 'submitted',
    step: 'wrapup',
    revision: 3,
    snapshot_version: 1,
    current_brief_id: null,
    opened_at: null,
    submitted_at: null,
    updated_at: '2026-10-04T10:00:00.000Z',
    content_changed_at: null,
    title: null,
  }
  h.state.deletedCookies = []
  h.state.revalidated = []
  h.state.queries = 0
  h.state.erase.mockReset()
  h.state.erase.mockResolvedValue({ ok: true, objects: 5, briefs: 2, accountDeleted: true })
})

describe('deleteMyKitchen — who may erase', () => {
  test('signed out → redirected to login; nothing erased', async () => {
    const err = await deleteMyKitchen(PROJECT).catch((e) => e)
    expect(err).toBeInstanceOf(h.RedirectSentinel)
    expect((err as InstanceType<typeof h.RedirectSentinel>).url).toMatch(/^\/login/)
    expect(h.state.erase).not.toHaveBeenCalled()
    expect(h.state.deletedCookies).toEqual([])
  })

  test("the project's maker (the read-only view) → notFound; nothing erased, cookie untouched", async () => {
    signInAs(MAKER, 'maker')
    await expect(deleteMyKitchen(PROJECT)).rejects.toBeInstanceOf(h.NotFoundSentinel)
    expect(h.state.erase).not.toHaveBeenCalled()
    expect(h.state.deletedCookies).toEqual([])
  })

  test('another customer → notFound; nothing erased', async () => {
    signInAs(OTHER_CUSTOMER, 'customer')
    await expect(deleteMyKitchen(PROJECT)).rejects.toBeInstanceOf(h.NotFoundSentinel)
    expect(h.state.erase).not.toHaveBeenCalled()
    expect(h.state.deletedCookies).toEqual([])
  })

  test('a malformed or non-string id → notFound before any query', async () => {
    signInAs(CUSTOMER, 'customer')
    await expect(deleteMyKitchen('not-a-uuid')).rejects.toBeInstanceOf(h.NotFoundSentinel)
    await expect(deleteMyKitchen(42)).rejects.toBeInstanceOf(h.NotFoundSentinel)
    await expect(deleteMyKitchen({ id: PROJECT })).rejects.toBeInstanceOf(h.NotFoundSentinel)
    expect(h.state.queries).toBe(0)
    expect(h.state.erase).not.toHaveBeenCalled()
  })

  test('a project that does not exist → notFound', async () => {
    signInAs(CUSTOMER, 'customer')
    h.state.project = null
    await expect(deleteMyKitchen(PROJECT)).rejects.toBeInstanceOf(h.NotFoundSentinel)
    expect(h.state.erase).not.toHaveBeenCalled()
  })
})

describe('deleteMyKitchen — the customer erases their own kitchen', () => {
  test('erase runs for this project and customer; signed out; lands on /login?deleted=1', async () => {
    signInAs(CUSTOMER, 'customer')
    const err = await deleteMyKitchen(PROJECT).catch((e) => e)

    expect(h.state.erase).toHaveBeenCalledTimes(1)
    expect(h.state.erase).toHaveBeenCalledWith(h.db, { projectId: PROJECT, customerId: CUSTOMER })
    expect(h.state.deletedCookies).toEqual(['sc_session'])
    expect(h.state.revalidated).toEqual(['/dashboard'])
    expect(err).toBeInstanceOf(h.RedirectSentinel)
    expect((err as InstanceType<typeof h.RedirectSentinel>).url).toBe('/login?deleted=1')
  })

  test('a deletion that stopped part-way → "incomplete"; cookie kept, no redirect', async () => {
    signInAs(CUSTOMER, 'customer')
    h.state.erase.mockResolvedValue({ ok: false, failedAt: 'storage' })
    const r = await deleteMyKitchen(PROJECT)
    expect(r).toEqual({ ok: false, error: 'incomplete' })
    expect(h.state.deletedCookies).toEqual([])
    expect(h.state.revalidated).toEqual([])
  })
})
