/**
 * The server copy matches the brief, and a write that landed unheard is ours
 * (IMP-06 review, round 2).
 *
 * Two reviewer reproductions, driven here against the real
 * `createCheckpointClient` and a model of the server that keeps a revision,
 * a copy and an `updated_at` clock — the maker's "changed since the brief"
 * flag is `updated_at > brief.created_at` (lib/project/status.ts):
 *
 *  1. A failed pre-submit flush suppressed the submitted snapshot for good
 *     (`coveredBySubmit`), even when the brief never went out. Offline at
 *     wrap-up, the flush and the handoff both failed; the retry then dropped
 *     the snapshot, the retried submit went out over the pre-wrap-up copy, and
 *     the next visit wrote the real one — flagging a brief nothing had changed
 *     since. Now the submit stores its own snapshot (lib/project/
 *     submit-snapshot, used by /api/handoff and by the model below), and the
 *     client simply retries.
 *  2. A retry after a lost response sent the newer snapshot at the old base;
 *     when the first write had in fact landed, the 409 was taken for another
 *     device and autosave halted, silently, for the rest of the session.
 *
 * And round 3: the submit's snapshot must not go around the conflict halt. A
 * laptop tab left open while the phone carried on in the builder submitted
 * its stale snapshot over the phone's copy. Now a halted tab sends no
 * snapshot, and the route stores one only over a copy the tab's claim knows.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { landedUnheard, snapshotFingerprint, stripImages } from '@/lib/project/checkpoint'
import { createCheckpointClient, FLUSH_TIMEOUT_MS, type CheckpointState } from '@/lib/project/checkpoint-client'
import { submitClaimFrom, submitSnapshotFrom, submitSnapshotWrite, type SubmitClaim } from '@/lib/project/submit-snapshot'
import { SNAPSHOT_VERSION, type ProjectSnapshot } from '@/lib/project/snapshot'

/** A journey with a photo in it: the local copy has pixels, the server copy a marker. */
const snap = (picks: number) =>
  ({
    currentStepId: 'contact',
    profile: { picks },
    spacePhotos: ['data:image/jpeg;base64,AAAA'],
  }) as unknown as ProjectSnapshot

const print = (s: ProjectSnapshot) => snapshotFingerprint(stripImages(s))

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

function modelServer(revision: number, copy: ProjectSnapshot) {
  const m = {
    revision,
    copy: stripImages(copy) as ProjectSnapshot,
    clock: 0,
    updatedAt: 0,
    briefAt: null as number | null,
    writes: [] as { picks: unknown; base: number }[],
    posts: 0,
    offline: false,
    /** Commit the next write, then lose its response (iOS 'Load failed'). */
    loseNext: 0,
    /** Commit the next write, then answer 504. */
    timeoutAfterCommitNext: 0,
    /** Answer the next write 500 without committing it. */
    failNext: 0,
    /** Answer the next write 429 for this long. */
    rateLimitMs: 0,
    gate: null as Promise<void> | null,
  }

  const fetchFn = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body))
    m.posts += 1
    if (m.gate) await m.gate
    if (m.offline) throw new TypeError('Load failed')
    if (m.failNext > 0) {
      m.failNext -= 1
      return json(500, { ok: false })
    }
    if (m.rateLimitMs > 0) {
      const retryAfterMs = m.rateLimitMs
      m.rateLimitMs = 0
      return json(429, { ok: false, reason: 'rate_limited', retryAfterMs })
    }
    if (body.baseRevision !== m.revision) {
      return json(409, { ok: false, reason: 'conflict', revision: m.revision, serverFingerprint: snapshotFingerprint(m.copy) })
    }
    m.revision += 1
    m.copy = body.snapshot
    m.updatedAt = ++m.clock
    m.writes.push({ picks: body.snapshot.profile.picks, base: body.baseRevision })
    if (m.loseNext > 0) {
      m.loseNext -= 1
      throw new TypeError('Load failed')
    }
    if (m.timeoutAfterCommitNext > 0) {
      m.timeoutAfterCommitNext -= 1
      return json(504, {})
    }
    return json(200, { ok: true, revision: m.revision })
  })

  /** /api/handoff's effect on the project row, through the route's own helpers. */
  function handoff(s: ProjectSnapshot | undefined, claim: SubmitClaim | null): boolean {
    if (m.offline) return false
    const write =
      s && claim
        ? submitSnapshotWrite(
            { revision: m.revision, snapshot: m.copy, snapshot_version: SNAPSHOT_VERSION },
            submitSnapshotFrom(s)!,
            claim
          )
        : null
    m.clock += 1
    if (write) {
      m.revision = write.revision
      m.copy = write.snapshot
    }
    m.updatedAt = m.clock
    m.briefAt = m.clock
    return true
  }

  /** Another device writes its own journey. */
  function otherDevice(s: ProjectSnapshot) {
    m.revision += 1
    m.copy = stripImages(s)
    m.updatedAt = ++m.clock
  }

  const holdRequests = () => {
    let release!: () => void
    m.gate = new Promise<void>((resolve) => (release = resolve))
    return () => {
      m.gate = null
      release()
    }
  }

  const changedSinceBrief = () => m.briefAt !== null && m.updatedAt > m.briefAt

  return { m, fetchFn, handoff, otherDevice, holdRequests, changedSinceBrief }
}

