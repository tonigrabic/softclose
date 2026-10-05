'use client'

import type { LeadProfile } from '@/lib/types'
import { FLOW, flowIndex, stepNumber, type FlowStepId } from '@/lib/flow'
import {
  BUILDER_GROUPS,
  type BuilderScreenId,
  type BuilderState,
} from '@/lib/builder/inventory'
import { t, tDynamic, DEFAULT_LOCALE, type Locale, type TranslationKey } from '@/lib/i18n'
import { JourneyRail, type RailAct, type RailStatus, type RailStep } from '@/components/JourneyRail'
import type { ReviewTarget } from '@/lib/review-nav'
import { readbackFor } from './kitchen-intake/readbacks'
import { GROUP_MODULES } from './builder/groups/registry'

/**
 * The ONE "Your brief" rail for the whole journey — capture steps, the builder's
 * component groups, AND the close steps, always shown together so the navigation
 * never swaps when the homeowner crosses from the funnel into the builder
 * (PR2 of the IA refactor; see handoff/IMPLEMENTATION.md).
 *
 * It replaces the two mutually-blind rails (FunnelNavRail / BuilderNavRail): each
 * only knew half the journey, so crossing the builder boundary made Act 1's
 * read-backs and Act 3's steps disappear. This one is fed the union of state:
 *  - `funnelStepId` — where we are in the funnel (`'builder'` while in the builder).
 *  - `profile` — funnel read-backs (and `profile.builderState` once built).
 *  - `builderState` / `builderGroupId` — live builder position while in the builder.
 *
 * The Build act expands into the builder's component groups (between
 * `confirm_look` and `wishlist`); everything else maps from `FLOW`. Only the
 * active act expands, so the groups are only visible once you're actually building
 * — unless `expandDone` asks for the done acts too (IMP-07): on the review, and
 * while editing from it, every done step is a way back (`onStepSelect`).
 * While editing from the review (`reviewed`) every step is done — the review
 * covers them all — and only the one reopened is current: the steps after it
 * are not "to do" again, and stay a click away.
 */

type Entry =
  | { kind: 'funnel'; id: FlowStepId; label: string; readback: string | null }
  | { kind: 'builder'; id: BuilderScreenId; label: string; readback: string | null }

type ActId = 'space' | 'build' | 'offer'

const ACTS: { id: ActId; num: number }[] = [
  { id: 'space', num: 1 },
  { id: 'build', num: 2 },
  { id: 'offer', num: 3 },
]

/** Which acts each FLOW group belongs to (the `builder` step expands separately). */
const ACT_OF_GROUP: Record<string, ActId> = {
  space: 'space',
  look: 'space',
  build: 'build',
  details: 'offer',
  finish: 'offer',
}

/**
 * The rail's own words: its heading and the three acts. The homeowner reads
 * their own journey ("Tvoj sažetak · Tvoj prostor"). The maker looking in
 * (readOnly) reads the customer's ("Kupčev sažetak · Kupčev prostor"), never
 * "your" about someone else's kitchen. The third act is named by what it
 * holds for both: the range is never a quote ("ponuda"), the maker sends
 * that. The step labels are the steps' names and read the same to both.
 */
export const RAIL_COPY = {
  homeowner: {
    brief: 'journey.brief',
    space: 'journey.act.space',
    build: 'journey.act.build',
    offer: 'journey.act.offer',
  },
  maker: {
    brief: 'journey.readOnly.brief',
    space: 'journey.readOnly.act.space',
    build: 'journey.readOnly.act.build',
    offer: 'journey.readOnly.act.offer',
  },
} as const satisfies Record<string, Record<'brief' | ActId, TranslationKey>>
export type RailVoice = keyof typeof RAIL_COPY

