/**
 * IMP-32 Done-when 3: the brief shows whether the sink moves.
 *
 * `tradeMoves` compares the room as it is today (room step) with the working
 * plan the homeowner confirmed, then the sink answer, then the intent. These
 * pin the rule order (geometry first), the confidence each rule carries, the
 * maker's line built from it, and the two places it is shown: the brief's
 * "Voda / plin" row (with lettered walls on the schematic) and the
 * homeowner's wrap-up sink row.
 */
import { describe, expect, test } from 'vitest'
import { MOCK_SPACE_VISION } from '@/lib/api/mock-fixtures/space-vision'
import { tDynamic, type Locale } from '@/lib/i18n/core'
import { hrHR } from '@/lib/i18n/locales/hr-HR'
import { buildHandoffBundle } from '@/lib/handoff/bundle'
import type { LeadProfile } from '@/lib/types'
import {
  counterWalls,
  describeTradeMoves,
  homeownerSinkLine,
  makerTradesRow,
  roomPlanFromVision,
  tradeMoves,
  tradeMovesFromProfile,
  validate,
  withIsland,
  withMeasuredWall,
  withSinkAsToday,
  withSinkOnWall,
  workingPlanFromRoom,
  type FloorPlan,
  type TradeMove,
  type TradeMoves,
} from '@/lib/floor-plan'

/** The mock L, measured A = 420, D = 300 — what commitRoom stores as the room. */
function measuredRoom(): FloorPlan {
  let p = roomPlanFromVision(MOCK_SPACE_VISION)!
  p = withMeasuredWall(p, 'top', 420, { hasPhotos: true })
  p = withMeasuredWall(p, 'left', 300, { hasPhotos: true })
  return validate(p)
}

const hr = (k: string) => tDynamic(k, 'hr-HR')
const sinkOf = (p: FloorPlan) => p.features.find((f) => f.kind === 'sink')!

