/**
 * /api/builder-hypothesis
 *
 * Single structured-output vision call. Input: the chosen render image (data
 * URL) + a few short homeowner preference ids (`DecorProfileHints`). Output:
 * BuilderHypothesis with per-field confidence + reason.
 *
 * Decor only since IMP-32: finishes, materials, appliance types. The layout is
 * fixed and measured by the homeowner at the room step, so this call gets no
 * plan, no layout contract and no anchor photo, and its schema has no layout
 * fields. The client also projects any stored read through `decorHypothesis`.
 *
 * The Builder UI calls this once on entry, then the user walks through the
 * groups confirming or swapping each pre-filled value.
 */

import { generateText, tool } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import { rateLimitKey } from '@/lib/rate-limit'
import { decors } from '@/lib/catalog'
import { apiAccount } from '@/lib/auth/dal'
import { mockAiEnabled, mockDelay } from '@/lib/api/mock'
import { mockHypothesis } from '@/lib/api/mock-fixtures/builder-hypothesis'
import type { BuilderHypothesis } from '@/lib/builder/hypothesis'
import { sanitizeDecorProfileHints } from '@/lib/api/decor-profile-hints'
import { providerFailure, unauthorized, AI_UNAVAILABLE } from '@/lib/api/errors'

const MAX_BYTES_PER_PHOTO = 6 * 1024 * 1024
const MAX_CALLS_PER_SESSION_WINDOW = 4
const SESSION_WINDOW_MS = 30 * 60 * 1000

/**
 * Vision model for the render read. It ran on the full model because the read
 * used to drive cabinet seeding; since IMP-32 it reads decor only, and the
 * model choice is left to IMP-23. Swap here.
 */
const LAYOUT_MODEL = 'gpt-5.4'

const confidenceEnum = z.enum(['H', 'M', 'L'])

const hint = <T extends z.ZodTypeAny>(value: T) =>
  z.object({
    value,
    confidence: confidenceEnum,
    reason: z.string().max(120).optional(),
  })

const cabinetBoxesSchema = z.object({
  carcassMaterial: hint(z.enum(['white_melamine_standard', 'colored_melamine'])).optional(),
  cornerSolution: hint(
    z.enum(['magic_corner', 'lazy_susan', 'diagonal_corner', 'dead_corner', 'none'])
  ).optional(),
  unitCounts: z
    .object({
      base: hint(z.number().int().min(0).max(20)).optional(),
      wall: hint(z.number().int().min(0).max(20)).optional(),
      tall: hint(z.number().int().min(0).max(6)).optional(),
    })
    .optional(),
})

const doorsSchema = z.object({
  material: hint(z.enum(['iveral', 'lacquered_mdf', 'alu_glass'])).optional(),
  profile: hint(z.enum(['flat', 'inset', 'relief'])).optional(),
  style: hint(
    z.enum(['slab', 'shaker', 'handleless_jpull', 'handleless_groove', 'glass_front', 'beaded'])
  ).optional(),
  decorCode: hint(z.string()).optional(),
  decorStructure: hint(z.string()).optional(),
  overlay: hint(z.enum(['full', 'partial', 'inset'])).optional(),
  edgeProfile: hint(z.enum(['square', 'softened', 'bevel', 'radius'])).optional(),
  colorDescription: z.string().max(120).optional(),
})

const worktopSchema = z.object({
  family: hint(
    z.enum(['laminate', 'compact', 'quartz', 'sintered_stone', 'solid_wood', 'stainless'])
  ).optional(),
  decorCode: hint(z.string()).optional(),
  decorStructure: hint(z.string()).optional(),
  thicknessMm: hint(z.union([z.literal(38), z.literal(20), z.literal(12)])).optional(),
})

const backsplashSchema = z.object({
  kind: hint(z.enum(['matching_slab', 'tile', 'glass', 'other', 'none'])).optional(),
})

const hardwareSchema = z.object({
  drawerSystemTier: hint(z.enum(['budget', 'mid', 'premium'])).optional(),
  hingeType: hint(z.enum(['soft_close', 'standard', 'push_to_open'])).optional(),
  handleStyle: hint(
    z.enum(['integrated_jpull', 'integrated_groove', 'pull_bar', 'knob', 'cup_pull'])
  ).optional(),
  handleFinish: hint(
    z.enum(['matte_black', 'brushed_steel', 'brass', 'chrome', 'matched_to_door'])
  ).optional(),
})