type Server = ReturnType<typeof modelServer>

/** A tab, seeded as the intake seeds it: with what the server holds. */
function tab(server: Server) {
  const states: CheckpointState[] = []
  const client = createCheckpointClient({
    projectId: 'p1',
    initialRevision: server.m.revision,
    initialFingerprint: snapshotFingerprint(server.m.copy),
    onState: (s) => states.push(s),
    fetch: server.fetchFn as unknown as typeof fetch,
  })
  return { client, states }
}

/**
 * The wrap-up's submit: the intake's beforeSubmit (flush, then the claim —
 * none, and so no snapshot, once halted), then the handoff.
 */
async function submit(server: Server, client: ReturnType<typeof tab>['client'], s: ProjectSnapshot) {
  const flushed = client.flush(s)
  await vi.advanceTimersByTimeAsync(0)
  const landed = await flushed
  const claim = client.submitting(s)
  return { landed, sent: server.handoff(claim ? s : undefined, claim) }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-04T10:00:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
})

describe('the server copy is the brief’s snapshot, and nothing flags a brief that did not change', () => {
  it('offline at wrap-up: flush and submit fail; back online the retry writes it, the retried submit follows, the next visit writes nothing', async () => {
    const server = modelServer(3, snap(1))
    const { client } = tab(server)
    const S = snap(9)

    server.m.offline = true
    expect(await submit(server, client, S)).toEqual({ landed: false, sent: false })

    // Signal comes back; the 2 s retry writes S — it is not dropped.
    server.m.offline = false
    await vi.advanceTimersByTimeAsync(2_000)
    expect(server.m.writes).toEqual([{ picks: 9, base: 3 }])

    // The homeowner taps retry: the flush is a no-op that reports S landed, then the brief.
    expect(await submit(server, client, S)).toEqual({ landed: true, sent: true })
    expect(snapshotFingerprint(server.m.copy)).toBe(print(S))
    expect(server.changedSinceBrief()).toBe(false)

    // "Back to kitchen" is a full reload: a fresh client, IndexedDB holding S with its pixels.
    const next = tab(server)
    next.client.queue(S)
    next.client.hide()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(server.m.writes).toHaveLength(1)
    expect(server.changedSinceBrief()).toBe(false)
  })

  it('the flush fails but the submit goes through: the submit stored S, the retry finds it there, and nothing is written after the brief', async () => {
    const server = modelServer(3, snap(1))
    const { client, states } = tab(server)
    const S = snap(9)

    server.m.failNext = 1
    expect(await submit(server, client, S)).toEqual({ landed: false, sent: true })
    // The project's copy is the brief's snapshot, whatever the flush did.
    expect(snapshotFingerprint(server.m.copy)).toBe(print(S))
    expect(server.m.revision).toBe(4)

    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(server.m.writes).toEqual([])
    expect(server.changedSinceBrief()).toBe(false)
    expect(states).not.toContain('conflict')

    // The next visit writes nothing either.
    const next = tab(server)
    next.client.queue(S)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(server.m.writes).toEqual([])
    expect(server.changedSinceBrief()).toBe(false)

    // A real change after the brief is a real write, on the revision the submit made.
    client.queue(snap(10))
    await vi.advanceTimersByTimeAsync(60_000)
    expect(server.m.writes).toEqual([{ picks: 10, base: 4 }])
    expect(server.changedSinceBrief()).toBe(true)
  })

  it('a flush that times out and lands after the brief is a no-op: the submit already stored the same snapshot', async () => {
    const server = modelServer(3, snap(1))
    const { client, states } = tab(server)
    const S = snap(9)

    const release = server.holdRequests()
    const flushed = client.flush(S)
    await vi.advanceTimersByTimeAsync(FLUSH_TIMEOUT_MS)
    expect(await flushed).toBe(false)
    expect(server.handoff(S, client.submitting(S))).toBe(true)
    expect(snapshotFingerprint(server.m.copy)).toBe(print(S))

    release()
    await vi.advanceTimersByTimeAsync(0)
    expect(server.m.writes).toEqual([])
    expect(server.changedSinceBrief()).toBe(false)
    expect(states.at(-1)).toBe('saved')
  })

  it('a save still on the wire when the flush gave up is the tab’s own: the submit writes over it once it lands', async () => {
    const server = modelServer(3, snap(1))
    const { client, states } = tab(server)
    const S = snap(9)

    const release = server.holdRequests()
    client.queue(snap(5))
    await vi.advanceTimersByTimeAsync(2_500)
    const flushed = client.flush(S)
    await vi.advanceTimersByTimeAsync(FLUSH_TIMEOUT_MS)
    expect(await flushed).toBe(false)
    const claim = client.submitting(S)

    // The slow save lands before the route reads the row.
    release()
    await vi.advanceTimersByTimeAsync(0)
    expect(server.m.writes).toEqual([{ picks: 5, base: 3 }])
    expect(server.handoff(S, claim)).toBe(true)
    expect(snapshotFingerprint(server.m.copy)).toBe(print(S))
    expect(server.changedSinceBrief()).toBe(false)

    client.queue(snap(10))
    await vi.advanceTimersByTimeAsync(60_000)
    expect(states).not.toContain('conflict')
    expect(server.m.writes.at(-1)).toEqual({ picks: 10, base: 5 })
  })

  it('an edit after the brief, sent on the pre-submit revision, is recognised as following the submit — not another device', async () => {
    const server = modelServer(3, snap(1))
    const { client, states } = tab(server)
    const S = snap(9)

    server.m.rateLimitMs = 60_000
    expect(await submit(server, client, S)).toEqual({ landed: false, sent: true })
    // Back into the builder from the wrap-up, inside the rate limit's wait.
    await vi.advanceTimersByTimeAsync(10_000)
    client.queue(snap(10))
    await vi.advanceTimersByTimeAsync(60_000)

    expect(states).not.toContain('conflict')
    expect(server.m.writes).toEqual([{ picks: 10, base: 4 }])
    expect(snapshotFingerprint(server.m.copy)).toBe(print(snap(10)))
  })

  it('control: without `submitting`, that same edit halts as a conflict — the mark is what tells them apart', async () => {
    const server = modelServer(3, snap(1))
    const { client, states } = tab(server)
    const S = snap(9)

    server.m.rateLimitMs = 60_000
    const flushed = client.flush(S)
    await vi.advanceTimersByTimeAsync(0)
    expect(await flushed).toBe(false)
    server.handoff(S, { revision: 3, unheard: [], submitted: [] })
    client.queue(snap(10))
    await vi.advanceTimersByTimeAsync(70_000)
    expect(states.at(-1)).toBe('conflict')
    expect(server.m.writes).toEqual([])
  })
})

