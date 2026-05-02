import { generateText, tool } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import { rateLimit } from '@/lib/rate-limit'
import type { TranslatedField } from '@/lib/types'

const MAX_CHARS_PER_BUCKET = 600
const MAX_CALLS_PER_SESSION_WINDOW = 10
const SESSION_WINDOW_MS = 30 * 60 * 1000

const translatedFieldSchema = z.object({
  trade: z
    .string()
    .min(2)
    .max(120)
    .describe('Concise trade-grade capture the maker reads.'),
  verbatim: z
    .string()
    .max(240)
    .describe('The homeowner\'s original phrase, copied near-verbatim.'),
})

const wishlistSchema = z.object({
  mustHaves: z.array(translatedFieldSchema).max(8).optional(),
  niceToHaves: z.array(translatedFieldSchema).max(8).optional(),
  dealBreakers: z.array(translatedFieldSchema).max(8).optional(),
  applianceNotes: translatedFieldSchema.optional(),
  additionalNotes: translatedFieldSchema.optional(),
})

const SYSTEM = `You translate informal homeowner wishlist text into trade-grade kitchen capture, preserving each item's verbatim phrase for designer cross-check.

Rules:
- Split into discrete items at natural breaks (commas, "and", new sentences). Each item becomes one TranslatedField.
- The "trade" field is short and trade-grade ("deep pan drawers near hob", "soft-close hardware", "no upper cabinets"). NEVER editorialize or upsell.
- The "verbatim" field copies the homeowner's words for THAT item — trim leading/trailing whitespace and connectors but otherwise verbatim.
- If you cannot map a phrase to a concrete trade-grade field, keep it as-is in trade ("just keep it bright and easy to clean") and store the same in verbatim. Do not invent.
- Skip empty buckets entirely rather than emit empty arrays.
- If a single text field has multiple unrelated points, split them.`

interface RequestBody {
  mustHaves?: string
  niceToHaves?: string
  dealBreakers?: string
  applianceNotes?: string
  additionalNotes?: string
}

export async function POST(req: Request) {
  const limit = rateLimit(req, 'translate-wishlist', MAX_CALLS_PER_SESSION_WINDOW, SESSION_WINDOW_MS)
  if (!limit.ok) {
    return Response.json(
      { error: 'Too many translate calls — please wait a moment.', retryAfterMs: limit.retryAfterMs },
      { status: 429 }
    )
  }

  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  for (const v of Object.values(body)) {
    if (typeof v === 'string' && v.length > MAX_CHARS_PER_BUCKET) {
      return Response.json(
        { error: `Each bucket capped at ${MAX_CHARS_PER_BUCKET} chars` },
        { status: 400 }
      )
    }
  }

  const sourcePrompt = [
    body.mustHaves ? `MUST-HAVES (verbatim): ${body.mustHaves.trim()}` : '',
    body.niceToHaves ? `NICE-TO-HAVES (verbatim): ${body.niceToHaves.trim()}` : '',
    body.dealBreakers ? `DEAL-BREAKERS (verbatim): ${body.dealBreakers.trim()}` : '',
    body.applianceNotes ? `APPLIANCE NOTES (verbatim): ${body.applianceNotes.trim()}` : '',
    body.additionalNotes ? `ADDITIONAL (verbatim): ${body.additionalNotes.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  if (!sourcePrompt) {
    // Nothing to translate — return empty result without burning an AI call.
    return Response.json({ result: {} })
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
              text: `Translate each bucket below. Return TranslatedField items per bucket.\n\n${sourcePrompt}`,
            },
          ],
        },
      ],
      tools: {
        translateWishlist: tool({
          description: 'Return per-bucket TranslatedField arrays.',
          inputSchema: wishlistSchema,
        }),
      },
      toolChoice: 'required',
    })

    const toolCall = result.toolCalls[0]
    if (!toolCall) {
      return Response.json({ error: 'No structured result returned' }, { status: 500 })
    }

    const out = toolCall.input as {
      mustHaves?: TranslatedField[]
      niceToHaves?: TranslatedField[]
      dealBreakers?: TranslatedField[]
      applianceNotes?: TranslatedField
      additionalNotes?: TranslatedField
    }
    return Response.json({ result: out })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Translate call failed'
    return Response.json({ error: message }, { status: 500 })
  }
}