describe('tradeMoves', () => {
  const room = measuredRoom()
  const working = workingPlanFromRoom(room, 'keep')

  test('the mock room has its sink and hob on wall A, read from the photos', () => {
    expect(counterWalls(room)).toEqual(['top', 'left'])
    expect(sinkOf(room)).toMatchObject({ wall: 'top', confidence: 'H', source: 'ai_vision' })
    expect(room.features.find((f) => f.kind === 'hob')).toMatchObject({ wall: 'top' })
  })

  test('keep: both stay, as the homeowner said', () => {
    const tm = tradeMoves(room, working, 'keep')
    expect(tm.sink).toEqual({ status: 'stays', fromWall: 'top', toWall: 'top', confidence: 'H', source: 'homeowner' })
    expect(tm.hob).toMatchObject({ status: 'stays', confidence: 'H', source: 'homeowner' })
    expect(tm.anyMove).toBe(false)
  })

  test('no plan of the room today (a journey from before the room step): unknown', () => {
    const tm = tradeMoves(undefined, working, undefined)
    expect(tm.sink).toEqual({ status: 'unknown', fromWall: null, toWall: 'top', confidence: null, source: null })
    expect(tm.hob.status).toBe('unknown')
    expect(describeTradeMoves(tm, hr)).toBeNull()
  })

  test('the room today shows no sink, intent change: the sink is unknown', () => {
    const noSink = { ...room, features: room.features.filter((f) => f.kind !== 'sink') }
    expect(tradeMoves(noSink, working, 'change').sink.status).toBe('unknown')
  })

  test('an empty room: a new installation, on the wall the plan puts it', () => {
    const tm = tradeMoves(undefined, working, undefined, { existingRoom: 'empty' })
    expect(tm.sink).toEqual({ status: 'new', fromWall: null, toWall: 'top', confidence: 'H', source: 'homeowner' })
    expect(tm.hob.status).toBe('new')
    // Even a stale intent or answer does not turn an empty room into a move.
    expect(tradeMoves(room, working, 'move_sink', { existingRoom: 'empty', sinkAnswer: 'moving' }).sink.status).toBe('new')
  })

  test('the sink drawn on wall D: a move A → D, as sure as the weaker read', () => {
    const moved = withSinkOnWall(working, 'left')
    expect(sinkOf(moved)).toMatchObject({ wall: 'left', confidence: 'H', source: 'homeowner' })
    const tm = tradeMoves(room, moved, 'keep')
    // Today's sink is the photo read (H, ai_vision); the moved one is the
    // homeowner's (H). A tie goes to today's read, which the move rests on.
    expect(tm.sink).toEqual({ status: 'moves', fromWall: 'top', toWall: 'left', confidence: 'H', source: 'ai_vision' })
    expect(tm.hob.status).toBe('stays')
    expect(tm.anyMove).toBe(true)
  })

  test('a weaker photo read of today\'s sink caps the move at its confidence', () => {
    const unsure = { ...room, features: room.features.map((f) => (f.kind === 'sink' ? { ...f, confidence: 'M' as const } : f)) }
    const tm = tradeMoves(unsure, withSinkOnWall(working, 'left'), 'keep')
    expect(tm.sink).toMatchObject({ status: 'moves', confidence: 'M', source: 'ai_vision' })
  })

  test('move_sink with the plan unchanged: the sink moves, the new spot is not drawn; the hob stays', () => {
    const tm = tradeMoves(room, working, 'move_sink')
    expect(tm.sink).toEqual({ status: 'moves', fromWall: 'top', toWall: null, confidence: 'H', source: 'homeowner' })
    expect(tm.hob).toMatchObject({ status: 'stays', fromWall: 'top' })
  })

  test('answer "same" with the plan unchanged: stays — the answer outranks the intent', () => {
    expect(tradeMoves(room, working, 'move_sink', { sinkAnswer: 'same' }).sink).toMatchObject({
      status: 'stays',
      fromWall: 'top',
      confidence: 'H',
      source: 'homeowner',
    })
  })

  test('answer "moving": a move with no drawn target', () => {
    expect(tradeMoves(room, working, 'keep', { sinkAnswer: 'moving' }).sink).toMatchObject({
      status: 'moves',
      fromWall: 'top',
      toWall: null,
    })
  })

  test('geometry outranks the answer: a sink drawn elsewhere moves even after "same"', () => {
    const tm = tradeMoves(room, withSinkOnWall(working, 'left'), 'keep', { sinkAnswer: 'same' })
    expect(tm.sink).toMatchObject({ status: 'moves', toWall: 'left' })
  })

  test('a shift of 120 cm along the same wall is not a move', () => {
    const s = sinkOf(working)
    const shifted = validate({
      ...working,
      features: working.features.map((f) => (f.id === s.id ? { ...f, centerCm: f.centerCm + 120 } : f)),
    })
    expect(sinkOf(shifted).centerCm).toBe(s.centerCm + 120)
    expect(tradeMoves(room, shifted, 'keep').sink.status).toBe('stays')
    expect(tradeMoves(room, shifted, 'change').sink).toMatchObject({ status: 'stays', confidence: 'L' })
  })

  test('add_island: same wall stays, inferred, capped at M', () => {
    const plan = workingPlanFromRoom(room, 'add_island')
    expect(plan.hasIsland).toBe(true)
    const tm = tradeMoves(room, plan, 'add_island')
    expect(tm.sink).toEqual({ status: 'stays', fromWall: 'top', toWall: 'top', confidence: 'M', source: 'inferred' })
    expect(tm.hob).toMatchObject({ status: 'stays', confidence: 'M', source: 'inferred' })
  })

  test('change: same wall stays at L', () => {
    expect(tradeMoves(room, working, 'change').sink).toMatchObject({ status: 'stays', confidence: 'L', source: 'inferred' })
  })

  test('tradeMovesFromProfile reads the room, the plan, the intent and the stored answer', () => {
    const tm = tradeMovesFromProfile({
      existingFloorPlan: room,
      floorPlan: working,
      layoutIntent: 'keep',
      existingRoom: 'kitchen',
      trades: { plumbing: { sinkPosition: 'moving' } },
    })
    expect(tm.sink).toMatchObject({ status: 'moves', toWall: null })
    expect(tradeMovesFromProfile({}).sink.status).toBe('unknown')
  })
})

