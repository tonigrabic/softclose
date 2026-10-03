/**
 * SYNTHETIC — the testers' two-angle L (2026-09-23 round: "the second wall is
 * ignored"). Their photos are not in the repo, so this is a hand-built read in
 * the model's raw tool-call shape (1-based `photo`), modelled on the one real
 * read we recorded (2026-09-19, tests/vision-wall-reconcile.test.ts `realRead`).
 *
 * Photo 1 faces the long wall: sink under the window, hob, dishwasher.
 * Photo 2 is taken from the other end and faces the return wall: fridge and a
 * tall column. Each photo shows one run; only the two together make the L.
 */
import type { RawVisionRead } from '@/lib/floor-plan'

export const TWO_ANGLE_L: RawVisionRead = {
  lookedLikeKitchen: true,
  layoutShape: 'l_shape',
  hasIsland: false,
  lengthCm: 380,
  widthCm: 260,
  wallRuns: [
    { wall: 'top', spanPct: { start: 0, end: 100 } },
    { wall: 'left', spanPct: { start: 0, end: 85 } },
  ],
  windows: [{ wall: 'top', positionPct: 40, widthPct: 30 }],
  features: {
    sink: { wall: 'top', positionPct: 40, confidence: 'H' },
    hob: { wall: 'top', positionPct: 72, confidence: 'M' },
    dishwasher: { wall: 'top', positionPct: 55, confidence: 'M' },
    fridge: { wall: 'left', positionPct: 80, confidence: 'H' },
  },
  photoViews: [
    { photo: 1, shows: 'top', counterWalls: ['top'], confidence: 'H' },
    { photo: 2, shows: 'left', counterWalls: ['left'], confidence: 'H' },
  ],
  summary: 'L-shaped kitchen, sink under the window on the long wall, fridge on the return.',
}

/** The same two photos when the model under-reports: one run, labelled single wall. */
export const TWO_ANGLE_L_UNDER_REPORTED: RawVisionRead = {
  ...TWO_ANGLE_L,
  layoutShape: 'single_wall',
  wallRuns: [{ wall: 'top', spanPct: { start: 0, end: 100 } }],
}

/** Both photos read as the same wall — the frame confusion behind the lost wall. */
export const TWO_ANGLE_L_SAME_WALL: RawVisionRead = {
  ...TWO_ANGLE_L,
  layoutShape: 'single_wall',
  wallRuns: [{ wall: 'top', spanPct: { start: 0, end: 100 } }],
  photoViews: [
    { photo: 1, shows: 'top', counterWalls: ['top'], confidence: 'M' },
    { photo: 2, shows: 'top', counterWalls: ['top'], confidence: 'M' },
  ],
}
