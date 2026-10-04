/**
 * IMP-07: GET /api/projects/[id]/brief — the customer's own copy of their
 * project's current brief, for the review's download on a revisit (there is
 * no send response to save any more).
 *
 *  - signed out: 401, never a redirect;
 *  - anyone but the project's customer, a malformed id, no brief yet: 404,
 *    the same answer every time;
 *  - the owner: the stored bundle with its id, without the maker-only money,
 *    its storage refs swapped for signed links; not cacheable.
 *
 * The route runs for real; only its edges are faked — the session, the
 * database client and the storage signer.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest'

const h = vi.hoisted(() => {
  const state = {
    session: null as null | {
      accountId: string
      role: 'customer' | 'maker'
      email: string
      name: string | null
      locale: string | null
    },
    project: null as Record<string, unknown> | null,
    briefs: {} as Record<string, Record<string, unknown>>,
    reads: [] as Array<{ table: string; filters: Array<[string, unknown]> }>,
    signed: [] as string[][],
  }
  function builder(table: string) {
    const call = { table, filters: [] as Array<[string, unknown]> }
    state.reads.push(call)
    const b = {
      select() {
        return b
      },
      eq(column: string, value: unknown) {
        call.filters.push([column, value])
        return b
      },
      maybeSingle() {
        if (table === 'softclose_projects') {
          const id = call.filters.find(([c]) => c === 'id')?.[1]
          return Promise.resolve({ data: state.project && state.project.id === id ? state.project : null, error: null })
        }
        if (table === 'softclose_briefs') {
          const id = call.filters.find(([c]) => c === 'id')?.[1] as string
          return Promise.resolve({ data: state.briefs[id] ?? null, error: null })
        }
        return Promise.resolve({ data: null, error: null })
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

vi.mock('@/lib/db/media', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/media')>()),
  storageSigner: () => async (paths: string[]) => {
    h.state.signed.push(paths)
    return Object.fromEntries(paths.map((p) => [p, `https://signed.test/${p}?token=t`]))
  },
}))

import { GET } from '@/app/api/projects/[id]/brief/route'

const CUSTOMER = '33333333-3333-4333-8333-333333333333'
const OTHER_CUSTOMER = '22222222-2222-4222-8222-222222222222'
const MAKER = '11111111-1111-4111-8111-111111111111'
const PROJECT = '55555555-5555-4555-8555-555555555555'
const BRIEF = '44444444-4444-4444-8444-444444444444'

const STORED_BUNDLE = {
  brief: { name: 'Ana', spacePhotos: ['storage://softclose-media/briefs/444/001.jpg'] },
  moodBoard: [],
  floorPlan: null,
  explorationRefs: [],
  chosenRender: null,
  estimate: {
    low: 5291,
    high: 7376,
    withAppliances: null,
    basis: '',
    bandPct: 14,
    lines: [],
    assumptions: ['installIncluded'],
    maker: { net: { low: 4000, high: 5500 }, margin: { low: 1291, high: 1876 }, marginPct: 30 },
  },
  transcript: [],
  generatedAt: '2026-10-04T08:00:00.000Z',
}

function get(id = PROJECT) {
  return GET(new Request(`http://localhost/api/projects/${id}/brief`), { params: Promise.resolve({ id }) })
}

const customer = (accountId = CUSTOMER) => ({
  accountId,
  role: 'customer' as const,
  email: 'ana@example.test',
  name: 'Ana',
  locale: 'hr-HR',
})

beforeEach(() => {
  h.state.session = customer()
  h.state.project = { id: PROJECT, customer_id: CUSTOMER, current_brief_id: BRIEF }
  h.state.briefs = { [BRIEF]: { id: BRIEF, bundle: structuredClone(STORED_BUNDLE) } }
  h.state.reads = []
  h.state.signed = []
})

describe('GET /api/projects/[id]/brief', () => {
  test('signed out: 401, and nothing is read', async () => {
    h.state.session = null
    const res = await get()
    expect(res.status).toBe(401)
    expect(h.state.reads).toEqual([])
  })

  test('another customer’s project: 404', async () => {
    h.state.session = customer(OTHER_CUSTOMER)
    const res = await get()
    expect(res.status).toBe(404)
    // The brief is never read for someone who does not own the project.
    expect(h.state.reads.map((r) => r.table)).toEqual(['softclose_projects'])
  })

  test('the maker: 404 (the maker reads briefs on their own pages), without a database read', async () => {
    h.state.session = { ...customer(MAKER), role: 'maker' }
    expect((await get()).status).toBe(404)
    expect(h.state.reads).toEqual([])
  })

  test('no brief on the project yet: 404', async () => {
    h.state.project = { id: PROJECT, customer_id: CUSTOMER, current_brief_id: null }
    expect((await get()).status).toBe(404)
  })

  test('a malformed id or an unknown project: 404', async () => {
    expect((await get('not-a-uuid')).status).toBe(404)
    expect((await get('66666666-6666-4666-8666-666666666666')).status).toBe(404)
  })

  test('the owner: the brief with its id, no maker-only money, media signed, not cacheable', async () => {
    const res = await get()
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    const body = await res.json()
    expect(body.briefId).toBe(BRIEF)
    expect(body.estimate.low).toBe(5291)
    expect(body.estimate).not.toHaveProperty('maker')
    expect(body.estimate).not.toHaveProperty('makerCost')
    expect(JSON.stringify(body)).not.toMatch(/"net"|"margin"|marginPct/)
    expect(body.brief.spacePhotos).toEqual(['https://signed.test/briefs/444/001.jpg?token=t'])
    expect(h.state.signed).toEqual([['briefs/444/001.jpg']])
    // It reads the project's CURRENT brief.
    const briefRead = h.state.reads.find((r) => r.table === 'softclose_briefs')!
    expect(briefRead.filters).toContainEqual(['id', BRIEF])
  })
})
