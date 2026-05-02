import { generateImage } from 'ai'
import { openai } from '@ai-sdk/openai'
import { rateLimit } from '@/lib/rate-limit'

const MAX_RENDERS_PER_SESSION = 5
const SESSION_WINDOW_MS = 30 * 60 * 1000
const MAX_BYTES = 5 * 1024 * 1024
const MODEL_VERSION = 'gpt-image-1'

interface RenderRequest {
  anchorPhoto?: string
  style?: string
  doorMaterial?: string
  worktopPreference?: string
  backsplashPreference?: string
  hardwareTier?: string
  hardwareBrand?: string
  cabinetConstruction?: string
  appliancesIntegrated?: string
  scopeNotes?: string
  visionSummary?: string
  styleHints?: string[]
  materialHints?: string[]
  nudges?: string[]
  previousRenderId?: string
}

const STYLE_LANGUAGE: Record<string, string> = {
  modern_minimal: 'modern minimalist, handleless slab cabinetry, calm neutral palette, very clean lines',
  warm_shaker: 'warm shaker style, painted shaker doors, brushed brass hardware, warm wood tones',
  industrial: 'industrial style, dark cabinets, exposed brick or steel accents, brushed black or steel hardware',
  transitional: 'transitional style, balance of traditional and modern, soft neutrals, elegant proportions',
  bold_dark: 'bold dark cabinetry, deep navy or charcoal, contrasting brass or matte-black hardware',
  natural_organic: 'natural organic style, light wood tones, soft greens, hand-finished materials',
}

const MATERIAL_LANGUAGE: Record<string, string> = {
  // Door
  shaker_painted: 'painted shaker cabinet doors',
  slab: 'flat slab cabinet doors',
  solid_wood: 'solid wood cabinet doors',
  veneer: 'wood veneer cabinet doors',
  thermofoil: 'thermofoil cabinet doors',
  glass_front: 'glass-front upper cabinets',
  // Worktop
  quartz: 'quartz worktops',
  quartzite: 'quartzite worktops',
  marble: 'marble worktops',
  granite: 'granite worktops',
  sintered_stone: 'sintered stone worktops',
  laminate: 'laminate worktops',
  // Backsplash
  tile: 'tiled backsplash',
  painted: 'painted backsplash',
  glass: 'glass backsplash',
  // Hardware tier
  premium: 'premium-feel hardware (Blum / Hafele class)',
  mid_tier: 'mid-range hardware',
  budget: 'budget hardware',
}

function describe(key: string | undefined, dict: Record<string, string>): string | null {
  if (!key) return null
  return dict[key] ?? key.replace(/_/g, ' ')
}

function buildPrompt(req: RenderRequest): string {
  const stylePhrase = describe(req.style, STYLE_LANGUAGE)
  const door = describe(req.doorMaterial, MATERIAL_LANGUAGE)
  const worktop = describe(req.worktopPreference, MATERIAL_LANGUAGE)
  const backsplash = describe(req.backsplashPreference, MATERIAL_LANGUAGE)
  const hardware = describe(req.hardwareTier, MATERIAL_LANGUAGE)

  const parts: string[] = [
    'Reimagine this kitchen as a photorealistic concept render.',
    'Keep the same room footprint, wall positions, window/door locations, and approximate camera angle as the source photo — only change the kitchen itself.',
  ]
  if (req.visionSummary) parts.push(`Existing space note: ${req.visionSummary}.`)
  if (stylePhrase) parts.push(`Style direction: ${stylePhrase}.`)
  const materials = [door, worktop, backsplash, hardware].filter(Boolean).join('; ')
  if (materials) parts.push(`Materials: ${materials}.`)
  if (req.cabinetConstruction && req.cabinetConstruction !== 'unsure') {
    parts.push(`Cabinet construction: ${req.cabinetConstruction.replace(/_/g, ' ')}.`)
  }
  if (req.appliancesIntegrated && req.appliancesIntegrated !== 'unsure') {
    parts.push(
      req.appliancesIntegrated === 'integrated'
        ? 'Appliances are integrated behind cabinet panels.'
        : req.appliancesIntegrated === 'freestanding'
          ? 'Appliances are freestanding.'
          : 'Mix of integrated and freestanding appliances.'
    )
  }
  if (req.scopeNotes) parts.push(`Scope notes: ${req.scopeNotes}.`)
  if (req.nudges && req.nudges.length > 0) {
    parts.push(`Adjust this iteration: ${req.nudges.join(', ')}.`)
  }
  parts.push(
    'Soft natural daylight, eye-level view, no text, no watermarks, no people. This is a concept render for discussion — not a literal commitment.'
  )
  return parts.join(' ')
}

function approxBytesOfDataUrl(dataUrl: string): number {
  const base64 = dataUrl.split(',')[1] ?? ''
  return Math.ceil((base64.length * 3) / 4)
}

export async function POST(req: Request) {
  const limit = rateLimit(req, 'render-concept', MAX_RENDERS_PER_SESSION, SESSION_WINDOW_MS)
  if (!limit.ok) {
    return Response.json(
      {
        error: `You've used your ${MAX_RENDERS_PER_SESSION} concept renders for this session — your designer can keep iterating with you on follow-up.`,
        retryAfterMs: limit.retryAfterMs,
      },
      { status: 429 }
    )
  }

  let body: RenderRequest
  try {
    body = (await req.json()) as RenderRequest
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.anchorPhoto || !body.anchorPhoto.startsWith('data:image/')) {
    return Response.json({ error: 'Missing or invalid anchorPhoto' }, { status: 400 })
  }
  if (approxBytesOfDataUrl(body.anchorPhoto) > MAX_BYTES) {
    return Response.json({ error: 'Anchor photo too large (max 5MB)' }, { status: 400 })
  }

  const prompt = buildPrompt(body)
  const id = `render-${Date.now()}-${Math.floor(Math.random() * 1e6)}`

  try {
    const { image } = await generateImage({
      model: openai.image(MODEL_VERSION),
      prompt: {
        text: prompt,
        images: [body.anchorPhoto],
      },
      size: '1024x1024',
    })

    const dataUrl = `data:${image.mediaType};base64,${image.base64}`
    return Response.json({
      id,
      imageDataUrl: dataUrl,
      prompt,
      modelVersion: MODEL_VERSION,
      nudges: body.nudges ?? [],
      generatedAt: new Date().toISOString(),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Render failed'
    // Surface the prompt back so the UI can still render an explanation if we
    // need to fall back to the source photo with an overlay.
    return Response.json({ error: message, prompt }, { status: 500 })
  }
}
