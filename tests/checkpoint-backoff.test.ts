/**
 * The checkpoint client backs off for real (IMP-06 review).
 *
 * A 429 used to halt the session; IMP-06 made it retryable, but the "backoff"
 * did not hold: the intake re-queued on every render (the hook handed out a
 * new object each time), each queue re-armed the 2.5 s idle timer, and every
 * failure armed another retry timer nobody cleared — about one POST every
 * 2.6 s for up to an hour, retry chains piling up. These drive the real
 * client (`createCheckpointClient`, the timers and fetch behind
 * `useProjectCheckpoint`) with fake timers and a scripted server.
 *
 * Also here: the route says how long to wait, and its limit sits above what
 * one tab can send.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CHECKPOINT_IDLE_MS,
  CHECKPOINT_RATE_LIMIT,
  OMITTED_IMAGE,
  retryAfterFrom,
  retryDelayMs,
  snapshotFingerprint,
  stripImages,
} from '@/lib/project/checkpoint'
import {
  CHECKPOINT_MAX_WAIT_MS,
  FLUSH_TIMEOUT_MS,
  createCheckpointClient,
  type CheckpointState,
} from '@/lib/project/checkpoint-client'
import type { ProjectSnapshot } from '@/lib/project/snapshot'

const h = vi.hoisted(() => ({
  limit: { ok: true, remaining: 1, retryAfterMs: 0 },
  limitCalls: [] as unknown[][],
}))

vi.mock('@/lib/auth/dal', () => ({
  apiAccount: async () => ({ accountId: 'customer-1', role: 'customer', email: 'kupac@example.test' }),
}))
vi.mock('@/lib/db/supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/supabase')>()),
  supabaseAdmin: () => null,
}))
vi.mock('@/lib/rate-limit', () => ({
  rateLimitKey: (...args: unknown[]) => {
    h.limitCalls.push(args)
    return h.limit
  },
}))

import { POST } from '@/app/api/projects/[id]/checkpoint/route'

/* ───────────────────────────── the route ───────────────────────────── */

describe('the route tells a rate-limited client when to come back', () => {
  it('answers 429 with retryAfterMs and a Retry-After header, and limits by the shared constants', async () => {
    h.limit = { ok: false, remaining: 0, retryAfterMs: 123_400 }
    h.limitCalls = []
    const res = await POST(
      new Request('http://localhost/api/projects/p1/checkpoint', { method: 'POST', body: '{}' }),
      { params: Promise.resolve({ id: 'p1' }) }
    )
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ ok: false, reason: 'rate_limited', retryAfterMs: 123_400 })
    expect(res.headers.get('Retry-After')).toBe('124')
    expect(h.limitCalls).toEqual([['customer-1', 'checkpoint', CHECKPOINT_RATE_LIMIT.max, CHECKPOINT_RATE_LIMIT.windowMs]])
  })
})

describe('the limit and the client agree', () => {
  it('one tab cannot reach the limit: a write needs a full idle period of quiet before it', () => {
    const oneTabCeiling = CHECKPOINT_RATE_LIMIT.windowMs / CHECKPOINT_IDLE_MS
    expect(oneTabCeiling).toBeLessThan(CHECKPOINT_RATE_LIMIT.max)
  })

  it('a block, if something reaches it, lifts within minutes, not the rest of an hour', () => {
    expect(CHECKPOINT_RATE_LIMIT.windowMs).toBeLessThanOrEqual(5 * 60 * 1000)
  })
})

describe('retryAfterFrom / retryDelayMs', () => {
  it('reads the body first, then a Retry-After header in seconds, else nothing', () => {
    expect(retryAfterFrom({ retryAfterMs: 90_000 }, '5')).toBe(90_000)
    expect(retryAfterFrom({}, '120')).toBe(120_000)
    expect(retryAfterFrom(null, null)).toBeNull()
    expect(retryAfterFrom({ retryAfterMs: 'soon' }, 'Wed, 21 Oct 2026 07:28:00 GMT')).toBeNull()
    expect(retryAfterFrom({ retryAfterMs: -1 }, '')).toBeNull()
  })

  it('waits the ladder, or as long as the server said when that is longer — capped at an hour', () => {
    expect(retryDelayMs(0)).toBe(2_000)
    expect(retryDelayMs(3)).toBe(60_000)
    expect(retryDelayMs(0, 4 * 60_000)).toBe(4 * 60_000)
    expect(retryDelayMs(3, 1_000)).toBe(60_000)
    expect(retryDelayMs(0, 10 * 60 * 60_000)).toBe(60 * 60_000)
  })
})

