/**
 * IMP-09 Done-when: delete removes every row and object for a test project.
 *
 * `eraseCustomerProject` runs against a fake Supabase client that records
 * every table call and every Storage call, so the order is asserted on what
 * was actually sent: close the project, read its briefs, list and remove
 * their Storage folders, then the brief rows, this project's tokens, the
 * project row, and — when the customer has no other kitchen — their login
 * tokens and the account. Storage goes first so a failure leaves every row
 * (and with it the retry) in place; each failure case below checks that no
 * later step ran.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { eraseCustomerProject, type EraseDb } from '@/lib/project/erase'

const P = '55555555-5555-4555-8555-555555555555'
const C = '33333333-3333-4333-8333-333333333333'
const EMAIL = 'ana@example.test'
const BUCKET = 'softclose-media'

type Filter = [op: 'eq', column: string, value: unknown]
interface TableCall {
  kind: 'table'
  table: string
  op: 'select' | 'update' | 'delete'
  payload?: Record<string, unknown>
  columns?: string
  filters: Filter[]
  limit?: number
}
interface StorageCall {
  kind: 'storage'
  bucket: string
  op: 'list' | 'remove'
  prefix?: string
  options?: { limit?: number; offset?: number }
  paths?: string[]
}
type Call = TableCall | StorageCall
type Err = { code?: string; message: string; statusCode?: string }

function fakeDb(init: {
  briefs?: Record<string, number>
  otherProjects?: boolean
  fail?: Partial<Record<'list' | 'remove' | `${string}.${TableCall['op']}`, Err>>
}) {
  const calls: Call[] = []
  /** briefId → object names still in Storage. */
  const objects = new Map<string, string[]>()
  for (const [id, n] of Object.entries(init.briefs ?? {})) {
    objects.set(
      id,
      Array.from({ length: n }, (_, i) => `${String(i + 1).padStart(3, '0')}.jpg`)
    )
  }
  let briefRows = Object.keys(init.briefs ?? {})
  const fail = init.fail ?? {}

  function table(name: string) {
    const call: TableCall = { kind: 'table', table: name, op: 'select', filters: [] }
    calls.push(call)
    const result = () => {
      const err = fail[`${name}.${call.op}`]
      if (err) return { data: null, error: err }
      if (call.op === 'select' && name === 'softclose_briefs') {
        return { data: briefRows.map((id) => ({ id })), error: null }
      }
      if (call.op === 'select' && name === 'softclose_projects') {
        return { data: init.otherProjects ? [{ id: 'other-project' }] : [], error: null }
      }
      if (call.op === 'delete' && name === 'softclose_briefs') briefRows = []
      return { data: null, error: null }
    }
    const b = {
      select(columns: string) {
        call.columns = columns
        return b
      },
      update(payload: Record<string, unknown>) {
        call.op = 'update'
        call.payload = payload
        return b
      },
      delete() {
        call.op = 'delete'
        return b
      },
      eq(column: string, value: unknown) {
        call.filters.push(['eq', column, value])
        return b
      },
      limit(n: number) {
        call.limit = n
        return b
      },
      then<T>(resolve: (v: ReturnType<typeof result>) => T, reject?: (e: unknown) => T) {
        return Promise.resolve(result()).then(resolve, reject)
      },
    }
    return b
  }

  const db = {
    from: table,
    storage: {
      from(bucket: string) {
        return {
          async list(prefix: string, options: { limit: number; offset: number }) {
            calls.push({ kind: 'storage', bucket, op: 'list', prefix, options })
            if (fail.list) return { data: null, error: fail.list }
            const id = prefix.replace(/^briefs\//, '')
            const names = objects.get(id) ?? []
            return {
              data: names.slice(options.offset, options.offset + options.limit).map((name) => ({ name, id: name })),
              error: null,
            }
          },
          async remove(paths: string[]) {
            calls.push({ kind: 'storage', bucket, op: 'remove', paths })
            if (fail.remove) return { data: null, error: fail.remove }
            for (const p of paths) {
              const [, id, name] = p.split('/')
              objects.set(id, (objects.get(id) ?? []).filter((n) => n !== name))
            }
            return { data: paths.map((name) => ({ name })), error: null }
          },
        }
      },
    },
  }

  return { db: db as unknown as EraseDb, calls, objects }
}

