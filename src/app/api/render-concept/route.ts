import { generateImage } from 'ai'
import { openai } from '@ai-sdk/openai'
import { rateLimit } from '@/lib/rate-limit'

const MAX_RENDERS_PER_SESSION = 5
const SESSION_WINDOW_MS = 30 * 60 * 1000
const MAX_BYTES_PER_IMAGE = 5 * 1024 * 1024
const MAX_STYLE_REFS = 3
const MAX_PRODUCT_REFS = 4
const MODEL_VERSION = 'gpt-image-2'
const QUALITY: 'low' | 'medium' | 'high' = 'medium'

interface ProductReferenceInput {
  /** Data URL or http(s) URL. */
  photo: string
  /** Short label, e.g. "stove", "microwave", "cabinet sample". */
  label: string
}

interface RenderRequest {
  anchorPhoto?: string
  styleReferences?: string[]
  productReferences?: ProductReferenceInput[]
  /**
   * Image of the most recent render the homeowner is iterating on. When set,
   * we feed it to the model as the iteration base so this generation refines
   * the previous version rather than starting fresh from the anchor.
   */
  previousRenderImage?: string
  /** Free-text adjustment the homeowner typed (in addition to chip nudges). */
  freeTextNudge?: string
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

type ManifestRole = 'anchor' | 'style' | 'product' | 'previous_render'

interface ManifestEntry {
  role: ManifestRole
  imageDataUrl: string
  label?: string
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

interface RoleEntry {
  /** 1-based index of this image in the final images[] array. */
  index: number
  /** Plain-language role for the prompt. */
  role: string
}

/**
 * Build the prompt for gpt-image-2. We address each photo by its 1-based
 * position so the model knows what each one is for: anchor, style ref,
 * specific product to incorporate, or the prior render to iterate on.
 */
function buildPrompt(
  req: RenderRequest,
  anchorEntry: RoleEntry,
  styleEntries: RoleEntry[],
  productEntries: RoleEntry[],
  previousRenderEntry: RoleEntry | null,
  freeTextNudge: string | null
): string {
  const stylePhrase = describe(req.style, STYLE_LANGUAGE)
  const door = describe(req.doorMaterial, MATERIAL_LANGUAGE)
  const worktop = describe(req.worktopPreference, MATERIAL_LANGUAGE)
  const backsplash = describe(req.backsplashPreference, MATERIAL_LANGUAGE)
  const hardware = describe(req.hardwareTier, MATERIAL_LANGUAGE)

  const parts: string[] = [
    'You are generating a photorealistic concept render of a kitchen redesign.',
  ]

  if (previousRenderEntry) {
    parts.push(
      `Photo ${previousRenderEntry.index} is the PREVIOUS RENDER — start from this version and refine it. Preserve everything about it that the homeowner is not asking to change; only modify what the adjustments below request.`
    )
  }

  parts.push(
    `Photo ${anchorEntry.index} is the ${anchorEntry.role} — KEEP its room footprint, wall positions, window/door locations, ceiling height, floor extents, and approximate camera angle. Only change the kitchen elements (cabinets, worktops, backsplash, appliances, lighting, finishes).`
  )

  if (styleEntries.length > 0) {
    const list = styleEntries.map((e) => `Photo ${e.index} (${e.role})`).join(', ')
    parts.push(
      `${list} ${styleEntries.length === 1 ? 'is a STYLE reference' : 'are STYLE references'} — borrow the overall mood, palette, materiality, and proportions from ${styleEntries.length === 1 ? 'it' : 'them'}, but do NOT copy ${styleEntries.length === 1 ? 'its' : 'their'} room layout.`
    )
  }

  if (productEntries.length > 0) {
    const list = productEntries.map((e) => `Photo ${e.index} (${e.role})`).join('; ')
    parts.push(
      `${list} ${productEntries.length === 1 ? 'is a SPECIFIC ITEM' : 'are SPECIFIC ITEMS'} the homeowner wants to incorporate. Place ${productEntries.length === 1 ? 'this item' : 'these items'} in the redesign with reasonable scale and positioning, and match ${productEntries.length === 1 ? 'its' : 'their'} finish, color, and form factor as faithfully as possible.`
    )
  }

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

  const adjustments: string[] = []
  if (req.nudges && req.nudges.length > 0) adjustments.push(...req.nudges)
  if (freeTextNudge) adjustments.push(freeTextNudge)
  if (adjustments.length > 0) {
    parts.push(`Adjust this iteration: ${adjustments.join('; ')}.`)
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

function isAcceptableImageRef(s: unknown): s is string {
  if (typeof s !== 'string' || s.length === 0) return false
  if (s.startsWith('data:image/')) return true
  if (s.startsWith('http://') || s.startsWith('https://')) return true
  return false
}

function sanitizeLabel(label: unknown): string | null {
  if (typeof label !== 'string') return null
  const cleaned = label.trim().replace(/[\r\n\t]+/g, ' ').slice(0, 60)
  return cleaned.length > 0 ? cleaned : null
}

function sanitizeFreeText(text: unknown, maxLen = 240): string | null {
  if (typeof text !== 'string') return null
  const cleaned = text.trim().replace(/[\r\n\t]+/g, ' ').slice(0, maxLen)
  return cleaned.length > 0 ? cleaned : null
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

  if (!isAcceptableImageRef(body.anchorPhoto)) {
    return Response.json({ error: 'Missing or invalid anchorPhoto' }, { status: 400 })
  }
  if (body.anchorPhoto!.startsWith('data:image/') && approxBytesOfDataUrl(body.anchorPhoto!) > MAX_BYTES_PER_IMAGE) {
    return Response.json({ error: 'Anchor photo too large (max 5MB)' }, { status: 400 })
  }

  // Style references — keep only valid, deduped, capped.
  const styleRefs: string[] = []
  for (const ref of body.styleReferences ?? []) {
    if (styleRefs.length >= MAX_STYLE_REFS) break
    if (!isAcceptableImageRef(ref)) continue
    if (ref.startsWith('data:image/') && approxBytesOfDataUrl(ref) > MAX_BYTES_PER_IMAGE) continue
    if (styleRefs.includes(ref) || ref === body.anchorPhoto) continue
    styleRefs.push(ref)
  }

  // Product references — keep only valid {photo, label} pairs.
  const productRefs: { photo: string; label: string }[] = []
  for (const item of body.productReferences ?? []) {
    if (productRefs.length >= MAX_PRODUCT_REFS) break
    if (!item || typeof item !== 'object') continue
    const label = sanitizeLabel(item.label)
    if (!label) continue
    if (!isAcceptableImageRef(item.photo)) continue
    if (item.photo.startsWith('data:image/') && approxBytesOfDataUrl(item.photo) > MAX_BYTES_PER_IMAGE) continue
    if (productRefs.some((p) => p.photo === item.photo)) continue
    if (item.photo === body.anchorPhoto) continue
    productRefs.push({ photo: item.photo, label })
  }

  // Validate the optional previous-render base.
  let previousRenderImage: string | null = null
  if (body.previousRenderImage) {
    if (
      typeof body.previousRenderImage === 'string' &&
      body.previousRenderImage.startsWith('data:image/') &&
      approxBytesOfDataUrl(body.previousRenderImage) <= MAX_BYTES_PER_IMAGE
    ) {
      previousRenderImage = body.previousRenderImage
    }
  }

  const freeTextNudge = sanitizeFreeText(body.freeTextNudge)

  // Build the ordered images array, parallel role labels for the prompt, and
  // the manifest we hand back to the client to persist on the render record.
  const images: string[] = []
  const manifest: ManifestEntry[] = []

  // Position 1: previous render (if iterating).
  let previousRenderEntry: RoleEntry | null = null
  if (previousRenderImage) {
    images.push(previousRenderImage)
    manifest.push({ role: 'previous_render', imageDataUrl: previousRenderImage })
    previousRenderEntry = { index: images.length, role: 'previous render' }
  }

  // Anchor (always present).
  images.push(body.anchorPhoto!)
  manifest.push({ role: 'anchor', imageDataUrl: body.anchorPhoto! })
  const anchorEntry: RoleEntry = {
    index: images.length,
    role: "homeowner's existing kitchen (the anchor)",
  }

  // Style refs.
  const styleEntries: RoleEntry[] = []
  for (const ref of styleRefs) {
    images.push(ref)
    manifest.push({ role: 'style', imageDataUrl: ref })
    styleEntries.push({ index: images.length, role: 'style/inspiration reference' })
  }

  // Product refs.
  const productEntries: RoleEntry[] = []
  for (const p of productRefs) {
    images.push(p.photo)
    manifest.push({ role: 'product', imageDataUrl: p.photo, label: p.label })
    productEntries.push({ index: images.length, role: p.label })
  }

  const prompt = buildPrompt(body, anchorEntry, styleEntries, productEntries, previousRenderEntry, freeTextNudge)
  const id = `render-${Date.now()}-${Math.floor(Math.random() * 1e6)}`

  try {
    const { image } = await generateImage({
      model: openai.image(MODEL_VERSION),
      prompt: {
        text: prompt,
        images,
      },
      size: '1024x1024',
      providerOptions: {
        openai: {
          quality: QUALITY,
        },
      },
    })

    const dataUrl = `data:${image.mediaType};base64,${image.base64}`
    return Response.json({
      id,
      imageDataUrl: dataUrl,
      prompt,
      modelVersion: MODEL_VERSION,
      quality: QUALITY,
      styleRefCount: styleRefs.length,
      productRefCount: productRefs.length,
      iteratedFromPreviousRender: Boolean(previousRenderImage),
      nudges: body.nudges ?? [],
      freeTextNudge: freeTextNudge ?? undefined,
      inputs: manifest,
      generatedAt: new Date().toISOString(),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Render failed'
    // Surface the prompt back so the UI can still render an explanation if we
    // need to fall back to the source photo with an overlay.
    return Response.json({ error: message, prompt }, { status: 500 })
  }
}
