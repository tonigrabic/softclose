import { generateText, tool } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import { rateLimitKey } from '@/lib/rate-limit'
import { apiAccount } from '@/lib/auth/dal'
import { mockAiEnabled, mockDelay } from '@/lib/api/mock'
import { MOCK_SUMMARY } from '@/lib/api/mock-fixtures/summarize-brief'
import type { LeadProfile } from '@/lib/types'
import { providerFailure, unauthorized, AI_UNAVAILABLE } from '@/lib/api/errors'

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
  // Auth first, before the mock short-circuit — "fully protected" must not have
  // an exception you have to remember. These routes spend real money (a render
  // is ~75 s of gpt-image-2) and were open to the internet until now.
  const session = await apiAccount()
  if (!session) return unauthorized()

  // Mock-AI mode: canned fixture before rate limiting, so devs can spam freely.
  if (mockAiEnabled()) {
    await mockDelay()
    return Response.json({ result: MOCK_SUMMARY })
  }
  const limit = rateLimitKey(session.accountId, 'summarize-brief', MAX_CALLS_PER_SESSION_WINDOW, SESSION_WINDOW_MS)
  if (!limit.ok) {
    return Response.json(
      { error: 'Too many summarise calls — please wait.', retryAfterMs: limit.retryAfterMs },
      { status: 429 }
    )
  }

  let body: { profile?: LeadProfile; locale?: string }
  try {
    body = (await req.json()) as { profile?: LeadProfile; locale?: string }
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.profile) {
    return Response.json({ error: 'Missing profile' }, { status: 400 })
  }

  // Trim noise + heavy fields before sending the profile to the model.
  const slim = slimProfile(body.profile)
  const profileJson = JSON.stringify(slim, null, 2)

  // Both fields land on the homeowner's wrap-up, so they follow the UI locale
  // (as space-vision's summary does). The profile's values are English enum
  // ids; without this the model writes English and quotes them ("slab").
  const langNote =
    body.locale === 'hr-HR'
      ? "\n- Write thankYouMessage and every summaryLines bullet in Croatian (hr-HR). Address the homeowner as \"ti\", never \"vi\" — the rest of the UI does. Use Croatian kitchen-trade vocabulary: fronte, korpus, radna ploča, zidna obloga, okovi, sudoper, napa, ugradbeni uređaji, spoj pod kutom (not \"mitre\"), J-ručka (not \"J-pull\"). The data's enum values are English ids — translate them, never quote them (\"ravne fronte\", not \"slab\")."
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
      // Seen once in a real run (2026-09-19) with nothing in the server log —
      // log the model's text so the next occurrence is diagnosable.
      console.error('[summarize-brief] no tool call; finishReason=%s text=%s', result.finishReason, result.text.slice(0, 300))
      return Response.json({ error: 'No structured result returned' }, { status: 500 })
    }
    return Response.json({ result: toolCall.input })
  } catch (err) {
    return Response.json(providerFailure('summarize-brief', err, AI_UNAVAILABLE), { status: 500 })
  }
}

/**
 * Strip noisy / heavy fields before shipping the profile to the model.
 *
 * Not just `spacePhotos` and `conceptRenders[].imageDataUrl`: every render also
 * carries an `inputs` manifest (anchor photo, style refs, previous render) as
 * base64 data URLs — several MB that the old shallow strip let through. That is
 * the most likely cause of the intermittent 500 seen on the real path
 * (2026-09-19). Walk the whole object and replace any data: URL string.
 *
 * Once there is a builder state, the inspiration-photo guesses go too: the
 * builder is what the homeowner chose, and the wrap-up rows next to this
 * summary show the builder picks (lib/builder/pick-labels). A bullet saying
 * "shaker" beside a row saying slab would contradict it.
 */
const PHOTO_GUESS_FIELDS = ['doorMaterial', 'worktopPreference', 'backsplashPreference', 'hardwareTier'] as const

function slimProfile(p: LeadProfile): Partial<LeadProfile> {
  const { spacePhotos, ...rest } = p
  if (rest.builderState) for (const k of PHOTO_GUESS_FIELDS) delete rest[k]
  const slim = stripDataUrls(rest) as Partial<LeadProfile>
  if (spacePhotos && spacePhotos.length > 0) {
    slim.spacePhotos = [`<<${spacePhotos.length} photos attached>>`]
  }
  return slim
}

function stripDataUrls(value: unknown): unknown {
  if (typeof value === 'string') return value.startsWith('data:') ? '<<image omitted>>' : value
  if (Array.isArray(value)) return value.map(stripDataUrls)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = stripDataUrls(v)
    return out
  }
  return value
}
