import { apiAccount } from '@/lib/auth/dal'
import { unauthorized } from '@/lib/api/errors'
import { supabaseAdmin, TABLES } from '@/lib/db/supabase'
import { offloadMedia, storageUploader } from '@/lib/db/media'
import { notifyMakerOfBrief } from '@/lib/notify/maker-email'
import { buildHandoffBundle } from '@/lib/handoff/bundle'
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
            .select('id, customer_id, maker_id')
            .eq('id', body.projectId)
            .maybeSingle()
          if (!project || project.customer_id !== session.accountId) {
            return Response.json({ error: 'not_found' }, { status: 404 })
          }
          projectId = project.id as string
          makerId = (project.maker_id as string | null) ?? null
        }

        const briefId = crypto.randomUUID()
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
        if (bErr) throw bErr

        // Point the project at its current brief and denormalise the range, so
        // the maker's list never has to load a snapshot to show a number.
        await db
          .from(TABLES.projects)
          .update({
            current_brief_id: briefId,
            status: 'submitted',
            submitted_at: submittedAt,
            updated_at: submittedAt,
            est_low: estimate?.low ?? null,
            est_high: estimate?.high ?? null,
            est_band_pct: estimate?.bandPct ?? null,
          })
          .eq('id', projectId)

        bundle.briefId = briefId
        bundle.makerPath = `/maker/${briefId}`

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
    return Response.json(bundle)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build handoff bundle'
    return Response.json({ error: message }, { status: 500 })
  }
}