/* ───────────────────────────── the client ───────────────────────────── */

type Reply = { status: number; body?: Record<string, unknown>; headers?: Record<string, string> } | 'network'

const snap = (n: number, extra: Record<string, unknown> = {}) =>
  ({ currentStepId: 'builder', profile: { picks: n }, ...extra }) as unknown as ProjectSnapshot

const ok = (revision: number): Reply => ({ status: 200, body: { ok: true, revision } })
const rateLimited = (retryAfterMs: number): Reply => ({
  status: 429,
  body: { ok: false, reason: 'rate_limited', retryAfterMs },
})

/** A scripted server: replies in order (the last one repeats), every POST recorded. */
function setup(replies: Reply[], opts: { initialFingerprint?: string | null } = {}) {
  const posts: { at: number; picks: unknown; baseRevision: number }[] = []
  const states: CheckpointState[] = []
  let gate: Promise<void> | null = null
  const fetchFn = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body))
    posts.push({ at: Date.now(), picks: body.snapshot.profile.picks, baseRevision: body.baseRevision })
    const reply = replies.length > 1 ? replies.shift()! : replies[0]
    if (gate) await gate
    if (reply === 'network') throw new TypeError('fetch failed')
    return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status, headers: reply.headers })
  })
  const client = createCheckpointClient({
    projectId: 'p1',
    initialRevision: 3,
    initialFingerprint: opts.initialFingerprint,
    onState: (s) => states.push(s),
    fetch: fetchFn as unknown as typeof fetch,
  })
  /** Hold every response until the returned function is called. */
  const holdResponses = () => {
    let release!: () => void
    gate = new Promise<void>((resolve) => (release = resolve))
    return () => {
      gate = null
      release()
    }
  }
  return { client, posts, states, holdResponses }
}

