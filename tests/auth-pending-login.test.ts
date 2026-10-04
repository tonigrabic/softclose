/**
 * A customer a maker invited (account `pending`) who signs in through /login's
 * link instead of the invite used to end in ERR_TOO_MANY_REDIRECTS:
 *
 *   completeSignIn set a cookie for the pending account (only an *invite*
 *   activated it) → / asked the DAL, which refuses anything not `active` →
 *   /login?next=%2F → the proxy saw a validly signed cookie on /login and
 *   sent it back to / → …
 *
 * Two fixes, both pinned here:
 *
 *  - A working sign-in link to the account's own address proves the address,
 *    as an invite does: a login token activates a pending account. (The
 *    kitchen they land on stops reading "invited" when the kitchen page loads
 *    — tests/kitchen-opened.test.ts.) And sign-in asks the DAL's own question
 *    before it sets a cookie, so it never hands out one every page then
 *    refuses.
 *  - The loop itself is impossible: the proxy no longer bounces anyone off
 *    /login on the cookie's signature alone. The login page asks the DAL, so a
 *    refused cookie (pending, disabled, signed out everywhere) gets the form.
 *
 * The real proxy, session signing, DAL, sign-in action and the / and /login
 * pages run, followed hop by hop the way a browser would. Faked: the account,
 * token and project stores, the cookie jar and request headers, and
 * next/navigation's redirect (thrown, then followed).
 */
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { Account } from '@/lib/auth/accounts'
import type { ConsumedToken } from '@/lib/auth/magic-link'

class Redirect extends Error {
  constructor(readonly url: string) {
    super(`redirect ${url}`)
  }
}
class NotFound extends Error {}

const h = vi.hoisted(() => ({
  state: {
    accounts: new Map<string, Account>(),
    /** What the activation UPDATE does — false plays a write that did not land. */
    activationLands: true,
    activated: [] as string[],
    touched: [] as string[],
    claim: { verdict: 'invalid' } as ConsumedToken,
    jar: new Map<string, string>(),
    path: '/',
  },
}))

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
vi.mock('@/lib/auth/accounts', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/auth/accounts')>()
  return {
    accountAdmitsSession: real.accountAdmitsSession,
    findAccountById: async (id: string) => {
      const a = h.state.accounts.get(id)
      return a ? { ...a } : null
    },
    findAccountByEmail: async (email: string) =>
      [...h.state.accounts.values()].find((a) => a.email === email) ?? null,
    activateAccount: async (id: string) => {
      h.state.activated.push(id)
      const a = h.state.accounts.get(id)
      if (a && a.status === 'pending' && h.state.activationLands) a.status = 'active'
    },
    touchLastLogin: async (id: string) => {
      h.state.touched.push(id)
    },
  }
})
vi.mock('@/lib/auth/magic-link', () => ({
  consumeToken: async () => h.state.claim,
  recentTokenCount: async () => 0,
  issueToken: async () => ({ raw: 'RAWTOKEN123', hash: 'h', expiresAt: new Date(Date.now() + 900_000) }),
}))
vi.mock('@/lib/auth/projects', () => ({
  currentProjectForCustomer: async (customerId: string) => (customerId === CUSTOMER.id ? { id: KITCHEN } : null),
}))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => ({ ok: true }) }))
vi.mock('@/lib/notify/send', () => ({
  emailProvider: () => 'resend',
  sendEmail: async () => ({ ok: true, outcome: 'sent', provider: 'resend', status: 200 }),
}))

import { proxy } from '@/proxy'
import { completeSignIn } from '@/app/auth/verify/actions'
import { requestLoginLink } from '@/app/login/actions'
import LoginPage from '@/app/login/page'
import Home from '@/app/page'
import { getSession, requireMaker, requireSession } from '@/lib/auth/dal'
import { SESSION_COOKIE, signSession } from '@/lib/auth/session'

const KITCHEN = '11111111-1111-4111-8111-111111111111'
const INVITED_KITCHEN = '22222222-2222-4222-8222-222222222222'
const CUSTOMER: Account = {
  id: 'cust-1',
  email: 'ana.kovac@example.com',
  role: 'customer',
  status: 'pending',
  name: 'Ana',
  locale: 'hr-HR',
  sessionEpoch: 0,
}
const MAKER: Account = {
  id: 'maker-1',
  email: 'studio@example.com',
  role: 'maker',
  status: 'active',
  name: 'Stolarija Horvat',
  locale: 'hr-HR',
  sessionEpoch: 0,
}

