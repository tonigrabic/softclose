/**
 * Deterministic intake flow.
 *
 * Replaces AI-orchestrated step selection with a fixed sequence of UI steps.
 * The AI is still called at three specific moments (vision on space photos,
 * vision on inspiration, render generation, wishlist translation, brief
 * summary) — but the ORDER and identity of steps is hard-coded so:
 *  - The progress sidebar can show exactly where the homeowner is.
 *  - The render auto-fires reliably right after the user picks inspiration.
 *  - "Back" works because each step's state is owned and addressable.
 *  - Behaviour is predictable, not at the mercy of the model.
 */

export type FlowStepId =
  | 'space_photos'
  | 'inspiration'
  | 'concept_render'
  | 'confirm_look'
  | 'builder'
  | 'wishlist'
  | 'logistics'
  | 'contact'

export interface FlowStepMeta {
  id: FlowStepId
  /** Short label shown in the sidebar / breadcrumbs. */
  label: string
  /** One-line description of what's being captured here. */
  why: string
  /** Group label for the sidebar — keeps scrollable list bucketed visually. */
  group: 'space' | 'look' | 'build' | 'details' | 'finish'
}

export const FLOW: FlowStepMeta[] = [
  // The journey opens straight into capturing the space — for an AI kitchen
  // renderer the old "project type" question was friction, so it was removed.
  {
    id: 'space_photos',
    // "Space photos", not "Your space" — the act heading above it in the rail
    // is already "Your space" (journey.act.space); identical labels read broken.
    label: 'Space photos',
    why: 'Photos so we can read your existing kitchen.',
    group: 'space',
  },
  {
    id: 'inspiration',
    label: 'Inspiration',
    why: 'A direction we can render against.',
    group: 'look',
  },
  {
    id: 'concept_render',
    label: 'AI concept',
    why: 'A render anchored to your space, in your direction.',
    group: 'look',
  },
  // "Confirm layout & look" now also shows the contract tally (runs, cabinet
  // counts, corners, appliances) below the editor — the homeowner edits the
  // plan, sees exactly what we'll price, and signs off once. The builder seeds
  // from exactly this confirmed contract.
  {
    id: 'confirm_look',
    label: 'Confirm layout & look',
    why: 'The layout we read from your render — adjust it, see the plan, confirm.',
    group: 'look',
  },
  {
    id: 'builder',
    label: 'Build it out',
    why: 'Pick every component and see a live cost range.',
    group: 'build',
  },
  // The wishlist lives INSIDE the Build act — it shapes the kitchen, so it
  // belongs with the live range, not after it. (The old "scope of work" step
  // was cut after maker testing, 2026-09-23: the estimate is the kitchen.)
  {
    id: 'wishlist',
    label: 'Wishlist',
    why: 'Must-haves and deal-breakers in your own words.',
    group: 'build',
  },
  // Close: a few practicalities (incl. the timeline), then contact. No
  // up-front budget — the live range is the budget conversation.
  {
    id: 'logistics',
    label: 'Logistics',
    why: 'Rough timing and site access.',
    group: 'details',
  },
  {
    id: 'contact',
    label: 'Contact',
    why: 'How your designer reaches you.',
    group: 'finish',
  },
]

/**
 * Steps that no longer exist, mapped to where a saved journey resumes instead.
 * Snapshots are forward-tolerant (see lib/project/snapshot.ts), so a journey
 * saved on a retired step must still land somewhere real.
 */
const RETIRED_STEPS: Record<string, FlowStepId> = {
  scope: 'wishlist',
}

/** A stored step id → a live one (retired steps forward to their successor). */
export function resolveStepId(id: string): FlowStepId | null {
  if (FLOW.some((s) => s.id === id)) return id as FlowStepId
  return RETIRED_STEPS[id] ?? null
}

export function flowIndex(id: FlowStepId): number {
  return FLOW.findIndex((s) => s.id === id)
}

/**
 * 1-based homeowner-visible step number, shared by the step eyebrows and the
 * journey rail so the two can never disagree. The `builder` step is excluded —
 * in the UI it expands into its component groups and carries the act label
 * instead of a number. Returns 0 for `builder`.
 */
export function stepNumber(id: FlowStepId): number {
  return FLOW.filter((s) => s.id !== 'builder').findIndex((s) => s.id === id) + 1
}

export function nextStepId(id: FlowStepId): FlowStepId | null {
  const i = flowIndex(id)
  return i >= 0 && i < FLOW.length - 1 ? FLOW[i + 1].id : null
}

export function prevStepId(id: FlowStepId): FlowStepId | null {
  const i = flowIndex(id)
  return i > 0 ? FLOW[i - 1].id : null
}