describe('createCheckpointClient — backing off sends nothing', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-04T10:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('after a 429 it waits as long as the server said: picks every 4 s, a hidden tab, the max wait — not one POST', async () => {
    const { client, posts, states } = setup([rateLimited(10 * 60_000), ok(4)])
    const t0 = Date.now()
    client.queue(snap(0))
    await vi.advanceTimersByTimeAsync(CHECKPOINT_IDLE_MS)
    expect(posts).toHaveLength(1)
    expect(states.at(-1)).toBe('pending')

    // Nine minutes of a homeowner watching the live range, tapping every 4 s.
    for (let i = 1; i <= 135; i++) {
      client.queue(snap(i))
      await vi.advanceTimersByTimeAsync(4_000)
    }
    client.hide()
    await vi.advanceTimersByTimeAsync(0)
    expect(posts).toHaveLength(1)
    // Only the retry timer is armed: queue() never re-arms the idle or max timers while backing off.
    expect(vi.getTimerCount()).toBe(1)

    // The window resets 10 min after the 429: one POST, with the latest pick.
    const resetAt = t0 + CHECKPOINT_IDLE_MS + 10 * 60_000
    await vi.advanceTimersByTimeAsync(resetAt - Date.now() - 1)
    expect(posts).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(posts).toHaveLength(2)
    expect(posts[1]).toMatchObject({ at: resetAt, picks: 135, baseRevision: 3 })
    expect(states.at(-1)).toBe('saved')
    await vi.advanceTimersByTimeAsync(60 * 60_000)
    expect(posts).toHaveLength(2)
  })

  it('a 429 that names no wait (header only) is honoured the same way', async () => {
    const { client, posts } = setup([{ status: 429, body: { ok: false }, headers: { 'Retry-After': '240' } }, ok(4)])
    client.queue(snap(1))
    await vi.advanceTimersByTimeAsync(CHECKPOINT_IDLE_MS)
    client.queue(snap(2))
    await vi.advanceTimersByTimeAsync(240_000 - 1)
    expect(posts).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(posts.map((p) => p.picks)).toEqual([1, 2])
  })

  it('server errors follow the ladder with a single retry timer — a queue in between does not send early', async () => {
    const { client, posts } = setup([{ status: 500 }, 'network', { status: 502 }, ok(4)])
    client.queue(snap(1))
    await vi.advanceTimersByTimeAsync(CHECKPOINT_IDLE_MS)
    const failedAt = Date.now()
    expect(vi.getTimerCount()).toBe(1)

    client.queue(snap(2))
    client.queue(snap(3))
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(2_000)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(15_000)
    expect(posts.map((p) => [p.at - failedAt, p.picks])).toEqual([
      [0, 1],
      [2_000, 3],
      [7_000, 3],
      [22_000, 3],
    ])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('dispose leaves no timer behind — a retry never fires after unmount', async () => {
    const { client, posts } = setup([{ status: 500 }])
    client.queue(snap(1))
    await vi.advanceTimersByTimeAsync(CHECKPOINT_IDLE_MS)
    expect(vi.getTimerCount()).toBe(1)
    client.dispose()
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(posts).toHaveLength(1)
  })
})

describe('createCheckpointClient — nothing is lost or invented', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('a snapshot queued while another is on the wire is sent after it lands — the landing does not drop it', async () => {
    const { client, posts, holdResponses } = setup([ok(4), ok(5)])
    const release = holdResponses()
    client.queue(snap(1))
    await vi.advanceTimersByTimeAsync(CHECKPOINT_IDLE_MS)
    expect(posts).toHaveLength(1)
    // A pick while the first write is slow; its idle timer fires into a busy wire.
    client.queue(snap(2))
    await vi.advanceTimersByTimeAsync(CHECKPOINT_IDLE_MS + 1_000)
    expect(posts).toHaveLength(1)
    release()
    await vi.advanceTimersByTimeAsync(0)
    expect(posts.map((p) => [p.picks, p.baseRevision])).toEqual([
      [1, 3],
      [2, 4],
    ])
  })

  it('a steady stream of picks still writes within the max wait', async () => {
    const { client, posts } = setup([ok(4)])
    const t0 = Date.now()
    // A pick every 2 s: the idle timer never gets its 2.5 s of quiet.
    for (let t = 0; t < CHECKPOINT_MAX_WAIT_MS + 1_000; t += 2_000) {
      client.queue(snap(t))
      await vi.advanceTimersByTimeAsync(2_000)
    }
    expect(posts.map((p) => p.at - t0)).toEqual([CHECKPOINT_MAX_WAIT_MS])
  })

  it('an unchanged resume writes nothing: the local copy with pixels matches the seeded server fingerprint', async () => {
    const server = snap(7, { spacePhotos: [OMITTED_IMAGE] })
    const local = snap(7, { spacePhotos: ['data:image/jpeg;base64,AAAA'] })
    const { client, posts } = setup([ok(4)], { initialFingerprint: snapshotFingerprint(stripImages(server)) })
    client.queue(local)
    client.hide()
    await vi.advanceTimersByTimeAsync(CHECKPOINT_MAX_WAIT_MS)
    expect(posts).toEqual([])
  })

  it('a pre-submit flush that fails stays queued: the retry writes it, and the retried flush is a no-op that reports it landed', async () => {
    // Offline at wrap-up: the flush (and the submit) fail. Signal back, the
    // retry writes the snapshot — before the homeowner's retried submit, so
    // the brief that follows is the later write (tests/checkpoint-submit).
    const { client, posts } = setup(['network', ok(4)])
    expect(await client.flush(snap(9))).toBe(false)
    expect(posts).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(posts.map((p) => [p.picks, p.baseRevision])).toEqual([
      [9, 3],
      [9, 3],
    ])
    expect(await client.flush(snap(9))).toBe(true)
    expect(posts).toHaveLength(2)
  })

  it('a flush inside a rate limit returns at once without a request; the retry sends it when the limit lifts', async () => {
    const { client, posts } = setup([rateLimited(5 * 60_000), ok(4)])
    client.queue(snap(1))
    await vi.advanceTimersByTimeAsync(CHECKPOINT_IDLE_MS)
    expect(posts).toHaveLength(1)

    const started = Date.now()
    const landed = client.flush(snap(2))
    await vi.advanceTimersByTimeAsync(0)
    expect(await landed).toBe(false)
    expect(Date.now() - started).toBeLessThan(FLUSH_TIMEOUT_MS)
    expect(posts).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(posts.map((p) => p.picks)).toEqual([1, 2])
    await vi.advanceTimersByTimeAsync(60 * 60_000)
    expect(posts).toHaveLength(2)
  })

  it('a flush outside any backoff lands and reports it', async () => {
    const { client, posts } = setup([ok(4)])
    const landed = client.flush(snap(3))
    await vi.advanceTimersByTimeAsync(0)
    expect(await landed).toBe(true)
    expect(posts.map((p) => p.picks)).toEqual([3])
  })
})
