/**
 * Pure helpers for saving a journey to the server.
 *
 * Everything that involves a decision lives here rather than in the React hook,
 * because `vitest.config.ts` runs `environment: 'node'` and only picks up
 * `tests/**\/*.test.ts` — a hook is untestable in this harness, so the hook is
 * kept as thin glue over functions that are not.
 */

/** Ceiling for one checkpoint body. Vercel's request cap is 4.5 MB and an
 *  oversized base64 payload has already produced a production 413 in this
 *  project; refusing early turns that into a log line instead of a 413. */
export const MAX_CHECKPOINT_BYTES = 3 * 1024 * 1024

/** Stands in for an image that was not sent. Structurally a string, so nothing
 *  downstream trips over a null where it expected a URL, and recognisable so a
 *  rehydrated journey can tell "no photo" from "photo we did not ship". */
export const OMITTED_IMAGE = 'omitted://image'

/**
 * Replace every inline image with a marker.
 *
 * Checkpoints are image-free by design. The snapshot holds base64 data URLs —
 * photos, inspiration, renders — which are megabytes, and this runs every few
 * seconds. What the maker needs to see and what a resume needs to restore is
 * the structure: layout, dimensions, picks, scope, wishlist.
 *
 * Images still reach the server at submit, where `offloadMedia` puts them in
 * Storage; a post-submit edit rehydrates them from the brief.
 */
export function stripImages<T>(value: T): T {
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return v.startsWith('data:image/') ? OMITTED_IMAGE : v
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {}
      for (const [k, item] of Object.entries(v as Record<string, unknown>)) out[k] = walk(item)
      return out
    }
    return v
  }
  return walk(value) as T
}

/**
 * A stable digest of a payload, used to skip writes that change nothing.
 *
 * This is not only an optimisation. Every write moves `updated_at`, the
 * maker's "last activity" for the project, so a checkpoint that wrote on every
 * React re-render would invent customer activity that never happened. (The
 * "changed since you got the brief" flag reads `content_changed_at` since
 * 0008, which the route moves only when the kitchen differs from the brief.)
 *
 * Key order is normalised, because JSON.stringify follows insertion order and
 * two structurally identical snapshots can be built in different orders.
 */
export function snapshotFingerprint(value: unknown): string {
  const canonical = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(canonical)
    if (v && typeof v === 'object') {
      const entries = Object.entries(v as Record<string, unknown>)
        .filter(([, val]) => val !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      const out: Record<string, unknown> = {}
      for (const [k, val] of entries) out[k] = canonical(val)
      return out
    }
    return v
  }
  const json = JSON.stringify(canonical(value)) ?? ''
  // FNV-1a. Not cryptographic — this only has to notice change, and it runs on
  // every keystroke-ish state update.
  let h = 0x811c9dc5
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0') + json.length.toString(16)
}

/** 2s, 5s, 15s, 60s, then hold. Long enough that a flaky connection settles,
 *  short enough that work is not left unsaved for minutes. */
export function nextBackoffMs(attempt: number): number {
  const ladder = [2_000, 5_000, 15_000, 60_000]
  return ladder[Math.min(attempt, ladder.length - 1)]
}

/** The client's idle debounce: a write goes out this long after the last change. */
export const CHECKPOINT_IDLE_MS = 2_500

/**
 * The route's per-account limit. Since builder autosave (IMP-06) every pick
 * is a checkpoint, so the old 240 an hour was within reach of one homeowner
 * working through the builder for twenty minutes, and a fixed one-hour window
 * then blocked them for the rest of the hour. One tab writes at most once per
 * idle period (a write needs CHECKPOINT_IDLE_MS of quiet before it), so the
 * cap sits above that ceiling with room for hide flushes; the short window
 * means a block, should something still reach it, lifts within minutes.
 */
export const CHECKPOINT_RATE_LIMIT = { max: 180, windowMs: 5 * 60 * 1000 } as const

