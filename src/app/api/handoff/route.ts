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
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as HandoffRequest
    const bundle = buildHandoffBundle(body)
    const { brief, estimate } = bundle

    // Persist the artifact so the maker can actually receive it. Failure here
    // must not cost the homeowner their summary: log, and return the bundle
    // without briefId — the wrap-up copy then says it was NOT saved.
    const db = supabaseAdmin()
    if (db && body.persist !== false) {
      try {
        const briefId = crypto.randomUUID()
        // Images leave the row: every data URL in the bundle becomes a private
        // Storage object under briefs/<id>/; the homeowner's own response keeps
        // the inline images (their download must work offline).
        const upload = storageUploader()
        const stored = upload
          ? await offloadMedia(bundle, `briefs/${briefId}`, upload)
          : { value: bundle, count: 0, bytes: 0 }
        const { data: project, error: sErr } = await db
          .from(TABLES.projects)
          .insert({
            locale: body.locale ?? null,
            step: 'contact',
            status: 'submitted',
            profile: stored.value.brief,
            submitted_at: new Date().toISOString(),
          })
          .select('id')
          .single()
        if (sErr) throw sErr
        const { error: bErr } = await db.from(TABLES.briefs).insert({
          id: briefId,
          project_id: project.id,
          locale: body.locale ?? null,
          contact_name: brief.name ?? null,
          contact_type: brief.contactValue?.includes('@') ? 'email' : brief.contactValue ? 'phone' : null,
          contact_value: brief.contactValue ?? null,
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
        bundle.briefId = briefId
        bundle.makerPath = `/maker/${briefId}`

        // Tell the maker. Origin from APP_URL, else the request itself.
        const baseUrl = process.env.APP_URL?.replace(/\/$/, '') || new URL(req.url).origin
        const notified = await notifyMakerOfBrief({ briefId, bundle, locale: body.locale, baseUrl })
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