describe('the confirm step\'s plan helpers', () => {
  const room = measuredRoom()
  const working = workingPlanFromRoom(room, 'keep')

  test('withSinkAsToday puts a moved sink back, so it reads as staying', () => {
    const moved = withSinkOnWall(working, 'left')
    const back = withSinkAsToday(moved, room)
    expect(sinkOf(back)).toMatchObject({ wall: 'top', centerCm: sinkOf(room).centerCm, widthCm: sinkOf(room).widthCm })
    expect(sinkOf(back).id).toBe(sinkOf(moved).id)
    expect(tradeMoves(room, back, 'keep', { sinkAnswer: 'same' }).sink.status).toBe('stays')
  })

  test('withSinkAsToday is the same object when there is nothing to restore', () => {
    expect(withSinkAsToday(working, room)).toBe(working)
    expect(withSinkAsToday(working, null)).toBe(working)
    expect(withSinkAsToday(working, { ...room, features: [] })).toBe(working)
  })

  test('withSinkOnWall adds a sink at the middle of the run when the plan has none', () => {
    const bare = validate({ ...working, features: working.features.filter((f) => f.kind !== 'sink') })
    const added = withSinkOnWall(bare, 'left')
    expect(sinkOf(added)).toMatchObject({ wall: 'left', centerCm: 150, confidence: 'H', source: 'homeowner' })
  })

  test('withIsland on, then off, gives back the plan without an island', () => {
    const on = withIsland(working, true)
    expect(on.island).toBeDefined()
    expect(on.hasIsland).toBe(true)
    expect(withIsland(on, true)).toBe(on)
    const off = withIsland(on, false)
    expect(off.island).toBeUndefined()
    expect(off.hasIsland).toBe(false)
    expect(off.layoutShape).toBe(working.layoutShape)
    expect(withIsland(working, false)).toBe(working)
  })
})

