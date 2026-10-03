/**
 * The measured room as hard rules for the concept render (IMP-32).
 *
 * The room step froze the room the homeowner measured; the working plan is
 * that room plus the intent. The render used to know nothing about it and
 * invented walls. This module turns the working plan into a small payload —
 * walls, runs, openings, sink and hob walls, island, sizes — that the client
 * sends with the render request, the server re-checks (`sanitizeRoomConstraints`)
 * and the prompt spells out (`describeRoomConstraints`).
 *
 * The payload is numbers and enums only. No free text survives the sanitiser,
 * so nothing a client sends here can reach the model as an instruction.
 *
 * Wall letters are the room step's (A top, B right, C bottom, D left). The
 * image model cannot see them, so `cameraFrame` translates each letter into
 * where that wall sits in the anchor photo, in the same frame the photo read
 * uses (facing wall A, wall D is on the left).
 *
 * Server-safe: no 'use client', imports only the floor-plan model, the layout
 * contract and types.
 */
import type { LayoutIntent, PhotoViewTarget, WallCorner, WallSide } from '@/lib/types'
import { floorPlanToLayout } from '@/lib/contract/layout-contract'
import { isRoomMeasured, validate, wallLengthCm, WALL_LETTER, type FloorPlan, type LayoutShape } from '@/lib/floor-plan'

/** What the homeowner wants; 'new' = the room is empty today. */
export type RenderIntent = LayoutIntent | 'new'

export interface RenderWall {
  wall: WallSide
  /** The wall's length (cm). */
  wallCm: number
  /** Base cabinets along it (cm), doors cut out. */
  counterCm: number
  /** Upper cabinets — a soft default; the render's adjustments own them. */
  uppers: boolean
  /** A full-height tall run. */
  tall: boolean
}

export interface RenderRoomConstraints {
  version: 1
  intent: RenderIntent
  shape: LayoutShape
  /** A/C = length, B/D = width. */
  roomCm: { length: number; width: number }
  ceilingCm: number | null
  ceilingMeasured: boolean
  /** In letter order A, B, C, D. */
  counterWalls: RenderWall[]
  windowWalls: WallSide[]
  doorWalls: WallSide[]
  /** Only counter walls. */
  sinkWall: WallSide | null
  hobWall: WallSide | null
  /** move_sink: the wall the sink leaves (it sits there today). `sinkWall` is then null. */
  sinkMovesFrom: WallSide | null
  island: { lengthCm: number; widthCm: number } | null
}

const LETTER_ORDER: readonly WallSide[] = ['top', 'right', 'bottom', 'left']

// Literal sets as own-key records: the compiler keeps them in step with the
// types, and an own-key check never matches a prototype key ('toString').
const WALL_SET: Record<WallSide, true> = { top: true, right: true, bottom: true, left: true }
const INTENT_SET: Record<RenderIntent, true> = { keep: true, add_island: true, move_sink: true, change: true, new: true }
const SHAPE_SET: Record<LayoutShape, true> = {
  single_wall: true,
  galley: true,
  l_shape: true,
  u_shape: true,
  peninsula: true,
  island: true,
  open: true,
  unsure: true,
}
const TARGET_SET: Record<PhotoViewTarget, true> = {
  top: true,
  right: true,
  bottom: true,
  left: true,
  top_left: true,
  top_right: true,
  bottom_right: true,
  bottom_left: true,
  unclear: true,
}

const WALL_MIN_CM = 120
const WALL_MAX_CM = 1200
const CEILING_MIN_CM = 200
const CEILING_MAX_CM = 400
const ISLAND_LENGTH_CM: readonly [number, number] = [60, 400]
const ISLAND_WIDTH_CM: readonly [number, number] = [40, 200]

function pick<T extends string>(v: unknown, set: Record<T, true>): T | null {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(set, v) ? (v as T) : null
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** A finite number, rounded, inside [min, max] — or null. Never a clamp. */
function cmIn(v: unknown, min: number, max: number): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null
  const r = Math.round(v)
  return r >= min && r <= max ? r : null
}

function byLetter(a: WallSide, b: WallSide): number {
  return LETTER_ORDER.indexOf(a) - LETTER_ORDER.indexOf(b)
}

const letter = (w: WallSide) => WALL_LETTER[w]

