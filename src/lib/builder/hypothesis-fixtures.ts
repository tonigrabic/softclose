/**
 * Hypothesis fixtures — shared by the /builder dev harness and the Part-1
 * mock-AI mode (`/api/builder-hypothesis` returns the `decor` fixture when
 * MOCK_AI=1).
 *
 * Each fixture BUILDS against a LayoutContract so its run ids always echo the
 * contract's: the real vision route is instructed to reuse contract run ids,
 * and a hypothesis whose runIds don't match is silently ignored by seeding —
 * exactly the failure class these fixtures exist to exercise.
 */
import type { LayoutContract } from '@/lib/contract/layout-contract'
import type { BuilderHypothesis, LayoutHypothesis } from '@/lib/builder/hypothesis'
import { decorsByUse } from '@/lib/catalog'

export interface HypothesisFixture {
  id: string
  label: string
  description: string
  /** `null` = the contract-only path (no hypothesis at all). */
  build: (contract: LayoutContract) => BuilderHypothesis | null
}

function contractRuns(contract: LayoutContract): NonNullable<LayoutHypothesis['runs']> {
  return contract.runs
    .filter((r) => r.id !== 'island')
    .map((r) => ({
      id: r.id,
      label: r.label,
      lengthCm: { value: r.lengthCm, confidence: 'M' as const },
    }))
}

export const HYPOTHESIS_FIXTURES: HypothesisFixture[] = [
  {
    id: 'none',
    label: 'No hypothesis',
    description: 'Contract-only seeding — the pure-fixture path.',
    build: () => null,
  },
  {
    id: 'decor',
    label: 'Decor read',
    description:
      'Full render read: door/worktop decors, hardware, appliances. Also the mock-mode hypothesis.',
    build: (contract) => {
      // Live catalog codes so the decor pickers/BOM see real entries.
      const doorDecor = decorsByUse('door')[0]
      const worktopDecor = decorsByUse('worktop')[0]
      return {
        usable: true,
        summary: 'Slab fronts in a warm matte decor, laminate worktop, integrated appliances.',
        layout: {
          shape: { value: contract.shape, confidence: 'M' },
          hasIsland: { value: contract.hasIsland, confidence: 'M' },
          runs: contractRuns(contract),
        },
        doors: {
          style: { value: 'slab', confidence: 'H' },
          decorCode: doorDecor ? { value: doorDecor.code, confidence: 'M' } : undefined,
          colorDescription: 'warm matte, subtle grain',
        },
        worktop: {
          family: { value: 'laminate', confidence: 'M' },
          decorCode: worktopDecor ? { value: worktopDecor.code, confidence: 'M' } : undefined,
        },
        backsplash: { kind: { value: 'tile', confidence: 'L' } },
        hardware: {
          drawerSystemTier: { value: 'mid', confidence: 'L' },
          handleStyle: { value: 'integrated_jpull', confidence: 'M' },
        },
        appliances: {
          hob: { value: 'induction', confidence: 'M' },
          oven: { value: 'single', confidence: 'M' },
          extractor: { value: 'chimney', confidence: 'M' },
          fridge: {
            present: { value: true, confidence: 'M' },
            integrated: { value: true, confidence: 'L' },
          },
          dishwasher: {
            present: { value: true, confidence: 'M' },
            integrated: { value: true, confidence: 'M' },
          },
        },
        lighting: { underCabinetLed: { value: true, confidence: 'M' } },
      }
    },
  },
  {
    id: 'tall-tower',
    label: 'Tall tower',
    description: 'Render shows a tall pantry/oven column on the first run (render-tall seeding).',
    build: (contract) => {
      const first = contract.runs.find((r) => r.id !== 'island')
      if (!first) return { usable: true }
      return {
        usable: true,
        layout: {
          shape: { value: contract.shape, confidence: 'M' },
          runs: contractRuns(contract).map((r) =>
            r.id === first.id ? { ...r, hasTall: { value: true, confidence: 'M' as const } } : r
          ),
        },
        features: { tallPantry: { present: { value: true, confidence: 'M' }, runId: first.id } },
      }
    },
  },
  {
    id: 'patterns',
    label: 'Unit patterns',
    description: 'Sparse per-unit pattern hints on the first run (drawer bank + bin pull-out).',
    build: (contract) => {
      const first = contract.runs.find((r) => r.id !== 'island')
      if (!first) return { usable: true }
      return {
        usable: true,
        layout: { shape: { value: contract.shape, confidence: 'M' } },
        cabinetBoxes: {
          unitPatterns: [
            { runId: first.id, positionPctAlongRun: 30, pattern: 'drawer_bank', confidence: 'M' },
            { runId: first.id, positionPctAlongRun: 85, pattern: 'trash_pullout', confidence: 'L' },
          ],
        },
      }
    },
  },
  {
    id: 'low-confidence',
    label: 'All low confidence',
    description: 'Everything L — FactsRecap should stay quiet and bands stay wide.',
    build: (contract) => ({
      usable: true,
      layout: { shape: { value: contract.shape, confidence: 'L' } },
      doors: { style: { value: 'slab', confidence: 'L' } },
      worktop: { family: { value: 'laminate', confidence: 'L' } },
    }),
  },
]

export function hypothesisFixtureById(id: string): HypothesisFixture {
  return HYPOTHESIS_FIXTURES.find((f) => f.id === id) ?? HYPOTHESIS_FIXTURES[0]
}