let logs: string[]
beforeEach(() => {
  vi.stubEnv('AUTH_SECRET', 'test-secret-at-least-32-characters-long')
  vi.stubEnv('APP_URL', 'https://app.example')
  logs = []
  for (const level of ['info', 'warn', 'error'] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '))
    })
  }
  h.state.accounts = new Map([
    [CUSTOMER.id, { ...CUSTOMER }],
    [MAKER.id, { ...MAKER }],
  ])
  h.state.activationLands = true
  h.state.activated = []
  h.state.touched = []
  h.state.claim = { verdict: 'invalid' }
  h.state.jar = new Map()
  h.state.path = '/'
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

const account = (id: string) => h.state.accounts.get(id)!

function loginClaim(accountId: string, redirectTo: string | null = null): ConsumedToken {
  return { verdict: 'ok', accountId, purpose: 'login', projectId: null, redirectTo }
}
function inviteClaim(accountId: string, projectId: string): ConsumedToken {
  return { verdict: 'ok', accountId, purpose: 'invite', projectId, redirectTo: `/kitchen/${projectId}` }
}

/** completeSignIn as the verify form posts it: where it redirects, or that it failed. */
async function signIn(claim: ConsumedToken): Promise<{ redirect: string } | { failed: true }> {
  h.state.claim = claim
  const f = new FormData()
  f.set('token', 'RAWTOKEN123')
  try {
    const state = await completeSignIn({ failed: false }, f)
    expect(state.failed).toBe(true)
    return { failed: true }
  } catch (e) {
    if (e instanceof Redirect) return { redirect: e.url }
    throw e
  }
}

/** A guarded page stands in for every page behind the DAL. */
async function render(url: string): Promise<string> {
  const { pathname, searchParams } = new URL(url, 'https://app.example')
  if (pathname === '/') {
    await Home()
    return 'no-project panel'
  }
  if (pathname === '/login') {
    const el = (await LoginPage({ searchParams: Promise.resolve(Object.fromEntries(searchParams)) })) as {
      props: { next?: string }
    }
    return `login form (next=${el.props.next ?? ''})`
  }
  if (pathname === '/dashboard') {
    await requireMaker()
    return 'dashboard'
  }
  if (pathname.startsWith('/kitchen/')) {
    await requireSession()
    return 'kitchen'
  }
  throw new Error(`no page for ${url}`)
}

/**
 * Follow a navigation the way a browser does — the proxy, then the page, and
 * every redirect either of them answers — until a page renders. Chrome gives
 * up after 20 hops; ten is plenty for any real path through this app.
 */
async function browse(start: string): Promise<{ landed: string; page: string; hops: string[] }> {
  let url = start
  const hops: string[] = []
  for (let i = 0; i < 10; i++) {
    hops.push(url)
    const cookie = h.state.jar.get(SESSION_COOKIE)
    const req = new NextRequest(new URL(url, 'https://app.example'), {
      headers: cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {},
    })
    const res = await proxy(req)
    const location = res.headers.get('location')
    if (location) {
      const to = new URL(location)
      url = to.pathname + to.search
      continue
    }
    h.state.path = url
    try {
      return { landed: url, page: await render(url), hops }
    } catch (e) {
      if (!(e instanceof Redirect)) throw e
      url = e.url
    }
  }
  throw new Error(`redirect loop: ${hops.join(' → ')}`)
}

describe("a pending customer signing in through /login's link", () => {
  test('is activated and lands on their kitchen — no loop', async () => {
    expect(await signIn(loginClaim(CUSTOMER.id))).toEqual({ redirect: '/' })

    expect(account(CUSTOMER.id).status).toBe('active')
    expect(h.state.jar.get(SESSION_COOKIE)).toBeTruthy()
    expect(h.state.touched).toEqual([CUSTOMER.id])

    const nav = await browse('/')
    expect(nav).toEqual({ landed: `/kitchen/${KITCHEN}`, page: 'kitchen', hops: ['/', `/kitchen/${KITCHEN}`] })
  })

  test('a ?next= carried on the link is honoured', async () => {
    expect(await signIn(loginClaim(CUSTOMER.id, `/kitchen/${KITCHEN}`))).toEqual({
      redirect: `/kitchen/${KITCHEN}`,
    })
    expect((await browse(`/kitchen/${KITCHEN}`)).page).toBe('kitchen')
  })
})

