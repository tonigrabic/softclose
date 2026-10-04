import { generateText, tool } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import { rateLimitKey } from '@/lib/rate-limit'
import { apiAccount } from '@/lib/auth/dal'
import { mockAiEnabled, mockDelay } from '@/lib/api/mock'
import { mockSpaceVision } from '@/lib/api/mock-fixtures/space-vision'
import { normalizeVisionRead } from '@/lib/floor-plan/vision-reconcile'
import { providerFailure, unauthorized, AI_UNAVAILABLE } from '@/lib/api/errors'

const MAX_PHOTOS = 4
const MAX_BYTES_PER_PHOTO = 5 * 1024 * 1024 // 5 MB
const MAX_CALLS_PER_SESSION_WINDOW = 6
const SESSION_WINDOW_MS = 30 * 60 * 1000 // 30 minutes — proxy for "session"

const wallSideEnum = z.enum(['top', 'bottom', 'left', 'right'])
const viewTargetEnum = z.enum([
  'top',
  'bottom',
  'left',
  'right',
  'top_left',
  'top_right',
  'bottom_right',
  'bottom_left',
  'unclear',
])
const confidenceEnum = z.enum(['H', 'M', 'L'])

const featurePositionSchema = z.object({
  wall: wallSideEnum,
  positionPct: z.number().min(0).max(100),
  confidence: confidenceEnum,
})

const visionResultSchema = z.object({
  layoutShape: z
    .enum(['single_wall', 'galley', 'l_shape', 'u_shape', 'island', 'peninsula', 'open', 'unsure'])
    .optional(),
  emptyRoom: z
    .boolean()
    .optional()
    .describe('True for a room meant for a kitchen with no cabinets in it yet (keep lookedLikeKitchen true, no wallRuns).'),
  // No upper bound on `photo`: an out-of-range index must not invalidate the
  // whole call — the normaliser drops it.
  photoViews: z
    .array(
      z.object({
        photo: z.number().int().min(1).describe('1-based; matches the "Photo N of M" label before each image.'),
        shows: viewTargetEnum.describe(
          'The wall this photo faces, or the corner it is centred on, in the ONE plan frame. "unclear" if neither.'
        ),
        counterWalls: z
          .array(wallSideEnum)
          .describe('Walls with base cabinets or a worktop visible IN THIS photo (only the walls it shows).'),
        confidence: confidenceEnum,
      })
    )
    .describe('Exactly one entry per photo, in upload order.'),
  hasIsland: z.boolean().optional(),
  lengthCm: z
    .number()
    .min(100)
    .max(1200)
    .optional()
    .describe('Rough longer-run length in cm. Clamp to [100, 1200].'),
  widthCm: z
    .number()
    .min(100)
    .max(1200)
    .optional()
    .describe('Rough shorter-run length in cm. Clamp to [100, 1200].'),
  ceilingHeightCm: z
    .number()
    .min(220)
    .max(360)
    .optional()
    .describe('Rough ceiling height in cm (door tops ≈ 200–210; standard ceiling ≈ 250–280). Only if you can judge it.'),
  wallRuns: z
    .array(
      z.object({
        wall: wallSideEnum,
        spanPct: z
          .object({
            start: z.number().min(0).max(100),
            end: z.number().min(0).max(100),
          })
          .describe('Start and end of this wall run along its edge, 0–100.'),
      })
    )
    .optional(),
  windows: z
    .array(
      z.object({
        wall: wallSideEnum,
        positionPct: z.number().min(0).max(100),
        widthPct: z.number().min(0).max(100),
      })
    )
    .optional(),
  doors: z
    .array(
      z.object({
        wall: wallSideEnum,
        positionPct: z.number().min(0).max(100),
        widthPct: z.number().min(0).max(100),
        swing: z.enum(['in', 'out']).optional(),
      })
    )
    .optional(),
  features: z
    .object({
      sink: featurePositionSchema.optional(),
      hob: featurePositionSchema.optional(),
      fridge: featurePositionSchema.optional(),
      dishwasher: featurePositionSchema.optional(),
      oven: featurePositionSchema
        .optional()
        .describe('Built-in oven, SEPARATE from the hob (under the counter or in a tall column).'),
      hood: featurePositionSchema
        .optional()
        .describe('Extractor / cooker hood over the hob (wall chimney, island, or ceiling).'),
      island: z
        .object({
          positionPct: z.object({
            x: z.number().min(0).max(100),
            y: z.number().min(0).max(100),
          }),
          sizePct: z.object({
            w: z.number().min(0).max(100),
            h: z.number().min(0).max(100),
          }),
        })
        .optional(),
    })
    .optional(),
  styleHints: z
    .array(z.string())
    .optional()
    .describe(
      'Short trade-grade style descriptors visible in the photos (e.g. "shaker doors", "warm wood floor"). Empty if nothing clear.'
    ),
  materialHints: z
    .array(z.string())
    .optional()
    .describe(
      'Short trade-grade material descriptors visible in the photos (e.g. "white quartz worktop", "brushed brass pulls"). Empty if nothing clear.'
    ),
  lookedLikeKitchen: z
    .boolean()
    .describe(
      'False if the photos clearly aren\'t a kitchen (e.g. living room, bedroom, outdoor scene). Triggers a re-upload affordance.'
    ),
  summary: z
    .string()
    .max(140)
    .optional()
    .describe('One short sentence the UI can display: "Looks like a galley with one window."'),
})

