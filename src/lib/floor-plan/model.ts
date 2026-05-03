/**
 * Floor-plan domain model — cm-based, single source of truth.
 *
 * The product principle behind this shape: the homeowner reports the
 * immovable constraints (room outline, openings, fixed features); the
 * designer designs the cabinets. So this model intentionally does NOT
 * make cabinet runs editable — those render as a faint hint background
 * derived from the layout shape, not as user-owned data.
 *
 * Every position is in centimetres relative to the room's top-left
 * corner. The canvas presenter (Konva) and the static SVG presenter
 * both consume this shape; the Vision API still emits percent-based
 * positions, and `fromVision()` translates those into cm using the
 * room footprint.
 */
import type {
  ConfidenceLevel,
  SpaceVisionResult,
  WallSide,
  FeaturePosition,
  IslandPosition,
  OpeningPosition,
} from '@/lib/types'

// ─── Source / confidence provenance ──────────────────────────────────────────

export type ElementSource = 'homeowner' | 'ai_vision' | 'inferred' | 'preset'

/** Reusable confidence + provenance pair. */
export interface Provenance {
  confidence: ConfidenceLevel
  source: ElementSource
}

// ─── Layout shape (drives the cabinet hint background) ───────────────────────

export type LayoutShape =
  | 'galley'
  | 'l_shape'
  | 'u_shape'
  | 'peninsula'
  | 'island'
  | 'open'
  | 'unsure'

// ─── Sides of the room (closed wall vs open passage to another room) ─────────

export type SideKind = 'closed' | 'open'

export interface SideSpec {
  kind: SideKind
  /** Optional homeowner label, e.g. "window wall" or "to dining room". */
  label?: string
  /**
   * Whether this side has counter/worktop running along it. `undefined` means
   * "use layout-shape default" (resolved by `effectiveHasCounter`). Open sides
   * never have counter, regardless of this flag.
   *
   * The renderer auto-segments the counter band wherever a door/passage
   * interrupts it — windows do not break counters (counters under windows are
   * normal). Features like sink/hob sit ON the counter and don't break it
   * either.
   */
  hasCounter?: boolean
  /**
   * How deep the counter is, in cm (perpendicular to the wall). `undefined`
   * uses the standard 60 cm. Most kitchens are 60; a few use shallower 50–55
   * (smaller flats) or deeper 65 (with appliances behind a fascia).
   */
  counterDepthCm?: number
  /**
   * How long the counter run is, in cm (along the wall). `undefined` means
   * "the full wall" — the renderer still cuts out doors/passages automatically.
   * Setting this lets a homeowner say "the counter only goes halfway, then
   * there's a free wall".
   */
  counterLengthCm?: number
  /**
   * Where the counter run begins along the wall, in cm from the wall's start
   * corner. `undefined` means "anchored at the start corner" (legacy behavior
   * — counter sits flush in the corner). Combined with `counterLengthCm` this
   * lets the homeowner park a partial run anywhere on the wall: aligned to
   * the start corner, centered, against the far corner, or at a custom
   * offset. Ignored when the counter spans the full wall.
   */
  counterStartCm?: number
}

export interface RoomSides {
  top: SideSpec
  bottom: SideSpec
  left: SideSpec
  right: SideSpec
}

// ─── Element types ───────────────────────────────────────────────────────────

export type OpeningKind = 'window' | 'door' | 'passage'
export type FeatureKind = 'sink' | 'hob' | 'fridge' | 'dishwasher'

export interface RoomSpec {
  lengthCm: number
  widthCm: number
  sides: RoomSides
  confidence: ConfidenceLevel
  source: ElementSource
}

export interface Opening {
  id: string
  kind: OpeningKind
  wall: WallSide
  /** Distance in cm from the wall's start corner (top→bottom for vertical, left→right for horizontal). */
  startCm: number
  widthCm: number
  swing?: 'in' | 'out'
  confidence: ConfidenceLevel
  source: ElementSource
}

export interface Feature {
  id: string
  kind: FeatureKind
  wall: WallSide
  /** Distance in cm from the wall's start corner to the feature's centre. */
  centerCm: number
  widthCm: number
  confidence: ConfidenceLevel
  source: ElementSource
}

export interface Island {
  id: string
  centerXCm: number
  centerYCm: number
  lengthCm: number
  widthCm: number
  seating?: boolean
  confidence: ConfidenceLevel
  source: ElementSource
}

