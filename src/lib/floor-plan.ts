/**
 * Tier-0 deterministic schematic generator.
 *
 * Produces a top-down SVG from a layout shape enum, optional rough dimensions,
 * an island flag, and (when /api/space-vision has run) positional features
 * inferred from the homeowner's actual photos. Low-confidence features render
 * dashed with a `?` glyph so the homeowner sees what to confirm.
 *
 * This is *not* a survey — it gives the homeowner and designer a shared
 * reference for the conversation.
 */
import type {
  WallSide,
  ConfidenceLevel,
  WallRun,
  OpeningPosition,
  SpaceFeatures,
  IslandPosition,
  FeaturePosition,
} from '@/lib/types'

export interface FloorPlanInput {
  layoutShape?: string
  hasIsland?: boolean
  lengthCm?: number
  widthCm?: number
  // Optional positional fields from AI vision:
  wallRuns?: WallRun[]
  windows?: OpeningPosition[]
  doors?: OpeningPosition[]
  features?: SpaceFeatures
}

const W = 480
const H = 320
const PADDING = 32
const CAB_DEPTH = 36
const COLORS = {
  wall: '#1f2937',
  cabFill: '#e7e5e4',
  cabStroke: '#a8a29e',
  islandFill: '#d6d3d1',
  textMuted: '#78716c',
  textHint: '#a8a29e',
  textBody: '#57534e',
  windowFill: '#dbeafe',
  windowStroke: '#3b82f6',
  doorFill: '#fef3c7',
  doorStroke: '#d97706',
  feature: '#475569',
  featureFill: '#f1f5f9',
  lowConfidence: '#94a3b8',
}

