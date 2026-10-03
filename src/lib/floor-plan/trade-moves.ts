/**
 * Do the water and the gas move (IMP-32)? Whether the sink and the hob stay on
 * the wall they are on today or go to another one — the line the maker reads
 * as "voda / plin se sele". Pure and server-safe: the confirm step's sink
 * chips, the brief and the wrap-up all read this one function.
 *
 * The first rule that applies wins:
 *   1. an empty room today — everything is a new installation;
 *   2. geometry — today's plan and the working plan put it on different
 *      walls: it moves, whatever was said;
 *   3. the homeowner's sink answer from the confirm step ("Ostaje gdje je" /
 *      "Seli se") — written only on a tap;
 *   4. the room step's intent — keep: both stay; move_sink: the sink moves
 *      (the spot is the maker's to agree), the hob stays;
 *   5. both plans put it on the same wall — it stays, as an inference;
 *   6. otherwise unknown.
 * Features are matched by kind, never by id (today's room and the working
 * plan are separate objects), and a shift along the same wall never counts as
 * a move — the pipes stay on that wall.
 *
 * The brief and the wrap-up derive this when they render, from the profile the
 * bundle already carries — there is no stored copy to go stale.
 */
import type { ConfidenceLevel, LayoutIntent, LeadProfile, WallSide } from '@/lib/types'
import type { ElementSource, Feature, FloorPlan } from './model'
import { WALL_LETTER } from './measure'

export type TradeStatus = 'stays' | 'moves' | 'new' | 'unknown'

export interface TradeMove {
  status: TradeStatus
  /** The wall it is on today, when the room shows it. */
  fromWall: WallSide | null
  /** The wall the working plan puts it on — null when a move has no drawn target. */
  toWall: WallSide | null
  /** Null only for 'unknown'. */
  confidence: ConfidenceLevel | null
  source: ElementSource | null
}

export interface TradeMoves {
  sink: TradeMove
  hob: TradeMove
  /** Either part moves. */
  anyMove: boolean
}

/** The homeowner's sink answer, stored as `trades.plumbing.sinkPosition`. */
export type SinkAnswer = 'same' | 'moving' | 'new'

type Part = 'sink' | 'hob'

const RANK: Record<ConfidenceLevel, number> = { L: 0, M: 1, H: 2 }

function firstOf(plan: FloorPlan | null | undefined, kind: Part): Feature | undefined {
  return plan?.features.find((f) => f.kind === kind)
}

/** The weaker of two features; a tie goes to today's (the read the move rests on). */
function weaker(was: Feature, now: Feature): Feature {
  return RANK[now.confidence] < RANK[was.confidence] ? now : was
}

function partMove(
  part: Part,
  was: Feature | undefined,
  now: Feature | undefined,
  intent: LayoutIntent | undefined,
  opts: { existingRoom?: 'kitchen' | 'empty'; sinkAnswer?: SinkAnswer }
): TradeMove {
  const from = was?.wall ?? null
  const to = now?.wall ?? null
  const said = (status: TradeStatus, toWall: WallSide | null = to): TradeMove => ({
    status,
    fromWall: status === 'new' ? null : from,
    toWall,
    confidence: 'H',
    source: 'homeowner',
  })

  // 1. No kitchen in the room today.
  if (opts.existingRoom === 'empty') return said('new')

  // 2. Drawn on another wall: a move, as sure as the weaker of the two reads.
  if (was && now && was.wall !== now.wall) {
    const w = weaker(was, now)
    return { status: 'moves', fromWall: from, toWall: to, confidence: w.confidence, source: w.source }
  }

  // 3. The homeowner's answer (the sink only).
  const answer = part === 'sink' ? opts.sinkAnswer : undefined
  if (answer === 'same') return said('stays')
  if (answer === 'moving') return said('moves', null)
  if (answer === 'new') return said('new')

  // 4. The room step's intent.
  if (intent === 'keep' || (intent === 'move_sink' && part === 'hob')) return said('stays')
  if (intent === 'move_sink') return said('moves', null)

  // 5. Same wall on both plans, read off the plans alone.
  if (was && now) {
    const c = weaker(was, now).confidence
    const confidence: ConfidenceLevel = intent === 'add_island' ? (RANK[c] < RANK.M ? c : 'M') : 'L'
    return { status: 'stays', fromWall: from, toWall: to, confidence, source: 'inferred' }
  }

  // 6.
  return { status: 'unknown', fromWall: from, toWall: to, confidence: null, source: null }
}

