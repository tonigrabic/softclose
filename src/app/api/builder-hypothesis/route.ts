/**
 * /api/builder-hypothesis
 *
 * Single structured-output vision call. Input: the chosen render image (data
 * URL) + minimal Phase-1 profile context. Output: BuilderHypothesis covering
 * all 10 component groups with per-field confidence + reason.
 *
 * The Builder UI calls this once on entry, then the user walks through the
 * groups confirming or swapping each pre-filled value.
 */

import { generateText, tool } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import { rateLimit } from '@/lib/rate-limit'
import { decors } from '@/lib/catalog'
import type { BuilderHypothesis } from '@/lib/builder/hypothesis'

const MAX_BYTES_PER_PHOTO = 6 * 1024 * 1024
const MAX_CALLS_PER_SESSION_WINDOW = 4
const SESSION_WINDOW_MS = 30 * 60 * 1000

const confidenceEnum = z.enum(['H', 'M', 'L'])
const layoutShapeEnum = z.enum([
  'galley',
  'l_shape',
  'u_shape',
  'island',
  'peninsula',
  'open',
  'unsure',
])

const hint = <T extends z.ZodTypeAny>(value: T) =>
  z.object({
    value,
    confidence: confidenceEnum,
    reason: z.string().max(120).optional(),
  })

const layoutSchema = z.object({
  shape: hint(layoutShapeEnum).optional(),
  hasIsland: hint(z.boolean()).optional(),
  ceilingHeightCm: hint(z.number().min(200).max(400)).optional(),
  runs: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        lengthCm: hint(z.number().min(80).max(1200)),
        hasBase: hint(z.boolean()).optional(),
        hasWall: hint(z.boolean()).optional(),
        hasTall: hint(z.boolean()).optional(),
      })
    )
    .max(4)
    .optional(),
})

const cabinetPatternEnum = z.enum([
  'doors_shelf',
  'drawer_bank',
  'pullouts_inside_doors',
  'drawer_door_combo',
  'sink_unit',
  'trash_pullout',
  'corner_magic',
  'corner_lazy',
  'oven_housing',
  'pullout_larder',
  'wine_pullout',
  'open_shelves',
])

const cabinetBoxesSchema = z.object({
  carcassMaterial: hint(
    z.enum([
      'white_melamine_standard',
      'colored_melamine',
      'moisture_resistant_p3',
      'matched_to_door',
    ])
  ).optional(),
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
  unitPatterns: z
    .array(
      z.object({
        runId: z.string(),
        positionPctAlongRun: z.number().min(0).max(100),
        pattern: cabinetPatternEnum,
        confidence: confidenceEnum,
      })
    )
    .max(20)
    .optional(),
})

const doorsSchema = z.object({
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
  edge: hint(z.enum(['square', 'bevel', 'mitred_waterfall', 'radius'])).optional(),
})

const backsplashSchema = z.object({
  kind: hint(
    z.enum(['matching_slab', 'tile', 'glass', 'wall_panel', 'painted', 'none'])
  ).optional(),
  decorCode: hint(z.string()).optional(),
  decorStructure: hint(z.string()).optional(),
  heightCm: hint(z.union([z.literal(60), z.literal(90), z.literal(120), z.literal(150)])).optional(),
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
  tallPantry: z
    .object({
      present: hint(z.boolean()),
      runId: z.string().optional(),
    })
    .optional(),
  windowOnRun: z
    .object({
      runId: z.string(),
      widthCm: hint(z.number().min(20).max(400)).optional(),
    })
    .optional(),
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
  underCabinetLed: hint(z.boolean()).optional(),
  plinthLed: hint(z.boolean()).optional(),
  pendantOverIsland: hint(z.boolean()).optional(),
  pendantCount: hint(z.number().int().min(0).max(6)).optional(),
})

const finishingSchema = z.object({
  plinthHeightMm: hint(z.union([z.literal(100), z.literal(120), z.literal(150)])).optional(),
  plinthMaterial: hint(
    z.enum(['matched_door', 'matched_floor', 'black_recessed', 'metal_strip'])
  ).optional(),
  corniceStyle: hint(z.enum(['none', 'flat', 'crown', 'custom_match_door'])).optional(),
})