export function JourneyNavRail({
  funnelStepId,
  profile,
  builderState,
  builderGroupId,
  onBuilderNavigate,
  journeyDone,
  voice = 'homeowner',
  expandDone,
  onStepSelect,
  reviewed,
  locale = DEFAULT_LOCALE,
}: {
  funnelStepId: FlowStepId
  profile: LeadProfile
  /** Live builder state while in the builder; falls back to `profile.builderState`. */
  builderState?: BuilderState | null
  /** Active builder group while in the builder. */
  builderGroupId?: BuilderScreenId | null
  /** Jump between builder groups — only wired while actually in the builder. */
  onBuilderNavigate?: (id: BuilderScreenId) => void
  /** True on the wrap-up screen: every act and step renders as done. */
  journeyDone?: boolean
  /** Whose words: 'maker' when the maker looks in at the customer's kitchen. */
  voice?: RailVoice
  /** Show the done acts' steps as well as the current act's (IMP-07). */
  expandDone?: boolean
  /** Reopen a done step — a funnel step, or a builder group (which opens the
   *  builder there). Outside the builder only; inside it, groups navigate
   *  through `onBuilderNavigate`. Absent where nobody may edit. */
  onStepSelect?: (target: ReviewTarget) => void
  /** The review has been reached (IMP-07): every step but the current one is done. */
  reviewed?: boolean
  locale?: Locale
}) {
  const copy = RAIL_COPY[voice]
  const inBuilder = funnelStepId === 'builder'
  // `profile.builderState` is stored as `unknown` on LeadProfile (the builder
  // module owns the type); cast on read, as the rest of the builder does.
  const builderStateForReadbacks: BuilderState | null =
    builderState ?? (profile.builderState as BuilderState | undefined) ?? null

  const linear = buildLinear(profile, builderStateForReadbacks, locale)
  const currentIndex = journeyDone
    ? linear.length
    : currentLinearIndex(linear, funnelStepId, builderGroupId)
  // Positional on the walk; once the review was reached, everything but the
  // step on screen is done.
  const statusAt = (i: number): RailStatus =>
    i === currentIndex ? 'current' : reviewed || i < currentIndex ? 'done' : 'todo'

  const acts: RailAct[] = ACTS.map((act) => {
    const indices = linear
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => entryAct(e) === act.id)

    const status: RailStatus =
      indices.every(({ i }) => statusAt(i) === 'done')
        ? 'done'
        : indices.some(({ i }) => i === currentIndex)
          ? 'current'
          : 'todo'

    const steps: RailStep[] = indices.map(({ e, i }) => {
      const st = statusAt(i)
      return {
        id: e.id,
        label: e.label,
        status: st,
        // Funnel steps carry the same number as their step eyebrow; builder
        // groups stay dot-marked sub-items.
        num: e.kind === 'funnel' ? stepNumber(e.id) : undefined,
        readback: st === 'done' ? e.readback : null,
        onSelect: inBuilder
          ? e.kind === 'builder' && onBuilderNavigate
            ? () => onBuilderNavigate(e.id)
            : undefined
          : st === 'done' && onStepSelect
            ? () => onStepSelect(e.kind === 'funnel' ? { step: e.id } : { step: 'builder', group: e.id })
            : undefined,
      }
    })

    return {
      id: act.id,
      num: act.num,
      label: t(copy[act.id], locale),
      status,
      count:
        status === 'current'
          ? { done: indices.filter(({ i }) => statusAt(i) === 'done').length, total: indices.length }
          : undefined,
      steps,
      expanded: status === 'done' && Boolean(expandDone),
    }
  })

  return <JourneyRail brief={t(copy.brief, locale)} acts={acts} />
}

/* ── Shared journey-position model ──────────────────────────────────────────
 * One linear ordering of every rail entry, so done/current/todo is a single
 * index comparison across the funnel↔builder boundary. The `builder` FLOW step
 * is replaced in place by the 9 component groups. Used by the rail above and
 * by the mobile progress pill. */

function buildLinear(
  profile: LeadProfile,
  builderStateForReadbacks: BuilderState | null,
  locale: Locale
): Entry[] {
  const linear: Entry[] = []
  for (const step of FLOW) {
    if (step.id === 'builder') {
      for (const g of BUILDER_GROUPS) {
        linear.push({
          kind: 'builder',
          id: g.id,
          label: tDynamic(g.labelKey, locale),
          readback: builderStateForReadbacks
            ? GROUP_MODULES[g.id].readback(builderStateForReadbacks, locale)
            : null,
        })
      }
      continue
    }
    linear.push({
      kind: 'funnel',
      id: step.id,
      label: tDynamic(`flow.${step.id}.label`, locale),
      readback: readbackFor(step.id, profile, locale),
    })
  }
  return linear
}

function currentLinearIndex(
  linear: Entry[],
  funnelStepId: FlowStepId,
  builderGroupId?: BuilderScreenId | null
): number {
  return funnelStepId === 'builder'
    ? linear.findIndex(
        (e) => e.kind === 'builder' && e.id === (builderGroupId ?? BUILDER_GROUPS[0].id)
      )
    : linear.findIndex((e) => e.kind === 'funnel' && e.id === funnelStepId)
}

const entryAct = (e: Entry): ActId =>
  e.kind === 'builder' ? 'build' : ACT_OF_GROUP[FLOW[flowIndex(e.id)].group]

/**
 * Compact "where am I" label for the mobile progress pill, e.g.
 * "Gradnja · Korpusi ormarića · 2/12". Mirrors the rail's model exactly so the
 * pill and the bottom-sheet rail can never disagree. Editing from the review
 * (`reviewed`), the step without the count: "1/5" would read as a journey
 * started over.
 */
export function journeyPillLabel(opts: {
  funnelStepId: FlowStepId
  profile: LeadProfile
  builderGroupId?: BuilderScreenId | null
  journeyDone?: boolean
  voice?: RailVoice
  reviewed?: boolean
  locale?: Locale
}): string {
  const { funnelStepId, profile, builderGroupId, journeyDone, reviewed, voice = 'homeowner', locale = DEFAULT_LOCALE } = opts
  const copy = RAIL_COPY[voice]
  if (journeyDone) return `${t(copy.offer, locale)} ✓`
  const builderStateForReadbacks =
    (profile.builderState as BuilderState | undefined) ?? null
  const linear = buildLinear(profile, builderStateForReadbacks, locale)
  const currentIndex = currentLinearIndex(linear, funnelStepId, builderGroupId)
  const current = linear[currentIndex]
  if (!current) return t(copy.brief, locale)
  const act = entryAct(current)
  if (reviewed) return `${tDynamic(`journey.act.${act}`, locale)} · ${current.label}`
  const actSteps = linear.filter((e) => entryAct(e) === act)
  const pos = actSteps.findIndex((e) => e === current) + 1
  return `${t(copy[act], locale)} · ${current.label} · ${pos}/${actSteps.length}`
}