describe('a tab behind another device never writes over it by submitting', () => {
  /** The phone carries on in the builder: real saves through its own client. */
  async function phoneWorks(phone: ReturnType<typeof tab>, from: number, count: number) {
    for (let i = 0; i < count; i++) {
      phone.client.queue(snap(from + i))
      await vi.advanceTimersByTimeAsync(2_500)
    }
  }

  it('the laptop halted on the phone’s work, then submitted: the phone’s copy stays, and the phone keeps saving', async () => {
    const server = modelServer(4, snap(1))
    const laptop = tab(server)
    const phone = tab(server)
    await phoneWorks(phone, 100, 5)
    expect(server.m.revision).toBe(9)

    // Back on the laptop tab, never reloaded: Continue queues a save that meets the phone's 409.
    laptop.client.queue(snap(2))
    await vi.advanceTimersByTimeAsync(2_500)
    expect(laptop.states.at(-1)).toBe('conflict')

    // The wrap-up mounts and submits on its own.
    const S = snap(9)
    expect(await submit(server, laptop.client, S)).toEqual({ landed: false, sent: true })
    expect(laptop.client.submitting(S)).toBeNull()
    expect(server.m.revision).toBe(9)
    expect(snapshotFingerprint(server.m.copy)).toBe(print(snap(104)))

    await phoneWorks(phone, 105, 1)
    expect(phone.states).not.toContain('conflict')
    expect(server.m.revision).toBe(10)
    expect(snapshotFingerprint(server.m.copy)).toBe(print(snap(105)))
  })

  it('no earlier save: the pre-submit flush is what meets the phone’s 409, and the submit still leaves its copy alone', async () => {
    const server = modelServer(3, snap(1))
    const laptop = tab(server)
    const phone = tab(server)
    await phoneWorks(phone, 500, 1)

    expect(await submit(server, laptop.client, snap(9))).toEqual({ landed: false, sent: true })
    expect(laptop.states.at(-1)).toBe('conflict')
    expect(server.m.revision).toBe(4)
    expect(snapshotFingerprint(server.m.copy)).toBe(print(snap(500)))

    await phoneWorks(phone, 501, 1)
    expect(phone.states).not.toContain('conflict')
    expect(snapshotFingerprint(server.m.copy)).toBe(print(snap(501)))
  })

  it('not halted — the flush failed before reaching the revision check — the route refuses on the claim alone', async () => {
    const server = modelServer(4, snap(1))
    const laptop = tab(server)
    const phone = tab(server)
    await phoneWorks(phone, 100, 5)

    server.m.failNext = 1
    const S = snap(9)
    expect(await submit(server, laptop.client, S)).toEqual({ landed: false, sent: true })
    expect(laptop.states).not.toContain('conflict')
    expect(server.m.revision).toBe(9)
    expect(snapshotFingerprint(server.m.copy)).toBe(print(snap(104)))

    // The laptop's retry then meets the phone's 409 and halts, as any save would.
    await vi.advanceTimersByTimeAsync(2_000)
    expect(laptop.states.at(-1)).toBe('conflict')
    await phoneWorks(phone, 105, 1)
    expect(phone.states).not.toContain('conflict')
  })
})

