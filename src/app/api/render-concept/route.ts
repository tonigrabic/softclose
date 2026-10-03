import { generateImage } from 'ai'
import { openai } from '@ai-sdk/openai'
import { rateLimitKey } from '@/lib/rate-limit'
import { apiAccount } from '@/lib/auth/dal'
import { mockAiEnabled, mockDelay } from '@/lib/api/mock'
import { mockRenderDataUrl } from '@/lib/api/mock-fixtures/render-concept'
import { providerFailure, unauthorized, AI_UNAVAILABLE } from '@/lib/api/errors'
import type { PhotoViewTarget } from '@/lib/types'
import {
  describeRoomConstraints,
  photoViewPhrase,
  sanitizePhotoViewTarget,
  sanitizeRoomConstraints,
  type RenderRoomConstraints,
} from '@/lib/render/room-constraints'

// Per-session render cap (product rule: renders capped at 5/session — they cost
// real image-gen money). Defaults to 5; override via env for local testing
// (set RENDER_CAP_PER_SESSION). Keep in sync with the client cap in
// ConceptRender.tsx (NEXT_PUBLIC_RENDER_CAP_PER_SESSION).
const MAX_RENDERS_PER_SESSION = Number(process.env.RENDER_CAP_PER_SESSION) || 5
const SESSION_WINDOW_MS = 30 * 60 * 1000
const MAX_BYTES_PER_IMAGE = 5 * 1024 * 1024
const MAX_STYLE_REFS = 3
const MAX_PRODUCT_REFS = 4
/** Other space photos sent as "same room, other position" (IMP-32). */
const MAX_ROOM_REFS = 2
/** Every image in one call: base + anchor + room + style + product. */
const MAX_INPUT_IMAGES = 10
/** A room reference is recompressed by the client to ~768 px; anything bigger is not one. */
const MAX_REF_BYTES = 1.5 * 1024 * 1024
const MODEL_VERSION = 'gpt-image-2'
const QUALITY: 'low' | 'medium' | 'high' = 'medium'

interface ProductReferenceInput {
  /** Data URL or http(s) URL. */
  photo: string
  /** Short label, e.g. "stove", "microwave", "cabinet sample". */
  label: string
}

/** One other space photo of the same room. `photoIndex` is 0-based into the space photos. */
interface RoomReferenceInput {
  photo: string
  shows: string
  photoIndex: number
}

export interface RenderRequest {
  anchorPhoto?: string
  styleReferences?: string[]
  productReferences?: ProductReferenceInput[]
  /**
   * Image of the most recent render the homeowner is iterating on. When set,
   * we feed it to the model as the iteration base so this generation refines
   * the previous version rather than starting fresh from the anchor.
   */
  previousRenderImage?: string
  /**
   * A render of the same redesign from another camera (a new anchor, or the
   * other side of the room). Its finishes are matched, its camera is not.
   * Never sent together with `previousRenderImage`; this one wins.
   */
  designReference?: string
  /** The measured room (`roomConstraintsFor`), re-checked here; unknown until sanitised. */
  room?: unknown
  /** Which wall or corner the anchor photo shows (its photo view), unknown until sanitised. */
  anchorShows?: unknown
  roomReferences?: RoomReferenceInput[]
  /** 'other_side' = rendered from another photo to show the rest of the room (absent = main). */
  view?: 'main' | 'other_side'
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
  /** The photo read's note on the kitchen as it is today. Dropped when the room is known. */
  visionSummary?: string
  styleHints?: string[]
  materialHints?: string[]
  nudges?: string[]
  previousRenderId?: string
}

type ManifestRole = 'anchor' | 'style' | 'product' | 'previous_render' | 'room_reference' | 'design_reference'

interface ManifestEntry {
  role: ManifestRole
  imageDataUrl: string
  label?: string
  photoIndex?: number
  shows?: PhotoViewTarget
}