const hypothesisSchema = z.object({
  usable: z.boolean(),
  summary: z.string().max(200).optional(),
  layout: layoutSchema.optional(),
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

/** Compact catalog hint for the model — code + name + family + tone, no prices. */
const CATALOG_HINT = decors
  .map((d) => `${d.code} ${d.structure} (${d.family}/${d.tone}/${d.finish}): ${d.name}`)
  .join('\n')

const SYSTEM = `You are a kitchen-trade vision assistant analysing an AI-rendered kitchen concept.

Your job: produce a structured BuilderHypothesis covering all 10 component groups so a homeowner can walk through the builder with each value pre-filled.

Rules:
- Return only what you can see or reasonably infer. Skip a field rather than fabricate.
- Confidence is per-field. 'H' only when the visual evidence is unambiguous; 'L' liberally — better empty than wrong.
- For each field include a short \`reason\` (≤ 12 words) referencing the visual evidence ("matte black slab fronts visible", "concrete-textured worktop").
- For decorCode suggestions: pick the closest match from the catalog below. Match family + tone + finish. If nothing close, leave decorCode empty and provide a colorDescription on the doors field.
- For runs: if the render shows an L-shape, return TWO runs (e.g. "main", "return") with separate lengthCm. For galley, return up to TWO runs facing each other. For straight, return ONE.
- Hardware is mostly invisible in renders — set drawerSystemTier confidence 'L' unless handles are clearly visible.
- Appliances: identify integrated vs. freestanding by visible seams. Hob type from cooktop appearance.
  - For fridge / dishwasher: return \`{ present, integrated }\` only if you can actually see them (or a clear integrated front). Skip rather than fabricate. The homeowner may not have either appliance — do not assume presence.
  - microwave / wineFridge / coffeeStation: skip unless visible.
- features: surface room-level facts that don't fit a single group.
  - tallPantry: only if a tall pantry-style cabinet is clearly visible (full-height, not appliance housing). Tie to a runId if you can place it.
  - windowOnRun: pin to the runId carrying the window. widthCm if guessable.
  - corniceVisible: only if a top trim/cornice is rendered.
  - floorColorHint / wallColorHint: short descriptors for the maker ("light oak floor", "off-white walls").
- cabinetBoxes.unitPatterns: pre-segment cabinet patterns along visible runs when possible. Use the trade-language enum (drawer_bank, sink_unit, oven_housing, corner_magic, pullout_larder, etc). Each entry pins one pattern at a positionPctAlongRun (0–100). Skip slots you can't read.
- Lighting: under-cabinet 'H' if a glow is visible under wall units; pendant only if a pendant is rendered.
- Set usable: false if the render is unintelligible (pure noise, completely empty room, wrong room type).

CATALOG (Croatian decors available via Elgrad):
${CATALOG_HINT}`

export async function POST(req: Request) {
  const limit = rateLimit(req, 'builder-hypothesis', MAX_CALLS_PER_SESSION_WINDOW, SESSION_WINDOW_MS)
  if (!limit.ok) {
    return Response.json(
      { error: 'Too many builder calls — please wait a moment.', retryAfterMs: limit.retryAfterMs },
      { status: 429 }
    )
  }

  let body: { renderImage?: string; profile?: Record<string, unknown> }
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

  const profileSummary = JSON.stringify(body.profile ?? {}, null, 2).slice(0, 2000)

  try {
    const result = await generateText({
      model: openai('gpt-5.4-mini'),
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                "Phase-1 profile (homeowner-stated; treat as soft hints, render takes precedence visually):\n" +
                profileSummary +
                "\n\nThe rendered concept image follows. Call inferBuilderHypothesis with structured fields covering every group you can read.",
            },
            dataUrlToImagePart(renderImage),
          ],
        },
      ],
      tools: {
        inferBuilderHypothesis: tool({
          description: 'Return a BuilderHypothesis covering all 10 component groups.',
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
    const message = err instanceof Error ? err.message : 'Builder hypothesis call failed'
    return Response.json({ error: message }, { status: 500 })
  }
}