/** A Retry-After longer than this is not believed (a bad header, a clock gone wrong). */
const MAX_RETRY_AFTER_MS = 60 * 60 * 1000

/**
 * How long a 429 asked us to wait: the route's `retryAfterMs`, else a
 * standard Retry-After header (seconds). Null when neither says.
 */
export function retryAfterFrom(body: { retryAfterMs?: unknown } | null | undefined, header: string | null): number | null {
  const fromBody = body?.retryAfterMs
  if (typeof fromBody === 'number' && Number.isFinite(fromBody) && fromBody > 0) return fromBody
  const seconds = header === null || header.trim() === '' ? NaN : Number(header)
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null
}

/**
 * The wait before retry number `attempt + 1`: the ladder, or — after a rate
 * limit — as long as the server said, whichever is longer. Retrying a 429
 * sooner only spends another request on another 429.
 */
export function retryDelayMs(attempt: number, retryAfterMs: number | null = null): number {
  const ladder = nextBackoffMs(attempt)
  if (retryAfterMs === null || !Number.isFinite(retryAfterMs) || retryAfterMs <= 0) return ladder
  return Math.max(ladder, Math.min(retryAfterMs, MAX_RETRY_AFTER_MS))
}

/**
 * A refusal no retry will change: not our project, session gone, a payload the
 * server will never accept. Retrying one just burns requests on a backoff
 * forever, which is exactly what a 404 did the first time this ran.
 *
 * Not 429 or 408: a rate limit or a timeout passes. With builder autosave
 * (IMP-06) every pick is a checkpoint, and halting on a 429 would stop saving
 * for the rest of the session, silently — the client waits it out instead,
 * for as long as the server says (retryDelayMs), sending nothing meanwhile.
 */
export function isPermanentRefusal(status: number): boolean {
  return status >= 400 && status < 500 && status !== 408 && status !== 429
}

export interface ConflictDecision {
  /** True when the server already holds exactly what we tried to send. */
  alreadyApplied: boolean
}

/**
 * What to do when the server rejects a checkpoint for a stale revision.
 *
 * If its fingerprint matches what we just sent, our own earlier write won and
 * this is a duplicate, not a conflict. That happens constantly: React
 * StrictMode double-mounts every effect in development, and a retry after a
 * timeout can land twice. Without this rule the customer would see a conflict
 * banner on nearly every dev page load — the same class of bug as the
 * double-brief insert this project already fixed once.
 */
export function classifyConflict(sentFingerprint: string, serverFingerprint: string | null): ConflictDecision {
  return { alreadyApplied: serverFingerprint !== null && serverFingerprint === sentFingerprint }
}

/**
 * A 409 whose server copy is a write of ours we never heard back about.
 *
 * `classifyConflict` only recognises the snapshot just sent. That is not
 * enough once a write can land unheard — a response lost to a dropped
 * connection, an iOS tab backgrounded mid-request ('Load failed'), a 504
 * after the update ran — because the retry sends whatever is latest by then,
 * and with every builder pick a checkpoint (IMP-06) something newer is the
 * normal case. The retry of B at the old base then finds A on the server;
 * halting on that would freeze the server copy, silently, for the rest of
 * the session.
 *
 * So the server copy is ours when it is:
 *  - a write whose outcome we never learned, at exactly the revision that
 *    write would have made (`unheard`: fingerprint → the base revision it was
 *    sent on); or
 *  - the snapshot a brief went out with (`submitted`): /api/handoff stores it
 *    as the project's copy, at a revision the client never hears about.
 * Anything else is another device.
 */
export function landedUnheard(
  serverFingerprint: string | null,
  serverRevision: unknown,
  unheard: ReadonlyMap<string, number>,
  submitted: ReadonlySet<string> = new Set()
): boolean {
  if (serverFingerprint === null) return false
  if (typeof serverRevision !== 'number' || !Number.isFinite(serverRevision)) return false
  if (submitted.has(serverFingerprint)) return true
  const base = unheard.get(serverFingerprint)
  return base !== undefined && serverRevision === base + 1
}