/** "A", "A and D", "A, B and D". */
function letters(ws: readonly WallSide[]): string {
  const ls = ws.map(letter)
  return ls.length <= 1 ? (ls[0] ?? '') : `${ls.slice(0, -1).join(', ')} and ${ls[ls.length - 1]}`
}

/** Unique valid walls, letter order. */
function wallList(raw: unknown): WallSide[] {
  if (!Array.isArray(raw)) return []
  const out = new Set<WallSide>()
  for (const v of raw) {
    const w = pick(v, WALL_SET)
    if (w) out.add(w)
    if (out.size === 4) break
  }
  return [...out].sort(byLetter)
}

/** A photo-view label from the client, checked against the literal set. */
export function sanitizePhotoViewTarget(raw: unknown): PhotoViewTarget | null {
  return pick(raw, TARGET_SET)
}

/**
 * The client's (or anyone's) payload, rebuilt from known keys only. Anything
 * required that is missing or out of range makes the whole payload null —
 * the route then renders unconstrained and says so (`constrained: false`).
 */
export function sanitizeRoomConstraints(raw: unknown): RenderRoomConstraints | null {
  if (!isRecord(raw) || raw.version !== 1) return null
  const intent = pick(raw.intent, INTENT_SET)
  const shape = pick(raw.shape, SHAPE_SET)
  if (!intent || !shape) return null
  const room = isRecord(raw.roomCm) ? raw.roomCm : {}
  const length = cmIn(room.length, WALL_MIN_CM, WALL_MAX_CM)
  const width = cmIn(room.width, WALL_MIN_CM, WALL_MAX_CM)
  if (length === null || width === null) return null

  const counterWalls: RenderWall[] = []
  for (const entry of Array.isArray(raw.counterWalls) ? raw.counterWalls : []) {
    if (counterWalls.length === 4) break
    if (!isRecord(entry)) continue
    const wall = pick(entry.wall, WALL_SET)
    if (!wall || counterWalls.some((c) => c.wall === wall)) continue
    const wallCm = cmIn(entry.wallCm, WALL_MIN_CM, WALL_MAX_CM)
    if (wallCm === null) continue
    const counterCm = cmIn(entry.counterCm, 0, wallCm)
    if (counterCm === null) continue
    counterWalls.push({ wall, wallCm, counterCm, uppers: entry.uppers === true, tall: entry.tall === true })
  }
  if (counterWalls.length === 0) return null
  counterWalls.sort((a, b) => byLetter(a.wall, b.wall))

  const onCounter = (v: unknown): WallSide | null => {
    const w = pick(v, WALL_SET)
    return w && counterWalls.some((c) => c.wall === w) ? w : null
  }
  const sinkMovesFrom = intent === 'move_sink' ? pick(raw.sinkMovesFrom, WALL_SET) : null
  const ceilingCm = cmIn(raw.ceilingCm, CEILING_MIN_CM, CEILING_MAX_CM)
  const isl = isRecord(raw.island) ? raw.island : null
  const islandLength = isl ? cmIn(isl.lengthCm, ...ISLAND_LENGTH_CM) : null
  const islandWidth = isl ? cmIn(isl.widthCm, ...ISLAND_WIDTH_CM) : null

  return {
    version: 1,
    intent,
    shape,
    roomCm: { length, width },
    ceilingCm,
    ceilingMeasured: ceilingCm !== null && raw.ceilingMeasured === true,
    counterWalls,
    windowWalls: wallList(raw.windowWalls),
    doorWalls: wallList(raw.doorWalls),
    sinkWall: sinkMovesFrom ? null : onCounter(raw.sinkWall),
    hobWall: onCounter(raw.hobWall),
    sinkMovesFrom,
    island: islandLength !== null && islandWidth !== null ? { lengthCm: islandLength, widthCm: islandWidth } : null,
  }
}

function firstFeatureWall(plan: FloorPlan | null | undefined, kind: 'sink' | 'hob'): WallSide | null {
  return plan?.features.find((f) => f.kind === kind)?.wall ?? null
}

/**
 * The render payload for the live working plan, or null until every counter
 * wall is measured. Runs, uppers and tall units come from the layout contract
 * the confirm step and the builder count from, so the render and the tally
 * read the same plan. The result goes through the sanitiser, so the client
 * sends exactly what the server keeps.
 */