const STYLE_LANGUAGE: Record<string, string> = {
  modern_minimal: 'modern minimalist, handleless slab cabinetry, calm neutral palette, very clean lines',
  warm_shaker: 'warm shaker style, painted shaker doors, brushed brass hardware, warm wood tones',
  industrial: 'industrial style, dark cabinets, exposed brick or steel accents, brushed black or steel hardware',
  transitional: 'transitional style, balance of traditional and modern, soft neutrals, elegant proportions',
  bold_dark: 'bold dark cabinetry, deep navy or charcoal, contrasting brass or matte-black hardware',
  // Shown to the homeowner as "Rustic" (value kept for saved journeys).
  natural_organic: 'rustic style, natural solid wood with visible grain, warm earthy tones, hand-finished textures',
}

const MATERIAL_LANGUAGE: Record<string, string> = {
  // Door
  shaker_painted: 'painted shaker cabinet doors',
  slab: 'flat slab cabinet doors',
  solid_wood: 'solid wood cabinet doors',
  veneer: 'wood veneer cabinet doors',
  thermofoil: 'thermofoil cabinet doors',
  glass_front: 'glass-front upper cabinets',
  lacquered_flat: 'flat lacquered (painted) slab cabinet doors',
  lacquered_inset: 'lacquered cabinet doors with a frame around a recessed centre panel (shaker)',
  lacquered_relief: 'lacquered cabinet doors with a routed decorative relief profile',
  alu_glass: 'aluminium-framed glass cabinet doors',
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

export interface RoleEntry {
  /** 1-based index of this image in the final images[] array. */
  index: number
  /** Plain-language role for the prompt. */
  role: string
}

/** Every image in the call, by the role it plays. */
export interface PromptImages {
  anchor: RoleEntry
  previousRender: RoleEntry | null
  designReference: RoleEntry | null
  roomRefs: (RoleEntry & { shows: PhotoViewTarget })[]
  style: RoleEntry[]
  product: RoleEntry[]
}

/** "Photo 3", "Photo 3 and Photo 4". */
function photoList(entries: readonly RoleEntry[]): string {
  const names = entries.map((e) => `Photo ${e.index}`)
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/**
 * Build the prompt for gpt-image-2. We address each photo by its 1-based
 * position so the model knows what each one is for: anchor, other views of
 * the same room, style ref, specific product to incorporate, or the render
 * to iterate on or match.
 *
 * Order: the base render, the anchor, the measured room (hard rules), the
 * other views of the room, then style, products, materials and adjustments.
 * When the room is known, the photo read's note on today's kitchen is left
 * out — it describes the old layout and fights 'add island' or 'change'.
 */
export function buildPrompt(
  req: RenderRequest,
  images: PromptImages,
  opts: { room: RenderRoomConstraints | null; anchorShows: PhotoViewTarget | null; freeTextNudge: string | null }
): string {
  const { room, anchorShows, freeTextNudge } = opts
  const stylePhrase = describe(req.style, STYLE_LANGUAGE)
  const door = describe(req.doorMaterial, MATERIAL_LANGUAGE)
  const worktop = describe(req.worktopPreference, MATERIAL_LANGUAGE)
  const backsplash = describe(req.backsplashPreference, MATERIAL_LANGUAGE)
  const hardware = describe(req.hardwareTier, MATERIAL_LANGUAGE)

  const parts: string[] = [
    'You are generating a photorealistic concept render of a kitchen redesign.',
  ]

  // A design reference and a previous render are never both the base.
  if (images.designReference) {
    parts.push(
      `Photo ${images.designReference.index} is a render of the SAME redesigned kitchen from another camera position — match its cabinet fronts, worktop, colours, hardware and appliance finishes exactly; do NOT copy its camera, framing or walls.`
    )
  } else if (images.previousRender) {
    parts.push(
      `Photo ${images.previousRender.index} is the PREVIOUS RENDER — start from this version and refine it. Preserve everything about it that the homeowner is not asking to change; only modify what the adjustments below request.`
    )
  }

  const anchor = images.anchor
  parts.push(
    `Photo ${anchor.index} is the ${anchor.role} — KEEP its room footprint, wall positions, window/door locations, ceiling height, floor extents, and approximate camera angle. ${
      room?.intent === 'new'
        ? 'Build the new kitchen into it (cabinets, worktops, backsplash, appliances, lighting, finishes).'
        : 'Only change the kitchen elements (cabinets, worktops, backsplash, appliances, lighting, finishes).'
    }`
  )

  if (room) {
    parts.push(describeRoomConstraints(room, anchorShows ? { photoNumber: anchor.index, shows: anchorShows } : undefined))
  }

  if (images.roomRefs.length > 0) {
    const one = images.roomRefs.length === 1
    // Wall letters only mean something once the ROOM block has named them.
    const views = room
      ? images.roomRefs.flatMap((r) => {
          const v = photoViewPhrase(r.shows)
          return v ? [`Photo ${r.index} ${v}`] : []
        })
      : []
    parts.push(
      `${photoList(images.roomRefs)} ${one ? 'shows' : 'show'} the SAME room from ${one ? 'another position' : 'other positions'}${
        views.length > 0 ? ` (${views.join('; ')})` : ''
      }. Use ${one ? 'it' : 'them'} only to understand the room — what is beside and behind the camera, where the windows and doors are. Do NOT render ${one ? 'its' : 'their'} viewpoint or copy ${one ? 'its' : 'their'} existing cabinets.`
    )
  }

  if (images.style.length > 0) {
    const list = images.style.map((e) => `Photo ${e.index} (${e.role})`).join(', ')
    const one = images.style.length === 1
    parts.push(
      `${list} ${one ? 'is a STYLE reference' : 'are STYLE references'} — borrow the overall mood, palette, materiality, and proportions from ${one ? 'it' : 'them'}, but do NOT copy ${one ? 'its' : 'their'} room layout.`
    )
  }

  if (images.product.length > 0) {
    const list = images.product.map((e) => `Photo ${e.index} (${e.role})`).join('; ')
    const one = images.product.length === 1
    parts.push(
      `${list} ${one ? 'is a SPECIFIC ITEM' : 'are SPECIFIC ITEMS'} the homeowner wants to incorporate. Place ${one ? 'this item' : 'these items'} in the redesign with reasonable scale and positioning, and match ${one ? 'its' : 'their'} finish, color, and form factor as faithfully as possible.`
    )
  }

  if (req.visionSummary && !room) parts.push(`Existing space note: ${req.visionSummary}.`)
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
  return parts.join('\n')
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

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Everything one render call needs, validated. */
export interface PreparedRender {
  images: string[]
  manifest: ManifestEntry[]
  prompt: string
  /** The measured room reached the prompt as hard rules. */
  constrained: boolean
  styleRefCount: number
  productRefCount: number
  iteratedFromPreviousRender: boolean
  freeTextNudge: string | null
}

/**
 * Validate the request and assemble the images, the manifest and the prompt.
 * Pure: the real path and the mock both run it, so a mock run shows the exact
 * prompt a real one would send.
 *
 * Image order: the base (design reference, else previous render), the anchor,
 * the room references, style, products. Over `MAX_INPUT_IMAGES`, style refs go
 * first, then room refs down to one; products are what the homeowner asked
 * for by name and stay.
 */
export function prepareRender(raw: unknown): PreparedRender | { error: string; status: number } {
  if (!isRecord(raw)) return { error: 'Invalid JSON', status: 400 }
  const body = raw as RenderRequest

  if (!isAcceptableImageRef(body.anchorPhoto)) {
    return { error: 'Missing or invalid anchorPhoto', status: 400 }
  }
  const anchorPhoto = body.anchorPhoto
  if (anchorPhoto.startsWith('data:image/') && approxBytesOfDataUrl(anchorPhoto) > MAX_BYTES_PER_IMAGE) {
    return { error: 'Anchor photo too large (max 5MB)', status: 400 }
  }

  // Style references — keep only valid, deduped, capped.
  const styleRefs: string[] = []
  for (const ref of Array.isArray(body.styleReferences) ? body.styleReferences : []) {
    if (styleRefs.length >= MAX_STYLE_REFS) break
    if (!isAcceptableImageRef(ref)) continue
    if (ref.startsWith('data:image/') && approxBytesOfDataUrl(ref) > MAX_BYTES_PER_IMAGE) continue
    if (styleRefs.includes(ref) || ref === anchorPhoto) continue
    styleRefs.push(ref)
  }

  // Product references — keep only valid {photo, label} pairs.
  const productRefs: { photo: string; label: string }[] = []
  for (const item of Array.isArray(body.productReferences) ? body.productReferences : []) {
    if (productRefs.length >= MAX_PRODUCT_REFS) break
    if (!isRecord(item)) continue
    const label = sanitizeLabel(item.label)
    if (!label) continue
    if (!isAcceptableImageRef(item.photo)) continue
    if (item.photo.startsWith('data:image/') && approxBytesOfDataUrl(item.photo) > MAX_BYTES_PER_IMAGE) continue
    if (productRefs.some((p) => p.photo === item.photo)) continue
    if (item.photo === anchorPhoto) continue
    productRefs.push({ photo: item.photo, label })
  }

  // Room references — other space photos of the same room, data URLs only.
  const roomRefs: { photo: string; shows: PhotoViewTarget; photoIndex: number }[] = []
  for (const item of Array.isArray(body.roomReferences) ? (body.roomReferences as unknown[]) : []) {
    if (roomRefs.length >= MAX_ROOM_REFS) break
    if (!isRecord(item)) continue
    const { photo, photoIndex } = item
    if (typeof photo !== 'string' || !photo.startsWith('data:image/')) continue
    if (approxBytesOfDataUrl(photo) > MAX_REF_BYTES) continue
    if (typeof photoIndex !== 'number' || !Number.isInteger(photoIndex) || photoIndex < 0 || photoIndex > 19) continue
    if (photo === anchorPhoto || styleRefs.includes(photo)) continue
    if (roomRefs.some((r) => r.photo === photo || r.photoIndex === photoIndex)) continue
    roomRefs.push({ photo, photoIndex, shows: sanitizePhotoViewTarget(item.shows) ?? 'unclear' })
  }

  const isDataImage = (v: unknown): v is string =>
    typeof v === 'string' && v.startsWith('data:image/') && approxBytesOfDataUrl(v) <= MAX_BYTES_PER_IMAGE
  // One base at most: a render from another camera (match its finishes) wins
  // over the previous render (refine it) — the two would pull the camera apart.
  const designReference = isDataImage(body.designReference) ? body.designReference : null
  const previousRenderImage = !designReference && isDataImage(body.previousRenderImage) ? body.previousRenderImage : null

  const fixedCount = 1 + (designReference || previousRenderImage ? 1 : 0) + productRefs.length
  const total = () => fixedCount + roomRefs.length + styleRefs.length
  while (total() > MAX_INPUT_IMAGES && styleRefs.length > 0) styleRefs.pop()
  while (total() > MAX_INPUT_IMAGES && roomRefs.length > 1) roomRefs.pop()

  const freeTextNudge = sanitizeFreeText(body.freeTextNudge)
  const room = sanitizeRoomConstraints(body.room)
  const anchorShows = sanitizePhotoViewTarget(body.anchorShows)

  // Build the ordered images array, parallel role labels for the prompt, and
  // the manifest we hand back to the client to persist on the render record.
  const images: string[] = []
  const manifest: ManifestEntry[] = []

  // Position 1: the base render, if any.
  let previousRender: RoleEntry | null = null
  let designRef: RoleEntry | null = null
  if (designReference) {
    images.push(designReference)
    manifest.push({ role: 'design_reference', imageDataUrl: designReference })
    designRef = { index: images.length, role: 'design reference' }
  } else if (previousRenderImage) {
    images.push(previousRenderImage)
    manifest.push({ role: 'previous_render', imageDataUrl: previousRenderImage })
    previousRender = { index: images.length, role: 'previous render' }
  }

  // Anchor (always present).
  images.push(anchorPhoto)
  manifest.push({ role: 'anchor', imageDataUrl: anchorPhoto, ...(anchorShows ? { shows: anchorShows } : {}) })
  const anchor: RoleEntry = {
    index: images.length,
    role: room?.intent === 'new' ? "homeowner's empty room (the anchor)" : "homeowner's existing kitchen (the anchor)",
  }

  // Room references.
  const roomEntries: PromptImages['roomRefs'] = []
  for (const r of roomRefs) {
    images.push(r.photo)
    manifest.push({ role: 'room_reference', imageDataUrl: r.photo, photoIndex: r.photoIndex, shows: r.shows })
    roomEntries.push({ index: images.length, role: 'same room, other position', shows: r.shows })
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

  const prompt = buildPrompt(
    body,
    { anchor, previousRender, designReference: designRef, roomRefs: roomEntries, style: styleEntries, product: productEntries },
    { room, anchorShows, freeTextNudge }
  )

  return {
    images,
    manifest,
    prompt,
    constrained: room !== null,
    styleRefCount: styleRefs.length,
    productRefCount: productRefs.length,
    iteratedFromPreviousRender: previousRenderImage !== null,
    freeTextNudge,
  }
}

export async function POST(req: Request) {
  // Auth first, before the mock short-circuit — "fully protected" must not have
  // an exception you have to remember. These routes spend real money (a render
  // is ~75 s of gpt-image-2) and were open to the internet until now.
  const session = await apiAccount()
  if (!session) return unauthorized()

  // Mock-AI mode skips the rate limit, so devs can iterate freely.
  const mock = mockAiEnabled()
  if (!mock) {
    const limit = rateLimitKey(session.accountId, 'render-concept', MAX_RENDERS_PER_SESSION, SESSION_WINDOW_MS)
    if (!limit.ok) {
      return Response.json(
        {
          error: `You've used your ${MAX_RENDERS_PER_SESSION} concept renders for this session — your designer can keep iterating with you on follow-up.`,
          retryAfterMs: limit.retryAfterMs,
        },
        { status: 429 }
      )
    }
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const prepared = prepareRender(body)
  if ('error' in prepared) return Response.json({ error: prepared.error }, { status: prepared.status })
  const { images, manifest, prompt, constrained } = prepared
  const nudges = (body as RenderRequest).nudges ?? []

  // Mock-AI mode: the canned render (a real data URL — downstream consumers
  // validate the data:image/ prefix) with the REAL prompt and manifest, so a
  // mock run shows exactly what a live render would have been told.
  if (mock) {
    await mockDelay(900)
    return Response.json({
      id: `render-mock-${Date.now()}`,
      imageDataUrl: await mockRenderDataUrl(),
      prompt,
      modelVersion: 'mock',
      quality: 'mock',
      styleRefCount: prepared.styleRefCount,
      productRefCount: prepared.productRefCount,
      iteratedFromPreviousRender: prepared.iteratedFromPreviousRender,
      nudges,
      freeTextNudge: prepared.freeTextNudge ?? undefined,
      inputs: manifest,
      constrained,
      generatedAt: new Date().toISOString(),
    })
  }

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
          // JPEG keeps the response (image + the echoed inputs) under Vercel's
          // 4.5 MB limit now that room references ride along.
          outputFormat: 'jpeg',
          outputCompression: 85,
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
      styleRefCount: prepared.styleRefCount,
      productRefCount: prepared.productRefCount,
      iteratedFromPreviousRender: prepared.iteratedFromPreviousRender,
      nudges,
      freeTextNudge: prepared.freeTextNudge ?? undefined,
      inputs: manifest,
      constrained,
      generatedAt: new Date().toISOString(),
    })
  } catch (err) {
    // Keep the prompt so the UI can still explain what it tried; never the raw provider text.
    return Response.json({ ...providerFailure('render-concept', err, AI_UNAVAILABLE), prompt }, { status: 500 })
  }
}