describe('describeTradeMoves — the maker\'s line', () => {
  const room = measuredRoom()
  const working = workingPlanFromRoom(room, 'keep')

  test('the sink to D: "se sele — sudoper: zid A → zid D · ploča ostaje na zidu A"', () => {
    const line = describeTradeMoves(tradeMoves(room, withSinkOnWall(working, 'left'), 'keep'), hr)!
    expect(line.headline).toBe('se sele')
    expect(line.detail).toContain('zid A → zid D')
    expect(line.detail).toContain('ploča ostaje na zidu A')
    expect(line.detail).toBe('sudoper: zid A → zid D · ploča ostaje na zidu A')
  })

  test('move_sink without a target names the wall it leaves', () => {
    const line = describeTradeMoves(tradeMoves(room, working, 'move_sink'), hr)!
    expect(line.headline).toBe('se sele')
    expect(line.detail).toContain('sudoper se seli sa zida A — novo mjesto nije ucrtano')
  })

  test('a move with no sink read today leaves the spot to the maker', () => {
    const noSink = { ...room, features: room.features.filter((f) => f.kind !== 'sink') }
    expect(describeTradeMoves(tradeMoves(noSink, working, 'move_sink'), hr)!.detail).toContain(
      'sudoper se seli — mjesto dogovaraš s kupcem'
    )
  })

  test('keep: both stay on wall A', () => {
    const line = describeTradeMoves(tradeMoves(room, working, 'keep'), hr)!
    expect(line).toEqual({ headline: 'ostaju na mjestu', detail: 'sudoper ostaje na zidu A · ploča ostaje na zidu A' })
  })

  test('an empty room reads as a new installation', () => {
    const line = describeTradeMoves(tradeMoves(undefined, working, undefined, { existingRoom: 'empty' }), hr)!
    expect(line.headline).toBe('nova instalacija — prostor danas bez kuhinje')
    expect(line.detail).toBe('sudoper na zidu A · ploča na zidu A')
    const bare = validate({ ...working, features: [] })
    expect(describeTradeMoves(tradeMoves(undefined, bare, undefined, { existingRoom: 'empty' }), hr)!.detail).toBe('')
  })

  test('one part unknown: the headline says to check at the site visit', () => {
    const noHob = { ...room, features: room.features.filter((f) => f.kind !== 'hob') }
    const line = describeTradeMoves(tradeMoves(noHob, working, 'change'), hr)!
    expect(line.headline).toBe('nepoznato — provjeri na izmjeri')
    expect(line.detail).toBe('sudoper ostaje na zidu A · ploča nije prepoznata na fotografijama')
  })

  test('both unknown: null, so the row hides itself', () => {
    expect(describeTradeMoves(tradeMoves(null, null, undefined), hr)).toBeNull()
  })

  test('every status reads as words in both locales — no raw key, no empty slot', () => {
    const walls = [null, 'top', 'left'] as const
    const statuses = ['stays', 'moves', 'new', 'unknown'] as const
    const parts: TradeMove[] = []
    for (const status of statuses)
      for (const fromWall of walls)
        for (const toWall of walls) parts.push({ status, fromWall, toWall, confidence: 'H', source: 'homeowner' })
    for (const locale of ['hr-HR', 'en-US'] as Locale[]) {
      const tr = (k: string) => tDynamic(k, locale)
      for (const sink of parts) {
        for (const hob of parts) {
          const tm: TradeMoves = { sink, hob, anyMove: sink.status === 'moves' || hob.status === 'moves' }
          const line = describeTradeMoves(tm, tr)
          if (!line) continue
          const text = `${line.headline} ${line.detail}`
          expect(text).not.toMatch(/maker\.trades|\{|\}/)
        }
      }
    }
    const en = describeTradeMoves(tradeMoves(room, withSinkOnWall(working, 'left'), 'keep'), (k) => tDynamic(k, 'en-US'))!
    expect(en).toEqual({ headline: 'moving', detail: 'sink: wall A → wall D · hob stays on wall A' })
  })
})

