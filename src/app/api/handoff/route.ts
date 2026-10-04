import { apiAccount } from '@/lib/auth/dal'
import { unauthorized } from '@/lib/api/errors'
import { supabaseAdmin, TABLES } from '@/lib/db/supabase'
import { offloadMedia, storageUploader } from '@/lib/db/media'
import { notifyMakerOfBrief } from '@/lib/notify/maker-email'
import { buildHandoffBundle, toCustomerBundle } from '@/lib/handoff/bundle'
import { decideBriefId, isBriefId } from '@/lib/handoff/brief-id'
import { isProjectClosed } from '@/lib/project/decision'
import { submitSnapshotFrom, submitSnapshotWrite } from '@/lib/project/submit-snapshot'
import type { ClientMessage, LeadProfile, MoodBoardItem } from '@/lib/types'

interface HandoffRequest {
  brief?: LeadProfile
  /** Active UI locale, stored with the brief so the maker sees the homeowner's language. */
  locale?: string
  /** false = build the bundle but do not store it (previews, tests). */
  persist?: boolean
  moodBoard?: MoodBoardItem[]
  explorationRefs?: { url: string; prompt: string; reaction?: string }[]
  transcript?: ClientMessage[]
  /** The project this brief belongs to. Without it the brief has no owner, and
   *  an ownerless brief is unreadable by anyone — see the block below. */
  projectId?: string
  /** Client-minted id for this send (lib/handoff/brief-id): a repeat of the same
   *  send gets the brief it already made. Absent from older clients. */
  briefId?: string
  /** The image-free journey snapshot this brief was built from. Stored as the
   *  project's copy in the same update that stamps the brief's time (see
   *  lib/project/submit-snapshot). Absent from older clients. */
  snapshot?: unknown
}

type Db = NonNullable<ReturnType<typeof supabaseAdmin>>

/**
 * Point the project at its new brief — and, when the brief's snapshot came
 * along and the server copy is a different one, store it, in the same update
 * that sets `updated_at` to the brief's time. Written on the revision just
 * read, like a checkpoint: a checkpoint landing in between (a retry of the
 * failed pre-submit flush) moves the revision, and the read is repeated. If
 * it keeps moving, or anything goes wrong, the brief still gets its project
 * update, without the snapshot — the behaviour before the copy was stored.
 */
async function updateSubmittedProject(
  db: Db,
  projectId: string,
  fields: Record<string, unknown>,
  snapshot: ReturnType<typeof submitSnapshotFrom>
): Promise<void> {
  for (let attempt = 0; snapshot && attempt < 3; attempt++) {
    const { data: row, error: readErr } = await db
      .from(TABLES.projects)
      .select('revision, snapshot, snapshot_version')
      .eq('id', projectId)
      .maybeSingle()
    if (readErr) break
    const write = submitSnapshotWrite(row, snapshot)
    if (!write) break
    const { data: updated, error: writeErr } = await db
      .from(TABLES.projects)
      .update({ ...fields, ...write })
      .eq('id', projectId)
      .eq('revision', row!.revision)
      .select('revision')
      .maybeSingle()
    if (writeErr) {
      console.error('[handoff] snapshot write failed', writeErr.message)
      break
    }
    if (updated) return
  }
  await db.from(TABLES.projects).update(fields).eq('id', projectId)
}

