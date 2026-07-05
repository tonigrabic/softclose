/**
 * Canned space-vision read for mock-AI mode: a plausible L-shape Croatian
 * kitchen with the full appliance set (incl. the oven + hood the real prompt
 * insists on), dims inside the route's per-shape sanity bands.
 */
import type { SpaceVisionResult } from '@/lib/types'

export const MOCK_SPACE_VISION: SpaceVisionResult = {
  lookedLikeKitchen: true,
  layoutShape: 'l_shape',
  hasIsland: false,
  lengthCm: 420,
  widthCm: 300,
  ceilingHeightCm: 270,
  wallRuns: [
    { wall: 'top', spanPct: { start: 0, end: 100 } },
    { wall: 'left', spanPct: { start: 0, end: 80 } },
  ],
  windows: [{ wall: 'bottom', positionPct: 50, widthPct: 30 }],
  doors: [{ wall: 'right', positionPct: 80, widthPct: 20, swing: 'in' }],
  features: {
    sink: { wall: 'top', positionPct: 30, confidence: 'H' },
    hob: { wall: 'top', positionPct: 65, confidence: 'H' },
    oven: { wall: 'top', positionPct: 65, confidence: 'M' },
    hood: { wall: 'top', positionPct: 65, confidence: 'M' },
    dishwasher: { wall: 'top', positionPct: 45, confidence: 'M' },
    fridge: { wall: 'left', positionPct: 75, confidence: 'H' },
  },
  styleHints: ['dated oak fronts', 'tiled backsplash'],
  materialHints: ['laminate worktop, beige', 'ceramic tile floor'],
  summary: 'L-shaped kitchen ~4.2 × 3.0 m, sink and hob on the long wall, fridge on the return.',
}