function approxBytesOfDataUrl(dataUrl: string): number {
  const base64 = dataUrl.split(',')[1] ?? ''
  return Math.ceil((base64.length * 3) / 4)
}

function dataUrlToImagePart(dataUrl: string): {
  type: 'image'
  image: string
  mediaType: string
} {
  // AI SDK accepts the full data URL as `image`. The `mediaType` field is what
  // the provider reads (NOT `mimeType` — that's the bug we hit before: the
  // provider silently dropped it and OpenAI rejected the bare base64).
  const mediaType = dataUrl.match(/^data:([^;]+);/)?.[1] ?? 'image/jpeg'
  return { type: 'image', image: dataUrl, mediaType }
}

const SYSTEM = `You are a kitchen-trade vision assistant. Look carefully at the photos the homeowner uploaded and call the inferKitchen tool with structured fields.

Rules:
- If the photos clearly are not a kitchen, set lookedLikeKitchen: false and leave most other fields empty.
- Confidence is per-feature. Use 'H' only when you can clearly see and locate the feature. Use 'L' liberally — better dashed-with-? than wrong.
- All photos show the SAME room from different positions. Build ONE plan of it. Frame: the plan seen from above, with the longest wall that carries base cabinets at the TOP; 'left' and 'right' are the walls at the left and right end of the top wall as you face it; 'bottom' faces the top wall. Every positional field, whichever photo you saw it in, uses this one frame. Positional fields use percentages along the room walls.
- photoViews: one entry per photo. 'shows' = the wall the camera faces, or the corner when the shot is centred where two walls meet. 'counterWalls' = the walls with base cabinets or a worktop visible in THAT photo. The same wall seen from two angles is still ONE wall: match the photos by the window, sink, hob, fridge and door. A counter wall seen in ANY photo belongs in wallRuns — wallRuns is the union across the photos, still bounded by layoutShape.
- An empty room meant for a kitchen (no cabinets yet): lookedLikeKitchen true, emptyRoom true, no wallRuns.
- wallRuns: list ONLY walls where you can actually SEE base cabinets / a worktop in at least one photo. Never add a wall you cannot see. The number of walls MUST agree with layoutShape: single_wall = 1 wall, galley = 2 facing walls, l_shape = exactly 2 walls that meet at a corner, u_shape = 3 walls, island/open = the wall(s) you see. A single photo of an L-shaped kitchen shows two runs — do not infer a third or fourth.
- Keep features consistent with openings: a sink under a window sits on the SAME wall as that window.
- Island: only when a free-standing island is clearly visible. Otherwise omit features.island entirely (do not send zeros) and set hasIsland:false.
- Identify EVERY fixed appliance you can see — homeowners often forget these, so be thorough. In particular, report the OVEN and the extractor HOOD as their own features (do not fold them into the hob): the hob is the cooktop surface, the oven is the built-in baking unit (often below the hob or in a tall column), and the hood is the extractor above the hob. Place the hood at the hob's position along its wall.
- For style and material hints, use trade language (shaker, slab, quartz, butcher block, brushed brass, etc.) — short fragments, not sentences.
- Skip a field rather than fabricate it.

Dimensions — be honest about what you can and cannot scale:
- Only output lengthCm / widthCm if you can anchor the scale to a visible reference object whose real-world size is roughly known. Acceptable anchors:
  · cooker / range top width (typically 60, 76, or 90 cm)
  · fridge width (typically 60, 75, 84, or 90 cm)
  · dishwasher width (typically 45 or 60 cm)
  · standard tile pattern (300, 400, 600 mm)
  · a clearly visible measuring tape or ruler.
- If no anchor is visible, omit lengthCm and widthCm. Add a short note in 'summary' explaining you couldn't scale it ("Hard to scale from these — let's set the size together.").
- Do not output dimensions to feel complete. Wrong dimensions cost the homeowner trust in the maker downstream.
- If you do output dimensions, sanity-check against typical room footprints:
  · single_wall: 200–600 cm × 150–500 cm
  · galley:    200–500 cm × 150–280 cm
  · l_shape:   240–600 cm × 200–500 cm
  · u_shape:   240–500 cm × 240–500 cm
  · peninsula: 240–600 cm × 240–500 cm
  · island:    350–800 cm × 300–600 cm
  Outside those bands, omit rather than report.`

