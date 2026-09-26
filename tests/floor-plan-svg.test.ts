/**
 * The static floor-plan SVG painted the room's white fill AFTER the counter
 * bands, so every plan — the shape-picker cards, the wrap-up, the maker's
 * schematic — read as an empty box, an L-shaped kitchen included. These pin
 * the paint order: counters exist, and they sit on top of the room fill.
 */
import { describe, expect, test } from 'vitest'
import { fromShapePreset, renderFloorPlanSvg, validate } from '@/lib/floor-plan'

const ROOM_FILL = 'fill="white"'
const COUNTER_FILL = 'fill="#eef0e9"'

function counterRects(svg: string): number {
  return svg.split(COUNTER_FILL).length - 1
}

describe('floor-plan SVG paint order', () => {
  test.each([
    ['l_shape', 2],
    ['u_shape', 3],
    ['galley', 2],
  ] as const)('%s draws its %i counter runs over the room, not under it', (shape, runs) => {
    const svg = renderFloorPlanSvg(validate(fromShapePreset(shape)), { mode: 'maker' })
    expect(counterRects(svg)).toBe(runs)
    // Later in the document = painted on top.
    expect(svg.indexOf(COUNTER_FILL)).toBeGreaterThan(svg.indexOf(ROOM_FILL))
  })
})
