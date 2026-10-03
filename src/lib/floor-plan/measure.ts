/**
 * The room step: the homeowner confirms the shape of the room they have today
 * and measures every wall the kitchen stands on. Decision 2026-10-03: the
 * homeowner measures; an AI number is only ever a hint.
 *
 * Pure helpers over the cm-based FloorPlan. A typed wall length is stored per
 * side (`SideSpec.measuredLengthCm`) — its presence is the provenance — and
 * folded into the room's dimensions; opposite walls share one dimension, so
 * the longer of a pair sets it and the shorter keeps its own counter length.
 */
import type { LayoutIntent, LeadProfile, SpaceVisionResult, WallSide } from '@/lib/types'
import {
  DIM_HARD_MAX,
  DIM_HARD_MIN,
  effectiveCounterLength,
  effectiveCounterStart,
  effectiveHasCounter,
  fromShapePreset,
  fromVision,
  makeFeature,
  makeIsland,
  validate,
  wallAxis,
  type FloorPlan,
  type LayoutShape,
  type RoomSides,
} from './model'
import { parseLengthToCm } from './units'

/**
 * Fixed letters, clockwise from the top: the same wall keeps its letter when a
 * photo label is corrected or the shape changes, so the photo chips, the plan
 * picture and the fields never disagree. An L therefore reads "A, D".
 */
export const WALL_LETTER: Record<WallSide, 'A' | 'B' | 'C' | 'D'> = {
  top: 'A',
  right: 'B',
  bottom: 'C',
  left: 'D',
}
const LETTER_ORDER: readonly WallSide[] = ['top', 'right', 'bottom', 'left']

/** The walls the kitchen stands on, in letter order. */
export function counterWalls(plan: FloorPlan): WallSide[] {
  return LETTER_ORDER.filter((w) => plan.room.sides[w].kind !== 'open' && effectiveHasCounter(plan, w))
}

export function isValidWallLength(cm: number | null | undefined): cm is number {
  return typeof cm === 'number' && Number.isFinite(cm) && cm >= DIM_HARD_MIN && cm <= DIM_HARD_MAX
}

/** Counter walls still without a typed length. */
export function missingWalls(plan: FloorPlan | null | undefined): WallSide[] {
  if (!plan) return []
  return counterWalls(plan).filter((w) => !isValidWallLength(plan.room.sides[w].measuredLengthCm))
}

/** Every wall the kitchen stands on has a typed length. The gate for the render. */
export function isRoomMeasured(plan: FloorPlan | null | undefined): boolean {
  return Boolean(plan) && counterWalls(plan!).length > 0 && missingWalls(plan).length === 0
}

export function hasAnyMeasuredWall(plan: FloorPlan | null | undefined): boolean {
  return Boolean(plan) && LETTER_ORDER.some((w) => isValidWallLength(plan!.room.sides[w].measuredLengthCm))
}

/**
 * The photo read's estimate for one wall, for the grey hint under its field.
 * Only an anchored vision dimension counts — never a preset default, which is
 * not an estimate. `fromVision` puts the longer dimension on top/bottom.
 */
export function wallEstimateCm(vision: SpaceVisionResult | null | undefined, wall: WallSide): number | null {
  const l = vision?.lengthCm
  const w = vision?.widthCm
  const longer = l && w ? Math.max(l, w) : (l ?? null)
  const shorter = l && w ? Math.min(l, w) : null
  const v = wallAxis(wall) === 'h' ? longer : shorter
  return v ? Math.round(v) : null
}

/**
 * A typed wall length → cm, or null when it does not look like one.
 * "380", "380 cm", "3.8 m", "3,8" (a bare number under 20 is metres) are all
 * 380. Outside 120–1200 cm is null — never a silent clamp, which could not
 * honestly be stamped as measured.
 */
export function parseWallLengthCm(raw: string): number | null {
  const text = raw.trim().replace(',', '.')
  let cm = parseLengthToCm(text)
  if (cm == null) return null
  if (/^\d+(\.\d+)?$/.test(text) && cm < 20) cm *= 100
  cm = Math.round(cm)
  return isValidWallLength(cm) ? cm : null
}

function scale(pos: number, from: number, to: number): number {
  return from > 0 ? (pos * to) / from : pos
}

/**
 * Set (or clear, with null) the typed length of one wall.
 *
 * The wall's axis takes the longest typed length among the counter walls on
 * it; when two facing counter walls differ, the shorter one keeps its length
 * as its counter run. Elements the photo read placed on that axis move with
 * the new size (positions scale); anything the homeowner placed stays put.
 * Once every counter wall is typed the plan is measured by the homeowner; the
 * room's H stamp needs a typed wall on both axes (see below).
 */
