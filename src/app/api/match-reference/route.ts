import { generateText, tool } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import { rateLimit } from '@/lib/rate-limit'
import { MAKER_CATALOG, type CatalogItem } from '@/lib/maker-catalog'

const MAX_CALLS = 12
const WINDOW_MS = 30 * 60 * 1000
const MAX_BYTES = 5 * 1024 * 1024

const categoryEnum = z.enum(['door', 'worktop', 'hardware', 'lighting', 'island'])

const matchSchema = z.object({
  catalogId: z
    .string()
    .describe('ID of the closest catalog item from the provided shortlist. Must be one of the IDs in the candidate list.'),
  confidence: z.enum(['H', 'M', 'L']),
  reasoning: z.string().max(160).describe('One short sentence the maker can read.'),
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
  // AI SDK's ImagePart uses `mediaType` (NOT `mimeType`). Pass the full data
  // URL as `image` — the provider handles decoding.
  const mediaType = dataUrl.match(/^data:([^;]+);/)?.[1] ?? 'image/jpeg'
  return { type: 'image', image: dataUrl, mediaType }
}

export async function POST(req: Request) {
  const limit = rateLimit(req, 'match-reference', MAX_CALLS, WINDOW_MS)
  if (!limit.ok) {
    return Response.json(
      { error: 'Too many match requests — please wait a moment.' },
      { status: 429 }
    )
  }

  let body: { referencePhoto?: string; category?: string }
  try {
    body = (await req.json()) as { referencePhoto?: string; category?: string }
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = categoryEnum.safeParse(body.category)
  if (!parsed.success) {
    return Response.json(
      { error: 'category must be one of: door, worktop, hardware, lighting, island' },
      { status: 400 }
    )
  }
  if (!body.referencePhoto || !body.referencePhoto.startsWith('data:image/')) {
    return Response.json(
      { error: 'Missing or invalid referencePhoto data URL' },
      { status: 400 }
    )
  }
  if (approxBytesOfDataUrl(body.referencePhoto) > MAX_BYTES) {
    return Response.json({ error: 'Reference photo too large (max 5MB)' }, { status: 400 })
  }

  const candidates: CatalogItem[] = MAKER_CATALOG.filter((c) => c.category === parsed.data)
  const candidateList = candidates
    .map((c) => `- id: ${c.id} | title: ${c.title ?? c.id} | tags: ${(c.tags ?? []).join(', ')}`)
    .join('\n')

  try {
    const result = await generateText({
      model: openai('gpt-5.4-mini'),
      system: `You are a kitchen-trade vision assistant. The homeowner uploaded a reference image for a single material slot. Match it to the closest item from the studio catalog shortlist.

Always pick from the shortlist — do not invent IDs. Use confidence H only when the image clearly matches the catalog item; M for plausible matches; L when you're guessing.`,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Category: ${parsed.data}\n\nCandidate catalog items:\n${candidateList}\n\nMatch the reference image to one candidate ID.`,
            },
            dataUrlToImagePart(body.referencePhoto),
          ],
        },
      ],
      tools: {
        match: tool({
          description: 'Return the closest catalog match for the reference image.',
          inputSchema: matchSchema,
        }),
      },
      toolChoice: 'required',
    })

    const toolCall = result.toolCalls[0]
    if (!toolCall) {
      return Response.json({ error: 'No match returned' }, { status: 500 })
    }
    const match = toolCall.input as z.infer<typeof matchSchema>
    const matched = candidates.find((c) => c.id === match.catalogId)
    if (!matched) {
      // Defensive: fall back to first candidate with low confidence.
      return Response.json({
        match: {
          catalogId: candidates[0]?.id,
          confidence: 'L',
          reasoning: 'AI returned an unknown ID; defaulted to the first studio option.',
        },
        item: candidates[0],
      })
    }
    return Response.json({ match, item: matched })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Match failed'
    return Response.json({ error: message }, { status: 500 })
  }
}
