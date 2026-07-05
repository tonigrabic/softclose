/**
 * Mock builder-hypothesis: the `decor` fixture built against the REQUEST's
 * layout contract, so run ids echo correctly (a hypothesis whose runIds don't
 * match the contract is silently ignored by seeding — the mock must behave
 * like the real route, which is instructed to reuse contract run ids).
 */
import { floorPlanToLayout, type LayoutContract } from '@/lib/contract/layout-contract'
import type { BuilderHypothesis } from '@/lib/builder/hypothesis'
import { hypothesisFixtureById } from '@/lib/builder/hypothesis-fixtures'
import { fromShapePreset, validate } from '@/lib/floor-plan'

export function mockHypothesis(contract?: LayoutContract | null): BuilderHypothesis {
  const c = contract ?? floorPlanToLayout(validate(fromShapePreset('l_shape')))
  return hypothesisFixtureById('decor').build(c) ?? { usable: true }
}