export function roomConstraintsFor(i: {
  plan: FloorPlan | null | undefined
  existing?: FloorPlan | null
  intent?: LayoutIntent
  existingRoom?: 'kitchen' | 'empty'
}): RenderRoomConstraints | null {
  if (!i.plan || !isRoomMeasured(i.plan)) return null
  const plan = validate(i.plan)
  const contract = floorPlanToLayout(plan)
  const counterWalls: RenderWall[] = []
  for (const wall of LETTER_ORDER) {
    const run = contract.runs.find((r) => r.id === wall)
    if (!run) continue
    counterWalls.push({
      wall,
      wallCm: Math.round(wallLengthCm(wall, plan.room)),
      counterCm: Math.round(run.lengthCm),
      uppers: run.hasWall,
      tall: run.hasTall,
    })
  }

  const intent: RenderIntent = i.existingRoom === 'empty' ? 'new' : (i.intent ?? 'keep')
  const planSink = firstFeatureWall(plan, 'sink')
  // The sink still sits where it is today: the render must move it. Without
  // the as-is room, the working plan's sink is today's (move_sink starts from
  // the room unchanged).
  const todaySink = i.existing ? firstFeatureWall(i.existing, 'sink') : planSink
  const sinkMovesFrom = intent === 'move_sink' && planSink !== null && planSink === todaySink ? planSink : null
  const wallsWith = (kinds: readonly string[]) =>
    [...new Set(plan.openings.filter((o) => kinds.includes(o.kind)).map((o) => o.wall))].sort(byLetter)

  return sanitizeRoomConstraints({
    version: 1,
    intent,
    shape: plan.layoutShape,
    roomCm: { length: Math.round(plan.room.lengthCm), width: Math.round(plan.room.widthCm) },
    ceilingCm: plan.ceilingHeightCm != null ? Math.round(plan.ceilingHeightCm) : null,
    ceilingMeasured: plan.ceilingSource === 'homeowner',
    counterWalls,
    windowWalls: wallsWith(['window']),
    // A passage is a doorway without a door: cabinets never cross it either.
    doorWalls: wallsWith(['door', 'passage']),
    sinkWall: sinkMovesFrom ? null : planSink,
    hobWall: firstFeatureWall(plan, 'hob'),
    sinkMovesFrom,
    island: plan.island
      ? { lengthCm: Math.round(plan.island.lengthCm), widthCm: Math.round(plan.island.widthCm) }
      : null,
  } satisfies RenderRoomConstraints)
}

// ─── Camera ─────────────────────────────────────────────────────────────────

/** Where each wall sits in a photo: ahead, at the left or right of the frame, or behind the camera. */
export interface CameraFrame {
  ahead: WallSide[]
  left: WallSide | null
  right: WallSide | null
  behind: WallSide[]
}

// Same frame as the photo read: facing wall A (top), wall D (left) is on the left.
const FACING: Record<WallSide, CameraFrame> = {
  top: { ahead: ['top'], left: 'left', right: 'right', behind: ['bottom'] },
  right: { ahead: ['right'], left: 'top', right: 'bottom', behind: ['left'] },
  bottom: { ahead: ['bottom'], left: 'right', right: 'left', behind: ['top'] },
  left: { ahead: ['left'], left: 'bottom', right: 'top', behind: ['right'] },
}
// A corner shot looks into the corner: its two walls fill the frame, left and right.
const INTO_CORNER: Record<WallCorner, CameraFrame> = {
  top_left: { ahead: ['top', 'left'], left: 'left', right: 'top', behind: ['right', 'bottom'] },
  top_right: { ahead: ['top', 'right'], left: 'top', right: 'right', behind: ['bottom', 'left'] },
  bottom_right: { ahead: ['right', 'bottom'], left: 'right', right: 'bottom', behind: ['top', 'left'] },
  bottom_left: { ahead: ['bottom', 'left'], left: 'bottom', right: 'left', behind: ['top', 'right'] },
}

/** Where the walls sit in a photo that shows `shows`; null when the photo read could not tell. */
export function cameraFrame(shows: PhotoViewTarget): CameraFrame | null {
  const target = sanitizePhotoViewTarget(shows)
  if (!target || target === 'unclear') return null
  const f = pick(target, WALL_SET) ? FACING[target as WallSide] : INTO_CORNER[target as WallCorner]
  return { ahead: [...f.ahead], left: f.left, right: f.right, behind: [...f.behind] }
}

