/**
 * Mock builder-hypothesis: the `decor` fixture. The route calls it with no
 * contract since IMP-32 (the request carries no layout), so it builds against
 * the L-shape preset. Its layout fields only matter for legacy, unmeasured
 * journeys; a measured room projects the read through `decorHypothesis`. Tests
 * still pass a contract to check run-id echo against every contract fixture.
 */
import { floorPlanToLayout, type LayoutContract } from '@/lib/contract/layout-contract'
import type { BuilderHypothesis } from '@/lib/builder/hypothesis'
import { hypothesisFixtureById } from '@/lib/builder/hypothesis-fixtures'
import { fromShapePreset, validate } from '@/lib/floor-plan'

export function mockHypothesis(contract?: LayoutContract | null): BuilderHypothesis {
  const c = contract ?? floorPlanToLayout(validate(fromShapePreset('l_shape')))
  return hypothesisFixtureById('decor').build(c) ?? { usable: true }
}
