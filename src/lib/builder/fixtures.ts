/**
 * Contract fixtures for the builder test harness.
 *
 * Each fixture builds a Part-1 `FloorPlan`; the harness derives the layout
 * contract from it (`floorPlanToLayout`) and renders the builder purely from
 * that contract. Adding a new test case = add one entry here.
 *
 * These exercise the contract-driven paths: galley (no corner), L (one corner),
 * U (two corners), island, peninsula, single-wall — so we can see whether each
 * screen renders the right thing for each layout.
 */
import { fromShapePreset, makeFeature, validate } from '@/lib/floor-plan'
import type { FloorPlan, FeatureKind } from '@/lib/floor-plan'
import type { WallSide } from '@/lib/types'

interface FeatureSpec {
  kind: FeatureKind
  wall: WallSide
}

export interface ContractFixture {
  id: string
  label: string
  description: string
  build: () => FloorPlan
}

function plan(
  shape: Parameters<typeof fromShapePreset>[0],
  features: FeatureSpec[],
  opts: { hasIsland?: boolean } = {}
): FloorPlan {
  const p = fromShapePreset(shape, { hasIsland: opts.hasIsland })
  for (const f of features) p.features.push(makeFeature(f.kind, f.wall, p.room))
  return validate(p)
}

export const CONTRACT_FIXTURES: ContractFixture[] = [
  {
    id: 'l-shape',
    label: 'L-shape · full',
    description: 'Two runs, one corner. Sink + hob + fridge + dishwasher.',
    build: () =>
      plan('l_shape', [
        { kind: 'sink', wall: 'top' },
        { kind: 'hob', wall: 'top' },
        { kind: 'fridge', wall: 'left' },
        { kind: 'dishwasher', wall: 'top' },
      ]),
  },
  {
    id: 'galley',
    label: 'Galley · no corner',
    description: 'Two parallel runs facing each other — no corner unit.',
    build: () =>
      plan('galley', [
        { kind: 'sink', wall: 'top' },
        { kind: 'hob', wall: 'bottom' },
        { kind: 'fridge', wall: 'top' },
      ]),
  },
  {
    id: 'u-shape',
    label: 'U-shape · two corners',
    description: 'Three runs, two corners.',
    build: () =>
      plan('u_shape', [
        { kind: 'sink', wall: 'left' },
        { kind: 'hob', wall: 'top' },
        { kind: 'fridge', wall: 'right' },
        { kind: 'dishwasher', wall: 'left' },
      ]),
  },
  {
    id: 'island',
    label: 'Island',
    description: 'Perimeter run + a free-standing island; no corner.',
    build: () =>
      plan(
        'island',
        [
          { kind: 'sink', wall: 'top' },
          { kind: 'hob', wall: 'top' },
        ],
        { hasIsland: true }
      ),
  },
  {
    id: 'peninsula',
    label: 'Peninsula',
    description: 'Two runs including a peninsula return.',
    build: () =>
      plan('peninsula', [
        { kind: 'sink', wall: 'top' },
        { kind: 'hob', wall: 'bottom' },
      ]),
  },
  {
    id: 'single',
    label: 'Single wall',
    description: 'One run, minimal — stress-test what should be excluded.',
    build: () => plan('unsure', [{ kind: 'sink', wall: 'top' }]),
  },
]

export function fixtureById(id: string): ContractFixture {
  return CONTRACT_FIXTURES.find((f) => f.id === id) ?? CONTRACT_FIXTURES[0]
}