/**
 * `'photo_only'`        AI vision saw the photos and inferred everything.
 * `'photo_plus_homeowner'` Vision seeded; homeowner touched at least one element.
 * `'homeowner_only'`    Started from a layout-shape preset (no photos).
 * `'deferred_to_designer'` Homeowner explicitly skipped — the designer will measure.
 */
export type MeasurementMethod =
  | 'photo_only'
  | 'photo_plus_homeowner'
  | 'homeowner_only'
  | 'deferred_to_designer'

export type DisplayUnit = 'cm' | 'ft_in'

export interface FloorPlan {
  schemaVersion: 1
  /** Display preference only; storage is always cm. */
  units: DisplayUnit
  layoutShape: LayoutShape
  hasIsland: boolean
  room: RoomSpec
  openings: Opening[]
  features: Feature[]
  island?: Island
  measurementMethod: MeasurementMethod
}

// ─── Defaults & catalog ──────────────────────────────────────────────────────

/** Typical real-world widths for each fixed feature (cm). */
export const FEATURE_DEFAULTS: Record<
  FeatureKind,
  { widthCm: number; depthCm: number; label: string }
> = {
  sink: { widthCm: 80, depthCm: 55, label: 'Sink' },
  hob: { widthCm: 75, depthCm: 60, label: 'Hob' },
  fridge: { widthCm: 75, depthCm: 65, label: 'Fridge' },
  dishwasher: { widthCm: 60, depthCm: 60, label: 'DW' },
}

export const OPENING_DEFAULTS: Record<
  OpeningKind,
  { widthCm: number; label: string }
> = {
  window: { widthCm: 110, label: 'Window' },
  door: { widthCm: 80, label: 'Door' },
  passage: { widthCm: 130, label: 'Passage' },
}

/** Sensible default room sizes per layout shape. Used when AI declines to scale. */
export const DEFAULT_ROOM_BY_SHAPE: Record<LayoutShape, { lengthCm: number; widthCm: number }> = {
  galley: { lengthCm: 360, widthCm: 220 },
  l_shape: { lengthCm: 380, widthCm: 320 },
  u_shape: { lengthCm: 360, widthCm: 360 },
  peninsula: { lengthCm: 400, widthCm: 320 },
  island: { lengthCm: 480, widthCm: 380 },
  open: { lengthCm: 480, widthCm: 380 },
  unsure: { lengthCm: 360, widthCm: 280 },
}

/** Per-shape sanity bands. Outside these, the dim is treated as not-yet-confirmed. */
export const SHAPE_DIM_BANDS: Record<
  LayoutShape,
  { length: [number, number]; width: [number, number] }
> = {
  galley: { length: [180, 550], width: [130, 300] },
  l_shape: { length: [220, 650], width: [180, 550] },
  u_shape: { length: [220, 550], width: [220, 550] },
  peninsula: { length: [220, 650], width: [220, 550] },
  island: { length: [320, 850], width: [280, 650] },
  open: { length: [220, 1000], width: [220, 800] },
  unsure: { length: [120, 1100], width: [120, 1100] },
}

/** Reasonable global dim limits for any single side. */
export const DIM_HARD_MIN = 120
export const DIM_HARD_MAX = 1200

// ─── Constructors / migration ────────────────────────────────────────────────