const appliancesSchema = z.object({
  hob: hint(z.enum(['induction', 'gas', 'ceramic', 'unknown'])).optional(),
  oven: hint(z.enum(['single', 'double', 'combi', 'unknown'])).optional(),
  extractor: hint(
    z.enum(['chimney', 'island', 'downdraft', 'recirculating', 'ceiling_recessed', 'unknown'])
  ).optional(),
  fridge: z
    .object({
      present: hint(z.boolean()),
      integrated: hint(z.boolean()).optional(),
    })
    .optional(),
  dishwasher: z
    .object({
      present: hint(z.boolean()),
      integrated: hint(z.boolean()).optional(),
    })
    .optional(),
  microwave: hint(
    z.object({
      present: z.boolean(),
      integrated: z.boolean().optional(),
    })
  ).optional(),
  wineFridge: hint(z.boolean()).optional(),
  coffeeStation: hint(z.boolean()).optional(),
})

const featuresSchema = z.object({
  openShelving: hint(z.boolean()).optional(),
  corniceVisible: hint(z.boolean()).optional(),
  floorColorHint: z.string().max(120).optional(),
  wallColorHint: z.string().max(120).optional(),
})

const sinkTapsSchema = z.object({
  sinkBowls: hint(z.enum(['single', 'one_and_half', 'double'])).optional(),
  sinkMount: hint(z.enum(['undermount', 'inset', 'flush', 'belfast'])).optional(),
  sinkMaterial: hint(z.enum(['stainless', 'granite_composite', 'ceramic', 'fragranite'])).optional(),
  tapType: hint(z.enum(['single_lever', 'pull_out', 'boiling_water', 'filtered_three_way'])).optional(),
  tapFinish: hint(
    z.enum(['matte_black', 'brushed_steel', 'brass', 'chrome', 'matched_to_door'])
  ).optional(),
})

const lightingSchema = z.object({
  led: hint(z.boolean()).optional(),
})

const finishingSchema = z.object({
  plinthHeightMm: hint(z.union([z.literal(100), z.literal(150)])).optional(),
  plinthMaterial: hint(z.enum(['wood', 'plastic'])).optional(),
})

const hypothesisSchema = z.object({
  usable: z.boolean(),
  summary: z.string().max(200).optional(),
  cabinetBoxes: cabinetBoxesSchema.optional(),
  doors: doorsSchema.optional(),
  worktop: worktopSchema.optional(),
  backsplash: backsplashSchema.optional(),
  hardware: hardwareSchema.optional(),
  appliances: appliancesSchema.optional(),
  sinkTaps: sinkTapsSchema.optional(),
  lighting: lightingSchema.optional(),
  finishing: finishingSchema.optional(),
  features: featuresSchema.optional(),
})

function approxBytesOfDataUrl(dataUrl: string): number {
  const base64 = dataUrl.split(',')[1] ?? ''
  return Math.ceil((base64.length * 3) / 4)
}

function dataUrlToImagePart(dataUrl: string) {
  const mediaType = dataUrl.match(/^data:([^;]+);/)?.[1] ?? 'image/jpeg'
  return { type: 'image' as const, image: dataUrl, mediaType }
}

/**
 * Assemble the user message for the hypothesis call. Pure (no I/O) so it can be
 * unit-tested. One image: the render. No anchor photo (it is the old kitchen,
 * and it only ever served the layout read) and no layout text: the layout is
 * fixed and measured, and the SYSTEM prompt says so. Returns the AI-SDK
 * `messages` array.
 */
export function buildHypothesisMessages(args: { renderImage: string; profileSummary: string }) {
  const { renderImage, profileSummary } = args
  const content: Array<
    { type: 'text'; text: string } | ReturnType<typeof dataUrlToImagePart>
  > = [
    {
      type: 'text',
      text:
        "Homeowner's stated preferences (soft hints only; where the render clearly shows a finish, the render wins):\n" +
        profileSummary +
        '\n\nThe rendered concept image follows. Read finishes, materials and appliance types from it.' +
        ' Call inferBuilderHypothesis with structured fields covering every group you can read.',
    },
    dataUrlToImagePart(renderImage),
  ]
  return [{ role: 'user' as const, content }]
}

/** Compact catalog hint for the model — code + name + family + tone, no prices. */
const CATALOG_HINT = decors
  .map((d) => `${d.code} ${d.structure} (${d.family}/${d.tone}/${d.finish}): ${d.name}`)
  .join('\n')