export function withMeasuredWall(
  plan: FloorPlan,
  wall: WallSide,
  cm: number | null,
  opts: { hasPhotos: boolean }
): FloorPlan {
  const typed = isValidWallLength(cm) ? cm : undefined
  const sides: RoomSides = {
    ...plan.room.sides,
    // A cleared wall also drops the run length a facing pair gave it.
    [wall]: { ...plan.room.sides[wall], measuredLengthCm: typed, ...(typed ? {} : { counterLengthCm: undefined }) },
  }
  let next: FloorPlan = { ...plan, room: { ...plan.room, sides } }

  const axis = wallAxis(wall)
  const onAxis = counterWalls(next).filter(
    (w) => wallAxis(w) === axis && isValidWallLength(next.room.sides[w].measuredLengthCm)
  )
  if (onAxis.length > 0) {
    const lengths = onAxis.map((w) => next.room.sides[w].measuredLengthCm!)
    const to = Math.max(...lengths)
    const from = axis === 'h' ? next.room.lengthCm : next.room.widthCm
    const moved = (w: WallSide, source: string) => wallAxis(w) === axis && source !== 'homeowner'
    const island = next.island
    // Every measured counter wall on the axis gets its run recomputed: the
    // shorter of a facing pair keeps its own length, anything else runs the
    // whole wall — so a run length left from an earlier pair never caps a wall.
    const s = { ...next.room.sides }
    for (const w of onAxis) {
      const own = s[w].measuredLengthCm!
      s[w] = { ...s[w], counterLengthCm: onAxis.length === 2 && own < to ? own : undefined }
    }
    next = {
      ...next,
      room: { ...next.room, sides: s, ...(axis === 'h' ? { lengthCm: to } : { widthCm: to }) },
      openings: next.openings.map((o) => (moved(o.wall, o.source) ? { ...o, startCm: scale(o.startCm, from, to) } : o)),
      features: next.features.map((f) => (moved(f.wall, f.source) ? { ...f, centerCm: scale(f.centerCm, from, to) } : f)),
      island:
        island && island.source !== 'homeowner'
          ? axis === 'h'
            ? { ...island, centerXCm: scale(island.centerXCm, from, to) }
            : { ...island, centerYCm: scale(island.centerYCm, from, to) }
          : island,
    }
  }

  // The room's confidence speaks for BOTH dimensions, so it becomes the
  // homeowner's only when a wall on each axis was typed. A galley or a single
  // wall measures its runs but not the depth of the room: the typed walls carry
  // their own provenance (measuredLengthCm), the room stays an estimate. Taking
  // a measurement back restores the estimate it replaced.
  const axes = new Set(counterWalls(next).map(wallAxis))
  const ownedByHomeowner = isRoomMeasured(next) && axes.size === 2
  const room = next.room
  if (ownedByHomeowner && room.source !== 'homeowner') {
    next = {
      ...next,
      room: { ...room, confidence: 'H', source: 'homeowner', estimate: { confidence: room.confidence, source: room.source } },
    }
  } else if (!ownedByHomeowner && room.source === 'homeowner' && room.estimate) {
    const { estimate, ...rest } = room
    next = { ...next, room: { ...rest, confidence: estimate.confidence, source: estimate.source } }
  }
  if (isRoomMeasured(next)) {
    next = { ...next, measurementMethod: opts.hasPhotos ? 'photo_plus_homeowner' : 'homeowner_only' }
  }
  return withShapeLabel(next)
}

/**
 * Re-derive the shape label (and pin defaults it would change) without
 * clamping elements. Typed lengths scale positions by ratio, which is
 * reversible only while nothing is clamped in between — a typo and its
 * correction, or editing one of a facing pair, must land every element where a
 * direct entry would. Elements are clamped once, when the room step commits.
 */
function withShapeLabel(plan: FloorPlan): FloorPlan {
  const v = validate(plan)
  return { ...plan, room: { ...plan.room, sides: v.room.sides }, layoutShape: v.layoutShape }
}

export const CEILING_MIN_CM = 200
export const CEILING_MAX_CM = 400

/**
 * Typed ceiling height (optional). Clearing it falls back to the photo read's
 * estimate, which stays "nije izmjereno".
 */
export function withCeiling(plan: FloorPlan, cm: number | null, aiFallbackCm?: number): FloorPlan {
  if (cm != null && cm >= CEILING_MIN_CM && cm <= CEILING_MAX_CM) {
    return { ...plan, ceilingHeightCm: Math.round(cm), ceilingSource: 'homeowner' }
  }
  return { ...plan, ceilingHeightCm: aiFallbackCm, ceilingSource: aiFallbackCm ? 'ai_vision' : undefined }
}