export async function POST(req: Request) {
  // Auth first, before the mock short-circuit — "fully protected" must not have
  // an exception you have to remember. These routes spend real money (a render
  // is ~75 s of gpt-image-2) and were open to the internet until now.
  const session = await apiAccount()
  if (!session) return unauthorized()

  let body: { photos?: string[]; locale?: string }
  try {
    body = (await req.json()) as { photos?: string[]; locale?: string }
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const photos = body.photos ?? []
  if (photos.length === 0) {
    return Response.json({ error: 'No photos provided' }, { status: 400 })
  }
  if (photos.length > MAX_PHOTOS) {
    return Response.json(
      { error: `Max ${MAX_PHOTOS} photos per call` },
      { status: 400 }
    )
  }
  for (const p of photos) {
    if (typeof p !== 'string' || !p.startsWith('data:image/')) {
      return Response.json({ error: 'Photos must be image data URLs' }, { status: 400 })
    }
    if (approxBytesOfDataUrl(p) > MAX_BYTES_PER_PHOTO) {
      return Response.json(
        { error: `Each photo must be under ${MAX_BYTES_PER_PHOTO / 1024 / 1024}MB` },
        { status: 400 }
      )
    }
  }

  // Mock-AI mode: the canned read for this many photos, through the same
  // normaliser as a live one, after the body is validated like a live call and
  // before rate limiting, so devs can spam freely.
  if (mockAiEnabled()) {
    await mockDelay()
    return Response.json({ result: normalizeVisionRead(mockSpaceVision(photos.length), photos.length) })
  }
  const limit = rateLimitKey(session.accountId, 'space-vision', MAX_CALLS_PER_SESSION_WINDOW, SESSION_WINDOW_MS)
  if (!limit.ok) {
    return Response.json(
      {
        error: `Too many vision calls — please wait a moment.`,
        retryAfterMs: limit.retryAfterMs,
      },
      { status: 429 }
    )
  }

  const langNote =
    body.locale === 'hr-HR'
      ? "\n\nWrite the 'summary' sentence in Croatian (hr-HR); keep every other field in the schema's English enum values."
      : ''

  try {
    const result = await generateText({
      model: openai('gpt-5.4-mini'),
      system: SYSTEM + langNote,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `${photos.length} photo${photos.length === 1 ? '' : 's'} of ONE kitchen, taken from different positions. Build one plan of the room: layout, dimensions, openings, fixed features, which wall or corner each photo shows, and style/material hints.`,
            },
            // Labelled, so photoViews can say which photo shows what.
            ...photos.flatMap((p, i) => [
              { type: 'text' as const, text: `Photo ${i + 1} of ${photos.length}:` },
              dataUrlToImagePart(p),
            ]),
          ],
        },
      ],
      tools: {
        inferKitchen: tool({
          description: 'Return structured inferences about the kitchen in the photos.',
          inputSchema: visionResultSchema,
        }),
      },
      toolChoice: 'required',
    })

    const toolCall = result.toolCalls[0]
    if (!toolCall) {
      return Response.json({ error: 'No structured result returned' }, { status: 500 })
    }
    // One view per photo, counter walls only where a photo can show them,
    // and dims outside the shape's band dropped (the model is told to omit
    // dims it cannot anchor; we don't trust it). The room step then asks the
    // homeowner to measure anyway — an AI number is only ever a hint.
    const inferred = normalizeVisionRead(toolCall.input, photos.length)

    return Response.json({ result: inferred })
  } catch (err) {
    return Response.json(providerFailure('space-vision', err, AI_UNAVAILABLE), { status: 500 })
  }
}