describe('what did not change', () => {
  test('an invite still activates and lands on its own kitchen, not the latest one', async () => {
    expect(await signIn(inviteClaim(CUSTOMER.id, INVITED_KITCHEN))).toEqual({
      redirect: `/kitchen/${INVITED_KITCHEN}`,
    })
    expect(account(CUSTOMER.id).status).toBe('active')
    expect((await browse(`/kitchen/${INVITED_KITCHEN}`)).page).toBe('kitchen')
  })

  test('an active customer signing in again activates nothing', async () => {
    account(CUSTOMER.id).status = 'active'
    expect(await signIn(loginClaim(CUSTOMER.id))).toEqual({ redirect: '/' })
    expect(h.state.activated).toEqual([])
  })

  test('a maker signing in goes to the dashboard', async () => {
    expect(await signIn(loginClaim(MAKER.id))).toEqual({ redirect: '/dashboard' })
    expect((await browse('/dashboard')).page).toBe('dashboard')
  })

  test('a disabled account is refused, and no cookie is set', async () => {
    account(CUSTOMER.id).status = 'disabled'
    expect(await signIn(loginClaim(CUSTOMER.id))).toEqual({ failed: true })
    expect(h.state.jar.size).toBe(0)
    expect(h.state.activated).toEqual([])
  })

  test('requestLoginLink still sends a pending account its link, and reads "sent" as for no account', async () => {
    const ask = async (email: string) => {
      const f = new FormData()
      f.set('email', email)
      return requestLoginLink({ status: 'idle' }, f)
    }
    expect((await ask(CUSTOMER.email)).status).toBe('sent')
    expect((await ask('nobody@example.com')).status).toBe('sent')
    expect(logs.join('\n')).toContain('login link issued a***@example.com')
  })
})

describe('sign-in never sets a cookie the DAL refuses', () => {
  test('an activation that did not land: the failed screen, no cookie, logged without the address', async () => {
    h.state.activationLands = false
    expect(await signIn(loginClaim(CUSTOMER.id))).toEqual({ failed: true })
    expect(h.state.jar.size).toBe(0)
    expect(h.state.touched).toEqual([])
    const line = logs.find((l) => l.includes('not active after activation'))
    expect(line).toContain('a***@example.com')
    expect(logs.join('\n')).not.toContain(CUSTOMER.email)
  })

  const cases: Array<[string, Account['status'], 'login' | 'invite', Account]> = [
    ['pending customer, login link', 'pending', 'login', CUSTOMER],
    ['pending customer, invite', 'pending', 'invite', CUSTOMER],
    ['active customer, login link', 'active', 'login', CUSTOMER],
    ['active customer, invite', 'active', 'invite', CUSTOMER],
    ['active maker, login link', 'active', 'login', MAKER],
  ]
  for (const [name, status, purpose, who] of cases) {
    test(`${name}: whenever a cookie is set, the DAL honours it`, async () => {
      for (const lands of [true, false]) {
        h.state.jar = new Map()
        account(who.id).status = status
        h.state.activationLands = lands
        await signIn(purpose === 'login' ? loginClaim(who.id) : inviteClaim(who.id, INVITED_KITCHEN))
        if (h.state.jar.has(SESSION_COOKIE)) expect(await getSession()).not.toBeNull()
      }
    })
  }
})

describe('a cookie the DAL refuses can never loop', () => {
  /** A validly signed cookie for an account, as the old sign-in (or a past session) left it. */
  async function cookieFor(who: Account) {
    const jwt = await signSession({ sub: who.id, role: who.role, epoch: who.sessionEpoch })
    h.state.jar.set(SESSION_COOKIE, jwt!)
  }

  test('pending — the cookie the old sign-in handed out: / ends on the login form, once', async () => {
    await cookieFor(CUSTOMER)
    const nav = await browse('/')
    expect(nav).toEqual({ landed: '/login?next=%2F', page: 'login form (next=/)', hops: ['/', '/login?next=%2F'] })
  })

  test('disabled after signing in: the login form', async () => {
    account(CUSTOMER.id).status = 'active'
    await cookieFor(account(CUSTOMER.id))
    account(CUSTOMER.id).status = 'disabled'
    expect((await browse(`/kitchen/${KITCHEN}`)).landed).toBe(`/login?next=%2Fkitchen%2F${KITCHEN}`)
  })

  test('signed out everywhere (epoch bumped): the login form', async () => {
    await cookieFor(MAKER)
    account(MAKER.id).sessionEpoch = 1
    expect((await browse('/dashboard')).landed).toBe('/login?next=%2Fdashboard')
  })

  test('the proxy lets a signed cookie through to /login — the page decides', async () => {
    await cookieFor(CUSTOMER)
    const cookie = h.state.jar.get(SESSION_COOKIE)!
    const res = await proxy(
      new NextRequest('https://app.example/login', { headers: { cookie: `${SESSION_COOKIE}=${cookie}` } })
    )
    expect(res.headers.get('location')).toBeNull()
  })

  test('a session the DAL honours is still sent on from /login, to where it was going', async () => {
    account(CUSTOMER.id).status = 'active'
    await cookieFor(account(CUSTOMER.id))
    expect((await browse('/login')).landed).toBe(`/kitchen/${KITCHEN}`)
    expect((await browse(`/login?next=${encodeURIComponent(`/kitchen/${KITCHEN}`)}`)).landed).toBe(
      `/kitchen/${KITCHEN}`
    )

    h.state.jar = new Map()
    await cookieFor(MAKER)
    expect((await browse('/login')).landed).toBe('/dashboard')
  })
})