let _idCounter = 0
function nextId(prefix: string): string {
  _idCounter += 1
  return `${prefix}_${_idCounter.toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

function defaultSides(): RoomSides {
  return {
    top: { kind: 'closed' },
    bottom: { kind: 'closed' },
    left: { kind: 'closed' },
    right: { kind: 'closed' },
  }
}

/** Snap a wall axis ('h' or 'v') so we know which direction startCm runs. */
export function wallAxis(wall: WallSide): 'h' | 'v' {
  return wall === 'top' || wall === 'bottom' ? 'h' : 'v'
}

/** Default counter presence per side based on layout shape (closed sides only). */
export function defaultHasCounter(wall: WallSide, layoutShape: LayoutShape): boolean {
  switch (layoutShape) {
    case 'galley':
      return wall === 'top' || wall === 'bottom'
    case 'l_shape':
      return wall === 'top' || wall === 'left'
    case 'u_shape':
      return wall === 'top' || wall === 'left' || wall === 'right'
    case 'peninsula':
      // Counter on the long top run; bottom counter is partial in render but the
      // toggle is still "yes by default" so it shows up.
      return wall === 'top' || wall === 'bottom'
    case 'island':
    case 'open':
      return wall === 'top'
    case 'unsure':
    default:
      return wall === 'top'
  }
}

/** Standard kitchen counter depth in cm (60 cm worktop). */
export const DEFAULT_COUNTER_DEPTH_CM = 60

/** Common counter depth options surfaced in the UI; "Other" handled via custom input. */
export const COUNTER_DEPTH_OPTIONS_CM = [50, 55, 60, 65, 70]

/**
 * Resolve whether a given side has counter, taking into account the homeowner
 * override (`SideSpec.hasCounter`), the layout-shape default, and the rule that
 * open sides never carry counter.
 */
export function effectiveHasCounter(plan: FloorPlan, wall: WallSide): boolean {
  const side = plan.room.sides[wall]
  if (side.kind === 'open') return false
  if (typeof side.hasCounter === 'boolean') return side.hasCounter
  return defaultHasCounter(wall, plan.layoutShape)
}

/**
 * Resolved counter depth (cm). Falls back to `DEFAULT_COUNTER_DEPTH_CM` when
 * the homeowner hasn't customised it.
 */
export function effectiveCounterDepth(plan: FloorPlan, wall: WallSide): number {
  const side = plan.room.sides[wall]
  const depth = side.counterDepthCm
  if (typeof depth === 'number' && Number.isFinite(depth)) {
    return clamp(depth, 30, 120)
  }
  return DEFAULT_COUNTER_DEPTH_CM
}

/**
 * Resolved counter run length (cm). Returns the full wall length when no
 * override is set; clamps to the wall.
 */
export function effectiveCounterLength(plan: FloorPlan, wall: WallSide): number {
  const total = wallLengthCm(wall, plan.room)
  const override = plan.room.sides[wall].counterLengthCm
  if (typeof override === 'number' && Number.isFinite(override)) {
    return clamp(override, 0, total)
  }
  return total
}

/**
 * Resolved counter run start offset (cm from the wall's start corner). If the
 * counter spans the full wall, start is always 0. Otherwise we honour the
 * homeowner override, clamped so the run can't slide past the far corner.
 */
export function effectiveCounterStart(plan: FloorPlan, wall: WallSide): number {
  const total = wallLengthCm(wall, plan.room)
  const len = effectiveCounterLength(plan, wall)
  if (len >= total) return 0
  const override = plan.room.sides[wall].counterStartCm
  if (typeof override === 'number' && Number.isFinite(override)) {
    return clamp(override, 0, total - len)
  }
  return 0
}

/**
 * True if the homeowner has explicitly capped the counter run for this side.
 * The UI uses this to flag "custom length" vs. the default "full wall" run.
 */
export function hasCustomCounterLength(plan: FloorPlan, wall: WallSide): boolean {
  return typeof plan.room.sides[wall].counterLengthCm === 'number'
}

/** Walls that share a corner with the given wall (left↔top/bottom, etc.). */
function perpendicularWalls(wall: WallSide): { atStart: WallSide; atEnd: WallSide } {
  // Wall convention: top/bottom run left→right (start=left, end=right); left/right
  // run top→bottom (start=top, end=bottom).
  switch (wall) {
    case 'top':
      return { atStart: 'left', atEnd: 'right' }
    case 'bottom':
      return { atStart: 'left', atEnd: 'right' }
    case 'left':
      return { atStart: 'top', atEnd: 'bottom' }
    case 'right':
      return { atStart: 'top', atEnd: 'bottom' }
  }
}

/**
 * Distance an opening sits from a given corner on its own wall. Top/bottom run
 * left→right so corner-with-left = 0, corner-with-right = wallLen. Left/right
 * run top→bottom so corner-with-top = 0, corner-with-bottom = wallLen.
 */
function openingCornerDistance(
  o: Opening,
  corner: WallSide,
  room: { lengthCm: number; widthCm: number }
): number {
  const wallLen = wallLengthCm(o.wall, room)
  const nearCornerIsStart =
    (o.wall === 'top' && corner === 'left') ||
    (o.wall === 'bottom' && corner === 'left') ||
    (o.wall === 'left' && corner === 'top') ||
    (o.wall === 'right' && corner === 'top')
  if (nearCornerIsStart) return o.startCm
  return wallLen - (o.startCm + o.widthCm)
}


/**
 * Compute counter segments along a wall in cm-from-corner, with door and
 * passage openings cut out. Windows do not break counters; features sit on the
 * counter and don't break it either. Also retreats from corners that are
 * occupied by a door/passage on the perpendicular wall, so the rendered
 * counter doesn't impossibly hug a doorway. Returns an empty array if the
 * side has no counter at all.
 */
export function counterSegmentsForWall(
  plan: FloorPlan,
  wall: WallSide
): Array<{ startCm: number; endCm: number }> {
  if (!effectiveHasCounter(plan, wall)) return []
  const total = wallLengthCm(wall, plan.room)
  const runStart = clamp(effectiveCounterStart(plan, wall), 0, total)
  const runLen = clamp(effectiveCounterLength(plan, wall), 0, total - runStart)
  const runEnd = runStart + runLen
  if (runLen <= 0) return []
  // Start with one segment spanning the configured run.
  let segments: Array<{ startCm: number; endCm: number }> = [{ startCm: runStart, endCm: runEnd }]
  // Cut out every door/passage on THIS wall.
  for (const o of plan.openings) {
    if (o.wall !== wall) continue
    if (o.kind !== 'door' && o.kind !== 'passage') continue
    const cutStart = clamp(o.startCm, 0, total)
    const cutEnd = clamp(o.startCm + o.widthCm, 0, total)
    segments = segments.flatMap((seg) => splitSegment(seg, cutStart, cutEnd))
  }
  // Retreat from corners shared with a perpendicular door/passage. The
  // exclusion span on this wall = perpendicular wall's counter depth (or the
  // standard depth if the perpendicular wall has no counter) + a hinge-side
  // clearance allowance.
  const { atStart, atEnd } = perpendicularWalls(wall)
  const startExclusion = cornerExclusion(plan, wall, atStart, total)
  const endExclusion = cornerExclusion(plan, wall, atEnd, total)
  if (startExclusion > 0) {
    segments = segments.flatMap((seg) => splitSegment(seg, 0, startExclusion))
  }
  if (endExclusion > 0) {
    segments = segments.flatMap((seg) => splitSegment(seg, total - endExclusion, total))
  }
  // Drop pixel-thin slivers (< 20 cm reads as visual noise).
  return segments.filter((s) => s.endCm - s.startCm >= 20)
}

/**
 * Compute how far this wall's counter must retreat from the corner shared
 * with `perpWall` so that any door/passage on the perp wall doesn't visually
 * collide with the corner cabinet run.
 *
 * Geometry: this wall's counter occupies a band along the wall, extending
 * into the room by `effectiveCounterDepth(wall)` perpendicular to the wall.
 * A door/passage on the perp wall sits at the perp-wall line and (for
 * doors) sweeps `widthCm` into the room when it opens. Any opening whose
 * near edge falls strictly inside this wall's counter band is therefore in
 * the same corner pocket as the cabinet — that's the "intersecting wall"
 * overlap a homeowner sees as a door drawn over a counter. We retreat by
 * exactly the opening's body width so the counter ends flush against the
 * door (homeowners can choose to add their own clearance separately if
 * they want it).
 *
 * Returns 0 when no opening on the perp wall intrudes into the band.
 */
function cornerExclusion(
  plan: FloorPlan,
  wall: WallSide,
  perpWall: WallSide,
  thisWallLen: number
): number {
  let maxRetreat = 0
  // The corner influence band runs perpendicular to `wall` for as far as
  // this wall's own counter projects into the room. An opening past that
  // depth no longer overlaps the cabinet visually, so we don't push.
  const counterBandDepth = effectiveCounterDepth(plan, wall)
  for (const o of plan.openings) {
    if (o.wall !== perpWall) continue
    if (o.kind !== 'door' && o.kind !== 'passage') continue
    const dist = openingCornerDistance(o, wall, plan.room)
    if (dist >= counterBandDepth) continue
    // Retreat along this wall by the opening's full body width. For doors
    // this also clears the inward swing arc (which extends `widthCm` into
    // the room along this wall's axis). The counter ends flush with the
    // far edge of the door — they can technically butt up to each other.
    const retreat = o.widthCm
    maxRetreat = Math.max(maxRetreat, retreat)
  }
  return Math.min(maxRetreat, thisWallLen / 2)
}

function splitSegment(
  seg: { startCm: number; endCm: number },
  cutStart: number,
  cutEnd: number
): Array<{ startCm: number; endCm: number }> {
  if (cutEnd <= seg.startCm || cutStart >= seg.endCm) return [seg]
  const out: Array<{ startCm: number; endCm: number }> = []
  if (cutStart > seg.startCm) out.push({ startCm: seg.startCm, endCm: cutStart })
  if (cutEnd < seg.endCm) out.push({ startCm: cutEnd, endCm: seg.endCm })
  return out
}

/** The length (in cm) of a given wall in the room. */
export function wallLengthCm(wall: WallSide, room: { lengthCm: number; widthCm: number }): number {
  return wallAxis(wall) === 'h' ? room.lengthCm : room.widthCm
}

/**
 * Convert a vision-supplied percent-along-wall into a cm-from-wall-start.
 * Vision uses the same axis convention (top/bottom run left→right, left/right
 * run top→bottom), so this is just a scale.
 */
function pctToCm(positionPct: number, wall: WallSide, lengthCm: number, widthCm: number): number {
  const total = wallAxis(wall) === 'h' ? lengthCm : widthCm
  return clamp((positionPct / 100) * total, 0, total)
}

function pctWidthToCm(widthPct: number, wall: WallSide, lengthCm: number, widthCm: number): number {
  const total = wallAxis(wall) === 'h' ? lengthCm : widthCm
  return clamp((widthPct / 100) * total, 30, total)
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

/**
 * Build a FloorPlan from the raw vision result. Used as the seed when the
 * homeowner first sees the editor.
 *
 * Cm dims fall back to per-shape defaults when vision declined to scale; the
 * editor surfaces a "set the size" affordance based on `room.confidence === 'L'`.
 */
export function fromVision(
  vision: SpaceVisionResult | null | undefined,
  opts: { units?: DisplayUnit } = {}
): FloorPlan {
  const layoutShape = (vision?.layoutShape as LayoutShape | undefined) ?? 'unsure'
  const fallback = DEFAULT_ROOM_BY_SHAPE[layoutShape] ?? DEFAULT_ROOM_BY_SHAPE.unsure

  let lengthCm = vision?.lengthCm ?? fallback.lengthCm
  let widthCm = vision?.widthCm ?? fallback.widthCm
  // Always orient so length >= width (matches our wallAxis convention).
  if (widthCm > lengthCm) [lengthCm, widthCm] = [widthCm, lengthCm]

  const dimsCameFromVision = Boolean(vision?.lengthCm && vision?.widthCm)
  const dimsConfidence: ConfidenceLevel = dimsCameFromVision ? 'M' : 'L'
  const dimsSource: ElementSource = dimsCameFromVision ? 'ai_vision' : 'preset'

  const room: RoomSpec = {
    lengthCm,
    widthCm,
    sides: defaultSides(),
    confidence: dimsConfidence,
    source: dimsSource,
  }

  // Open-side detection from layout shape — peninsulas usually open on one
  // short side, true open-plan opens on one long side. Conservative defaults.
  if (layoutShape === 'peninsula') room.sides.right = { kind: 'open' }
  if (layoutShape === 'open') room.sides.bottom = { kind: 'open' }

  const openings: Opening[] = []
  for (const w of vision?.windows ?? []) {
    openings.push(visionOpeningToOpening(w, 'window', lengthCm, widthCm))
  }
  for (const d of vision?.doors ?? []) {
    openings.push(visionOpeningToOpening(d, 'door', lengthCm, widthCm))
  }

  const features: Feature[] = []
  if (vision?.features) {
    if (vision.features.sink) features.push(visionFeatureToFeature('sink', vision.features.sink, lengthCm, widthCm))
    if (vision.features.hob) features.push(visionFeatureToFeature('hob', vision.features.hob, lengthCm, widthCm))
    if (vision.features.fridge) features.push(visionFeatureToFeature('fridge', vision.features.fridge, lengthCm, widthCm))
    if (vision.features.dishwasher) features.push(visionFeatureToFeature('dishwasher', vision.features.dishwasher, lengthCm, widthCm))
  }

  let island: Island | undefined
  if (vision?.features?.island) {
    island = visionIslandToIsland(vision.features.island, lengthCm, widthCm)
  } else if (vision?.hasIsland) {
    island = defaultIsland(lengthCm, widthCm)
  }

  const hasIsland = Boolean(island) || layoutShape === 'island' || Boolean(vision?.hasIsland)

  return {
    schemaVersion: 1,
    units: opts.units ?? 'cm',
    layoutShape,
    hasIsland,
    room,
    openings,
    features,
    island,
    measurementMethod: vision ? 'photo_only' : 'homeowner_only',
  }
}

/**
 * Build a FloorPlan from just a layout shape — used when the user skipped photos
 * and picked a shape from the visual chooser.
 */
export function fromShapePreset(
  layoutShape: LayoutShape,
  opts: { hasIsland?: boolean; units?: DisplayUnit } = {}
): FloorPlan {
  const dims = DEFAULT_ROOM_BY_SHAPE[layoutShape] ?? DEFAULT_ROOM_BY_SHAPE.unsure
  const room: RoomSpec = {
    lengthCm: dims.lengthCm,
    widthCm: dims.widthCm,
    sides: defaultSides(),
    confidence: 'L',
    source: 'preset',
  }
  if (layoutShape === 'peninsula') room.sides.right = { kind: 'open' }
  if (layoutShape === 'open') room.sides.bottom = { kind: 'open' }

  const island = opts.hasIsland || layoutShape === 'island' ? defaultIsland(dims.lengthCm, dims.widthCm) : undefined

  return {
    schemaVersion: 1,
    units: opts.units ?? 'cm',
    layoutShape,
    hasIsland: Boolean(island),
    room,
    openings: [],
    features: [],
    island,
    measurementMethod: 'homeowner_only',
  }
}

function visionOpeningToOpening(
  src: OpeningPosition,
  kind: OpeningKind,
  lengthCm: number,
  widthCm: number
): Opening {
  const widthCmFinal = pctWidthToCm(src.widthPct, src.wall, lengthCm, widthCm)
  const center = pctToCm(src.positionPct, src.wall, lengthCm, widthCm)
  const startCm = clamp(center - widthCmFinal / 2, 0, wallAxis(src.wall) === 'h' ? lengthCm : widthCm)
  return {
    id: nextId(kind),
    kind,
    wall: src.wall,
    startCm,
    widthCm: widthCmFinal,
    swing: src.swing,
    confidence: 'M',
    source: 'ai_vision',
  }
}

function visionFeatureToFeature(
  kind: FeatureKind,
  src: FeaturePosition,
  lengthCm: number,
  widthCm: number
): Feature {
  const def = FEATURE_DEFAULTS[kind]
  return {
    id: nextId(kind),
    kind,
    wall: src.wall,
    centerCm: pctToCm(src.positionPct, src.wall, lengthCm, widthCm),
    widthCm: def.widthCm,
    confidence: src.confidence,
    source: 'ai_vision',
  }
}

function visionIslandToIsland(src: IslandPosition, lengthCm: number, widthCm: number): Island {
  return {
    id: nextId('island'),
    centerXCm: clamp((src.positionPct.x / 100) * lengthCm, 0, lengthCm),
    centerYCm: clamp((src.positionPct.y / 100) * widthCm, 0, widthCm),
    lengthCm: clamp((src.sizePct.w / 100) * lengthCm, 80, lengthCm * 0.8),
    widthCm: clamp((src.sizePct.h / 100) * widthCm, 60, widthCm * 0.7),
    confidence: 'M',
    source: 'ai_vision',
  }
}

function defaultIsland(roomLengthCm: number, roomWidthCm: number): Island {
  return {
    id: nextId('island'),
    centerXCm: roomLengthCm / 2,
    centerYCm: roomWidthCm / 2,
    lengthCm: clamp(roomLengthCm * 0.35, 120, 280),
    widthCm: clamp(roomWidthCm * 0.28, 80, 120),
    confidence: 'L',
    source: 'inferred',
  }
}

// ─── Mutation helpers (immutable; UI uses these to drive state) ──────────────

/** Mark an element confirmed by the homeowner. */
export function confirmedBy(prov: Provenance, source: ElementSource = 'homeowner'): Provenance {
  return { confidence: 'H', source }
}

/** Make a fresh element of the given kind, placed sensibly on the named wall. */
export function makeOpening(kind: OpeningKind, wall: WallSide, room: RoomSpec): Opening {
  const def = OPENING_DEFAULTS[kind]
  const total = wallLengthCm(wall, room)
  return {
    id: nextId(kind),
    kind,
    wall,
    startCm: clamp(total / 2 - def.widthCm / 2, 0, total - def.widthCm),
    widthCm: Math.min(def.widthCm, total),
    confidence: 'H',
    source: 'homeowner',
  }
}

export function makeFeature(kind: FeatureKind, wall: WallSide, room: RoomSpec): Feature {
  const def = FEATURE_DEFAULTS[kind]
  const total = wallLengthCm(wall, room)
  return {
    id: nextId(kind),
    kind,
    wall,
    centerCm: total / 2,
    widthCm: Math.min(def.widthCm, total - 20),
    confidence: 'H',
    source: 'homeowner',
  }
}

export function makeIsland(room: RoomSpec): Island {
  return defaultIsland(room.lengthCm, room.widthCm)
}

// ─── Validation ──────────────────────────────────────────────────────────────

/** Returns a normalized copy with everything clamped to legal ranges. */
export function validate(plan: FloorPlan): FloorPlan {
  const lengthCm = clamp(plan.room.lengthCm, DIM_HARD_MIN, DIM_HARD_MAX)
  const widthCm = clamp(plan.room.widthCm, DIM_HARD_MIN, DIM_HARD_MAX)
  const room: RoomSpec = { ...plan.room, lengthCm, widthCm }

  const openings = plan.openings
    .filter((o) => isClosedSide(plan, o.wall))
    .map((o) => clampOpening(o, room))
  const features = plan.features.map((f) => clampFeature(f, room))
  const island = plan.island ? clampIsland(plan.island, room) : undefined

  return { ...plan, room, openings, features, island, hasIsland: Boolean(island) }
}

function isClosedSide(plan: FloorPlan, wall: WallSide): boolean {
  return plan.room.sides[wall].kind !== 'open'
}

function clampOpening(o: Opening, room: RoomSpec): Opening {
  const total = wallLengthCm(o.wall, room)
  const widthCm = clamp(o.widthCm, 30, total)
  const startCm = clamp(o.startCm, 0, total - widthCm)
  return { ...o, widthCm, startCm }
}

function clampFeature(f: Feature, room: RoomSpec): Feature {
  const total = wallLengthCm(f.wall, room)
  const widthCm = clamp(f.widthCm, 30, total - 20)
  const centerCm = clamp(f.centerCm, widthCm / 2, total - widthCm / 2)
  return { ...f, widthCm, centerCm }
}

function clampIsland(i: Island, room: RoomSpec): Island {
  const lengthCm = clamp(i.lengthCm, 80, room.lengthCm * 0.85)
  const widthCm = clamp(i.widthCm, 60, room.widthCm * 0.85)
  const centerXCm = clamp(i.centerXCm, lengthCm / 2 + 60, room.lengthCm - lengthCm / 2 - 60)
  const centerYCm = clamp(i.centerYCm, widthCm / 2 + 60, room.widthCm - widthCm / 2 - 60)
  return { ...i, lengthCm, widthCm, centerXCm, centerYCm }
}

/** True if at least one element appears to have homeowner-supplied data. */
export function hasHomeownerEdits(plan: FloorPlan): boolean {
  if (plan.room.source === 'homeowner') return true
  if (plan.measurementMethod !== 'photo_only') return true
  return [...plan.openings, ...plan.features, plan.island].some(
    (e): e is Opening | Feature | Island => Boolean(e) && (e as Provenance).source === 'homeowner'
  )
}

// ─── Type guards ─────────────────────────────────────────────────────────────

export function isOpening(el: unknown): el is Opening {
  return Boolean(el && typeof el === 'object' && 'kind' in el && 'startCm' in el && 'widthCm' in el)
}
export function isFeature(el: unknown): el is Feature {
  return Boolean(el && typeof el === 'object' && 'kind' in el && 'centerCm' in el)
}
export function isIsland(el: unknown): el is Island {
  return Boolean(el && typeof el === 'object' && 'centerXCm' in el)
}
