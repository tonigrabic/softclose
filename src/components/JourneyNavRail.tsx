'use client'

import type { LeadProfile } from '@/lib/types'
import { FLOW, flowIndex, stepNumber, type FlowStepId } from '@/lib/flow'
import {
  BUILDER_GROUPS,
  type BuilderScreenId,
  type BuilderState,
} from '@/lib/builder/inventory'
import { tDynamic, DEFAULT_LOCALE, type Locale } from '@/lib/i18n'
import { JourneyRail, type RailAct, type RailStatus, type RailStep } from '@/components/JourneyRail'
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
 * The Build act expands into the 9 component groups (between `confirm_look` and
 * `scope`); everything else maps from `FLOW`. Only the active act expands, so the
 * 9 groups are only visible once you're actually building.
 */

type Entry =
  | { kind: 'funnel'; id: FlowStepId; label: string; readback: string | null }
  | { kind: 'builder'; id: BuilderScreenId; label: string; readback: string | null }

const ACTS: { id: 'space' | 'build' | 'offer'; num: number }[] = [
  { id: 'space', num: 1 },
  { id: 'build', num: 2 },
  { id: 'offer', num: 3 },
]

/** Which acts each FLOW group belongs to (the `builder` step expands separately). */
const ACT_OF_GROUP: Record<string, 'space' | 'build' | 'offer'> = {
  space: 'space',
  look: 'space',
  build: 'build',
  details: 'offer',
  finish: 'offer',
}

export function JourneyNavRail({
  funnelStepId,
  profile,
  builderState,
  builderGroupId,
  onBuilderNavigate,
  journeyDone,
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
  locale?: Locale
}) {
  const inBuilder = funnelStepId === 'builder'
  // `profile.builderState` is stored as `unknown` on LeadProfile (the builder
  // module owns the type); cast on read, as the rest of the builder does.
  const builderStateForReadbacks: BuilderState | null =
    builderState ?? (profile.builderState as BuilderState | undefined) ?? null

  const linear = buildLinear(profile, builderStateForReadbacks, locale)
  const currentIndex = journeyDone
    ? linear.length
    : currentLinearIndex(linear, funnelStepId, builderGroupId)

  const acts: RailAct[] = ACTS.map((act) => {
    const indices = linear
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => entryAct(e) === act.id)

    const status: RailStatus =
      indices.every(({ i }) => i < currentIndex)
        ? 'done'
        : indices.some(({ i }) => i === currentIndex)
          ? 'current'
          : 'todo'

    const steps: RailStep[] = indices.map(({ e, i }) => {
      const st: RailStatus = i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'todo'
      return {
        id: e.id,
        label: e.label,
        status: st,
        // Funnel steps carry the same number as their step eyebrow; builder
        // groups stay dot-marked sub-items.
        num: e.kind === 'funnel' ? stepNumber(e.id) : undefined,
        readback: st === 'done' ? e.readback : null,
        onSelect:
          inBuilder && e.kind === 'builder' && onBuilderNavigate
            ? () => onBuilderNavigate(e.id)
            : undefined,
      }
    })

    return {
      id: act.id,
      num: act.num,
      label: tDynamic(`journey.act.${act.id}`, locale),
      status,
      count:
        status === 'current'
          ? { done: indices.filter(({ i }) => i < currentIndex).length, total: indices.length }
          : undefined,
      steps,
    }
  })

  return <JourneyRail brief={tDynamic('journey.brief', locale)} acts={acts} />
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

const entryAct = (e: Entry): 'space' | 'build' | 'offer' =>
  e.kind === 'builder' ? 'build' : ACT_OF_GROUP[FLOW[flowIndex(e.id)].group]

/**
 * Compact "where am I" label for the mobile progress pill, e.g.
 * "Gradnja · Korpusi ormarića · 2/12". Mirrors the rail's model exactly so the
 * pill and the bottom-sheet rail can never disagree.
 */
export function journeyPillLabel(opts: {
  funnelStepId: FlowStepId
  profile: LeadProfile
  builderGroupId?: BuilderScreenId | null
  journeyDone?: boolean
  locale?: Locale
}): string {
  const { funnelStepId, profile, builderGroupId, journeyDone, locale = DEFAULT_LOCALE } = opts
  if (journeyDone) return `${tDynamic('journey.act.offer', locale)} ✓`
  const builderStateForReadbacks =
    (profile.builderState as BuilderState | undefined) ?? null
  const linear = buildLinear(profile, builderStateForReadbacks, locale)
  const currentIndex = currentLinearIndex(linear, funnelStepId, builderGroupId)
  const current = linear[currentIndex]
  if (!current) return tDynamic('journey.brief', locale)
  const act = entryAct(current)
  const actSteps = linear.filter((e) => entryAct(e) === act)
  const pos = actSteps.findIndex((e) => e === current) + 1
  return `${tDynamic(`journey.act.${act}`, locale)} · ${current.label} · ${pos}/${actSteps.length}`
}