/** A compact, comparable line per call. */
function line(c: Call): string {
  if (c.kind === 'storage') {
    return c.op === 'list'
      ? `storage.list ${c.prefix} @${c.options?.offset}`
      : `storage.remove ${c.paths?.length}`
  }
  const where = c.filters.map(([, col, v]) => `${col}=${v}`).join(' ')
  const extra = c.op === 'update' ? ` ${JSON.stringify(c.payload)}` : c.limit ? ` limit ${c.limit}` : ''
  return `${c.table}.${c.op} ${where}${extra}`
}

const tableDeletes = (calls: Call[]) =>
  calls.filter((c): c is TableCall => c.kind === 'table' && c.op === 'delete')

let errorSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  errorSpy.mockRestore()
})

describe('eraseCustomerProject — the whole kitchen, in order', () => {
  test('two briefs, five objects, no other kitchen: everything goes, account last', async () => {
    const { db, calls, objects } = fakeDb({ briefs: { B1: 3, B2: 2 } })
    const r = await eraseCustomerProject(db, { projectId: P, customerId: C })

    expect(r).toEqual({ ok: true, objects: 5, briefs: 2, accountDeleted: true })
    expect(calls.map(line)).toEqual([
      `softclose_projects.update id=${P} customer_id=${C} {"status":"archived"}`,
      `softclose_briefs.select project_id=${P}`,
      'storage.list briefs/B1 @0',
      'storage.list briefs/B2 @0',
      'storage.remove 5',
      `softclose_briefs.delete project_id=${P}`,
      `softclose_auth_tokens.delete project_id=${P}`,
      `softclose_projects.delete id=${P} customer_id=${C}`,
      `softclose_projects.select customer_id=${C} limit 1`,
      `softclose_auth_tokens.delete account_id=${C}`,
      `softclose_accounts.delete id=${C} role=customer`,
    ])
    // Every Storage call went to the media bucket, and nothing is left there.
    expect(calls.filter((c) => c.kind === 'storage').every((c) => (c as StorageCall).bucket === BUCKET)).toBe(true)
    expect([...objects.values()].flat()).toEqual([])
  })

  test('only the folders of this project’s briefs are touched', async () => {
    const { db, calls } = fakeDb({ briefs: { B1: 3, B2: 2 } })
    await eraseCustomerProject(db, { projectId: P, customerId: C })
    const removed = calls.flatMap((c) => (c.kind === 'storage' && c.op === 'remove' ? c.paths ?? [] : []))
    expect(removed).toHaveLength(5)
    for (const p of removed) expect(p).toMatch(/^briefs\/(B1|B2)\/\d{3}\.jpg$/)
  })

  test('another kitchen on the account: the account and its login tokens stay', async () => {
    const { db, calls } = fakeDb({ briefs: { B1: 1 }, otherProjects: true })
    const r = await eraseCustomerProject(db, { projectId: P, customerId: C })
    expect(r).toEqual({ ok: true, objects: 1, briefs: 1, accountDeleted: false })
    expect(tableDeletes(calls).map((c) => c.table)).toEqual([
      'softclose_briefs',
      'softclose_auth_tokens',
      'softclose_projects',
    ])
    expect(calls.some((c) => c.kind === 'table' && c.table === 'softclose_accounts')).toBe(false)
  })

  test('invited, never sent (no briefs): no Storage remove, rows still go', async () => {
    const { db, calls } = fakeDb({})
    const r = await eraseCustomerProject(db, { projectId: P, customerId: C })
    expect(r).toEqual({ ok: true, objects: 0, briefs: 0, accountDeleted: true })
    expect(calls.some((c) => c.kind === 'storage')).toBe(false)
    expect(tableDeletes(calls).map((c) => c.table)).toEqual([
      'softclose_briefs',
      'softclose_auth_tokens',
      'softclose_projects',
      'softclose_auth_tokens',
      'softclose_accounts',
    ])
  })

  test('1001 objects: listed in pages of 1000, removed in chunks of 1000 and 1', async () => {
    const { db, calls, objects } = fakeDb({ briefs: { B1: 1001 } })
    const r = await eraseCustomerProject(db, { projectId: P, customerId: C })
    expect(r).toMatchObject({ ok: true, objects: 1001 })
    const lists = calls.filter((c): c is StorageCall => c.kind === 'storage' && c.op === 'list')
    expect(lists.map((c) => c.options)).toEqual([
      { limit: 1000, offset: 0 },
      { limit: 1000, offset: 1000 },
    ])
    const removes = calls.filter((c): c is StorageCall => c.kind === 'storage' && c.op === 'remove')
    expect(removes.map((c) => c.paths?.length)).toEqual([1000, 1])
    expect(objects.get('B1')).toEqual([])
  })

  test('a re-run on an already emptied project is a calm no-op', async () => {
    const fake = fakeDb({ briefs: { B1: 2 } })
    await eraseCustomerProject(fake.db, { projectId: P, customerId: C })
    const again = await eraseCustomerProject(fake.db, { projectId: P, customerId: C })
    expect(again).toEqual({ ok: true, objects: 0, briefs: 0, accountDeleted: true })
  })
})

