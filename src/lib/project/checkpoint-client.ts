/**
 * The timers and the fetch behind `useProjectCheckpoint`: mirror the journey
 * to the server, alongside the IndexedDB copy.
 *
 * Plain TypeScript, not a hook, so the node-only test harness can drive the
 * real retry behaviour with fake timers and a fake fetch — the same split as
 * `createDebouncer` under `useDebouncedCallback`. Every decision it makes
 * (what to strip, whether anything changed, how long to wait, whether a 409
 * is really a conflict) lives in `./checkpoint`; this is the scheduling.
 *
 * It must never interrupt the homeowner. Every failure is swallowed into a
 * state the save indicator can show quietly; IndexedDB still has their work.
 *
 * Backing off means sending nothing. After a failure exactly one retry timer
 * is armed, for the ladder step or — after a 429 — for as long as the server
 * said. Until it fires, a new snapshot only replaces the one waiting; the
 * idle timer, a hidden tab and queue() all leave the wire alone, and the
 * retry sends whatever is latest by then.
 */
import {
  CHECKPOINT_IDLE_MS,
  classifyConflict,
  isPermanentRefusal,
  MAX_CHECKPOINT_BYTES,
  retryAfterFrom,
  retryDelayMs,
  snapshotFingerprint,
  stripImages,
} from './checkpoint'
import type { ProjectSnapshot } from './snapshot'

export type CheckpointState = 'idle' | 'saving' | 'saved' | 'pending' | 'conflict' | 'error' | 'disabled'

/** …but never hold a write longer than this, so continuous fiddling in the
 *  builder still reaches the server. */
export const CHECKPOINT_MAX_WAIT_MS = 15_000
/** A flush holds up a submit at most this long; the submit never waits on a slow save. */
export const FLUSH_TIMEOUT_MS = 4_000

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export interface CheckpointClient {
  /** Debounced write of `snapshot` (the latest replaces any earlier one still waiting). */
  queue: (snapshot: ProjectSnapshot, opts?: { immediate?: boolean }) => void
  /**
   * Write `snapshot` now and resolve once it has landed (or failed, or timed
   * out): true only when the server holds exactly this snapshot — so a
   * "Spremljeno" built on it is never a guess.
   *
   * `final`: this is the snapshot a brief is about to be built from. Should
   * it fail to land, it is never written later either: the brief carries it,
   * and a late write would only move `updated_at` past the brief and flag a
   * brand-new brief as "changed since submit". The next real change writes.
   */
  flush: (snapshot: ProjectSnapshot, opts?: { final?: boolean }) => Promise<boolean>
  /** The tab is being hidden: send what is waiting now — unless backing off. */
  hide: () => void
  /** Clear every timer. Not terminal: StrictMode remounts the same client. */
  dispose: () => void
}

export interface CheckpointClientOptions {
  projectId: string
  initialRevision?: number
  /**
   * Fingerprint of what the server already holds (`snapshotFingerprint` of
   * the stripped initial snapshot). Seeds the "nothing changed" check, so a
   * visit that changes nothing writes nothing — every write moves
   * `updated_at`, and that is the maker's "changed since the brief" signal.
   */
  initialFingerprint?: string | null
  onState?: (state: CheckpointState) => void
  /** Injectable for tests. */
  fetch?: typeof fetch
}

interface CheckpointReply {
  ok?: boolean
  revision?: number
  reason?: string
  serverFingerprint?: string | null
  retryAfterMs?: number
}

type Timer = ReturnType<typeof setTimeout> | null

