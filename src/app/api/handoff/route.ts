import { hasPlan, planFromProfile, renderFloorPlanSvg, validate } from '@/lib/floor-plan'
import { buildStubEstimate } from '@/lib/stub-estimate'
import { computeBom } from '@/lib/builder/bom'
import { makerPricingEntryCount } from '@/lib/catalog/maker-pricing'
import { supabaseAdmin, TABLES } from '@/lib/db/supabase'
import { offloadMedia, storageUploader } from '@/lib/db/media'
import { notifyMakerOfBrief } from '@/lib/notify/maker-email'
import type { BuilderState } from '@/lib/builder/inventory'
import type {
  ClientMessage,
  ConceptRender,
  ConceptVisualRef,
  HandoffBundle,
  LeadProfile,
  MoodBoardItem,
} from '@/lib/types'

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

const PLAN_DISCLAIMER =
  'Schematic generated from the homeowner-confirmed plan and AI-inferred features — not a survey or working drawing. Per-element provenance + confidence on hover.'

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as HandoffRequest
    const brief = body.brief ?? {}
    const moodBoard = body.moodBoard ?? brief.moodBoardItems ?? []
    const transcript = body.transcript ?? []
    const explorationRefs: ConceptVisualRef[] = (body.explorationRefs ?? []).map((r) => ({
      url: r.url,
      prompt: r.prompt,
      reaction: r.reaction,
      illustrativeOnly: true,
    }))

    let floorPlan: HandoffBundle['floorPlan'] = null
    if (hasPlan(brief)) {
      const plan = planFromProfile(brief)
      if (plan) {
        const validated = validate(plan)
        floorPlan = {
          plan: validated,
          // Maker mode: solid lines, provenance shown by the dashboard, not by dashing.
          svg: renderFloorPlanSvg(validated, { mode: 'maker' }),
          disclaimer: PLAN_DISCLAIMER,
        }
      }
    }

    let chosenRender: (ConceptRender & { conceptOnly: true }) | null = null
    if (brief.conceptRenderChosenId && brief.conceptRenders?.length) {
      const found = brief.conceptRenders.find((r) => r.id === brief.conceptRenderChosenId)
      if (found) chosenRender = { ...found, conceptOnly: true as const }
    }

    // Prefer the real BOM the homeowner built in Phase 2; fall back to the
    // budget-band stub only if they never opened the builder.
    let estimate = buildStubEstimate(brief)
    if (estimate) estimate.bandPct = 20
    if (brief.builderState) {
      const bom = computeBom(brief.builderState as BuilderState, undefined, { scope: brief.scope })
      // Headline range is kitchen-only (works); appliances + sink/tap (goods)
      // ride alongside as the all-in figure. Band applies to the works range.
      const hasGoods = bom.sections.goods.high > 0
      estimate = {
        low: bom.sections.works.low,
        high: bom.sections.works.high,
        withAppliances: hasGoods ? { low: bom.total.low, high: bom.total.high } : null,
        basis: `Estimated from your build — ±${Math.round(bom.sections.works.bandWidthPct / 2)}%. An estimate your maker confirms, never a final quote.`,
        placeholder: false,
        bandPct: Math.round(bom.sections.works.bandWidthPct / 2),
      }
      // Maker-only cost basis: same build priced at the maker's B2B account
      // prices. Only attached once the maker has supplied prices; the homeowner
      // figures above stay retail regardless (decision 2026-06-21).
      if (makerPricingEntryCount() > 0) {
        const makerBom = computeBom(brief.builderState as BuilderState, undefined, {
          scope: brief.scope,
          pricing: 'maker',
        })
        estimate.makerCost = { low: makerBom.total.low, high: makerBom.total.high }
      }
    }

    const bundle: HandoffBundle = {
      brief,
      moodBoard,
      floorPlan,
      explorationRefs,
      chosenRender,
      estimate,
      transcript,
      generatedAt: new Date().toISOString(),
    }

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
        const { data: session, error: sErr } = await db
          .from(TABLES.sessions)
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
          session_id: session.id,
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