describe('eraseCustomerProject — a failure stops it, and nothing after it runs', () => {
  test('Storage list fails → failedAt storage, no row deleted', async () => {
    const { db, calls } = fakeDb({ briefs: { B1: 2 }, fail: { list: { statusCode: '500', message: 'boom' } } })
    const r = await eraseCustomerProject(db, { projectId: P, customerId: C })
    expect(r).toEqual({ ok: false, failedAt: 'storage' })
    expect(tableDeletes(calls)).toEqual([])
  })

  test('Storage remove fails → failedAt storage, no row deleted', async () => {
    const { db, calls } = fakeDb({ briefs: { B1: 2 }, fail: { remove: { statusCode: '503', message: 'boom' } } })
    const r = await eraseCustomerProject(db, { projectId: P, customerId: C })
    expect(r).toEqual({ ok: false, failedAt: 'storage' })
    expect(tableDeletes(calls)).toEqual([])
  })

  test('the brief delete fails → no token, project or account delete', async () => {
    const { db, calls } = fakeDb({
      briefs: { B1: 1 },
      fail: { 'softclose_briefs.delete': { code: '57014', message: 'canceling statement' } },
    })
    const r = await eraseCustomerProject(db, { projectId: P, customerId: C })
    expect(r).toEqual({ ok: false, failedAt: 'briefs' })
    expect(tableDeletes(calls).map((c) => c.table)).toEqual(['softclose_briefs'])
  })

  test('closing fails → nothing read, listed or deleted', async () => {
    const { db, calls } = fakeDb({
      briefs: { B1: 1 },
      fail: { 'softclose_projects.update': { code: '08006', message: 'connection failure' } },
    })
    const r = await eraseCustomerProject(db, { projectId: P, customerId: C })
    expect(r).toEqual({ ok: false, failedAt: 'close' })
    expect(calls).toHaveLength(1)
  })

  test('a new invite in between (account delete hits RESTRICT, 23503): ok, account kept', async () => {
    const { db } = fakeDb({
      briefs: { B1: 1 },
      fail: {
        'softclose_accounts.delete': {
          code: '23503',
          message: `update or delete on table "softclose_accounts" violates foreign key constraint … Key (id)=(${C})`,
        },
      },
    })
    const r = await eraseCustomerProject(db, { projectId: P, customerId: C })
    expect(r).toEqual({ ok: true, objects: 1, briefs: 1, accountDeleted: false })
  })

  test('any other account delete error is a failure at the account step', async () => {
    const { db } = fakeDb({ fail: { 'softclose_accounts.delete': { code: '42501', message: 'permission denied' } } })
    const r = await eraseCustomerProject(db, { projectId: P, customerId: C })
    expect(r).toEqual({ ok: false, failedAt: 'account' })
  })

  test('the log names the step and the code — never the project, the customer or an email', async () => {
    const { db } = fakeDb({
      briefs: { B1: 1 },
      fail: {
        'softclose_projects.delete': {
          code: '23503',
          message: `Key (customer_id)=(${C}) is still referenced; contact ${EMAIL}; project ${P}`,
        },
      },
    })
    const r = await eraseCustomerProject(db, { projectId: P, customerId: C })
    expect(r).toEqual({ ok: false, failedAt: 'project' })
    expect(errorSpy).toHaveBeenCalledWith('[erase] stopped at', 'project', '23503')
    const logged = JSON.stringify(errorSpy.mock.calls)
    expect(logged).not.toContain(P)
    expect(logged).not.toContain(C)
    expect(logged).not.toContain(EMAIL)
    expect(logged).not.toContain('Key (')
  })

  test('a thrown client error is caught and reported as the step it happened in', async () => {
    const { db } = fakeDb({ briefs: { B1: 1 } })
    const throwing = {
      from: db.from.bind(db),
      storage: {
        from: () => ({
          list: async () => {
            throw new Error(`fetch failed for ${P}`)
          },
        }),
      },
    } as unknown as EraseDb
    const r = await eraseCustomerProject(throwing, { projectId: P, customerId: C })
    expect(r).toEqual({ ok: false, failedAt: 'storage' })
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(P)
  })
})
