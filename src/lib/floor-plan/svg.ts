/**
 * Deterministic SVG renderer — server-safe, used by:
 *   - the maker handoff bundle (so the maker dashboard has a static picture)
 *   - the option-visuals layout-tile thumbnails (no Konva on the server)
 *   - the wrap-up screen's static preview
 *
 * Two modes:
 *   - 'homeowner' renders low-confidence elements dashed with a `?` glyph
 *     (encourages confirmation in the editor — "fix this please").
 *   - 'maker'    renders everything solid; the maker dashboard surfaces
 *     provenance via separate pills outside the SVG.
 */
import type { FloorPlan, Feature, Opening, Island } from './model'
import { wallAxis, wallLengthCm, FEATURE_DEFAULTS, OPENING_DEFAULTS } from './model'
import { fitRoom, featurePxRect, openingPxRect, type FitResult } from './geometry'
import { formatLength } from './units'

const W = 480
const H = 320

const COLORS = {
  wall: '#1f2937',
  wallOpen: '#cbd5e1',
  cabFill: '#e7e5e4',
  cabStroke: '#a8a29e',
  cabHint: '#f5f5f4',
  cabHintStroke: '#d6d3d1',
  islandFill: '#d6d3d1',
  textMuted: '#78716c',
  textHint: '#a8a29e',
  textBody: '#57534e',
  windowFill: '#dbeafe',
  windowStroke: '#3b82f6',
  doorFill: '#fef3c7',
  doorStroke: '#d97706',
  passageFill: '#f1f5f9',
  passageStroke: '#94a3b8',
  feature: '#475569',
  featureFill: '#f1f5f9',
  lowConfidence: '#94a3b8',
} as const

export type SvgRenderMode = 'homeowner' | 'maker'

interface RenderOpts {
  mode?: SvgRenderMode
  /** When true, include element ids as data-element-id attributes (lets the maker dashboard hover-link). */
  includeDataAttrs?: boolean
  /** Include the bottom dimension caption. Default true. */
  showDimensions?: boolean
  /** Include the corner "schematic — not a survey" disclaimer. Default true. */
  showDisclaimer?: boolean
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"]/g, (c) => {
    if (c === '<') return '&lt;'
    if (c === '>') return '&gt;'
    if (c === '"') return '&quot;'
    return '&amp;'
  })
}

/** Render a FloorPlan as an SVG string. */
export function renderFloorPlanSvg(plan: FloorPlan, opts: RenderOpts = {}): string {
  const { mode = 'homeowner', includeDataAttrs = true, showDimensions = true, showDisclaimer = true } = opts
  const fit = fitRoom(plan.room, { w: W, h: H })

  let body = ''

  // Cabinet hint background — derived from layout shape, faint, non-interactive.
  body += renderCabinetHint(plan, fit)

  // Room rectangle with side-aware stroke (closed solid, open dashed).
  body += renderRoom(plan, fit)

  // Openings.
  for (const o of plan.openings) {
    body += renderOpening(o, plan, fit, mode, includeDataAttrs)
  }
  // Features.
  for (const f of plan.features) {
    body += renderFeature(f, plan, fit, mode, includeDataAttrs)
  }
  // Island.
  if (plan.island) {
    body += renderIsland(plan.island, fit, mode, includeDataAttrs)
  }

  if (showDimensions) {
    const lengthLabel = formatLength(plan.room.lengthCm, plan.units)
    const widthLabel = formatLength(plan.room.widthCm, plan.units)
    body +=
      `<text x="${W / 2}" y="${H - 8}" text-anchor="middle" font-size="11" fill="${COLORS.textMuted}" ` +
      `font-family="system-ui, sans-serif">${escapeXml(lengthLabel)} × ${escapeXml(widthLabel)}</text>`
  }
  if (showDisclaimer) {
    body +=
      `<text x="${20}" y="${20}" font-size="10" fill="${COLORS.textHint}" ` +
      `font-family="system-ui, sans-serif">Schematic — not a survey</text>`
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%" ` +
    `role="img" aria-label="Schematic floor plan">${body}</svg>`
  )
}

