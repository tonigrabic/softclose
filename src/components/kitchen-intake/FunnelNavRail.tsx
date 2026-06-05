'use client'

import type { LeadProfile } from '@/lib/types'
import { FLOW, flowIndex, type FlowStepId, type FlowStepMeta } from '@/lib/flow'
import { JourneyRail, type RailAct, type RailStatus, type RailStep } from '@/components/JourneyRail'
import { readbackFor } from './StepsOverview'

/**
 * The funnel's view of the "Your brief" rail (the same component the builder
 * uses, fed funnel data). The five FLOW groups fold into the three journey
 * acts; the act holding the current step expands to show its steps with
 * read-backs. The Build act is a single step here — when the homeowner is
 * actually in the builder, BuilderNavRail expands it with the component groups.
 *
 * Display-only (as the old StepsOverview was); labels are English to match the
 * funnel until the capture flow is localised.
 */
const ACTS: { id: 'space' | 'build' | 'offer'; num: number; label: string; groups: FlowStepMeta['group'][] }[] = [
  { id: 'space', num: 1, label: 'Your space', groups: ['space', 'look'] },
  { id: 'build', num: 2, label: 'Build it', groups: ['build'] },
  { id: 'offer', num: 3, label: 'Your offer', groups: ['details', 'finish'] },
]

export function FunnelNavRail({
  currentStepId,
  profile,
}: {
  currentStepId: FlowStepId
  profile: LeadProfile
}) {
  const currentIdx = flowIndex(currentStepId)

  const acts: RailAct[] = ACTS.map((act) => {
    const steps = FLOW.filter((s) => act.groups.includes(s.group))
    const idxs = steps.map((s) => flowIndex(s.id))
    const status: RailStatus =
      currentIdx > Math.max(...idxs) ? 'done' : currentIdx < Math.min(...idxs) ? 'todo' : 'current'
    const doneCount = steps.filter((s) => flowIndex(s.id) < currentIdx).length

    const railSteps: RailStep[] = steps.map((s) => {
      const i = flowIndex(s.id)
      const st: RailStatus = i < currentIdx ? 'done' : i === currentIdx ? 'current' : 'todo'
      return {
        id: s.id,
        label: s.label,
        status: st,
        readback: st === 'done' ? readbackFor(s.id, profile) : null,
      }
    })

    return {
      id: act.id,
      num: act.num,
      label: act.label,
      status,
      count: status === 'current' ? { done: doneCount, total: steps.length } : undefined,
      steps: railSteps,
    }
  })

  return <JourneyRail brief="Your brief" acts={acts} />
}
