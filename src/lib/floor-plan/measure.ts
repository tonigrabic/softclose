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
import type { LayoutIntent, SpaceVisionResult, WallSide } from '@/lib/types'
import {
  DIM_HARD_MAX,
  DIM_HARD_MIN,
  effectiveHasCounter,
  fromShapePreset,
  fromVision,
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
 * Once every counter wall is typed the room is the homeowner's: H, measured.
 */
export function withMeasuredWall(
  plan: FloorPlan,
  wall: WallSide,
  cm: number | null,
  opts: { hasPhotos: boolean }
): FloorPlan {
  const sides: RoomSides = {
    ...plan.room.sides,
    [wall]: { ...plan.room.sides[wall], measuredLengthCm: isValidWallLength(cm) ? cm : undefined },
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
    next = {
      ...next,
      room: { ...next.room, ...(axis === 'h' ? { lengthCm: to } : { widthCm: to }) },
      openings: next.openings.map((o) => (moved(o.wall, o.source) ? { ...o, startCm: scale(o.startCm, from, to) } : o)),
      features: next.features.map((f) => (moved(f.wall, f.source) ? { ...f, centerCm: scale(f.centerCm, from, to) } : f)),
      island:
        island && island.source !== 'homeowner'
          ? axis === 'h'
            ? { ...island, centerXCm: scale(island.centerXCm, from, to) }
            : { ...island, centerYCm: scale(island.centerYCm, from, to) }
          : island,
    }
    if (onAxis.length === 2) {
      const s = { ...next.room.sides }
      for (const w of onAxis) {
        const own = s[w].measuredLengthCm!
        s[w] = { ...s[w], counterLengthCm: own < to ? own : undefined }
      }
      next = { ...next, room: { ...next.room, sides: s } }
    }
  }

  if (isRoomMeasured(next)) {
    next = {
      ...next,
      room: { ...next.room, confidence: 'H', source: 'homeowner' },
      measurementMethod: opts.hasPhotos ? 'photo_plus_homeowner' : 'homeowner_only',
    }
  }
  return validate(next)
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
  return validate({ ...plan, layoutShape: card, room: { ...plan.room, sides }, island, hasIsland: Boolean(island) })
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
  let next = base
  for (const w of LETTER_ORDER) {
    const cm = prev.room.sides[w].measuredLengthCm
    if (isValidWallLength(cm)) next = withMeasuredWall(next, w, cm, opts)
  }
  if (prev.ceilingSource === 'homeowner') next = withCeiling(next, prev.ceilingHeightCm ?? null)
  return next
}

/** Can the room step's footer Continue move on from this screen? */
export function roomStepReady(input: {
  phase: 'shape' | 'measure'
  plan: FloorPlan | null | undefined
  existingRoom?: 'kitchen' | 'empty'
  layoutIntent?: LayoutIntent
}): boolean {
  if (input.phase === 'measure') return isRoomMeasured(input.plan)
  if (!input.plan) return false
  return input.existingRoom === 'empty' || Boolean(input.layoutIntent)
}