// ─── Internals ───────────────────────────────────────────────────────────────

function renderRoom(plan: FloorPlan, fit: FitResult): string {
  const { x, y, w, h } = fit.inner
  // White interior fill stays a single rect; per-side strokes drawn as 4 lines.
  const fill = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="white" />`
  const sides = plan.room.sides
  const drawSide = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    open: boolean
  ) =>
    open
      ? `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${COLORS.wallOpen}" stroke-width="2" stroke-dasharray="6 4" />`
      : `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${COLORS.wall}" stroke-width="3" />`
  return (
    fill +
    drawSide(x, y, x + w, y, sides.top.kind === 'open') +
    drawSide(x + w, y, x + w, y + h, sides.right.kind === 'open') +
    drawSide(x, y + h, x + w, y + h, sides.bottom.kind === 'open') +
    drawSide(x, y, x, y + h, sides.left.kind === 'open')
  )
}

/**
 * Faint cabinet-run background derived from layoutShape. Hint only — the
 * homeowner doesn't edit cabinets; the maker designs them.
 */
function renderCabinetHint(plan: FloorPlan, fit: FitResult): string {
  const sides = plan.room.sides
  const cabDepthPx = Math.max(20, Math.min(36, 36 * fit.scale * 8))
  const inset = 4
  const { x, y, w, h } = fit.inner
  const r = (rx: number, ry: number, rw: number, rh: number) =>
    `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="${COLORS.cabHint}" stroke="${COLORS.cabHintStroke}" stroke-dasharray="2 4" stroke-width="1" rx="2" />`

  let s = ''
  const top = () => sides.top.kind === 'closed' && r(x + inset, y + inset, w - inset * 2, cabDepthPx)
  const bottom = () => sides.bottom.kind === 'closed' && r(x + inset, y + h - cabDepthPx - inset, w - inset * 2, cabDepthPx)
  const left = () => sides.left.kind === 'closed' && r(x + inset, y + inset, cabDepthPx, h - inset * 2)
  const right = () => sides.right.kind === 'closed' && r(x + w - cabDepthPx - inset, y + inset, cabDepthPx, h - inset * 2)

  switch (plan.layoutShape) {
    case 'galley':
      s += top() || ''
      s += bottom() || ''
      break
    case 'l_shape':
      s += top() || ''
      s += left() || ''
      break
    case 'u_shape':
      s += top() || ''
      s += left() || ''
      s += right() || ''
      break
    case 'peninsula':
      s += top() || ''
      // Peninsula often opens on one short side; partial cabinet on bottom.
      if (sides.bottom.kind === 'closed') {
        s += r(x + inset, y + h - cabDepthPx - inset, (w - inset * 2) * 0.55, cabDepthPx)
      }
      break
    case 'island':
    case 'open':
      s += top() || ''
      break
    default:
      // unsure — show one faint hint along the longest closed side
      s += top() || left() || bottom() || right() || ''
  }
  return s
}

function renderOpening(
  o: Opening,
  plan: FloorPlan,
  fit: FitResult,
  mode: SvgRenderMode,
  withId: boolean
): string {
  const rect = openingPxRect(o, fit, plan.room)
  const { fill, stroke } = openingColors(o.kind)
  const dashed = mode === 'homeowner' && o.confidence === 'L' ? ' stroke-dasharray="3 3"' : ''
  const idAttr = withId ? ` data-element-id="${o.id}" data-element-kind="${o.kind}"` : ''
  const label = `${OPENING_DEFAULTS[o.kind].label} (${Math.round(o.widthCm)} cm)`
  const queryGlyph =
    mode === 'homeowner' && o.confidence === 'L'
      ? renderQueryBadge(rect.x + rect.w / 2, rect.y + rect.h / 2)
      : ''
  return (
    `<g${idAttr}>` +
    `<rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" rx="2" ` +
    `fill="${fill}" stroke="${stroke}" stroke-width="1.5"${dashed} />` +
    queryGlyph +
    `<title>${escapeXml(label)}</title>` +
    `</g>`
  )
}

