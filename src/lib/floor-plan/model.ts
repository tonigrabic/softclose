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