describe('a write that landed unheard is ours, even when something newer was picked meanwhile', () => {
  it('the response is lost after the commit, B is picked during the backoff: the retry adopts A’s revision and writes B', async () => {
    const server = modelServer(5, snap(0))
    const { client, states } = tab(server)

    server.m.loseNext = 1
    client.queue(snap(1))
    await vi.advanceTimersByTimeAsync(2_500)
    expect(server.m.writes).toEqual([{ picks: 1, base: 5 }])
    expect(states.at(-1)).toBe('pending')

    client.queue(snap(2))
    await vi.advanceTimersByTimeAsync(2_000)
    expect(states).not.toContain('conflict')
    expect(states.at(-1)).toBe('saved')
    expect(server.m.writes).toEqual([
      { picks: 1, base: 5 },
      { picks: 2, base: 6 },
    ])

    // And it keeps saving: later picks, and a submit's flush that reports the truth.
    client.queue(snap(3))
    await vi.advanceTimersByTimeAsync(2_500)
    const flushed = client.flush(snap(4))
    await vi.advanceTimersByTimeAsync(0)
    expect(await flushed).toBe(true)
    expect(server.m.writes.map((w) => [w.picks, w.base])).toEqual([
      [1, 5],
      [2, 6],
      [3, 7],
      [4, 8],
    ])
  })

  it('the builder’s urgent flush, which skips the retry timer, is recognised the same way', async () => {
    const server = modelServer(5, snap(0))
    const { client, states } = tab(server)

    server.m.loseNext = 1
    client.queue(snap(1))
    await vi.advanceTimersByTimeAsync(2_500)

    const flushed = client.flush(snap(2))
    await vi.advanceTimersByTimeAsync(0)
    expect(await flushed).toBe(true)
    expect(states).not.toContain('conflict')
    expect(server.m.writes.map((w) => [w.picks, w.base])).toEqual([
      [1, 5],
      [2, 6],
    ])
  })

  it('a 504 after the update ran counts as unheard too', async () => {
    const server = modelServer(5, snap(0))
    const { client, states } = tab(server)

    server.m.timeoutAfterCommitNext = 1
    client.queue(snap(1))
    await vi.advanceTimersByTimeAsync(2_500)
    client.queue(snap(2))
    await vi.advanceTimersByTimeAsync(2_000)
    expect(states).not.toContain('conflict')
    expect(snapshotFingerprint(server.m.copy)).toBe(print(snap(2)))
  })

  it('control: a 409 over another device’s write still halts, and nothing more is sent', async () => {
    const server = modelServer(5, snap(0))
    const { client, states } = tab(server)

    server.m.failNext = 1
    client.queue(snap(1))
    await vi.advanceTimersByTimeAsync(2_500)
    server.otherDevice(snap(77))
    client.queue(snap(2))
    await vi.advanceTimersByTimeAsync(2_000)
    expect(states.at(-1)).toBe('conflict')
    client.queue(snap(3))
    await vi.advanceTimersByTimeAsync(60_000)
    expect(server.m.writes).toEqual([])
    expect(snapshotFingerprint(server.m.copy)).toBe(print(snap(77)))
  })
})

