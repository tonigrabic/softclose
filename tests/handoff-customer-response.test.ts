/**
 * IMP-05: the homeowner's copy of their brief carries nothing of the maker's.
 *
 * The wrap-up renders, and the JSON download writes to disk, exactly what
 * /api/handoff answers. So the answer may hold no maker-only money (net cost,
 * margin, the B2B cost basis) and no path into the maker's side (`/maker/<id>`,
 * a 404 for a customer). The B2B cost basis is not even computed at submit any
 * more: it would be stored with the brief and could ride back in a response.
 * The maker's brief page computes it at view time (makerCostFor).
 *
 * The maker pricelist is mocked as populated here, so the code before IMP-05
 * would have produced a `makerCost` on every one of these sends. The real JSON
 * ships empty (tests/maker-pricing.test.ts), which is why the leak was dormant.
 *
 * The route runs for real; only its edges are faked, as in handoff-closed: the
 * session, the database client (which records every query), media offload and
 * the maker email.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { CONTRACT_FIXTURES } from '@/lib/builder/fixtures'
import { floorPlanToLayout } from '@/lib/contract/layout-contract'
import { hydrateFromHypothesis } from '@/lib/builder/state'
import { computeBom } from '@/lib/builder/bom'
import type { BuilderState } from '@/lib/builder/inventory'
import type { HandoffBundle } from '@/lib/types'

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
    /** Briefs by id, as a lookup by id sees them. */
    briefs: {} as Record<string, Record<string, unknown>>,
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

// A maker who has supplied B2B prices: every SKU costs them 1 €.
vi.mock('@/lib/catalog/maker-pricing', () => ({
  makerPricingEntryCount: () => 1,
  makerPriceForSku: (sku: string | undefined | null) => (sku ? 1 : null),
}))

import { POST } from '@/app/api/handoff/route'
import { buildHandoffBundle, makerCostFor } from '@/lib/handoff/bundle'

const CUSTOMER = '33333333-3333-4333-8333-333333333333'
const MAKER = '11111111-1111-4111-8111-111111111111'
const PROJECT = '55555555-5555-4555-8555-555555555555'
const EXISTING_BRIEF = '44444444-4444-4444-8444-444444444444'

/** An L-shape where the maker supplies the appliances and the sink + tap, so
 *  there are goods with SKUs for the B2B prices to land on. */
function lShape(): BuilderState {
  const f = CONTRACT_FIXTURES.find((x) => x.id === 'l-shape')!
  const s = hydrateFromHypothesis(null, { layoutContract: floorPlanToLayout(f.build()) })
  return {
    ...s,
    appliances: { ...s.appliances, supply: 'maker_supplies' },
    sinkTaps: { ...s.sinkTaps, supply: 'maker_supplies' },
  }
}

function send(extra: Record<string, unknown> = {}) {
  return POST(
    new Request('http://localhost/api/handoff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brief: { builderState: lShape() }, projectId: PROJECT, locale: 'hr-HR', ...extra }),
    })
  )
}

function expectCustomerCopy(json: HandoffBundle & Record<string, unknown>) {
  expect(json.estimate).not.toBeNull()
  expect(json.estimate!.low).toBeGreaterThan(0)
  expect(json.estimate).not.toHaveProperty('makerCost')
  expect(json.estimate).not.toHaveProperty('maker')
  expect(json).not.toHaveProperty('makerPath')
  // Nothing anywhere in it points into the maker's side.
  expect(JSON.stringify(json)).not.toMatch(/\/maker\//)
}

const briefInserts = () => h.state.calls.filter((c) => c.table === 'softclose_briefs' && c.op === 'insert')

beforeEach(() => {
  h.state.session = { accountId: CUSTOMER, role: 'customer', email: 'kupac@example.test', name: null, locale: 'hr-HR' }
  h.state.project = { id: PROJECT, customer_id: CUSTOMER, maker_id: MAKER, status: 'in_progress', current_brief_id: null }
  h.state.briefs = {}
  h.state.calls = []
  h.state.notified = 0
})

describe('the customer’s /api/handoff response', () => {
  test('a fresh send: saved, with the range, and no maker money or maker path', async () => {
    const res = await send()
    expect(res.status).toBe(200)
    const json = (await res.json()) as HandoffBundle & Record<string, unknown>
    expect(json.briefId).toMatch(/^[0-9a-f-]{36}$/)
    expectCustomerCopy(json)
    expect(h.state.notified).toBe(1)
  })

  test('a repeated send of the same brief (the reuse answer) is stripped the same way', async () => {
    h.state.project = { ...h.state.project, status: 'submitted', current_brief_id: EXISTING_BRIEF }
    h.state.briefs = { [EXISTING_BRIEF]: { project_id: PROJECT, maker_status: 'new' } }
    const res = await send({ briefId: EXISTING_BRIEF })
    expect(res.status).toBe(200)
    const json = (await res.json()) as HandoffBundle & Record<string, unknown>
    expect(json.briefId).toBe(EXISTING_BRIEF)
    expectCustomerCopy(json)
    // A reuse writes nothing and emails nobody.
    expect(briefInserts()).toEqual([])
    expect(h.state.notified).toBe(0)
  })

  test('the stored brief keeps net cost and margin, and has no B2B cost basis: none is computed at submit', async () => {
    await send()
    const [insert] = briefInserts()
    expect(insert).toBeDefined()
    const stored = (insert.payload as { bundle: HandoffBundle }).bundle
    expect(stored.estimate!.maker).toBeDefined()
    expect(stored.estimate!.makerCost).toBeUndefined()
    expect(stored).not.toHaveProperty('makerPath')
  })
})

describe('the B2B cost basis is computed on the maker’s page only', () => {
  test('buildHandoffBundle attaches none, even with a pricelist in', () => {
    const bundle = buildHandoffBundle({ brief: { builderState: lShape() } })
    expect(bundle.estimate).not.toBeNull()
    expect(bundle.estimate).not.toHaveProperty('makerCost')
  })

  test('makerCostFor prices the build at the maker’s cost, below what the homeowner pays', () => {
    const state = lShape()
    const cost = makerCostFor({ builderState: state })
    expect(cost).toBeDefined()
    const retail = computeBom(state).total
    expect(cost!.low).toBeGreaterThan(0)
    expect(cost!.low).toBeLessThanOrEqual(cost!.high)
    expect(cost!.low).toBeLessThan(retail.low)
    expect(cost!.high).toBeLessThan(retail.high)
  })

  test('no build, no cost basis', () => {
    expect(makerCostFor({})).toBeUndefined()
  })
})
