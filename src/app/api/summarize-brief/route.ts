import { generateText, tool } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import { rateLimit } from '@/lib/rate-limit'
import type { LeadProfile } from '@/lib/types'

const MAX_CALLS_PER_SESSION_WINDOW = 5
const SESSION_WINDOW_MS = 30 * 60 * 1000

const summarySchema = z.object({
  thankYouMessage: z
    .string()
    .min(8)
    .max(160)
    .describe('Warm, brief send-off line. No quoting, no AI references, no emojis.'),
  summaryLines: z
    .array(z.string().min(4).max(140))
    .min(3)
    .max(6)
    .describe(
      'Designer-facing TL;DR bullets. Each line is one trade-grade observation about scope, look, or constraints. No fluff.'
    ),
})

const SYSTEM = `You write a short wrap-up summary of a homeowner kitchen brief.

Output two things:
1. thankYouMessage — one warm sentence to the homeowner, no fluff, no emojis, no AI references.
2. summaryLines — 3–6 short bullets the maker reads to know what they're walking into. Each bullet is trade-grade, single-sentence, fact-based.

Rules:
- Use ONLY the data given. Never fabricate fields, dimensions, or selections that aren't in the profile.
- Skip whole categories that have no data rather than say "unknown".
- Do not give cost estimates or pricing — the cost-model handles that elsewhere.
- Keep each bullet under 140 characters.`

export async function POST(req: Request) {
  const limit = rateLimit(req, 'summarize-brief', MAX_CALLS_PER_SESSION_WINDOW, SESSION_WINDOW_MS)
  if (!limit.ok) {
    return Response.json(
      { error: 'Too many summarise calls — please wait.', retryAfterMs: limit.retryAfterMs },
      { status: 429 }
    )
  }

  let body: { profile?: LeadProfile }
  try {
    body = (await req.json()) as { profile?: LeadProfile }
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.profile) {
    return Response.json({ error: 'Missing profile' }, { status: 400 })
  }

  // Trim noise + heavy fields before sending the profile to the model.
  const slim = slimProfile(body.profile)
  const profileJson = JSON.stringify(slim, null, 2)

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
              text: `Brief data (JSON):\n\n${profileJson}\n\nReturn the wrap-up summary.`,
            },
          ],
        },
      ],
      tools: {
        writeSummary: tool({
          description: 'Return the wrap-up thank-you and summary lines.',
          inputSchema: summarySchema,
        }),
      },
      toolChoice: 'required',
    })

    const toolCall = result.toolCalls[0]
    if (!toolCall) {
      return Response.json({ error: 'No structured result returned' }, { status: 500 })
    }
    return Response.json({ result: toolCall.input })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Summarise call failed'
    return Response.json({ error: message }, { status: 500 })
  }
}

/**
 * Strip noisy / heavy fields (raw photo data URLs, base64 renders) before
 * shipping the profile to the model. Keeps context tight and fast.
 */
function slimProfile(p: LeadProfile): Partial<LeadProfile> {
  const { spacePhotos, conceptRenders, ...rest } = p
  return {
    ...rest,
    // Replace heavy fields with simple presence flags.
    ...(spacePhotos && spacePhotos.length > 0
      ? { spacePhotos: [`<<${spacePhotos.length} photos attached>>`] }
      : {}),
    ...(conceptRenders && conceptRenders.length > 0
      ? {
          conceptRenders: conceptRenders.map((r) => ({
            ...r,
            imageDataUrl: '<<image omitted>>',
          })),
        }
      : {}),
  } as Partial<LeadProfile>
}