describe('submitSnapshotWrite only writes over a copy the claim knows as the tab’s', () => {
  const S = stripImages(snap(9))
  const row = (revision: number, copy: ProjectSnapshot) => ({
    revision,
    snapshot: stripImages(copy),
    snapshot_version: SNAPSHOT_VERSION,
  })
  const A = print(snap(5))
  it('the revision the tab last saw, an unheard write of its at exactly the next one, or a snapshot it submitted', () => {
    expect(submitSnapshotWrite(row(7, snap(1)), S, { revision: 7, unheard: [], submitted: [] })?.revision).toBe(8)
    expect(submitSnapshotWrite(row(8, snap(5)), S, { revision: 7, unheard: [A], submitted: [] })?.revision).toBe(9)
    expect(submitSnapshotWrite(row(12, snap(5)), S, { revision: 7, unheard: [], submitted: [A] })?.revision).toBe(13)
  })
  it('anything else is another device’s, and is left alone', () => {
    expect(submitSnapshotWrite(row(8, snap(77)), S, { revision: 7, unheard: [A], submitted: [] })).toBeNull()
    expect(submitSnapshotWrite(row(9, snap(5)), S, { revision: 7, unheard: [A], submitted: [] })).toBeNull()
  })
  it('a claim from the body is read strictly', () => {
    expect(submitClaimFrom({ revision: 3, unheard: ['a'], submitted: [] })).toEqual({ revision: 3, unheard: ['a'], submitted: [] })
    expect(submitClaimFrom({ revision: 3, unheard: ['a'] })).toBeNull()
    expect(submitClaimFrom({ revision: '3', unheard: [], submitted: [] })).toBeNull()
    expect(submitClaimFrom({ revision: 3, unheard: Array(65).fill('a'), submitted: [] })).toBeNull()
    expect(submitClaimFrom(null)).toBeNull()
  })
})

describe('landedUnheard', () => {
  const unheard = new Map([['A', 5]])
  it('an unheard write counts only at exactly the revision it would have made', () => {
    expect(landedUnheard('A', 6, unheard)).toBe(true)
    expect(landedUnheard('A', 7, unheard)).toBe(false)
    expect(landedUnheard('B', 6, unheard)).toBe(false)
    expect(landedUnheard(null, 6, unheard)).toBe(false)
    expect(landedUnheard('A', null, unheard)).toBe(false)
  })
  it('the submitted snapshot counts at any revision — the submit bumps it unseen', () => {
    expect(landedUnheard('S', 42, new Map(), new Set(['S']))).toBe(true)
    expect(landedUnheard('S', undefined, new Map(), new Set(['S']))).toBe(false)
  })
})
