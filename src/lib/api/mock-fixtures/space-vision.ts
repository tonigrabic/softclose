/**
 * Canned space-vision read for mock-AI mode: a plausible L-shape Croatian
 * kitchen with the full appliance set (incl. the oven + hood the real prompt
 * insists on), dims inside the route's per-shape sanity bands.
 */
import type { SpaceVisionResult } from '@/lib/types'
import type { RawVisionRead } from '@/lib/floor-plan'

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

const MOCK_VIEWS = [
  // The testers' case: each photo shows one run; only the two together make the L.
  { photo: 1, shows: 'top', counterWalls: ['top'], confidence: 'H' },
  { photo: 2, shows: 'left', counterWalls: ['left'], confidence: 'H' },
  // The window wall: no counter.
  { photo: 3, shows: 'bottom', counterWalls: [], confidence: 'M' },
  { photo: 4, shows: 'top_left', counterWalls: ['top', 'left'], confidence: 'M' },
] as const

/**
 * The raw tool-call shape for `photoCount` photos (1-based `photo`), as the
 * route hands it to `normalizeVisionRead` — the mock goes through the same
 * normaliser as a live read. One photo is a wide corner shot of the L; two
 * photos each show one run and the model under-reports `wallRuns` to the
 * first, so the browser run proves the photos are joined, not passed through.
 */
export function mockSpaceVision(photoCount: number): RawVisionRead {
  if (photoCount <= 1) {
    return {
      ...MOCK_SPACE_VISION,
      photoViews: [{ photo: 1, shows: 'top_left', counterWalls: ['top', 'left'], confidence: 'M' }],
    }
  }
  return {
    ...MOCK_SPACE_VISION,
    wallRuns: photoCount === 2 ? [{ wall: 'top', spanPct: { start: 0, end: 100 } }] : MOCK_SPACE_VISION.wallRuns,
    photoViews: MOCK_VIEWS.slice(0, photoCount).map((v) => ({ ...v, counterWalls: [...v.counterWalls] })),
  }
}
