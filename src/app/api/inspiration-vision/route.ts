import { generateText, tool } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import { rateLimit } from '@/lib/rate-limit'

const MAX_PHOTOS = 6
const MAX_BYTES_PER_PHOTO = 5 * 1024 * 1024
const MAX_CALLS_PER_SESSION_WINDOW = 8
const SESSION_WINDOW_MS = 30 * 60 * 1000

const STYLE_VALUES = [
  'modern_minimal',
  'warm_shaker',
  'industrial',
  'transitional',
  'bold_dark',
  'natural_organic',
] as const

const DOOR_VALUES = ['slab', 'shaker', 'beaded_inset', 'glass_front', 'mixed'] as const
const WORKTOP_VALUES = [
  'quartz',
  'marble',
  'quartzite',
  'granite',
  'butcher_block',
  'concrete',
  'stainless',
  'soapstone',
] as const
const BACKSPLASH_VALUES = [
  'subway_tile',
  'zellige',
  'mosaic',
  'slab_match',
  'painted',
  'none',
] as const
const HARDWARE_VALUES = [
  'warm_brass',
  'brushed_nickel',
  'matte_black',
  'mixed',
  'none_visible',
] as const

export interface InspirationVisionResult {
  styleGuess?: (typeof STYLE_VALUES)[number]
  doorMaterialGuess?: (typeof DOOR_VALUES)[number]
  worktopGuess?: (typeof WORKTOP_VALUES)[number]
  backsplashGuess?: (typeof BACKSPLASH_VALUES)[number]
  hardwareTierGuess?: (typeof HARDWARE_VALUES)[number]
  styleHints?: string[]
  materialHints?: string[]
  paletteHints?: string[]
  summary?: string
}

const inspirationSchema = z.object({
  styleGuess: z.enum(STYLE_VALUES).optional(),
  doorMaterialGuess: z.enum(DOOR_VALUES).optional(),
  worktopGuess: z.enum(WORKTOP_VALUES).optional(),
  backsplashGuess: z.enum(BACKSPLASH_VALUES).optional(),
  hardwareTierGuess: z.enum(HARDWARE_VALUES).optional(),
  styleHints: z
    .array(z.string())
    .max(5)
    .optional()
    .describe('Short trade-grade style descriptors visible across the references.'),
  materialHints: z
    .array(z.string())
    .max(5)
    .optional()
    .describe('Short trade-grade material descriptors (e.g. "veined quartz", "brushed brass").'),
  paletteHints: z
    .array(z.string())
    .max(5)
    .optional()
    .describe('Color/palette notes (e.g. "warm cream + black", "deep navy + brass").'),
  summary: z
    .string()
    .max(160)
    .optional()
    .describe('One short sentence describing the direction the homeowner is leaning.'),
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
  const mediaType = dataUrl.match(/^data:([^;]+);/)?.[1] ?? 'image/jpeg'
  return { type: 'image', image: dataUrl, mediaType }
}

function urlToImagePart(url: string): { type: 'image'; image: string } {
  return { type: 'image', image: url }
}

const SYSTEM = `You are a kitchen-trade vision assistant. The homeowner has picked one or more inspiration references (uploaded photos or web images) and optionally tagged a high-level style direction. Read what they're actually drawn to and return structured trade-grade guesses.

Rules:
- Pick the SINGLE strongest read for each guess field. Skip a field rather than fabricate it.
- Use the exact enum values listed in the schema.
- Style hints, material hints, palette hints: 2–5 words each, trade language (shaker, slab, veined quartz, brushed brass, warm cream, etc.).
- summary: one sentence the UI shows back to the homeowner ("Looks like you're leaning warm shaker, painted soft white, brushed brass.").
- The homeowner-tagged styles are a STRONG signal. If they tagged "warm_shaker" and the references look modern, treat their tag as the dominant signal and add a note in the summary that the references diverge.
- If they tagged a style but uploaded NO reference photos, you can still emit guesses driven by the tag alone; just keep confidence implicit by skipping the more specific fields (worktop, backsplash) and leaning on hints + summary.`

export async function POST(req: Request) {
  const limit = rateLimit(req, 'inspiration-vision', MAX_CALLS_PER_SESSION_WINDOW, SESSION_WINDOW_MS)
  if (!limit.ok) {
    return Response.json(
      { error: 'Too many vision calls — please wait a moment.', retryAfterMs: limit.retryAfterMs },
      { status: 429 }
    )
  }

  let body: {
    referencePhotos?: string[]
    referenceUrls?: string[]
    selectedStyles?: string[]
    spaceSummary?: string
  }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const photos = (body.referencePhotos ?? []).slice(0, MAX_PHOTOS)
  const urls = (body.referenceUrls ?? []).slice(0, MAX_PHOTOS)
  const selectedStyles = body.selectedStyles ?? []

  if (photos.length === 0 && urls.length === 0 && selectedStyles.length === 0) {
    return Response.json(
      { error: 'Provide at least one reference photo, URL, or selected style.' },
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

  const userParts: Array<
    { type: 'text'; text: string } | { type: 'image'; image: string; mediaType?: string }
  > = []
  const tagsLine = selectedStyles.length
    ? `Homeowner tagged styles: ${selectedStyles.join(', ')}.`
    : 'Homeowner did not tag any pre-set style.'
  const spaceLine = body.spaceSummary
    ? `Their existing space: ${body.spaceSummary}`
    : ''
  userParts.push({
    type: 'text',
    text: `${tagsLine}${spaceLine ? `\n${spaceLine}` : ''}\n\nReferences follow.`,
  })
  for (const p of photos) userParts.push(dataUrlToImagePart(p))
  for (const u of urls) userParts.push(urlToImagePart(u))

  try {
    const result = await generateText({
      model: openai('gpt-5.4-mini'),
      system: SYSTEM,
      messages: [{ role: 'user', content: userParts }],
      tools: {
        readInspiration: tool({
          description: 'Return structured trade-grade guesses about the homeowner\'s direction.',
          inputSchema: inspirationSchema,
        }),
      },
      toolChoice: 'required',
    })
    const toolCall = result.toolCalls[0]
    if (!toolCall) {
      return Response.json({ error: 'No structured result returned' }, { status: 500 })
    }
    return Response.json({ result: toolCall.input as InspirationVisionResult })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Vision call failed'
    return Response.json({ error: message }, { status: 500 })
  }
}
