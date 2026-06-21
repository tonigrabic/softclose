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
  | 'type'
  | 'space_photos'
  | 'inspiration'
  | 'concept_render'
  | 'confirm_look'
  | 'builder'
  | 'scope'
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
  // `type` opens Act 1 — "what are we doing" frames the whole flow
  // (handoff/IMPLEMENTATION.md §1; the timeline half of the old
  // project-basics step lives with logistics in Act 3).
  {
    id: 'type',
    label: 'Project type',
    why: "What we're doing — it frames everything else.",
    group: 'space',
  },
  {
    id: 'space_photos',
    label: 'Your space',
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
  {
    id: 'confirm_look',
    label: 'Confirm layout & look',
    why: 'The layout we read from your render — adjust it, then confirm.',
    group: 'look',
  },
  {
    id: 'builder',
    label: 'Build it out',
    why: 'Pick every component and see a live cost range.',
    group: 'build',
  },
  // scope + wishlist live INSIDE the Build act — they shape the kitchen and
  // move the price, so they belong with the live range, not after it.
  {
    id: 'scope',
    label: 'Scope of work',
    why: "What's actually being touched in this project.",
    group: 'build',
  },
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
    why: 'Rough timing, site access, living arrangement.',
    group: 'details',
  },
  {
    id: 'contact',
    label: 'Contact',
    why: 'How your designer reaches you.',
    group: 'finish',
  },
]

export function flowIndex(id: FlowStepId): number {
  return FLOW.findIndex((s) => s.id === id)
}

export function nextStepId(id: FlowStepId): FlowStepId | null {
  const i = flowIndex(id)
  return i >= 0 && i < FLOW.length - 1 ? FLOW[i + 1].id : null
}

export function prevStepId(id: FlowStepId): FlowStepId | null {
  const i = flowIndex(id)
  return i > 0 ? FLOW[i - 1].id : null
}
