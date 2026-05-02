import { renderFloorPlanSvg, hasFloorPlanInput, planInputFromProfile } from '@/lib/floor-plan'
import { buildStubEstimate } from '@/lib/stub-estimate'
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

    const planInput = planInputFromProfile(brief)
    const floorPlan = hasFloorPlanInput(planInput)
      ? {
          svg: renderFloorPlanSvg(planInput),
          disclaimer:
            'Schematic generated from stated layout and AI-inferred features — not a survey or working drawing. Dashed boxes mark low-confidence inferences.',
        }
      : null

    let chosenRender: (ConceptRender & { conceptOnly: true }) | null = null
    if (brief.conceptRenderChosenId && brief.conceptRenders?.length) {
      const found = brief.conceptRenders.find((r) => r.id === brief.conceptRenderChosenId)
      if (found) chosenRender = { ...found, conceptOnly: true as const }
    }

    const estimate = buildStubEstimate(brief)

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
