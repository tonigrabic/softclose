import { hasPlan, planFromProfile, renderFloorPlanSvg, validate } from '@/lib/floor-plan'
import { buildStubEstimate } from '@/lib/stub-estimate'
import { computeBom } from '@/lib/builder/bom'
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
    if (brief.builderState) {
      const bom = computeBom(brief.builderState as BuilderState)
      estimate = {
        low: bom.total.low,
        high: bom.total.high,
        basis: `Estimated from your build — ±${Math.round(bom.bandWidthPct / 2)}%. An estimate your maker confirms, never a final quote.`,
        placeholder: false,
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
    return Response.json(bundle)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build handoff bundle'
    return Response.json({ error: message }, { status: 500 })
  }
}