function escapeText(s: string): string {
  return s.replace(/[<>&]/g, (c) => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;'))
}

function cabRect(x: number, y: number, w: number, h: number, dashed = false): string {
  const dash = dashed ? ' stroke-dasharray="4 4"' : ''
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${COLORS.cabFill}" stroke="${COLORS.cabStroke}"${dash} />`
}

function normalize(shape?: string): string {
  return (shape ?? '').toLowerCase().replace(/[\s-]+/g, '_')
}

interface InnerRect {
  x: number
  y: number
  w: number
  h: number
}

/** Convert a wall + position-along-wall (0–100%) into x/y px coords. */
function pointOnWall(side: WallSide, positionPct: number, inner: InnerRect): { x: number; y: number } {
  const t = Math.max(0, Math.min(100, positionPct)) / 100
  switch (side) {
    case 'top':
      return { x: inner.x + inner.w * t, y: inner.y }
    case 'bottom':
      return { x: inner.x + inner.w * t, y: inner.y + inner.h }
    case 'left':
      return { x: inner.x, y: inner.y + inner.h * t }
    case 'right':
      return { x: inner.x + inner.w, y: inner.y + inner.h * t }
  }
}

/** Wall axis ('h' for top/bottom, 'v' for left/right). */
function wallAxis(side: WallSide): 'h' | 'v' {
  return side === 'top' || side === 'bottom' ? 'h' : 'v'
}

function renderOpening(
  opening: OpeningPosition,
  inner: InnerRect,
  fill: string,
  stroke: string,
  label: string
): string {
  const center = pointOnWall(opening.wall, opening.positionPct, inner)
  const span = (opening.widthPct / 100) * (wallAxis(opening.wall) === 'h' ? inner.w : inner.h)
  const half = span / 2
  if (wallAxis(opening.wall) === 'h') {
    const y = opening.wall === 'top' ? inner.y - 5 : inner.y + inner.h - 5
    return `<rect x="${center.x - half}" y="${y}" width="${span}" height="10" rx="2" fill="${fill}" stroke="${stroke}" stroke-width="1.5" /><title>${escapeText(label)}</title>`
  }
  const x = opening.wall === 'left' ? inner.x - 5 : inner.x + inner.w - 5
  return `<rect x="${x}" y="${center.y - half}" width="10" height="${span}" rx="2" fill="${fill}" stroke="${stroke}" stroke-width="1.5" /><title>${escapeText(label)}</title>`
}

function renderFeature(
  glyph: string,
  pos: FeaturePosition,
  inner: InnerRect,
  label: string
): string {
  // Place feature just inside the wall (offset by ~CAB_DEPTH * 0.6 inward).
  const point = pointOnWall(pos.wall, pos.positionPct, inner)
  const inset = CAB_DEPTH * 0.6
  let cx = point.x
  let cy = point.y
  switch (pos.wall) {
    case 'top':
      cy = inner.y + inset
      break
    case 'bottom':
      cy = inner.y + inner.h - inset
      break
    case 'left':
      cx = inner.x + inset
      break
    case 'right':
      cx = inner.x + inner.w - inset
      break
  }
  const dashed = pos.confidence === 'L' ? ' stroke-dasharray="3 3"' : ''
  const stroke = pos.confidence === 'L' ? COLORS.lowConfidence : COLORS.feature
  const queryGlyph = pos.confidence === 'L' ? '?' : ''
  const charLen = glyph.length
  const w = Math.max(20, charLen * 8 + 8)
  const x = cx - w / 2
  const y = cy - 9
  return (
    `<g><rect x="${x}" y="${y}" width="${w}" height="18" rx="3" fill="${COLORS.featureFill}" stroke="${stroke}" stroke-width="1.25"${dashed} />` +
    `<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="10" font-weight="600" fill="${stroke}" font-family="system-ui, sans-serif">${escapeText(glyph)}${queryGlyph}</text>` +
    `<title>${escapeText(`${label}${pos.confidence === 'L' ? ' (low confidence)' : ''}`)}</title>` +
    `</g>`
  )
}

function renderIsland(island: IslandPosition, inner: InnerRect): string {
  const x = inner.x + (island.positionPct.x / 100) * inner.w - (island.sizePct.w / 200) * inner.w
  const y = inner.y + (island.positionPct.y / 100) * inner.h - (island.sizePct.h / 200) * inner.h
  const w = (island.sizePct.w / 100) * inner.w
  const h = (island.sizePct.h / 100) * inner.h
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${COLORS.islandFill}" stroke="${COLORS.cabStroke}" /><text x="${x + w / 2}" y="${y + h / 2 + 4}" text-anchor="middle" font-size="11" fill="${COLORS.textBody}" font-family="system-ui, sans-serif">Island</text>`
}

export function renderFloorPlanSvg(input: FloorPlanInput): string {
  const inner: InnerRect = {
    x: PADDING,
    y: PADDING,
    w: W - PADDING * 2,
    h: H - PADDING * 2,
  }

  let body = `<rect x="${inner.x}" y="${inner.y}" width="${inner.w}" height="${inner.h}" fill="white" stroke="${COLORS.wall}" stroke-width="3" />`

  const shape = normalize(input.layoutShape)

  // Use explicit wallRuns when provided; otherwise fall back to shape presets.
  if (input.wallRuns && input.wallRuns.length > 0) {
    for (const run of input.wallRuns) {
      const start = pointOnWall(run.wall, run.spanPct.start, inner)
      const end = pointOnWall(run.wall, run.spanPct.end, inner)
      const isHoriz = wallAxis(run.wall) === 'h'
      const rectX = isHoriz ? Math.min(start.x, end.x) : run.wall === 'left' ? inner.x + 4 : inner.x + inner.w - CAB_DEPTH - 4
      const rectY = isHoriz ? (run.wall === 'top' ? inner.y + 4 : inner.y + inner.h - CAB_DEPTH - 4) : Math.min(start.y, end.y)
      const rectW = isHoriz ? Math.abs(end.x - start.x) : CAB_DEPTH
      const rectH = isHoriz ? CAB_DEPTH : Math.abs(end.y - start.y)
      body += cabRect(rectX, rectY, rectW, rectH)
    }
  } else {
    switch (shape) {
      case 'galley':
        body += cabRect(inner.x + 4, inner.y + 4, inner.w - 8, CAB_DEPTH)
        body += cabRect(inner.x + 4, inner.y + inner.h - CAB_DEPTH - 4, inner.w - 8, CAB_DEPTH)
        break
      case 'l_shape':
      case 'l':
        body += cabRect(inner.x + 4, inner.y + 4, inner.w - 8, CAB_DEPTH)
        body += cabRect(inner.x + 4, inner.y + 4, CAB_DEPTH, inner.h - 8)
        break
      case 'u_shape':
      case 'u':
        body += cabRect(inner.x + 4, inner.y + 4, inner.w - 8, CAB_DEPTH)
        body += cabRect(inner.x + 4, inner.y + 4, CAB_DEPTH, inner.h - 8)
        body += cabRect(inner.x + inner.w - CAB_DEPTH - 4, inner.y + 4, CAB_DEPTH, inner.h - 8)
        break
      case 'peninsula':
        body += cabRect(inner.x + 4, inner.y + 4, inner.w - 8, CAB_DEPTH)
        body += cabRect(inner.x + 4, inner.y + inner.h - CAB_DEPTH - 4, Math.round(inner.w * 0.55), CAB_DEPTH)
        break
      case 'island':
      case 'open':
        body += cabRect(inner.x + 4, inner.y + 4, inner.w - 8, CAB_DEPTH)
        break
      default:
        body += cabRect(inner.x + 4, inner.y + 4, inner.w - 8, CAB_DEPTH, true)
    }
  }

  // Openings (windows + doors)
  if (input.windows) {
    for (const w of input.windows) {
      body += renderOpening(w, inner, COLORS.windowFill, COLORS.windowStroke, 'Window')
    }
  }
  if (input.doors) {
    for (const d of input.doors) {
      body += renderOpening(d, inner, COLORS.doorFill, COLORS.doorStroke, 'Door')
    }
  }

  // Features (sink/hob/fridge/dishwasher/island)
  if (input.features?.sink) body += renderFeature('Sink', input.features.sink, inner, 'Sink')
  if (input.features?.hob) body += renderFeature('Hob', input.features.hob, inner, 'Hob')
  if (input.features?.fridge) body += renderFeature('Fridge', input.features.fridge, inner, 'Fridge')
  if (input.features?.dishwasher) body += renderFeature('DW', input.features.dishwasher, inner, 'Dishwasher')

  if (input.features?.island) {
    body += renderIsland(input.features.island, inner)
  } else if (input.hasIsland || shape === 'island') {
    const iw = Math.min(inner.w * 0.45, 220)
    const ih = Math.min(inner.h * 0.32, 90)
    const ix = inner.x + (inner.w - iw) / 2
    const iy = inner.y + (inner.h - ih) / 2 + CAB_DEPTH * 0.4
    body += `<rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" rx="4" fill="${COLORS.islandFill}" stroke="${COLORS.cabStroke}" /><text x="${ix + iw / 2}" y="${iy + ih / 2 + 4}" text-anchor="middle" font-size="11" fill="${COLORS.textBody}" font-family="system-ui, sans-serif">Island</text>`
  }

  const lengthLabel = input.lengthCm ? `${input.lengthCm} cm` : 'rough length'
  const widthLabel = input.widthCm ? `${input.widthCm} cm` : 'rough width'
  body += `<text x="${W / 2}" y="${H - 8}" text-anchor="middle" font-size="11" fill="${COLORS.textMuted}" font-family="system-ui, sans-serif">${escapeText(lengthLabel)} × ${escapeText(widthLabel)}</text>`
  body += `<text x="${PADDING}" y="${PADDING - 12}" font-size="10" fill="${COLORS.textHint}" font-family="system-ui, sans-serif">Schematic — not a survey</text>`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%" role="img" aria-label="Schematic floor plan">${body}</svg>`
}

export function hasFloorPlanInput(input: FloorPlanInput): boolean {
  return Boolean(
    input.layoutShape ||
      input.hasIsland ||
      input.lengthCm ||
      input.widthCm ||
      input.wallRuns?.length ||
      input.windows?.length ||
      input.doors?.length ||
      input.features
  )
}

/** Convenience: build a FloorPlanInput from a LeadProfile (using vision if present). */
export function planInputFromProfile(profile: {
  layoutShape?: string
  hasIsland?: boolean
  spaceLengthCm?: number
  spaceWidthCm?: number
  spaceVisionResult?: {
    layoutShape?: string
    hasIsland?: boolean
    lengthCm?: number
    widthCm?: number
    wallRuns?: WallRun[]
    windows?: OpeningPosition[]
    doors?: OpeningPosition[]
    features?: SpaceFeatures
  }
}): FloorPlanInput {
  const v = profile.spaceVisionResult
  return {
    layoutShape: profile.layoutShape ?? v?.layoutShape,
    hasIsland: profile.hasIsland ?? v?.hasIsland,
    lengthCm: profile.spaceLengthCm ?? v?.lengthCm,
    widthCm: profile.spaceWidthCm ?? v?.widthCm,
    wallRuns: v?.wallRuns,
    windows: v?.windows,
    doors: v?.doors,
    features: v?.features,
  }
}

// Re-export type aliases used by the renderer so consumers can hold references.
export type { ConfidenceLevel }