export async function POST(req: Request) {
  const session = await apiAccount()
  if (!session) return unauthorized()

  try {
    const body = (await req.json()) as HandoffRequest
    // A customer's contact email is the address they signed in with — taken
    // from the session, never from the client's copy. (A projectId that is not
    // theirs is refused below, before anything is stored.)
    if (body.brief && body.projectId && session.role === 'customer') {
      body.brief = { ...body.brief, email: session.email }
    }
    const bundle = buildHandoffBundle(body)
    const { brief, estimate } = bundle

    // Persist the artifact so the maker can actually receive it. Failure here
    // must not cost the homeowner their summary: log, and return the bundle
    // without briefId — the wrap-up copy then says it was NOT saved.
    const db = supabaseAdmin()
    if (db && body.persist !== false) {
      try {
        // Ownership. The DAL refuses ownerless briefs on purpose, so resolving
        // the maker here is not bookkeeping — it is what makes the brief exist
        // for the person it was written for.
        let projectId: string | null = null
        let makerId: string | null = null
        if (body.projectId) {
          const { data: project } = await db
            .from(TABLES.projects)
            .select('id, customer_id, maker_id, status, current_brief_id')
            .eq('id', body.projectId)
            .maybeSingle()
          if (!project || project.customer_id !== session.accountId) {
            return Response.json({ error: 'not_found' }, { status: 404 })
          }
          // A closed project takes no new brief (IMP-03). An intake tab left
          // open while the maker declined could otherwise re-send: the project
          // update below would un-archive it, and a maker who already said no
          // would get a fresh 'new' brief and another email.
          //
          // The declined brief is checked, not just the project's status: the
          // archive after a decline is a second, best-effort write, and a
          // failed one leaves the project reading 'submitted'. The brief is
          // the source of truth (isProjectClosed).
          let currentBriefStatus: string | null = null
          if (project.current_brief_id) {
            const { data: current, error: currentErr } = await db
              .from(TABLES.briefs)
              .select('maker_status')
              .eq('id', project.current_brief_id)
              .maybeSingle()
            // Unknown is not "open": a failed read stores nothing (the outer
            // catch answers with an unsaved bundle) rather than risk handing a
            // maker who said no another brief.
            if (currentErr) throw currentErr
            currentBriefStatus = (current?.maker_status as string | null) ?? null
          }
          if (isProjectClosed(project.status as string, currentBriefStatus)) {
            return Response.json({ error: 'closed', code: 'closed' }, { status: 409 })
          }
          projectId = project.id as string
          makerId = (project.maker_id as string | null) ?? null
        }

        // A repeated send — the wrap-up remounted, or a retry after a lost
        // response — must not insert a second brief and email the maker again.
        // Checked before any media is uploaded.
        const { data: existing } = isBriefId(body.briefId)
          ? await db.from(TABLES.briefs).select('project_id').eq('id', body.briefId).maybeSingle()
          : { data: null }
        const decision = decideBriefId(
          body.briefId,
          existing ? { projectId: (existing.project_id as string | null) ?? null } : null,
          projectId,
          () => crypto.randomUUID()
        )
        if (decision.kind === 'reject') {
          return Response.json({ error: 'conflict' }, { status: 409 })
        }
        if (decision.kind === 'reuse') {
          bundle.briefId = decision.id
          return Response.json(toCustomerBundle(bundle))
        }

        const briefId = decision.id
        // One timestamp for the brief row AND the project's updated_at.
        // Letting the database default created_at and then updating the project
        // afterwards leaves updated_at a few milliseconds later, and the maker's
        // list derives "changed since you got the brief" from exactly that
        // comparison — so every fresh submit would arrive already flagged as an
        // edit, and the flag would mean nothing.
        const submittedAt = new Date().toISOString()
        // Images leave the row: every data URL in the bundle becomes a private
        // Storage object under briefs/<id>/; the homeowner's own response keeps
        // the inline images (their download must work offline).
        const upload = storageUploader()
        const stored = upload
          ? await offloadMedia(bundle, `briefs/${briefId}`, upload)
          : { value: bundle, count: 0, bytes: 0 }

        // Projects are created by an invite now. This only runs for the legacy
        // path — a submit with no projectId — which keeps the old tests and any
        // anonymous flow working.
        if (!projectId) {
          const { data: created, error: pErr } = await db
            .from(TABLES.projects)
            .insert({
              locale: body.locale ?? null,
              step: 'contact',
              status: 'submitted',
              profile: stored.value.brief,
              submitted_at: submittedAt,
            })
            .select('id')
            .single()
          if (pErr) throw pErr
          projectId = created.id as string
        }

        // The row holds one channel: the phone when given (the email is always
        // recoverable through the project's customer), else the email, else
        // the anonymous funnel's single value.
        const phone = brief.phone?.trim()
        const contact = phone
          ? { type: 'phone', value: phone }
          : brief.email
            ? { type: 'email', value: brief.email }
            : brief.contactValue
              ? { type: brief.contactValue.includes('@') ? 'email' : 'phone', value: brief.contactValue }
              : null

        const { error: bErr } = await db.from(TABLES.briefs).insert({
          id: briefId,
          created_at: submittedAt,
          project_id: projectId,
          maker_id: makerId,
          locale: body.locale ?? null,
          contact_name: brief.name ?? null,
          contact_type: contact?.type ?? null,
          contact_value: contact?.value ?? null,
          estimate_low: estimate?.low ?? null,
          estimate_high: estimate?.high ?? null,
          estimate_all_in_low: estimate?.withAppliances?.low ?? null,
          estimate_all_in_high: estimate?.withAppliances?.high ?? null,
          band_pct: estimate?.bandPct ?? null,
          bundle: stored.value,
          media_object_count: stored.count,
          media_bytes: stored.bytes,
        })
        // Two sends of the same brief racing: the other one inserted first.
        // Same outcome as a reuse — no second project update, no second email.
        if (bErr?.code === '23505') {
          bundle.briefId = briefId
          return Response.json(toCustomerBundle(bundle))
        }
        if (bErr) throw bErr

        // Point the project at its current brief and denormalise the range, so
        // the maker's list never has to load a snapshot to show a number. The
        // journey copy is the brief's own snapshot from here on (above).
        await updateSubmittedProject(
          db,
          projectId,
          {
            current_brief_id: briefId,
            status: 'submitted',
            submitted_at: submittedAt,
            updated_at: submittedAt,
            est_low: estimate?.low ?? null,
            est_high: estimate?.high ?? null,
            est_band_pct: estimate?.bandPct ?? null,
          },
          // Only a project's own customer reaches here with a projectId; the
          // legacy insert above stores the profile and has no journey copy.
          body.projectId ? submitSnapshotFrom(body.snapshot) : null
        )

        bundle.briefId = briefId

        // Tell the maker — their own address once the brief has an owner.
        // MAKER_NOTIFY_EMAIL is only the pre-accounts fallback.
        const baseUrl = process.env.APP_URL?.replace(/\/$/, '') || new URL(req.url).origin
        let to: string | null = null
        if (makerId) {
          const { data: maker } = await db.from(TABLES.accounts).select('email').eq('id', makerId).maybeSingle()
          to = (maker?.email as string | null) ?? null
        }
        const notified = await notifyMakerOfBrief({ briefId, bundle, locale: body.locale, baseUrl, to })
        if (notified) {
          await db.from(TABLES.briefs).update({ maker_notified_at: new Date().toISOString() }).eq('id', briefId)
        }
      } catch (persistErr) {
        console.error('[handoff] persist failed', persistErr)
      }
    }
    return Response.json(toCustomerBundle(bundle))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build handoff bundle'
    return Response.json({ error: message }, { status: 500 })
  }
}