/** A typed ceiling height → cm, or null. Same rules as a wall, in its own range. */
export function parseCeilingCm(raw: string): number | null {
  const text = raw.trim().replace(',', '.')
  let cm = parseLengthToCm(text)
  if (cm == null) return null
  if (/^\d+(\.\d+)?$/.test(text) && cm < 20) cm *= 100
  cm = Math.round(cm)
  return cm >= CEILING_MIN_CM && cm <= CEILING_MAX_CM ? cm : null
}

// ─── The shape card ──────────────────────────────────────────────────────────

/** The six cards on the room step. 'empty' is not a layout: no kitchen there yet. */
export type RoomCard = 'l_shape' | 'u_shape' | 'galley' | 'single_wall' | 'island' | 'empty'
export const ROOM_CARDS: readonly RoomCard[] = ['l_shape', 'u_shape', 'galley', 'single_wall', 'island', 'empty']
/** The cards for the kitchen they want, when the room is empty today. */
export const TARGET_CARDS: readonly Exclude<RoomCard, 'empty'>[] = ['l_shape', 'u_shape', 'galley', 'single_wall', 'island']

/** Which card a plan reads as — the pre-selection on the room step. */
export function cardForPlan(plan: FloorPlan | null | undefined): Exclude<RoomCard, 'empty'> | null {
  if (!plan) return null
  if (plan.hasIsland) return 'island'
  const walls = counterWalls(plan)
  if (walls.length === 0) return null
  if (walls.length >= 3) return 'u_shape'
  if (walls.length === 2) {
    const [a, b] = walls
    return wallAxis(a) === wallAxis(b) ? 'galley' : 'l_shape'
  }
  return 'single_wall'
}

/** Wall sets a card admits, the conventional orientation first. */
const CARD_WALLS: Record<Exclude<RoomCard, 'empty' | 'island'>, WallSide[][]> = {
  single_wall: [['top'], ['right'], ['bottom'], ['left']],
  galley: [['top', 'bottom'], ['left', 'right']],
  l_shape: [['top', 'left'], ['top', 'right'], ['bottom', 'left'], ['bottom', 'right']],
  u_shape: [['left', 'top', 'right'], ['top', 'right', 'bottom'], ['right', 'bottom', 'left'], ['bottom', 'left', 'top']],
}

/**
 * The plan for a picked card. Without a plan, the card's preset. With one, the
 * walls that fit the card are kept (the one most like the current walls wins),
 * so a corrected L stays on the walls the photos showed; openings, features
 * and typed lengths are kept. The island card adds an island if there is none
 * and keeps the walls; every other card removes it.
 */
export function withShape(plan: FloorPlan | null | undefined, card: Exclude<RoomCard, 'empty'>): FloorPlan {
  if (!plan) return validate(fromShapePreset(card as LayoutShape, { hasIsland: card === 'island' }))
  const current = counterWalls(plan)
  let walls: WallSide[]
  if (card === 'island') {
    walls = current.length > 0 ? current : ['top']
  } else {
    const options = CARD_WALLS[card]
    walls = options.reduce((best, o) =>
      o.filter((w) => current.includes(w)).length > best.filter((w) => current.includes(w)).length ? o : best
    )
  }
  const sides = { ...plan.room.sides }
  for (const w of LETTER_ORDER) {
    const on = walls.includes(w)
    sides[w] = { ...sides[w], ...(on ? { kind: 'closed' as const } : {}), hasCounter: on }
  }
  const island = card === 'island' ? (plan.island ?? makeIsland(plan.room)) : undefined
  let next = validate({ ...plan, layoutShape: card, room: { ...plan.room, sides }, island, hasIsland: Boolean(island) })
  // The walls changed, so the room and its runs are re-derived from every
  // typed length: a run length left over from the previous shape never caps,
  // and a new facing pair gets its own.
  const hasPhotos = next.measurementMethod === 'photo_plus_homeowner' || next.measurementMethod === 'photo_only'
  for (const w of LETTER_ORDER) {
    const cm = next.room.sides[w].measuredLengthCm
    if (isValidWallLength(cm)) next = withMeasuredWall(next, w, cm, { hasPhotos })
  }
  return next
}

/** The room as the photos read it, or null when there is nothing to read (or no kitchen in it yet). */
export function roomPlanFromVision(vision: SpaceVisionResult | null | undefined): FloorPlan | null {
  if (!vision || !vision.lookedLikeKitchen || vision.emptyRoom) return null
  return validate(fromVision(vision))
}

/**
 * A new or corrected photo read while a plan exists: rebuild the plan from the
 * read, then put back every length and the ceiling the homeowner typed. With
 * no read (photos removed) a measured plan stays and an unmeasured one goes.
 */
