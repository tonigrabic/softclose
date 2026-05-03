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
import {
  wallAxis,
  wallLengthCm,
  FEATURE_DEFAULTS,
  OPENING_DEFAULTS,
  counterSegmentsForWall,
  effectiveCounterDepth,
} from './model'
import { fitRoom, featurePxRect, openingPxRect, type FitResult } from './geometry'
import { formatLength } from './units'
import type { WallSide } from '@/lib/types'

const W = 480
const H = 320

const COLORS = {
  wall: '#1f2937',
  wallOpen: '#cbd5e1',
  cabStroke: '#a8a29e',
  counterFill: '#eef0e9',
  counterStroke: '#bbc1ad',
  islandFill: '#d6d3d1',
  textMuted: '#78716c',
  textHint: '#a8a29e',
  textBody: '#57534e',
  textWallLabel: '#9ca3af',
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
  /** Show Top/Bottom/Left/Right wall labels just outside the room. Default false (homeowner editor turns this on). */
  showWallLabels?: boolean
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
  const {
    mode = 'homeowner',
    includeDataAttrs = true,
    showDimensions = true,
    showDisclaimer = true,
    showWallLabels = false,
  } = opts
  const fit = fitRoom(plan.room, { w: W, h: H })

  let body = ''

  // Counter bands per side, auto-segmented by doors/passages on that wall.
  body += renderCounters(plan, fit)

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

  if (showWallLabels) {
    body += renderWallLabels(plan, fit)
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
 * Counter bands along each closed side that has counter, auto-segmented by
 * doors/passages on that wall. The counter is a homeowner-owned binary per
 * side (default from layout shape, override-able). Cabinets sit ON the counter
 * and are designed by the maker — we don't draw individual cabinets.
 */
function renderCounters(plan: FloorPlan, fit: FitResult): string {
  let s = ''
  const sides: WallSide[] = ['top', 'bottom', 'left', 'right']
  for (const wall of sides) {
    const segments = counterSegmentsForWall(plan, wall)
    if (segments.length === 0) continue
    const depthCm = effectiveCounterDepth(plan, wall)
    for (const seg of segments) {
      s += counterRectSvg(wall, seg, fit, plan.room, depthCm)
    }
  }
  return s
}

function counterRectSvg(
  wall: WallSide,
  seg: { startCm: number; endCm: number },
  fit: FitResult,
  room: { lengthCm: number; widthCm: number },
  depthCm: number
): string {
  const depthPx = Math.max(14, depthCm * fit.scale)
  const inset = 1
  let x = 0
  let y = 0
  let w = 0
  let h = 0
  switch (wall) {
    case 'top':
      x = fit.inner.x + seg.startCm * fit.scale + inset
      y = fit.inner.y + inset
      w = (seg.endCm - seg.startCm) * fit.scale - inset * 2
      h = depthPx
      break
    case 'bottom':
      x = fit.inner.x + seg.startCm * fit.scale + inset
      y = fit.inner.y + room.widthCm * fit.scale - depthPx - inset
      w = (seg.endCm - seg.startCm) * fit.scale - inset * 2
      h = depthPx
      break
    case 'left':
      x = fit.inner.x + inset
      y = fit.inner.y + seg.startCm * fit.scale + inset
      w = depthPx
      h = (seg.endCm - seg.startCm) * fit.scale - inset * 2
      break
    case 'right':
      x = fit.inner.x + room.lengthCm * fit.scale - depthPx - inset
      y = fit.inner.y + seg.startCm * fit.scale + inset
      w = depthPx
      h = (seg.endCm - seg.startCm) * fit.scale - inset * 2
      break
  }
  if (w <= 0 || h <= 0) return ''
  return (
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" ` +
    `fill="${COLORS.counterFill}" stroke="${COLORS.counterStroke}" stroke-width="1" />`
  )
}

function renderWallLabels(plan: FloorPlan, fit: FitResult): string {
  const sides = plan.room.sides
  const label = (wall: WallSide) =>
    sides[wall].kind === 'open'
      ? `${capitalize(wall)} (open)`
      : sides[wall].label
        ? `${capitalize(wall)} · ${sides[wall].label}`
        : capitalize(wall)
  const { x, y, w, h } = fit.inner
  const labelStyle = `font-size="10" font-weight="600" fill="${COLORS.textWallLabel}" font-family="system-ui, sans-serif" letter-spacing="0.04em"`
  return (
    `<text x="${x + w / 2}" y="${y - 8}" text-anchor="middle" ${labelStyle}>${escapeXml(label('top').toUpperCase())}</text>` +
    `<text x="${x + w / 2}" y="${y + h + 18}" text-anchor="middle" ${labelStyle}>${escapeXml(label('bottom').toUpperCase())}</text>` +
    `<text x="${x - 8}" y="${y + h / 2 + 4}" text-anchor="end" ${labelStyle}>${escapeXml(label('left').toUpperCase())}</text>` +
    `<text x="${x + w + 8}" y="${y + h / 2 + 4}" text-anchor="start" ${labelStyle}>${escapeXml(label('right').toUpperCase())}</text>`
  )
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
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
