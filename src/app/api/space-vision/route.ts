import { generateText, tool } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import { rateLimit } from '@/lib/rate-limit'
import type { SpaceVisionResult } from '@/lib/types'

const MAX_PHOTOS = 4
const MAX_BYTES_PER_PHOTO = 5 * 1024 * 1024 // 5 MB
const MAX_CALLS_PER_SESSION_WINDOW = 6
const SESSION_WINDOW_MS = 30 * 60 * 1000 // 30 minutes — proxy for "session"

const wallSideEnum = z.enum(['top', 'bottom', 'left', 'right'])
const confidenceEnum = z.enum(['H', 'M', 'L'])

const featurePositionSchema = z.object({
  wall: wallSideEnum,
  positionPct: z.number().min(0).max(100),
  confidence: confidenceEnum,
})

const visionResultSchema = z.object({
  layoutShape: z
    .enum(['galley', 'l_shape', 'u_shape', 'island', 'peninsula', 'open', 'unsure'])
    .optional(),
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
- Positional fields use percentages along the room walls. Treat the longer wall run as 'top' (or 'bottom') and the shorter as 'left'/'right'.
- For dimensions, give your best rough guess in cm. Be conservative; do not invent precision. Skip rather than guess wildly.
- For style and material hints, use trade language (shaker, slab, quartz, butcher block, brushed brass, etc.) — short fragments, not sentences.
- Skip a field rather than fabricate it.`

export async function POST(req: Request) {
  const limit = rateLimit(req, 'space-vision', MAX_CALLS_PER_SESSION_WINDOW, SESSION_WINDOW_MS)
  if (!limit.ok) {
    return Response.json(
      {
        error: `Too many vision calls — please wait a moment.`,
        retryAfterMs: limit.retryAfterMs,
      },
      { status: 429 }
    )
  }

  let body: { photos?: string[] }
  try {
    body = (await req.json()) as { photos?: string[] }
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
              text: 'Here are the photos of my kitchen. Please infer layout, dimensions, openings, fixed features, and style/material hints.',
            },
            ...photos.map(dataUrlToImagePart),
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
    const inferred = toolCall.input as SpaceVisionResult

    // Light dimension clamping defense-in-depth (model is also told to clamp).
    if (inferred.lengthCm && (inferred.lengthCm < 100 || inferred.lengthCm > 1200)) {
      inferred.lengthCm = undefined
    }
    if (inferred.widthCm && (inferred.widthCm < 100 || inferred.widthCm > 1200)) {
      inferred.widthCm = undefined
    }

    return Response.json({ result: inferred })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Vision call failed'
    return Response.json({ error: message }, { status: 500 })
  }
}