const SYSTEM = `You are a kitchen-trade vision assistant analysing an AI-rendered kitchen concept.

Your job: produce a structured BuilderHypothesis covering every component group so a homeowner can walk through the builder with each value pre-filled.

You receive ONE image: the RENDER, a concept of the intended new kitchen. Read finishes, materials and appliance types from it: fronts, worktop, backsplash, handles, sink and taps, lighting, plinth, carcass colour, which appliances are there and whether they are integrated.

The layout is fixed and measured. The homeowner measured the room and set which walls carry cabinets, their lengths, the island, uppers, tall units and where the sink and hob sit, before this render was made. Do not report the layout: no shape, no runs, no island, no cabinet positions, no tall units, no windows. The render is a concept and may not match the measured room; that is expected and not your concern.

Rules:
- Return only what you can see or reasonably infer. Skip a field rather than fabricate.
- Confidence is per-field. 'H' only when the visual evidence is unambiguous; 'L' liberally — better empty than wrong.
- For each field include a short \`reason\` (≤ 12 words) referencing the visual evidence ("matte black slab fronts visible", "concrete-textured worktop").
- doors.material: 'lacquered_mdf' when the fronts look painted/lacquered — one solid colour, often with an inset panel or a routed relief; 'iveral' for melamine decors (wood grain, stone print, plain flat slabs); 'alu_glass' only when most fronts are aluminium-framed glass. doors.profile only for lacquered_mdf: 'flat', 'inset' (frame around a recessed panel, shaker) or 'relief' (routed decorative profile).
- For decorCode suggestions: pick the closest match from the catalog below. Match family + tone + finish. If nothing close, leave decorCode empty and provide a colorDescription on the doors field.
- Layout is fixed and measured: report only finishes, materials and appliance types. Never guess cabinet counts, positions or the corner solution; skip those fields.
- Hardware is mostly invisible in renders — set drawerSystemTier confidence 'L' unless handles are clearly visible.
- Appliances: identify integrated vs. freestanding by visible seams. Hob type from cooktop appearance.
  - For fridge / dishwasher: return \`{ present, integrated }\` only if you can actually see them (or a clear integrated front). Skip rather than fabricate. The homeowner may not have either appliance — do not assume presence.
  - microwave / wineFridge / coffeeStation: skip unless visible.
- features: surface finish-level facts that don't fit a single group.
  - corniceVisible: only if a top trim/cornice is rendered.
  - floorColorHint / wallColorHint: short descriptors for the maker ("light oak floor", "off-white walls").
- Lighting: led = true 'H' only if built-in LED light is visible (a glow under wall units, in shelves or the plinth). Pendants and ceiling lights don't count.
- backsplash.kind: 'matching_slab' when the wall behind the worktop is in the worktop's decor; 'other' for panels, slats or paint.
- Set usable: false if the render is unintelligible (pure noise, completely empty room, wrong room type).

CATALOG (Croatian decors available via Elgrad):
${CATALOG_HINT}`

export async function POST(req: Request) {
  // Auth first, before the mock short-circuit — "fully protected" must not have
  // an exception you have to remember. These routes spend real money (a render
  // is ~75 s of gpt-image-2) and were open to the internet until now.
  const session = await apiAccount()
  if (!session) return unauthorized()

  // Mock-AI mode: the decor hypothesis fixture. The request carries no layout
  // any more, and the client projects the read through `decorHypothesis` once
  // the room is measured, so the fixture's layout fields never reach the tally.
  if (mockAiEnabled()) {
    await mockDelay(800)
    return Response.json({ hypothesis: mockHypothesis(null) })
  }
  const limit = rateLimitKey(session.accountId, 'builder-hypothesis', MAX_CALLS_PER_SESSION_WINDOW, SESSION_WINDOW_MS)
  if (!limit.ok) {
    return Response.json(
      { error: 'Too many builder calls — please wait a moment.', retryAfterMs: limit.retryAfterMs },
      { status: 429 }
    )
  }

  let body: {
    renderImage?: string
    hints?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const renderImage = body.renderImage
  if (!renderImage || typeof renderImage !== 'string' || !renderImage.startsWith('data:image/')) {
    return Response.json({ error: 'renderImage must be an image data URL' }, { status: 400 })
  }
  if (approxBytesOfDataUrl(renderImage) > MAX_BYTES_PER_PHOTO) {
    return Response.json(
      { error: `Image must be under ${MAX_BYTES_PER_PHOTO / 1024 / 1024}MB` },
      { status: 400 }
    )
  }

  // Client-supplied and interpolated into the prompt: whitelisted, short ids only.
  const profileSummary = JSON.stringify(sanitizeDecorProfileHints(body.hints), null, 2)

  try {
    const result = await generateText({
      model: openai(LAYOUT_MODEL),
      system: SYSTEM,
      messages: buildHypothesisMessages({ renderImage, profileSummary }),
      tools: {
        inferBuilderHypothesis: tool({
          description: 'Return a BuilderHypothesis covering the finish, material and appliance groups.',
          inputSchema: hypothesisSchema,
        }),
      },
      toolChoice: 'required',
    })

    const toolCall = result.toolCalls[0]
    if (!toolCall) {
      return Response.json({ error: 'No structured result returned' }, { status: 500 })
    }
    const hypothesis = toolCall.input as BuilderHypothesis
    return Response.json({ hypothesis })
  } catch (err) {
    return Response.json(providerFailure('builder-hypothesis', err, AI_UNAVAILABLE), { status: 500 })
  }
}
