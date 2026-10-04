'use client'

import { AppShell } from '@/components/AppShell'
import { JourneyNavRail, journeyPillLabel } from '@/components/JourneyNavRail'
import { useTranslations } from '@/lib/i18n'
import { FLOW, flowIndex, resumeStepId, type FlowStepId } from '@/lib/flow'
import { roomStepDone } from '@/lib/floor-plan'
import { stepProgress, type StepProgress } from '@/lib/project/status'
import type { ProjectSnapshot } from '@/lib/project/snapshot'
import type { LeadProfile, WrapUpData } from '@/lib/types'
import { WrapUpScreen } from './WrapUpScreen'

/** Where the customer is, as the maker looking in reads it. */
export interface LookOnlyView {
  /** The rail's step: where the journey resumes, as the kitchen home says. */
  stepId: FlowStepId
  /** The customer reached the wrap-up. */
  done: boolean
  progressPercent: number
  /** What the customer has committed so far — the answers, never the drafts. */
  profile: LeadProfile
  data: WrapUpData
  /** Absent once the customer has finished; otherwise where they last saved,
   *  or that they have not started. */
  progress?: StepProgress | 'not_started'
}

/** No TL;DR mid-journey: one from an earlier finish describes a kitchen the
 *  customer has since gone back to change. */
const NO_SUMMARY: WrapUpData = { thankYouMessage: '', summaryLines: [] }

/**
 * The maker's view of the customer's kitchen, from the server's copy alone.
 * Not the browser's: a copy the maker's own browser kept would win over the
 * customer's later progress and show the maker a kitchen that no longer is.
 */
export function lookOnlyView(snapshot: ProjectSnapshot | null | undefined): LookOnlyView {
  if (!snapshot) {
    return { stepId: 'space_photos', done: false, progressPercent: 0, profile: {}, data: NO_SUMMARY, progress: 'not_started' }
  }
  const profile = snapshot.profile ?? {}
  if (snapshot.isDone && snapshot.wrapUpData) {
    return { stepId: 'contact', done: true, progressPercent: 100, profile, data: snapshot.wrapUpData }
  }
  // The same resume the kitchen home labels its button with (IMP-31).
  const stepId = resumeStepId(snapshot.currentStepId, {
    roomMeasured: roomStepDone(profile),
    contractConfirmed: Boolean(profile.contractConfirmedAt),
  })
  return {
    stepId,
    done: false,
    progressPercent: Math.round((flowIndex(stepId) / FLOW.length) * 100),
    profile,
    data: NO_SUMMARY,
    progress: stepProgress(stepId) ?? 'not_started',
  }
}

export interface KitchenLookOnlyProps {
  snapshot: ProjectSnapshot | null
  projectId?: string
  makerName?: string | null
  hasExistingBrief?: boolean
}

/**
 * The maker looking in at a customer's kitchen (IMP-05): one page to look at,
 * finished or not. The customer's answers so far in the wrap-up's maker
 * wording, the rail at the step they reached, and one line saying where they
 * are. No steps to click through, nothing to edit, and no call to an AI route
 * or the handoff: the kitchen is the customer's to fill, and a render or a
 * summary the maker set off would be spent on a kitchen nobody asked about.
 */
export function KitchenLookOnly({ snapshot, projectId, makerName, hasExistingBrief = false }: KitchenLookOnlyProps) {
  const { locale, tDynamic } = useTranslations()
  const view = lookOnlyView(snapshot)
  return (
    <AppShell
      progressPercent={view.progressPercent}
      mobilePillLabel={journeyPillLabel({
        funnelStepId: view.stepId,
        profile: view.profile,
        journeyDone: view.done,
        voice: 'maker',
        locale,
      })}
      nav={
        <>
          <JourneyNavRail
            funnelStepId={view.stepId}
            profile={view.profile}
            journeyDone={view.done}
            voice="maker"
            locale={locale}
          />
          <p className="mt-5 text-[10px] leading-relaxed text-muted-foreground">
            {tDynamic('kitchen.home.readOnly.note')}
          </p>
        </>
      }
    >
      <WrapUpScreen
        data={view.data}
        profile={view.profile}
        explorationRefs={[]}
        transcript={[]}
        projectId={projectId}
        makerName={makerName}
        readOnly
        hasExistingBrief={hasExistingBrief}
        progress={view.progress}
      />
    </AppShell>
  )
}