export function reseedRoomPlan(
  prev: FloorPlan | null | undefined,
  vision: SpaceVisionResult | null | undefined,
  opts: { hasPhotos: boolean }
): FloorPlan | null {
  if (!vision) return prev && hasAnyMeasuredWall(prev) ? prev : null
  if (!prev) return null
  const base = roomPlanFromVision(vision)
  if (!base) return prev
  // An island the homeowner put on the plan has nothing to do with which
  // walls the photos show: it stays.
  let next = prev.island && !base.island ? { ...base, island: prev.island, hasIsland: true } : base
  for (const w of LETTER_ORDER) {
    const cm = prev.room.sides[w].measuredLengthCm
    if (isValidWallLength(cm)) next = withMeasuredWall(next, w, cm, opts)
  }
  if (prev.ceilingSource === 'homeowner') next = withCeiling(next, prev.ceilingHeightCm ?? null)
  return next
}

/**
 * The working plan the render and the confirm step build on: the room as
 * measured, plus the intent — an island added when that is what they want.
 * Every other intent starts from the room as it is today.
 */
export function workingPlanFromRoom(room: FloorPlan, intent?: LayoutIntent): FloorPlan {
  return intent === 'add_island' && !room.hasIsland
    ? validate({ ...room, island: makeIsland(room.room), hasIsland: true })
    : room
}

// ─── The light confirm (IMP-32) ──────────────────────────────────────────────

/**
 * The island on or off. On adds the default island when there is none (an
 * existing one stays as drawn); off removes it. The counter walls never
 * change, so the rest of the tally is untouched.
 */
export function withIsland(plan: FloorPlan, on: boolean): FloorPlan {
  if (on) return plan.island ? plan : validate({ ...plan, island: makeIsland(plan.room), hasIsland: true })
  return plan.island ? validate({ ...plan, island: undefined, hasIsland: false }) : plan
}

/**
 * The sink on another wall, as the homeowner tapped it: the first sink moves
 * to the middle of that wall's counter run (the whole wall when the run is
 * not cut short) and becomes theirs. With no sink on the plan, one is added
 * there.
 */
export function withSinkOnWall(plan: FloorPlan, wall: WallSide): FloorPlan {
  const centerCm = effectiveCounterStart(plan, wall) + effectiveCounterLength(plan, wall) / 2
  const sink = plan.features.find((f) => f.kind === 'sink')
  const features = sink
    ? plan.features.map((f) =>
        f.id === sink.id ? { ...f, wall, centerCm, confidence: 'H' as const, source: 'homeowner' as const } : f
      )
    : [...plan.features, { ...makeFeature('sink', wall, plan.room), centerCm }]
  return validate({ ...plan, features })
}

/**
 * The sink back where it is today: the plan's sink takes the wall, position,
 * width and provenance of the room's own sink (added when the plan has
 * none). A no-op — the same object — when the room shows no sink or the
 * sink is already there.
 */
export function withSinkAsToday(plan: FloorPlan, existing: FloorPlan | null | undefined): FloorPlan {
  const today = existing?.features.find((f) => f.kind === 'sink')
  if (!today) return plan
  const sink = plan.features.find((f) => f.kind === 'sink')
  if (sink && sink.wall === today.wall && sink.centerCm === today.centerCm && sink.widthCm === today.widthCm) {
    return plan
  }
  const spot = {
    wall: today.wall,
    centerCm: today.centerCm,
    widthCm: today.widthCm,
    confidence: today.confidence,
    source: today.source,
  }
  const features = sink
    ? plan.features.map((f) => (f.id === sink.id ? { ...f, ...spot } : f))
    : [...plan.features, { ...today }]
  return validate({ ...plan, features })
}

/** Can the room step's footer Continue move on from this screen? */
export function roomStepReady(input: {
  phase: 'shape' | 'measure'
  plan: FloorPlan | null | undefined
  existingRoom?: 'kitchen' | 'empty'
  layoutIntent?: LayoutIntent
}): boolean {
  if (input.phase === 'measure') return isRoomMeasured(input.plan)
  // A shape with no wall carrying counter has nothing to measure — no way on.
  if (!input.plan || counterWalls(input.plan).length === 0) return false
  return input.existingRoom === 'empty' || Boolean(input.layoutIntent)
}

/**
 * The room step is done: committed with every counter wall measured. The
 * render's gate and the resume rule read this, never the live plan. A plan
 * committed by an earlier build (before the stamp existed) counts through its
 * measured as-is room.
 */
export function roomStepDone(profile: Pick<LeadProfile, 'roomConfirmed' | 'existingFloorPlan'> | null | undefined): boolean {
  return Boolean(profile?.roomConfirmed) || isRoomMeasured(profile?.existingFloorPlan)
}