describe('the brief\'s "Voda / plin" row', () => {
  const room = measuredRoom()
  const working = workingPlanFromRoom(room, 'keep')

  test('the sink to D: one line, as sure as today\'s photo read', () => {
    expect(makerTradesRow(tradeMoves(room, withSinkOnWall(working, 'left'), 'keep'), hr)).toEqual({
      value: 'se sele — sudoper: zid A → zid D · ploča ostaje na zidu A',
      confidence: 'H',
      source: 'ai_vision',
    })
  })

  test('the weakest known part sets the pills; an unknown part does not count', () => {
    const unsure = { ...room, features: room.features.map((f) => (f.kind === 'sink' ? { ...f, confidence: 'M' as const } : f)) }
    expect(makerTradesRow(tradeMoves(unsure, withSinkOnWall(working, 'left'), 'keep'), hr)).toMatchObject({
      confidence: 'M',
      source: 'ai_vision',
    })
    expect(makerTradesRow(tradeMoves(room, workingPlanFromRoom(room, 'add_island'), 'add_island'), hr)).toMatchObject({
      value: 'ostaju na mjestu — sudoper ostaje na zidu A · ploča ostaje na zidu A',
      confidence: 'M',
      source: 'inferred',
    })
    // Change, no hob read today: the sink stays at L (inferred); the unknown hob has no say.
    const noHob = { ...room, features: room.features.filter((f) => f.kind !== 'hob') }
    expect(makerTradesRow(tradeMoves(noHob, working, 'change'), hr)).toEqual({
      value: 'nepoznato — provjeri na izmjeri — sudoper ostaje na zidu A · ploča nije prepoznata na fotografijama',
      confidence: 'L',
      source: 'inferred',
    })
  })

  test('an empty room with nothing drawn: the headline alone', () => {
    const bare = validate({ ...working, features: [] })
    expect(makerTradesRow(tradeMoves(undefined, bare, undefined, { existingRoom: 'empty' }), hr)).toEqual({
      value: 'nova instalacija — prostor danas bez kuhinje',
      confidence: 'H',
      source: 'homeowner',
    })
  })

  test('both unknown: no row', () => {
    expect(makerTradesRow(tradeMoves(null, null, undefined), hr)).toBeNull()
  })

  test('the stored answer never reaches the brief as an English word', () => {
    expect(hrHR).not.toHaveProperty('maker.spec.plumbing')
    for (const sinkPosition of ['same', 'moving', 'new'] as const) {
      for (const locale of ['hr-HR', 'en-US'] as Locale[]) {
        const row = makerTradesRow(
          tradeMovesFromProfile({ existingFloorPlan: room, floorPlan: working, trades: { plumbing: { sinkPosition } } }),
          (k) => tDynamic(k, locale)
        )!
        expect(row.value).not.toMatch(/maker\.trades|\{|\}/)
        if (locale === 'hr-HR') expect(row.value).not.toMatch(/\b(same|moving|new)\b/)
      }
    }
  })

  test('the bundle\'s profile is enough: the row is derived from bundle.brief, and the schematic is lettered', () => {
    const brief: LeadProfile = {
      existingFloorPlan: room,
      floorPlan: withSinkOnWall(working, 'left'),
      layoutIntent: 'keep',
      existingRoom: 'kitchen',
    }
    const bundle = buildHandoffBundle({ brief })
    expect(makerTradesRow(tradeMovesFromProfile(bundle.brief), hr)?.value).toBe(
      'se sele — sudoper: zid A → zid D · ploča ostaje na zidu A'
    )
    const svg = bundle.floorPlan!.svg
    for (const [wall, letter] of [['top', 'A'], ['right', 'B'], ['bottom', 'C'], ['left', 'D']]) {
      expect(svg).toContain(`data-wall-letter="${wall}"`)
      expect(svg).toMatch(new RegExp(`data-wall-letter="${wall}">.*?>${letter}</text>`))
    }
  })
})

describe('the wrap-up\'s sink row (homeowner)', () => {
  const room = measuredRoom()
  const working = workingPlanFromRoom(room, 'keep')

  test('in words, by status', () => {
    expect(homeownerSinkLine(tradeMoves(room, working, 'keep').sink, hr)).toBe('ostaje gdje je')
    expect(homeownerSinkLine(tradeMoves(room, withSinkOnWall(working, 'left'), 'keep').sink, hr)).toBe('seli se na zid D')
    expect(homeownerSinkLine(tradeMoves(room, working, 'move_sink').sink, hr)).toBe(
      'seli se — mjesto dogovaraš s izrađivačem'
    )
    expect(homeownerSinkLine(tradeMoves(undefined, working, undefined, { existingRoom: 'empty' }).sink, hr)).toBe(
      'novi priključak'
    )
  })

  test('unknown hides the row', () => {
    expect(homeownerSinkLine(tradeMoves(undefined, working, undefined).sink, hr)).toBeNull()
  })

  test('follows the locale; no raw key, no empty slot, never the stored answer', () => {
    const en = (k: string) => tDynamic(k, 'en-US')
    expect(homeownerSinkLine(tradeMoves(room, withSinkOnWall(working, 'left'), 'keep').sink, en)).toBe('moves to wall D')
    for (const sinkPosition of ['same', 'moving', 'new'] as const) {
      for (const locale of ['hr-HR', 'en-US'] as Locale[]) {
        const line = homeownerSinkLine(
          tradeMovesFromProfile({ existingFloorPlan: room, floorPlan: working, trades: { plumbing: { sinkPosition } } }).sink,
          (k) => tDynamic(k, locale)
        )!
        expect(line).not.toMatch(/wrapup\.trades|\{|\}/)
        expect(line).not.toBe(sinkPosition)
      }
    }
  })
})
