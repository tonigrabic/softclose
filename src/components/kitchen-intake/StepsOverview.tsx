'use client'

import { Check, Circle } from 'lucide-react'
import type { LeadProfile } from '@/lib/types'
import { FLOW, flowIndex, type FlowStepId, type FlowStepMeta } from '@/lib/flow'
import { cn } from '@/lib/utils'

interface StepsOverviewProps {
  currentStepId: FlowStepId
  visitedSteps: Set<FlowStepId>
  profile: LeadProfile
}

/**
 * Deterministic sidebar that mirrors the FLOW exactly. No inference about which
 * step is "active" — the parent passes it in. Past steps show a check + a tiny
 * read-back of what was captured, current step is highlighted, future steps are
 * dimmed.
 */
export function StepsOverview({ currentStepId, visitedSteps, profile }: StepsOverviewProps) {
  const currentIdx = flowIndex(currentStepId)

  const groups: { groupId: FlowStepMeta['group']; steps: FlowStepMeta[] }[] = []
  for (const step of FLOW) {
    const last = groups[groups.length - 1]
    if (last && last.groupId === step.group) {
      last.steps.push(step)
    } else {
      groups.push({ groupId: step.group, steps: [step] })
    }
  }

  return (
    <nav aria-label="Intake progress" className="space-y-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Your brief
      </p>
      <ol className="space-y-4">
        {groups.map((group) => (
          <li key={group.groupId}>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">
              {GROUP_LABELS[group.groupId]}
            </p>
            <ul className="space-y-1.5">
              {group.steps.map((step) => {
                const idx = flowIndex(step.id)
                const isCurrent = step.id === currentStepId
                const isPast = idx < currentIdx
                const wasVisited = visitedSteps.has(step.id)
                const readback = isPast || isCurrent ? readbackFor(step.id, profile) : null
                return (
                  <li key={step.id}>
                    <div
                      className={cn(
                        'flex items-start gap-2 px-2 py-1.5 transition-colors',
                        !isCurrent && !isPast && !wasVisited && 'opacity-55'
                      )}
                    >
                      <span className="mt-0.5 flex size-4 items-center justify-center shrink-0">
                        {isPast ? (
                          <Check className="size-3.5 stroke-[2.5] text-primary" aria-hidden />
                        ) : isCurrent ? (
                          <span className="block size-2 animate-pulse rounded-full bg-primary" />
                        ) : (
                          <Circle className="size-3 stroke-[1.5] text-muted-foreground/40" aria-hidden />
                        )}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span
                          className={cn(
                            'block text-[12.5px] leading-tight',
                            isCurrent
                              ? 'font-semibold text-foreground'
                              : 'font-medium text-foreground/85'
                          )}
                        >
                          {step.label}
                        </span>
                        {readback && (
                          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                            {readback}
                          </p>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </li>
        ))}
      </ol>
    </nav>
  )
}

const GROUP_LABELS: Record<FlowStepMeta['group'], string> = {
  space: 'Your space',
  look: 'The look',
  details: 'Project details',
  finish: 'Finish',
}

function readbackFor(stepId: FlowStepId, p: LeadProfile): string | null {
  switch (stepId) {
    case 'space_photos': {
      const n = p.spacePhotos?.length ?? 0
      if (n === 0) return null
      const layout = p.layoutShape ?? p.spaceVisionResult?.layoutShape
      return layout ? `${n} photo${n === 1 ? '' : 's'} · ${layout.replace(/_/g, ' ')}` : `${n} photo${n === 1 ? '' : 's'}`
    }
    case 'inspiration': {
      const styles = p.stylePreferences ?? []
      if (styles.length === 0) return null
      return styles.map((s) => s.replace(/_/g, ' ')).join(', ')
    }
    case 'concept_render': {
      if (!p.conceptRenderChosenId) return null
      return 'Render chosen'
    }
    case 'confirm_look': {
      const parts = [
        p.doorMaterial,
        p.worktopPreference,
        p.hardwareTier,
      ].filter(Boolean) as string[]
      if (parts.length === 0) return null
      return parts.map((s) => s.replace(/_/g, ' ')).join(' · ')
    }
    case 'project_basics': {
      const parts = [
        p.projectType?.replace(/_/g, ' '),
        p.timeline?.replace(/_/g, ' '),
        p.budgetRange?.replace(/_/g, ' '),
      ].filter(Boolean)
      return parts.length > 0 ? parts.join(' · ') : null
    }
    case 'scope': {
      const trueKeys = Object.entries(p.scope ?? {})
        .filter(([, v]) => v === true)
        .map(([k]) => k)
      if (trueKeys.length === 0) return null
      return `${trueKeys.length} item${trueKeys.length === 1 ? '' : 's'} in scope`
    }
    case 'wishlist': {
      const total =
        (p.mustHaves?.length ?? 0) +
        (p.niceToHaves?.length ?? 0) +
        (p.dealBreakers?.length ?? 0)
      if (total === 0) return null
      return `${total} item${total === 1 ? '' : 's'} captured`
    }
    case 'logistics': {
      const parts = [
        p.logistics?.siteAccess?.replace(/_/g, ' '),
        p.logistics?.livingDuringBuild?.replace(/_/g, ' '),
      ].filter(Boolean)
      return parts.length > 0 ? parts.join(' · ') : null
    }
    case 'contact': {
      if (!p.name && !p.contactValue) return null
      return [p.name, p.contactValue].filter(Boolean).join(' · ')
    }
  }
}
