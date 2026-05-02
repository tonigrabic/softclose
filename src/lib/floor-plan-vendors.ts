/**
 * Tier 1+ floor-plan generation vendor short list, output of the spike
 * captured in the kitchen-discovery plan. Read this when wiring an
 * external generator behind a feature flag.
 *
 * The Tier-0 deterministic generator in `floor-plan.ts` covers the MVP.
 * Anything below this comment is *not wired in* — it documents which
 * vendor surface to evaluate when we want richer output.
 */
export type FloorPlanVendorTier = 1 | 2 | 3

export interface FloorPlanVendor {
  id: string
  name: string
  tier: FloorPlanVendorTier
  /** Input shape the vendor accepts. */
  input: 'text' | 'sketch' | 'photo' | 'structured' | 'embed'
  /** Output shape we'd consume. */
  output: 'png' | 'svg' | 'pdf' | 'json' | 'embed'
  /** Rough public pricing posture; verify before integration. */
  pricingNote: string
  /** Things to validate during the integration spike before going live. */
  caveats: string[]
  /** Human-readable home page; the integration URL/API differs. */
  reference: string
}

export const FLOOR_PLAN_VENDORS: FloorPlanVendor[] = [
  {
    id: 'apify-text-to-plan',
    name: 'AI Floor Planner (Apify actors)',
    tier: 1,
    input: 'text',
    output: 'png',
    pricingNote: 'Pay-per-event, ~$0.08 per plan at the time of the spike.',
    caveats: [
      'Marketplace actor — quality varies by run; sample on real intake before relying on it.',
      'Verify licensing for downstream use (commercial / client-facing).',
    ],
    reference: 'https://apify.com/store?search=floor%20plan',
  },
  {
    id: 'roomagen-photo',
    name: 'Roomagen photo-to-plan',
    tier: 2,
    input: 'photo',
    output: 'png',
    pricingNote: 'Per-plan fee in the low-cents range; consumer-grade UI primarily.',
    caveats: [
      'Estimated only — wall positions and openings often wrong.',
      'API stability and B2B terms unverified; treat as exploratory.',
    ],
    reference: 'https://roomagen.com/tools/floor-plan-from-photo',
  },
  {
    id: 'roomagen-sketch',
    name: 'Roomagen sketch digitizer',
    tier: 2,
    input: 'sketch',
    output: 'png',
    pricingNote: 'Same product family as the photo-to-plan tool.',
    caveats: [
      'Hand-sketch interpretation works best with clean orthogonal lines.',
      'Watermark / branding likely on free tier; check paid tier output.',
    ],
    reference: 'https://roomagen.com/tools/sketch-to-floor-plan',
  },
  {
    id: 'modelslab-image-plan',
    name: 'ModelsLab image-to-plan',
    tier: 2,
    input: 'photo',
    output: 'png',
    pricingNote: 'Enterprise-style API with usage tiers; quote required.',
    caveats: [
      'API surface evolves quickly; pin to a model version when integrating.',
      'Latency and consistency need real-data validation.',
    ],
    reference: 'https://docs.modelslab.com/enterprise-api/interior/floor-planning',
  },
  {
    id: 'floorplanner',
    name: 'Floorplanner API (v2 / v3)',
    tier: 3,
    input: 'embed',
    output: 'embed',
    pricingNote: 'Per-project / per-export pricing with sandbox tier.',
    caveats: [
      'Heavier integration — projects + tokens + branded export.',
      'Closer to how studios already work; better fit once we have a maker dashboard.',
    ],
    reference: 'https://floorplanner.readme.io/reference/v30-specification',
  },
]

/** Cheap predicate so we can gate UI / docs on whether any vendor is wired in. */
export const FLOOR_PLAN_VENDOR_INTEGRATIONS_LIVE = false
