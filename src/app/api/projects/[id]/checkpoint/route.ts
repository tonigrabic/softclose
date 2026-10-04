import { apiAccount } from '@/lib/auth/dal'
import { unauthorized } from '@/lib/api/errors'
import { supabaseAdmin, TABLES } from '@/lib/db/supabase'
import { CHECKPOINT_RATE_LIMIT, MAX_CHECKPOINT_BYTES, snapshotFingerprint } from '@/lib/project/checkpoint'
import { SNAPSHOT_VERSION } from '@/lib/project/snapshot'
import { contentChangedAt } from '@/lib/project/status'
import { rateLimitKey } from '@/lib/rate-limit'

/**
 * Save a customer's in-progress journey.
 *
 * Two things make this safe to call every few seconds:
 *
 *  1. The body carries no images. The client strips them; this route refuses
 *     anything that still contains one, and refuses on the raw text before
 *     JSON.parse so an oversized body is a clean 413 rather than a parser dying.
 *  2. The write is conditional on `revision`, so two tabs (or a phone and a
 *     laptop) cannot silently overwrite each other — the loser gets a 409 and
 *     the server's current revision, and decides what to do with it.
 *
 * Degradation matters more here than anywhere: a failed checkpoint must never
 * cost the homeowner their work or interrupt them. Every failure path answers
 * with something the client can act on quietly, and never a 500.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await apiAccount()
  if (!session) return unauthorized()

  const { id } = await ctx.params
  const limit = rateLimitKey(session.accountId, 'checkpoint', CHECKPOINT_RATE_LIMIT.max, CHECKPOINT_RATE_LIMIT.windowMs)
  if (!limit.ok) {
    // When the window resets, so the client waits exactly that long instead
    // of spending a request on a 429 every few seconds until it does.
    return Response.json(
      { ok: false, reason: 'rate_limited', retryAfterMs: limit.retryAfterMs },
      { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil(limit.retryAfterMs / 1000))) } }
    )
  }

  const db = supabaseAdmin()
  if (!db) return Response.json({ ok: false, reason: 'no_db' }, { status: 503 })

  // Read once as text: length and content are both checked before parsing.
  const raw = await req.text()
  if (raw.length > MAX_CHECKPOINT_BYTES) {
    console.error('[checkpoint] payload too large', raw.length)
    return Response.json({ ok: false, reason: 'too_large' }, { status: 413 })
  }
  if (raw.includes('data:image/')) {
    console.error('[checkpoint] payload still contains an inline image — refusing')
    return Response.json({ ok: false, reason: 'inline_image' }, { status: 400 })
  }

  let body: { baseRevision?: number; snapshot?: unknown; step?: string; snapshotVersion?: number }
  try {
    body = JSON.parse(raw)
  } catch {
    return Response.json({ ok: false, reason: 'bad_json' }, { status: 400 })
  }
  if (typeof body.baseRevision !== 'number' || !body.snapshot) {
    return Response.json({ ok: false, reason: 'bad_request' }, { status: 400 })
  }

  // Ownership: only the project's customer may write to it. The maker can read
  // the project elsewhere, but must never be able to edit their customer's
  // answers — the brief's value is that it is the homeowner's own words.
  const { data: project } = await db
    .from(TABLES.projects)
    .select('id, customer_id, revision, status, snapshot_version, current_brief_id, brief_print')
    .eq('id', id)
    .maybeSingle()
  if (!project || project.customer_id !== session.accountId) {
    return Response.json({ ok: false, reason: 'not_found' }, { status: 404 })
  }

  // Written by newer code than this: serve read-only rather than clobber it.
  // Dropping a mismatched snapshot is right for the local cache and disastrous
  // here — this is the customer's only kitchen.
  if ((project.snapshot_version as number) > SNAPSHOT_VERSION) {
    return Response.json(
      { ok: false, reason: 'version_ahead', snapshotVersion: project.snapshot_version },
      { status: 409 }
    )
  }

  // No `status` in this write. The status read above may already be stale —
  // a decline archives the project, a send marks it submitted, and neither
  // bumps `revision` — so writing it back would undo them: an autosave in
  // flight across the maker's decline would re-open the project (IMP-03).
  //
  // Every save is activity (`updated_at`); only a kitchen that differs from
  // the brief the maker has is a change (`content_changed_at`, 0008). A walk
  // back through the steps from the review moves the step and the done flag
  // and re-stamps sign-offs — saved for the resume, never flagged.
  const now = new Date().toISOString()
  const { data: updated, error } = await db
    .from(TABLES.projects)
    .update({
      snapshot: body.snapshot,
      snapshot_version: SNAPSHOT_VERSION,
      revision: (project.revision as number) + 1,
      step: body.step ?? null,
      updated_at: now,
      content_changed_at: contentChangedAt(
        {
          currentBriefId: (project.current_brief_id as string | null) ?? null,
          briefPrint: (project.brief_print as string | null) ?? null,
        },
        body.snapshot,
        now
      ),
    })
    .eq('id', id)
    .eq('revision', body.baseRevision)
    .select('revision, updated_at')
    .maybeSingle()

  if (error) {
    console.error('[checkpoint] write failed', error.message)
    return Response.json({ ok: false, reason: 'write_failed' }, { status: 503 })
  }

  if (!updated) {
    // Someone else moved the revision on. Hand back ours so the client can tell
    // "my own earlier write landed" from "another device is editing this".
    const { data: current } = await db
      .from(TABLES.projects)
      .select('revision, snapshot')
      .eq('id', id)
      .maybeSingle()
    return Response.json(
      {
        ok: false,
        reason: 'conflict',
        revision: current?.revision ?? null,
        serverFingerprint: current?.snapshot ? snapshotFingerprint(current.snapshot) : null,
      },
      { status: 409 }
    )
  }

  // The one status move a checkpoint makes — the first save starts the
  // journey — as its own write, conditional on the status it moves from, so
  // it can never overwrite anything else. Best-effort: if it fails, the next
  // checkpoint still reads 'invited' and tries again.
  if (project.status === 'invited') {
    const { error: statusError } = await db
      .from(TABLES.projects)
      .update({ status: 'in_progress' })
      .eq('id', id)
      .eq('status', 'invited')
    if (statusError) console.error('[checkpoint] invited → in_progress failed', statusError.message)
  }

  return Response.json({ ok: true, revision: updated.revision, savedAt: updated.updated_at })
}
