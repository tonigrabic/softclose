/**
 * A brief's id is minted by the client at submit and used by the server as the
 * row's primary key. That makes sending a brief repeatable: a wrap-up that
 * remounts, or a retry after a response that never arrived, finds the brief it
 * already made instead of inserting a second one and emailing the maker again.
 *
 * The id rides in the snapshot (WrapUpData.briefId) and is saved by the flush
 * that runs BEFORE the brief is sent, so recording it never adds a write after
 * the brief — which would flag every fresh brief "changed since submit".
 *
 * Pure and server-safe.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isBriefId(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

/** A v4 UUID — `crypto.randomUUID` is secure-context only (not a LAN-IP dev URL). */
export function mintBriefId(): string {
  const c = globalThis.crypto
  if (typeof c?.randomUUID === 'function') return c.randomUUID()
  const b = new Uint8Array(16)
  if (typeof c?.getRandomValues === 'function') c.getRandomValues(b)
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export type BriefIdDecision =
  | { kind: 'create'; id: string }
  | { kind: 'reuse'; id: string }
  | { kind: 'reject' }

/**
 * What a send should do, given the id it asked for and any brief that already
 * holds it. No usable id (an older client): mint one server-side, as before.
 * Held by this project: this send already happened — reuse it. Held by anyone
 * else: refuse, without saying whose it is.
 */
export function decideBriefId(
  requested: unknown,
  existing: { projectId: string | null } | null,
  projectId: string | null,
  fresh: () => string
): BriefIdDecision {
  if (!isBriefId(requested)) return { kind: 'create', id: fresh() }
  if (!existing) return { kind: 'create', id: requested }
  return projectId !== null && existing.projectId === projectId
    ? { kind: 'reuse', id: requested }
    : { kind: 'reject' }
}