export function createCheckpointClient(opts: CheckpointClientOptions): CheckpointClient {
  const { projectId } = opts
  const fetchFn: typeof fetch = opts.fetch ?? ((input, init) => fetch(input, init))
  const setState = opts.onState ?? (() => {})

  let revision = opts.initialRevision ?? 0
  let lastSentFingerprint: string | null = opts.initialFingerprint ?? null
  // The snapshot a brief went out with after its pre-submit flush failed (see `flush`).
  let coveredBySubmit: string | null = null
  let pending: ProjectSnapshot | null = null
  let inFlight = false
  let attempt = 0
  // Set once a conflict is confirmed: we stop writing rather than race another
  // device. There is no defensible automatic merge of conceptRenders or
  // builderState, and last-writer-wins would let a phone erase an hour of work.
  let halted = false
  // A 429 said "not before then": not even an explicit flush sends earlier.
  let rateLimitedUntil = 0

  let idleTimer: Timer = null
  let maxTimer: Timer = null
  let retryTimer: Timer = null

  const clearDebounce = () => {
    if (idleTimer) clearTimeout(idleTimer)
    if (maxTimer) clearTimeout(maxTimer)
    idleTimer = null
    maxTimer = null
  }
  const clearRetry = () => {
    if (retryTimer) clearTimeout(retryTimer)
    retryTimer = null
  }
  // One retry timer, ever: re-arming replaces it, so failures cannot stack chains.
  const armRetry = (wait: number) => {
    clearRetry()
    retryTimer = setTimeout(() => {
      retryTimer = null
      void send()
    }, wait)
  }

  /** The server holds `sent` now (written, or found already there). */
  const settled = (sent: ProjectSnapshot) => {
    attempt = 0
    rateLimitedUntil = 0
    clearRetry()
    // The server copy has moved on from the submitted one; writing that back later is a real change.
    coveredBySubmit = null
    if (pending === sent) {
      pending = null
      return
    }
    // A newer snapshot was queued while this one was on the wire. If its idle
    // timer already fired (and found the wire busy), nothing else will send it.
    if (pending && !idleTimer) void send()
  }

  async function send(force = false): Promise<void> {
    if (halted || inFlight) return
    const snapshot = pending
    if (!snapshot) return
    // Backing off: the retry sends the latest. An explicit flush may try once
    // early — but not inside a rate limit, which named its own end.
    if (retryTimer && !(force && Date.now() >= rateLimitedUntil)) return
    clearDebounce()

    const payload = stripImages(snapshot)
    const fingerprint = snapshotFingerprint(payload)
    if (fingerprint === lastSentFingerprint || fingerprint === coveredBySubmit) {
      // Nothing actually changed. Skipping is not just thrift: the maker's
      // "changed since submit" flag is `updated_at > brief.created_at`, so a
      // no-op write would fabricate customer activity that never happened.
      pending = null
      return
    }

    const body = JSON.stringify({ baseRevision: revision, step: snapshot.currentStepId, snapshot: payload })
    if (body.length > MAX_CHECKPOINT_BYTES) {
      console.error('[checkpoint] refusing to send an oversized snapshot', body.length)
      setState('error')
      pending = null
      return
    }

    inFlight = true
    setState('saving')
    let res: Response | null = null
    let data: CheckpointReply = {}
    try {
      res = await fetchFn(`/api/projects/${projectId}/checkpoint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
      data = (await res.json().catch(() => ({}))) as CheckpointReply
    } catch {
      res = null // offline, DNS, an aborted request: retried below
    } finally {
      inFlight = false
    }

    if (res?.ok && data.ok) {
      revision = data.revision ?? revision + 1
      lastSentFingerprint = fingerprint
      setState('saved')
      settled(snapshot)
      return
    }

    if (res?.status === 409 && data.reason === 'conflict') {
      if (classifyConflict(fingerprint, data.serverFingerprint ?? null).alreadyApplied) {
        // Our own earlier write won — a StrictMode double-mount, or a retry
        // after a timeout that actually landed. Adopt the revision, carry on.
        revision = data.revision ?? revision
        lastSentFingerprint = fingerprint
        setState('saved')
        settled(snapshot)
        return
      }
      // A genuinely different device is editing this project. Stop writing
      // rather than race; IndexedDB still holds ours.
      halt('conflict')
      return
    }

    if (res && (res.status === 503 || data.reason === 'no_db')) {
      // No database configured — the anonymous local-only behaviour. Silent.
      halt('disabled')
      return
    }

    // Any other 4xx but a rate limit or a timeout is permanent (see
    // isPermanentRefusal). Stop and let the local copy stand.
    if (res && isPermanentRefusal(res.status)) {
      console.error('[checkpoint] refused:', res.status, data.reason)
      halt('error')
      return
    }

    // 5xx, a network error, a timeout, a rate limit: wait, then send the latest.
    attempt += 1
    const rateLimited = res?.status === 429
    const wait = retryDelayMs(attempt - 1, rateLimited ? retryAfterFrom(data, res!.headers.get('Retry-After')) : null)
    if (rateLimited) rateLimitedUntil = Date.now() + wait
    setState('pending')
    armRetry(wait)
  }

  function halt(state: CheckpointState) {
    halted = true
    clearDebounce()
    clearRetry()
    setState(state)
  }

  const queue: CheckpointClient['queue'] = (snapshot, queueOpts) => {
    if (halted) return
    pending = snapshot
    if (retryTimer) return
    if (queueOpts?.immediate) {
      void send()
      return
    }
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      idleTimer = null
      void send()
    }, CHECKPOINT_IDLE_MS)
    // Armed once per batch, not per change — re-arming it on every change
    // would let a steady stream of picks hold the write forever.
    maxTimer ??= setTimeout(() => {
      maxTimer = null
      void send()
    }, CHECKPOINT_MAX_WAIT_MS)
  }

  // Submitting the brief must be the project's LAST write. The maker's "changed
  // since submit" flag is `updated_at > brief.created_at`, and the submit itself
  // changes the snapshot (isDone, wrapUpData) — left to the idle timer, that save
  // lands a few seconds after the brief and flags every fresh brief as edited.
  // Flushed first, the same snapshot queued afterwards is a fingerprint no-op.
  // A save that fails or stalls must not block the submit; with `final` it is
  // not written after the brief either.
  const flush: CheckpointClient['flush'] = async (snapshot, flushOpts) => {
    if (halted) return false
    const target = snapshotFingerprint(stripImages(snapshot))
    let abandoned = false
    const write = (async () => {
      // A save already on the wire finishes first, so ours is the one that lands last.
      while (inFlight) await sleep(50)
      // Timed out while waiting: the caller has moved on, and whatever was
      // queued since is newer than this snapshot — leave it be.
      if (abandoned) return
      pending = snapshot
      await send(true)
    })()
    await Promise.race([write, sleep(FLUSH_TIMEOUT_MS)])
    abandoned = true
    // Landed now, or already there (an unchanged snapshot is a no-op send).
    const landed = lastSentFingerprint === target
    if (!landed && flushOpts?.final) coveredBySubmit = target
    return landed
  }

  const hide: CheckpointClient['hide'] = () => {
    if (pending) void send()
  }

  const dispose: CheckpointClient['dispose'] = () => {
    clearDebounce()
    clearRetry()
  }

  return { queue, flush, hide, dispose }
}
