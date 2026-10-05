/**
 * The submit stores the snapshot its brief was built from as the project's
 * copy (IMP-06 review).
 *
 * The maker's "changed since you got the brief" flag is `updated_at >
 * brief.created_at`, and /api/handoff stamps both with one timestamp. The
 * server copy of the journey used to reach that state only through the
 * client's pre-submit checkpoint flush — and a flush fails exactly when a
 * submit is most likely to be retried: a dropped connection fails both. The
 * brief then went out over a pre-wrap-up copy (what the maker's read-only view
 * and a second device show), and the next visit wrote the real one, moving
 * `updated_at` past a brief nothing had changed since. An in-memory guard
 * against the late write could not survive that next visit.
 *
 * So the submit carries the image-free snapshot, and the route writes it in
 * the same project update that sets `updated_at` to the brief's time. The
 * flush is a head start: when it landed, the copy already matches and the
 * route leaves snapshot and revision alone, so the client stays in step.
 *
 * Only over a copy the submitting tab knows as its own (`SubmitClaim`). A tab
 * left open on the laptop while the phone carried on in the builder must not
 * erase the phone's work by submitting — the last-writer-wins overwrite the
 * checkpoint client halts to prevent.
 *
 * Pure — used by the client (building the body) and the route (checking it).
 */
import { landedUnheard, MAX_CHECKPOINT_BYTES, snapshotFingerprint, stripImages } from './checkpoint'
import { SNAPSHOT_VERSION, type ProjectSnapshot } from './snapshot'

/**
 * The image-free snapshot a submit carries, or null for anything that is not
 * a snapshot or is too big to store (the checkpoint route's own ceiling).
 * Stripping is idempotent, so the route can re-apply it to whatever arrives.
 */
export function submitSnapshotFrom(raw: unknown): ProjectSnapshot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const stripped = stripImages(raw) as ProjectSnapshot
  if (JSON.stringify(stripped).length > MAX_CHECKPOINT_BYTES) return null
  return stripped
}

/**
 * What the submitting tab knows the server copy to be (CheckpointClient
 * ['submitting']). The route stores the brief's snapshot only over a copy the
 * tab would itself take for its own — its revision, or one of its writes it
 * never heard back about, the rule its 409s follow (`landedUnheard`) — and
 * never over another device's newer work. A halted tab sends none.
 */
export interface SubmitClaim {
  /** The revision the tab last confirmed (or loaded). */
  revision: number
  /** Writes sent on that revision whose outcome it has not heard: lost, a 5xx, still on the wire. */
  unheard: string[]
  /** Snapshots briefs went out with: stored at revisions the tab never hears about. */
  submitted: string[]
}

/** More fingerprints than any tab holds: each list empties on a confirmed write or grows by one per brief. */
const MAX_CLAIM_PRINTS = 64

/** The claim a submit carries, or null for anything malformed — no snapshot is then stored. */
export function submitClaimFrom(raw: unknown): SubmitClaim | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const { revision, unheard, submitted } = raw as Record<string, unknown>
  if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 0) return null
  const prints = (v: unknown) =>
    Array.isArray(v) && v.length <= MAX_CLAIM_PRINTS && v.every((p) => typeof p === 'string') ? (v as string[]) : null
  const u = prints(unheard)
  const s = prints(submitted)
  return u && s ? { revision, unheard: u, submitted: s } : null
}

/** The project columns the decision reads. */
export interface ProjectCopyRow {
  revision?: unknown
  snapshot?: unknown
  snapshot_version?: unknown
}

export interface SubmitSnapshotWrite {
  snapshot: ProjectSnapshot
  snapshot_version: number
  revision: number
  step: string | null
}

/**
 * The fields a submit adds to its project update so the copy is the brief's
 * snapshot — written conditionally on `row.revision` by the caller. Null when
 * there is nothing to write:
 *  - the copy already is this snapshot (the flush landed): no revision bump,
 *    which would only make the client's next save meet a 409;
 *  - the copy is not one the claim knows as the tab's own: another device
 *    wrote it, and a checkpoint from this tab would meet a 409 there too;
 *  - newer code wrote the copy: never clobbered, as in the checkpoint route;
 *  - the row is unreadable.
 */
export function submitSnapshotWrite(
  row: ProjectCopyRow | null,
  snapshot: ProjectSnapshot,
  claim: SubmitClaim
): SubmitSnapshotWrite | null {
  if (!row || typeof row.revision !== 'number' || !Number.isFinite(row.revision)) return null
  if (typeof row.snapshot_version === 'number' && row.snapshot_version > SNAPSHOT_VERSION) return null
  const serverPrint = row.snapshot ? snapshotFingerprint(row.snapshot) : null
  if (serverPrint === snapshotFingerprint(snapshot)) return null
  const ours =
    row.revision === claim.revision ||
    landedUnheard(
      serverPrint,
      row.revision,
      new Map(claim.unheard.map((p) => [p, claim.revision])),
      new Set(claim.submitted)
    )
  if (!ours) return null
  return {
    snapshot,
    snapshot_version: SNAPSHOT_VERSION,
    revision: row.revision + 1,
    step: typeof snapshot.currentStepId === 'string' ? snapshot.currentStepId : null,
  }
}