function isCorner(shows: PhotoViewTarget): boolean {
  return shows !== 'unclear' && !pick(shows, WALL_SET)
}

/** "faces wall D" / "faces the corner of walls A and D"; null when unclear. */
export function photoViewPhrase(shows: PhotoViewTarget): string | null {
  const frame = cameraFrame(shows)
  if (!frame) return null
  return isCorner(shows)
    ? `faces the corner of walls ${letters([...frame.ahead].sort(byLetter))}`
    : `faces wall ${letter(frame.ahead[0])}`
}

// ─── Prompt text ────────────────────────────────────────────────────────────

/** "wall A" / "walls A and D". */
function wallsPhrase(ws: readonly WallSide[]): string {
  return `${ws.length === 1 ? 'wall' : 'walls'} ${letters(ws)}`
}

function adjacent(a: WallSide, b: WallSide): boolean {
  const h = (w: WallSide) => w === 'top' || w === 'bottom'
  return h(a) !== h(b)
}

function shapePhrase(walls: readonly WallSide[]): string {
  if (walls.length === 1) return 'exactly 1 wall (a single run)'
  if (walls.length === 2) {
    return adjacent(walls[0], walls[1])
      ? 'exactly 2 walls, meeting in one corner (L-shape)'
      : 'exactly 2 walls, facing each other (galley)'
  }
  if (walls.length === 3) return 'exactly 3 walls (U-shape)'
  return 'all 4 walls'
}

/**
 * The ROOM block of the render prompt. How firmly each fact is held depends
 * on the intent: keep, add_island and new hold everything; move_sink frees
 * only the sink; change holds the room size, openings and ceiling and offers
 * today's cabinet walls as a starting point. Upper cabinets are always a soft
 * default — the render's adjustments own them.
 *
 * With `camera`, every wall is also named by where it sits in the anchor
 * photo, and walls behind the camera are told not to appear.
 */
