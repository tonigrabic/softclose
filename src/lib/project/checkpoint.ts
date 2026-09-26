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
 * This is not only an optimisation. The maker's "changed since you got the
 * brief" flag is derived from `updated_at > brief.created_at`, so a checkpoint
 * that wrote on every React re-render would invent customer activity that never
 * happened and make that signal worthless.
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