export function tradeMoves(
  existing: FloorPlan | null | undefined,
  working: FloorPlan | null | undefined,
  intent: LayoutIntent | undefined,
  opts: { existingRoom?: 'kitchen' | 'empty'; sinkAnswer?: SinkAnswer } = {}
): TradeMoves {
  const sink = partMove('sink', firstOf(existing, 'sink'), firstOf(working, 'sink'), intent, opts)
  const hob = partMove('hob', firstOf(existing, 'hob'), firstOf(working, 'hob'), intent, opts)
  return { sink, hob, anyMove: sink.status === 'moves' || hob.status === 'moves' }
}

export function tradeMovesFromProfile(
  p: Pick<LeadProfile, 'existingFloorPlan' | 'floorPlan' | 'layoutIntent' | 'existingRoom' | 'trades'>
): TradeMoves {
  return tradeMoves(p.existingFloorPlan, p.floorPlan, p.layoutIntent, {
    existingRoom: p.existingRoom,
    sinkAnswer: p.trades?.plumbing?.sinkPosition,
  })
}

function partDetail(part: Part, m: TradeMove, tr: (key: string) => string): string {
  const say = (variant: string) => tr(`maker.trades.${part}.${variant}`)
  switch (m.status) {
    case 'moves':
      if (!m.fromWall) return say('movesNoFrom')
      if (!m.toWall) return say('movesOpen').replace('{from}', WALL_LETTER[m.fromWall])
      return say('moves').replace('{from}', WALL_LETTER[m.fromWall]).replace('{to}', WALL_LETTER[m.toWall])
    case 'stays':
      return m.fromWall ? say('stays').replace('{from}', WALL_LETTER[m.fromWall]) : say('staysNoWall')
    case 'new':
      return m.toWall ? say('new').replace('{to}', WALL_LETTER[m.toWall]) : ''
    case 'unknown':
      return say('unknown')
  }
}

/**
 * The maker's line: a headline (`maker.trades.*`) and the per-part detail
 * joined with " · " (empty for a new installation with nothing drawn yet).
 * Null when neither part is known, so the row hides itself.
 */
export function describeTradeMoves(
  tm: TradeMoves,
  tr: (key: string) => string
): { headline: string; detail: string } | null {
  const parts = [tm.sink, tm.hob]
  if (parts.every((m) => m.status === 'unknown')) return null
  const headline = tm.anyMove
    ? 'moves'
    : parts.every((m) => m.status === 'new')
      ? 'new'
      : parts.every((m) => m.status === 'stays')
        ? 'stays'
        : 'unknown'
  const detail = (['sink', 'hob'] as const)
    .map((part) => partDetail(part, tm[part], tr))
    .filter(Boolean)
    .join(' · ')
  return { headline: tr(`maker.trades.${headline}`), detail }
}

/**
 * The maker brief's "Voda / plin" row: the headline and the detail on one
 * line, with the confidence and source of the weakest part that is known —
 * a move is only as sure as the read it rests on. Null when neither part is
 * known, so the row hides itself.
 */
export function makerTradesRow(
  tm: TradeMoves,
  tr: (key: string) => string
): { value: string; confidence: ConfidenceLevel; source: ElementSource } | null {
  const line = describeTradeMoves(tm, tr)
  let weakest: { confidence: ConfidenceLevel; source: ElementSource } | null = null
  for (const m of [tm.sink, tm.hob]) {
    if (m.status === 'unknown' || !m.confidence || !m.source) continue
    if (!weakest || RANK[m.confidence] < RANK[weakest.confidence]) {
      weakest = { confidence: m.confidence, source: m.source }
    }
  }
  if (!line || !weakest) return null
  return { value: line.detail ? `${line.headline} — ${line.detail}` : line.headline, ...weakest }
}

/**
 * The homeowner's wrap-up line for the sink (`wrapup.trades.*`), in words —
 * never the stored answer as it is. Null when unknown, so the row hides.
 */
export function homeownerSinkLine(m: TradeMove, tr: (key: string) => string): string | null {
  switch (m.status) {
    case 'stays':
      return tr('wrapup.trades.stays')
    case 'moves':
      return m.toWall ? tr('wrapup.trades.moves').replace('{to}', WALL_LETTER[m.toWall]) : tr('wrapup.trades.movesOpen')
    case 'new':
      return tr('wrapup.trades.new')
    case 'unknown':
      return null
  }
}