function openingColors(kind: Opening['kind']): { fill: string; stroke: string } {
  switch (kind) {
    case 'window':
      return { fill: COLORS.windowFill, stroke: COLORS.windowStroke }
    case 'door':
      return { fill: COLORS.doorFill, stroke: COLORS.doorStroke }
    case 'passage':
      return { fill: COLORS.passageFill, stroke: COLORS.passageStroke }
  }
}

function renderFeature(
  f: Feature,
  plan: FloorPlan,
  fit: FitResult,
  mode: SvgRenderMode,
  withId: boolean
): string {
  const def = FEATURE_DEFAULTS[f.kind]
  const rect = featurePxRect(f, fit, plan.room)
  const dashed = mode === 'homeowner' && f.confidence === 'L' ? ' stroke-dasharray="3 3"' : ''
  const stroke = mode === 'homeowner' && f.confidence === 'L' ? COLORS.lowConfidence : COLORS.feature
  const idAttr = withId ? ` data-element-id="${f.id}" data-element-kind="${f.kind}"` : ''
  const cx = rect.x + rect.w / 2
  const cy = rect.y + rect.h / 2
  const queryGlyph =
    mode === 'homeowner' && f.confidence === 'L'
      ? `<text x="${cx + (rect.w / 2) - 6}" y="${cy + 3}" text-anchor="middle" font-size="9" font-weight="700" fill="${stroke}" font-family="system-ui, sans-serif">?</text>`
      : ''
  return (
    `<g${idAttr}>` +
    `<rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" rx="3" ` +
    `fill="${COLORS.featureFill}" stroke="${stroke}" stroke-width="1.25"${dashed} />` +
    `<text x="${cx}" y="${cy + 3}" text-anchor="middle" font-size="9" font-weight="600" ` +
    `fill="${stroke}" font-family="system-ui, sans-serif">${escapeXml(def.label)}</text>` +
    queryGlyph +
    `<title>${escapeXml(def.label)} (${Math.round(f.widthCm)} cm)</title>` +
    `</g>`
  )
}

function renderIsland(
  i: Island,
  fit: FitResult,
  mode: SvgRenderMode,
  withId: boolean
): string {
  const w = i.lengthCm * fit.scale
  const h = i.widthCm * fit.scale
  const x = fit.inner.x + i.centerXCm * fit.scale - w / 2
  const y = fit.inner.y + i.centerYCm * fit.scale - h / 2
  const dashed = mode === 'homeowner' && i.confidence === 'L' ? ' stroke-dasharray="3 3"' : ''
  const idAttr = withId ? ` data-element-id="${i.id}" data-element-kind="island"` : ''
  return (
    `<g${idAttr}>` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" ` +
    `fill="${COLORS.islandFill}" stroke="${COLORS.cabStroke}" stroke-width="1.5"${dashed} />` +
    `<text x="${x + w / 2}" y="${y + h / 2 + 4}" text-anchor="middle" font-size="11" ` +
    `fill="${COLORS.textBody}" font-family="system-ui, sans-serif">Island</text>` +
    `</g>`
  )
}

function renderQueryBadge(cx: number, cy: number): string {
  return (
    `<g>` +
    `<circle cx="${cx + 30}" cy="${cy}" r="7" fill="white" stroke="${COLORS.lowConfidence}" stroke-width="1" />` +
    `<text x="${cx + 30}" y="${cy + 3}" text-anchor="middle" font-size="9" font-weight="700" ` +
    `fill="${COLORS.lowConfidence}" font-family="system-ui, sans-serif">?</text>` +
    `</g>`
  )
}

// Re-export wallAxis/wallLengthCm so external consumers can hold the same util.
export { wallAxis, wallLengthCm }