export function describeRoomConstraints(
  c: RenderRoomConstraints,
  camera?: { photoNumber: number; shows: PhotoViewTarget }
): string {
  const frame = camera ? cameraFrame(camera.shows) : null
  const corner = camera ? isCorner(camera.shows) : false
  const position = (w: WallSide): string | null => {
    if (!frame) return null
    if (frame.behind.includes(w)) return 'behind the camera'
    if (frame.left === w) return corner ? 'left side of the frame' : 'left edge of the frame'
    if (frame.right === w) return corner ? 'right side of the frame' : 'right edge of the frame'
    if (frame.ahead.includes(w)) return 'the wall the camera faces'
    return null
  }
  const named = (w: WallSide) => {
    const p = position(w)
    return p ? `wall ${letter(w)} (${p})` : `wall ${letter(w)}`
  }

  const change = c.intent === 'change'
  const walls = c.counterWalls.map((w) => w.wall)
  const lines: string[] = []

  if (c.intent === 'new') {
    lines.push(
      'ROOM — an empty room today, measured by the homeowner; below is the kitchen they want built in it. These are HARD RULES: they override the style references, product photos and adjustments.'
    )
  } else if (change) {
    lines.push(
      'ROOM — measured by the homeowner. The room size, windows, doors and ceiling are HARD RULES: they override the style references, product photos and adjustments. The homeowner wants a different layout, so the cabinets described below are how the kitchen is today.'
    )
  } else {
    lines.push(
      'ROOM — measured by the homeowner. These are HARD RULES: they override the style references, product photos and adjustments.'
    )
  }

  const ceiling =
    c.ceilingCm !== null ? `, ceiling ${c.ceilingCm} cm${c.ceilingMeasured ? '' : ' (estimated)'}` : ''
  lines.push(
    `- Room ${c.roomCm.length} × ${c.roomCm.width} cm (walls A and C are ${c.roomCm.length} cm, walls B and D ${c.roomCm.width} cm)${ceiling}.`
  )

  const runs = c.counterWalls
    .map(
      (w) =>
        `${named(w.wall)}: ${w.wallCm} cm long, base cabinets and worktop along ${w.counterCm} cm of it${w.tall ? ', plus full-height tall cabinets' : ''}`
    )
    .join('; ')
  if (change) {
    lines.push(
      `- Today the cabinets stand on ${wallsPhrase(walls)}: ${runs}. This layout may change — use it only as a starting point.`
    )
  } else {
    lines.push(`- Cabinets stand on ${shapePhrase(walls)}: ${runs}.`)
    const empty = LETTER_ORDER.filter((w) => !walls.includes(w))
    if (empty.length > 0) {
      lines.push(
        `- ${empty.length === 1 ? `Wall ${letters(empty)} carries` : `Walls ${letters(empty)} carry`} NO cabinets, worktop or appliances. Do not add a run there.`
      )
    }
    const withUppers = c.counterWalls.filter((w) => w.uppers).map((w) => w.wall)
    const without = walls.filter((w) => !withUppers.includes(w))
    if (withUppers.length === 0) {
      lines.push('- No upper cabinets by default; an adjustment below may change that.')
    } else {
      lines.push(
        `- Upper cabinets on ${wallsPhrase(withUppers)}${without.length > 0 ? `, none on ${wallsPhrase(without)}` : ''} — a default; an adjustment below may change the upper cabinets.`
      )
    }
  }

  const openings = [
    ...c.windowWalls.map((w) => `Window on ${named(w)}`),
    ...c.doorWalls.map((w) => `Door on ${named(w)}`),
  ]
  if (openings.length > 0) {
    lines.push(`- ${openings.join('. ')}. Keep them where they are; never run cabinets across a door.`)
  }

  const fixtures: string[] = []
  if (change) {
    const today = [c.sinkWall && `sink on wall ${letter(c.sinkWall)}`, c.hobWall && `hob on wall ${letter(c.hobWall)}`].filter(
      Boolean
    )
    if (today.length > 0) fixtures.push(`Today: ${today.join(', ')}; they may move with the new layout.`)
  } else {
    if (c.sinkMovesFrom) {
      const others = walls.filter((w) => w !== c.sinkMovesFrom)
      const targets = [...(others.length > 0 ? [wallsPhrase(others)] : []), ...(c.island ? ['the island'] : [])]
      fixtures.push(
        targets.length > 0
          ? `The sink moves: it is not on wall ${letter(c.sinkMovesFrom)} where it is today — place it on ${targets.join(' or ')}.`
          : `The sink moves to a new place along wall ${letter(c.sinkMovesFrom)}, not where it is today.`
      )
    } else if (c.sinkWall) {
      fixtures.push(`Sink on wall ${letter(c.sinkWall)}.`)
    }
    if (c.hobWall) fixtures.push(`Hob on wall ${letter(c.hobWall)}.`)
  }
  if (fixtures.length > 0) lines.push(`- ${fixtures.join(' ')}`)

  if (change) {
    lines.push(
      c.island
        ? `- Today there is an island of ${c.island.lengthCm} × ${c.island.widthCm} cm; it may change too.`
        : '- No island today.'
    )
  } else {
    lines.push(
      c.island
        ? `- One free-standing island, ${c.island.lengthCm} × ${c.island.widthCm} cm, its long side parallel to wall A, in the open floor between the runs.`
        : '- No island and no peninsula.'
    )
  }

  if (camera && frame) {
    const behind = [...frame.behind].sort(byLetter)
    const notShown = `${behind.length === 1 ? `Wall ${letters(behind)} is` : `Walls ${letters(behind)} are`} behind the camera and must not appear.`
    if (corner && frame.left && frame.right) {
      lines.push(
        `CAMERA: Photo ${camera.photoNumber} (the anchor) looks into the corner where wall ${letter(frame.left)} and wall ${letter(frame.right)} meet: wall ${letter(frame.left)} runs in from the left edge of the frame, wall ${letter(frame.right)} from the right edge. ${notShown}`
      )
    } else if (frame.left && frame.right) {
      lines.push(
        `CAMERA: Photo ${camera.photoNumber} (the anchor) faces wall ${letter(frame.ahead[0])}. Wall ${letter(frame.left)} is at the left edge of the frame, wall ${letter(frame.right)} at the right edge. ${notShown}`
      )
    }
  }

  return lines.join('\n')
}
