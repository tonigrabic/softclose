'use client'

import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, RotateCcw } from 'lucide-react'
import { ProgressBar } from './ProgressBar'
import { StepsOverview } from './StepsOverview'
import { SpaceCapture } from './SpaceCapture'
import { Inspiration } from './Inspiration'
import { ConceptRender as ConceptRenderUI } from './ConceptRender'
import { ConfirmLook } from './ConfirmLook'
import { ChipMulti } from './ChipMulti'
import { VisualScale } from './VisualScale'
import { ContactForm, type ContactValue } from './ContactForm'
import { WrapUpScreen } from './WrapUpScreen'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  FLOW,
  flowIndex,
  nextStepId,
  prevStepId,
  type FlowStepId,
} from '@/lib/flow'
import { derivePrefills } from '@/lib/derive-prefills'
import { DESIGNER_NAME } from '@/lib/system-prompt'
import type { UploadedReference } from './ImageSelect'
import type {
  ClientMessage,
  ConceptRender,
  LeadProfile,
  SpaceVisionResult,
  WrapUpData,
} from '@/lib/types'
import type { InspirationVisionResult } from '@/app/api/inspiration-vision/route'

const PROJECT_TYPE_OPTIONS = [
  { value: 'full_remodel', label: 'Full remodel' },
  { value: 'cabinet_replace', label: 'Cabinets only' },
  { value: 'refresh', label: 'Light refresh' },
  { value: 'addition', label: 'Addition / extension' },
  { value: 'repair', label: 'Repair / fix' },
] as const

const TIMELINE_BANDS = [
  { value: 'asap', label: 'ASAP', caption: 'Within 4 weeks' },
  { value: '1_3_months', label: '1–3 months', caption: 'Soonish' },
  { value: '3_6_months', label: '3–6 months', caption: 'Planning' },
  { value: '6_12_months', label: '6–12 months', caption: 'Researching' },
  { value: 'no_rush', label: 'No rush', caption: 'Just exploring' },
]

const BUDGET_BANDS = [
  { value: 'under_15k', label: 'Under $15k' },
  { value: '15k_30k', label: '$15–30k' },
  { value: '30k_60k', label: '$30–60k' },
  { value: '60k_plus', label: '$60k+' },
  { value: 'unsure', label: 'Not sure yet' },
]

const SCOPE_OPTIONS = [
  { value: 'cabinets', label: 'Cabinets', icon: 'palette' },
  { value: 'worktops', label: 'Worktops', icon: 'gem' },
  { value: 'sinkTaps', label: 'Sink + taps', icon: 'wrench' },
  { value: 'appliancesSupply', label: 'Appliances', icon: 'refrigerator' },
  { value: 'flooring', label: 'Flooring', icon: 'grid' },
  { value: 'walls', label: 'Walls', icon: 'palette' },
  { value: 'lighting', label: 'Lighting', icon: 'lightbulb' },
  { value: 'plumbingRelocation', label: 'Move plumbing', icon: 'wrench' },
  { value: 'electricalWork', label: 'New electrical', icon: 'zap' },
  { value: 'structural', label: 'Move walls', icon: 'hammer' },
  { value: 'demolitionDisposal', label: 'Demo + disposal', icon: 'hammer' },
  { value: 'installation', label: 'Installation', icon: 'wrench' },
]

const SITE_ACCESS_OPTIONS = [
  { value: 'street_level', label: 'Street level' },
  { value: 'one_flight', label: 'One flight up' },
  { value: 'multi_flight', label: 'Multiple flights' },
  { value: 'lift', label: 'Lift / elevator' },
  { value: 'restricted', label: 'Restricted access' },
]
const LIVING_OPTIONS = [
  { value: 'in_place', label: 'Stay in place' },
  { value: 'partial_move', label: 'Partial move-out' },
  { value: 'fully_relocate', label: 'Fully relocate' },
]

interface IntakeFlowState {
  currentStepId: FlowStepId
  visitedSteps: Set<FlowStepId>
}

export function KitchenIntake() {
  const [state, setState] = useState<IntakeFlowState>({
    currentStepId: 'space_photos',
    visitedSteps: new Set(['space_photos']),
  })
  const [profile, setProfile] = useState<LeadProfile>({})
  const [transcript, setTranscript] = useState<ClientMessage[]>([])
  const [isDone, setIsDone] = useState(false)
  const [wrapUpData, setWrapUpData] = useState<WrapUpData | null>(null)
  const [isFinalising, setIsFinalising] = useState(false)
  const [finaliseError, setFinaliseError] = useState<string | null>(null)

  // Per-step transient state lifted to the parent so Back navigation preserves work.
  const [spacePhotos, setSpacePhotos] = useState<string[]>([])
  const [spaceVision, setSpaceVision] = useState<SpaceVisionResult | null>(null)
  const [inspirationStyles, setInspirationStyles] = useState<string[]>([])
  const [inspirationRefs, setInspirationRefs] = useState<UploadedReference[]>([])
  const [inspirationVision, setInspirationVision] = useState<InspirationVisionResult | null>(null)
  const [conceptRenders, setConceptRenders] = useState<ConceptRender[]>([])
  const [chosenRenderId, setChosenRenderId] = useState<string | null>(null)
  const [scopeSelected, setScopeSelected] = useState<string[]>([])
  const [siteAccess, setSiteAccess] = useState<string | null>(null)
  const [livingPlan, setLivingPlan] = useState<string | null>(null)
  const [contactDraft, setContactDraft] = useState<ContactValue>({
    name: '',
    contactType: 'email',
    contactValue: '',
  })

  // Wishlist free-text drafts (translated into TranslatedField on submit).
  const [mustHavesText, setMustHavesText] = useState('')
  const [niceToHavesText, setNiceToHavesText] = useState('')
  const [dealBreakersText, setDealBreakersText] = useState('')
  const [isTranslating, setIsTranslating] = useState(false)
  const [translateError, setTranslateError] = useState<string | null>(null)

  /** Patch the central LeadProfile (replace strategy at top-level keys). */
  function patchProfile(patch: Partial<LeadProfile>) {
    setProfile((prev) => ({ ...prev, ...patch }))
  }

  /** Move to a specific step, optionally recording it as visited. */
  function goTo(id: FlowStepId) {
    setState((prev) => ({
      currentStepId: id,
      visitedSteps: new Set([...prev.visitedSteps, id]),
    }))
    setTranslateError(null)
    setFinaliseError(null)
  }

  function goNext() {
    const next = nextStepId(state.currentStepId)
    if (next) {
      goTo(next)
    } else {
      void finalise()
    }
  }

  function goBack() {
    const prev = prevStepId(state.currentStepId)
    if (prev) goTo(prev)
  }

  /** Nudge the transcript with what the user just told us, in plain English. */
  function logTurn(role: 'user' | 'assistant', content: string, images?: string[]) {
    setTranscript((prev) => [...prev, { role, content, images }])
  }

  /**
   * Apply space-vision results to the profile. Called when SpaceCapture confirms.
   */
  function commitSpacePhotos() {
    const inferred: Partial<LeadProfile> = { spacePhotos }
    if (spaceVision) {
      inferred.spaceVisionResult = spaceVision
      if (spaceVision.layoutShape && spaceVision.layoutShape !== 'unsure') {
        inferred.layoutShape = spaceVision.layoutShape
      }
      if (typeof spaceVision.hasIsland === 'boolean') {
        inferred.hasIsland = spaceVision.hasIsland
      }
      if (spaceVision.lengthCm) inferred.spaceLengthCm = spaceVision.lengthCm
      if (spaceVision.widthCm) inferred.spaceWidthCm = spaceVision.widthCm
    }
    patchProfile(inferred)
    logTurn(
      'user',
      spaceVision?.summary
        ? `Uploaded ${spacePhotos.length} space photo${spacePhotos.length === 1 ? '' : 's'}. AI read: ${spaceVision.summary}`
        : `Uploaded ${spacePhotos.length} space photo${spacePhotos.length === 1 ? '' : 's'}.`,
      spacePhotos
    )
    goNext()
  }

  /**
   * Apply inspiration + inspiration-vision results to the profile, then advance.
   * Concept render step will auto-fire on entry.
   */
  function commitInspiration() {
    const prefills = derivePrefills({
      selectedStyles: inspirationStyles,
      inspirationVision,
      spaceVision,
    })
    patchProfile(prefills)
    const description = [
      inspirationStyles.length > 0
        ? `tagged ${inspirationStyles.join(', ')}`
        : null,
      inspirationRefs.length > 0
        ? `${inspirationRefs.length} reference${inspirationRefs.length === 1 ? '' : 's'}`
        : null,
    ]
      .filter(Boolean)
      .join(' + ')
    logTurn('user', `Inspiration: ${description || '(none)'}`)
    goNext()
  }

  function commitConfirmLook() {
    const parts = [
      profile.stylePreferences?.length ? `style: ${profile.stylePreferences.join(', ')}` : null,
      profile.doorMaterial ? `door: ${profile.doorMaterial}` : null,
      profile.worktopPreference ? `worktop: ${profile.worktopPreference}` : null,
      profile.backsplashPreference ? `backsplash: ${profile.backsplashPreference}` : null,
      profile.hardwareTier ? `hardware: ${profile.hardwareTier}` : null,
    ].filter(Boolean)
    logTurn('user', `Confirmed look: ${parts.join(' · ') || '(skipped)'}`)
    goNext()
  }

  function commitProjectBasics() {
    if (!profile.projectType || !profile.timeline) return
    if (!profile.budgetRange && profile.budgetShared !== false) return
    logTurn(
      'user',
      `Project basics: ${profile.projectType} · ${profile.timeline} · ${profile.budgetRange ?? 'budget tbd'}`
    )
    goNext()
  }

  function commitScope() {
    const scope: NonNullable<LeadProfile['scope']> = {}
    for (const opt of SCOPE_OPTIONS) {
      const key = opt.value as keyof typeof scope
      ;(scope as Record<string, boolean>)[key] = scopeSelected.includes(opt.value)
    }
    patchProfile({ scope })
    logTurn(
      'user',
      `Scope: ${scopeSelected.length === 0 ? '(none selected)' : scopeSelected.join(', ')}`
    )
    goNext()
  }

  async function commitWishlist() {
    if (!mustHavesText.trim() && !niceToHavesText.trim() && !dealBreakersText.trim()) {
      goNext()
      return
    }
    setIsTranslating(true)
    setTranslateError(null)
    try {
      const res = await fetch('/api/translate-wishlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mustHaves: mustHavesText,
          niceToHaves: niceToHavesText,
          dealBreakers: dealBreakersText,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        throw new Error(data.error ?? `Translate failed (${res.status})`)
      }
      const result = data.result as {
        mustHaves?: LeadProfile['mustHaves']
        niceToHaves?: LeadProfile['niceToHaves']
        dealBreakers?: LeadProfile['dealBreakers']
      }
      patchProfile({
        mustHaves: result.mustHaves,
        niceToHaves: result.niceToHaves,
        dealBreakers: result.dealBreakers,
      })
      logTurn(
        'user',
        [
          mustHavesText && `Must-haves: ${mustHavesText}`,
          niceToHavesText && `Nice-to-haves: ${niceToHavesText}`,
          dealBreakersText && `Deal-breakers: ${dealBreakersText}`,
        ]
          .filter(Boolean)
          .join(' / ')
      )
      goNext()
    } catch (err) {
      setTranslateError(err instanceof Error ? err.message : 'Could not save wishlist')
    } finally {
      setIsTranslating(false)
    }
  }

  function commitLogistics() {
    if (!siteAccess && !livingPlan) {
      goNext()
      return
    }
    patchProfile({
      logistics: {
        ...(siteAccess ? { siteAccess: siteAccess as NonNullable<LeadProfile['logistics']>['siteAccess'] } : {}),
        ...(livingPlan
          ? { livingDuringBuild: livingPlan as NonNullable<LeadProfile['logistics']>['livingDuringBuild'] }
          : {}),
      },
    })
    logTurn(
      'user',
      `Logistics: ${[siteAccess, livingPlan].filter(Boolean).join(' · ') || '(skipped)'}`
    )
    goNext()
  }

  async function commitContact() {
    const trimmedName = contactDraft.name.trim()
    const trimmedContact = contactDraft.contactValue.trim()
    if (!trimmedName || !trimmedContact) return
    patchProfile({
      name: trimmedName,
      contactValue: trimmedContact,
    })
    logTurn('user', `Contact: ${trimmedName} (${trimmedContact})`)
    await finalise({
      name: trimmedName,
      contactValue: trimmedContact,
    })
  }

  /** Wrap-up: apply final patch, fetch summary, mark done. */
  async function finalise(extraPatch: Partial<LeadProfile> = {}) {
    setIsFinalising(true)
    setFinaliseError(null)
    const finalProfile = {
      ...profile,
      ...extraPatch,
      // Chosen render at this point is owned by client state.
      ...(chosenRenderId ? { conceptRenderChosenId: chosenRenderId } : {}),
      ...(conceptRenders.length > 0 ? { conceptRenders } : {}),
    }
    try {
      const res = await fetch('/api/summarize-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: finalProfile }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        throw new Error(data.error ?? `Summarise failed (${res.status})`)
      }
      const summary = data.result as { thankYouMessage: string; summaryLines: string[] }
      setProfile(finalProfile)
      setWrapUpData({
        thankYouMessage: summary.thankYouMessage,
        summaryLines: summary.summaryLines,
      })
      setIsDone(true)
    } catch (err) {
      // Even if the AI summary fails, let the homeowner see their wrap-up with a fallback message.
      setProfile(finalProfile)
      setWrapUpData({
        thankYouMessage: `Thanks${finalProfile.name ? `, ${finalProfile.name}` : ''} — your brief is on its way to ${DESIGNER_NAME}.`,
        summaryLines: buildFallbackSummary(finalProfile),
      })
      setFinaliseError(err instanceof Error ? err.message : 'Summary unavailable')
      setIsDone(true)
    } finally {
      setIsFinalising(false)
    }
  }

  function resetAll() {
    setState({ currentStepId: 'space_photos', visitedSteps: new Set(['space_photos']) })
    setProfile({})
    setTranscript([])
    setIsDone(false)
    setWrapUpData(null)
    setIsFinalising(false)
    setFinaliseError(null)
    setSpacePhotos([])
    setSpaceVision(null)
    setInspirationStyles([])
    setInspirationRefs([])
    setInspirationVision(null)
    setConceptRenders([])
    setChosenRenderId(null)
    setScopeSelected([])
    setSiteAccess(null)
    setLivingPlan(null)
    setContactDraft({ name: '', contactType: 'email', contactValue: '' })
    setMustHavesText('')
    setNiceToHavesText('')
    setDealBreakersText('')
  }

  /**
   * Apply chosen render to the profile in the same handler the ConceptRender
   * component calls. We avoid a useEffect-then-setState round trip so the
   * sidebar read-back ("Render chosen") updates atomically with the action.
   */
  function chooseRender(id: string) {
    setChosenRenderId(id)
    patchProfile({ conceptRenderChosenId: id, conceptRenders })
  }

  const progress = useMemo(
    () => Math.round(((flowIndex(state.currentStepId) + (isDone ? 1 : 0)) / FLOW.length) * 100),
    [state.currentStepId, isDone]
  )

  if (isDone && wrapUpData) {
    return (
      <WrapUpScreen
        data={wrapUpData}
        profile={profile}
        explorationRefs={[]}
        transcript={transcript}
      />
    )
  }

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <ProgressBar percent={progress} />
      <div className="flex w-full flex-row">
        <aside className="sticky top-0 h-dvh w-64 shrink-0 overflow-y-auto border-r border-border/60 bg-card/40 px-5 py-10 lg:w-72 lg:px-6">
          <header className="mb-5 flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {DESIGNER_NAME}
            </p>
            {Object.keys(profile).length > 0 && (
              <button
                type="button"
                onClick={resetAll}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[10px] font-semibold text-muted-foreground hover:text-foreground"
                title="Start over"
              >
                <RotateCcw className="size-3 stroke-[2]" aria-hidden />
                Start over
              </button>
            )}
          </header>
          <StepsOverview
            currentStepId={state.currentStepId}
            visitedSteps={state.visitedSteps}
            profile={profile}
          />
        </aside>

        <main className="mx-auto w-full max-w-3xl flex-1 px-8 py-14 lg:px-14 lg:py-16">
          <AnimatePresence mode="wait">
            <motion.section
              key={state.currentStepId}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-7"
            >
              <StepBody
                stepId={state.currentStepId}
                profile={profile}
                onPatchProfile={patchProfile}
                spacePhotos={spacePhotos}
                onSpacePhotosChange={setSpacePhotos}
                spaceVision={spaceVision}
                onSpaceVisionChange={setSpaceVision}
                inspirationStyles={inspirationStyles}
                onInspirationStylesChange={setInspirationStyles}
                inspirationRefs={inspirationRefs}
                onInspirationRefsChange={setInspirationRefs}
                inspirationVision={inspirationVision}
                onInspirationVisionChange={setInspirationVision}
                conceptRenders={conceptRenders}
                onConceptRenderAdded={(r) => setConceptRenders((prev) => [...prev, r])}
                chosenRenderId={chosenRenderId}
                onChooseRender={chooseRender}
                scopeSelected={scopeSelected}
                onScopeChange={setScopeSelected}
                siteAccess={siteAccess}
                onSiteAccessChange={setSiteAccess}
                livingPlan={livingPlan}
                onLivingPlanChange={setLivingPlan}
                contactDraft={contactDraft}
                onContactDraftChange={setContactDraft}
                mustHavesText={mustHavesText}
                onMustHavesTextChange={setMustHavesText}
                niceToHavesText={niceToHavesText}
                onNiceToHavesTextChange={setNiceToHavesText}
                dealBreakersText={dealBreakersText}
                onDealBreakersTextChange={setDealBreakersText}
                onSpacePhotosCommit={commitSpacePhotos}
                onSpacePhotosSkip={() => {
                  logTurn('user', 'Skipped uploading space photos')
                  goNext()
                }}
                onConceptRenderSkip={() => {
                  logTurn('user', 'Skipped concept render')
                  goNext()
                }}
              />

              {translateError && (
                <p className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-2.5 text-xs text-destructive">
                  {translateError}
                </p>
              )}
              {finaliseError && (
                <p className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-2.5 text-xs text-destructive">
                  Couldn&apos;t fetch the AI summary, but your brief is saved. Continuing with a fallback summary.
                </p>
              )}

              <FooterNav
                stepId={state.currentStepId}
                canGoBack={flowIndex(state.currentStepId) > 0}
                isBusy={isTranslating || isFinalising}
                onBack={goBack}
                onContinue={() => commitForStep(state.currentStepId)}
                profile={profile}
                hasInspirationInput={
                  inspirationStyles.length > 0 || inspirationRefs.length > 0
                }
                hasContactDraft={
                  Boolean(contactDraft.name.trim() && contactDraft.contactValue.trim())
                }
                scopeCount={scopeSelected.length}
              />
            </motion.section>
          </AnimatePresence>
        </main>
      </div>
    </div>
  )

  function commitForStep(id: FlowStepId): void {
    switch (id) {
      case 'space_photos':
        commitSpacePhotos()
        break
      case 'inspiration':
        commitInspiration()
        break
      case 'concept_render':
        // The ConceptRender component handles its own choose/skip;
        // a manual continue means "I'm done with this step, take whatever I have."
        logTurn('user', chosenRenderId ? 'Picked a render' : 'No render chosen')
        goNext()
        break
      case 'confirm_look':
        commitConfirmLook()
        break
      case 'project_basics':
        commitProjectBasics()
        break
      case 'scope':
        commitScope()
        break
      case 'wishlist':
        void commitWishlist()
        break
      case 'logistics':
        commitLogistics()
        break
      case 'contact':
        void commitContact()
        break
    }
  }
}

interface StepBodyProps {
  stepId: FlowStepId
  profile: LeadProfile
  onPatchProfile: (patch: Partial<LeadProfile>) => void
  spacePhotos: string[]
  onSpacePhotosChange: (photos: string[]) => void
  spaceVision: SpaceVisionResult | null
  onSpaceVisionChange: (v: SpaceVisionResult | null) => void
  inspirationStyles: string[]
  onInspirationStylesChange: (s: string[]) => void
  inspirationRefs: UploadedReference[]
  onInspirationRefsChange: (r: UploadedReference[]) => void
  inspirationVision: InspirationVisionResult | null
  onInspirationVisionChange: (v: InspirationVisionResult | null) => void
  conceptRenders: ConceptRender[]
  onConceptRenderAdded: (r: ConceptRender) => void
  chosenRenderId: string | null
  onChooseRender: (id: string) => void
  scopeSelected: string[]
  onScopeChange: (s: string[]) => void
  siteAccess: string | null
  onSiteAccessChange: (s: string | null) => void
  livingPlan: string | null
  onLivingPlanChange: (s: string | null) => void
  contactDraft: ContactValue
  onContactDraftChange: (c: ContactValue) => void
  mustHavesText: string
  onMustHavesTextChange: (t: string) => void
  niceToHavesText: string
  onNiceToHavesTextChange: (t: string) => void
  dealBreakersText: string
  onDealBreakersTextChange: (t: string) => void
  onSpacePhotosCommit: () => void
  onSpacePhotosSkip: () => void
  onConceptRenderSkip: () => void
}

function StepBody(props: StepBodyProps) {
  const {
    stepId,
    profile,
    onPatchProfile,
    spacePhotos,
    onSpacePhotosChange,
    spaceVision,
    onSpaceVisionChange,
    inspirationStyles,
    onInspirationStylesChange,
    inspirationRefs,
    onInspirationRefsChange,
    inspirationVision,
    onInspirationVisionChange,
    conceptRenders,
    onConceptRenderAdded,
    chosenRenderId,
    onChooseRender,
    scopeSelected,
    onScopeChange,
    siteAccess,
    onSiteAccessChange,
    livingPlan,
    onLivingPlanChange,
    contactDraft,
    onContactDraftChange,
    mustHavesText,
    onMustHavesTextChange,
    niceToHavesText,
    onNiceToHavesTextChange,
    dealBreakersText,
    onDealBreakersTextChange,
    onSpacePhotosCommit,
    onSpacePhotosSkip,
    onConceptRenderSkip,
  } = props

  switch (stepId) {
    case 'space_photos':
      return (
        <StepFrame
          eyebrow="Step 1"
          title="Snap your kitchen — we&apos;ll read the layout."
          subtitle="A few wide shots are perfect. We use them to anchor the AI render and pre-fill the floor plan."
        >
          <SpaceCapture
            photos={spacePhotos}
            onPhotosChange={onSpacePhotosChange}
            visionResult={spaceVision}
            onVisionResult={onSpaceVisionChange}
            onSkip={onSpacePhotosSkip}
            onConfirm={onSpacePhotosCommit}
          />
        </StepFrame>
      )

    case 'inspiration':
      return (
        <StepFrame
          eyebrow="Step 2"
          title="What feels right?"
          subtitle="Pick a direction or upload a few inspiration shots. We&apos;ll read what you&apos;re drawn to and pre-fill the rest."
        >
          <Inspiration
            selectedStyles={inspirationStyles}
            onSelectedStylesChange={onInspirationStylesChange}
            uploadedRefs={inspirationRefs}
            onUploadedRefsChange={onInspirationRefsChange}
            spaceVisionResult={spaceVision}
            inspirationVisionResult={inspirationVision}
            onInspirationVisionResult={onInspirationVisionChange}
          />
        </StepFrame>
      )

    case 'concept_render':
      return (
        <StepFrame
          eyebrow="Step 3"
          title="A first AI sketch of your space."
          subtitle="Anchored to your photo. Tap a tweak chip and re-render, or pick this one and move on."
        >
          <ConceptRenderUI
            anchorPhotos={spacePhotos}
            renders={conceptRenders}
            chosenId={chosenRenderId}
            profile={profile}
            onRenderAdded={onConceptRenderAdded}
            onChoose={(id) => onChooseRender(id)}
            onSkip={onConceptRenderSkip}
            autoStart
          />
        </StepFrame>
      )

    case 'confirm_look':
      return (
        <StepFrame
          eyebrow="Step 4"
          title="Confirm the look."
          subtitle="We&apos;ve pre-filled what we read from your render. Adjust anything that&apos;s off."
        >
          <ConfirmLook
            profile={profile}
            onChange={onPatchProfile}
            hasPrefills={Boolean(
              inspirationVision || profile.stylePreferences?.length || profile.doorMaterial
            )}
          />
        </StepFrame>
      )

    case 'project_basics':
      return (
        <StepFrame
          eyebrow="Step 5"
          title="Project basics."
          subtitle="What you're after, when, and roughly how much."
        >
          <div className="space-y-7">
            <div>
              <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Project type
              </p>
              <div className="flex flex-wrap gap-2">
                {PROJECT_TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onPatchProfile({ projectType: opt.value })}
                    className={cn(
                      'rounded-full border px-3.5 py-2 text-[13px] font-medium transition-all',
                      profile.projectType === opt.value
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card hover:border-primary/40'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Timeline
              </p>
              <VisualScale
                bands={TIMELINE_BANDS}
                selected={profile.timeline ?? null}
                onSelect={(v) => onPatchProfile({ timeline: v })}
                axisCaption="Roughly when?"
              />
            </div>
            <div>
              <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Budget
              </p>
              <VisualScale
                bands={BUDGET_BANDS}
                selected={profile.budgetRange ?? null}
                onSelect={(v) =>
                  onPatchProfile({
                    budgetRange: v === 'unsure' ? undefined : v,
                    budgetShared: v !== 'unsure',
                  })
                }
                axisCaption="Roughly how much?"
              />
            </div>
          </div>
        </StepFrame>
      )

    case 'scope':
      return (
        <StepFrame
          eyebrow="Step 6"
          title="What's actually being touched?"
          subtitle="Tap everything in scope. We won't ask about anything you skip."
        >
          <ChipMulti
            options={SCOPE_OPTIONS}
            selected={scopeSelected}
            onToggle={(v) =>
              onScopeChange(
                scopeSelected.includes(v)
                  ? scopeSelected.filter((x) => x !== v)
                  : [...scopeSelected, v]
              )
            }
          />
        </StepFrame>
      )

    case 'wishlist':
      return (
        <StepFrame
          eyebrow="Step 7"
          title="In your own words."
          subtitle="No need to be precise — write the way you think. We'll translate to trade-grade and keep your phrasing for the designer."
        >
          <div className="space-y-5">
            <FreeTextField
              label="Must-haves"
              hint="Things this kitchen has to do for you."
              placeholder="e.g. Easy-to-grab pots and pans, big drawers near the stove…"
              value={mustHavesText}
              onChange={onMustHavesTextChange}
            />
            <FreeTextField
              label="Nice-to-haves"
              hint="Bonus points if we can fit it."
              placeholder="e.g. A coffee station, more outlets along the counter…"
              value={niceToHavesText}
              onChange={onNiceToHavesTextChange}
            />
            <FreeTextField
              label="Deal-breakers"
              hint="Anything you do NOT want."
              placeholder="e.g. Open shelving, dark countertops…"
              value={dealBreakersText}
              onChange={onDealBreakersTextChange}
            />
          </div>
        </StepFrame>
      )

    case 'logistics':
      return (
        <StepFrame
          eyebrow="Step 8"
          title="Logistics."
          subtitle="A couple of practical things so the maker can plan around your life."
        >
          <div className="space-y-7">
            <div>
              <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Site access
              </p>
              <div className="flex flex-wrap gap-2">
                {SITE_ACCESS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() =>
                      onSiteAccessChange(siteAccess === opt.value ? null : opt.value)
                    }
                    className={cn(
                      'rounded-full border px-3.5 py-2 text-[13px] font-medium transition-all',
                      siteAccess === opt.value
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card hover:border-primary/40'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Where will you live during the build?
              </p>
              <div className="flex flex-wrap gap-2">
                {LIVING_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() =>
                      onLivingPlanChange(livingPlan === opt.value ? null : opt.value)
                    }
                    className={cn(
                      'rounded-full border px-3.5 py-2 text-[13px] font-medium transition-all',
                      livingPlan === opt.value
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card hover:border-primary/40'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </StepFrame>
      )

    case 'contact':
      return (
        <StepFrame
          eyebrow="Last step"
          title="Where should the designer reach you?"
          subtitle="We&apos;ll only use this for your project conversation."
        >
          <ContactForm value={contactDraft} onChange={onContactDraftChange} />
        </StepFrame>
      )
  }
}

function StepFrame({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow?: string
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-6">
      <div>
        {eyebrow && (
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">
            {eyebrow}
          </p>
        )}
        <h1 className="text-balance text-3xl font-semibold leading-[1.18] tracking-tight text-foreground md:text-[2.125rem] md:leading-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-2 max-w-prose text-[14.5px] leading-relaxed text-muted-foreground">
            {subtitle}
          </p>
        )}
      </div>
      {children}
    </div>
  )
}

function FreeTextField({
  label,
  hint,
  placeholder,
  value,
  onChange,
}: {
  label: string
  hint?: string
  placeholder?: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <label className="text-[13px] font-semibold text-foreground">{label}</label>
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </div>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-h-[88px] resize-none"
        maxLength={600}
      />
    </div>
  )
}

function FooterNav({
  stepId,
  canGoBack,
  isBusy,
  onBack,
  onContinue,
  profile,
  hasInspirationInput,
  hasContactDraft,
  scopeCount,
}: {
  stepId: FlowStepId
  canGoBack: boolean
  isBusy: boolean
  onBack: () => void
  onContinue: () => void
  profile: LeadProfile
  hasInspirationInput: boolean
  hasContactDraft: boolean
  scopeCount: number
}) {
  // Per-step continue gating + label.
  const ctaLabel = (() => {
    if (stepId === 'contact') return 'Send to designer'
    return 'Continue'
  })()

  const canContinue = (() => {
    switch (stepId) {
      case 'space_photos':
        // SpaceCapture handles its own internal "Confirm" button when a vision result
        // is ready. The footer Continue is a "skip and move on" — always enabled.
        return true
      case 'inspiration':
        return hasInspirationInput
      case 'concept_render':
        return true
      case 'confirm_look':
        return Boolean(
          profile.stylePreferences?.length ||
            profile.doorMaterial ||
            profile.worktopPreference ||
            profile.backsplashPreference ||
            profile.hardwareTier
        )
      case 'project_basics':
        return Boolean(
          profile.projectType &&
            profile.timeline &&
            (profile.budgetRange || profile.budgetShared === false)
        )
      case 'scope':
        return scopeCount > 0
      case 'wishlist':
        return true
      case 'logistics':
        return true
      case 'contact':
        return hasContactDraft
    }
  })()

  // For the space_photos step, the Continue button is redundant (SpaceCapture has
  // its own Confirm) but we keep a Skip pathway via the footer.
  const isSpaceStep = stepId === 'space_photos'

  return (
    <div className="flex items-center justify-between gap-3 pt-4">
      <button
        type="button"
        onClick={onBack}
        disabled={!canGoBack || isBusy}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-[13px] font-medium text-muted-foreground transition-all',
          (!canGoBack || isBusy) && 'opacity-30',
          canGoBack && !isBusy && 'hover:text-foreground'
        )}
      >
        <ArrowLeft className="size-3.5 stroke-[2]" aria-hidden />
        Back
      </button>
      <button
        type="button"
        onClick={onContinue}
        disabled={!canContinue || isBusy}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-[13px] font-semibold transition-all',
          canContinue && !isBusy
            ? 'bg-foreground text-background shadow-sm hover:brightness-110'
            : 'cursor-not-allowed bg-muted text-muted-foreground'
        )}
      >
        {isBusy ? (
          <>
            <span className="inline-block size-1.5 animate-pulse rounded-full bg-background/80" />
            Working…
          </>
        ) : (
          <>
            {isSpaceStep ? 'Skip' : ctaLabel}
            <ArrowRight className="size-3.5 stroke-[2]" aria-hidden />
          </>
        )}
      </button>
    </div>
  )
}

function buildFallbackSummary(profile: LeadProfile): string[] {
  const lines: string[] = []
  if (profile.projectType) lines.push(`Project type: ${profile.projectType.replace(/_/g, ' ')}.`)
  if (profile.timeline) lines.push(`Timeline: ${profile.timeline.replace(/_/g, ' ')}.`)
  if (profile.budgetRange) lines.push(`Budget band: ${profile.budgetRange.replace(/_/g, ' ')}.`)
  if (profile.stylePreferences?.length) {
    lines.push(`Style direction: ${profile.stylePreferences.join(', ').replace(/_/g, ' ')}.`)
  }
  if (profile.doorMaterial) lines.push(`Door material: ${profile.doorMaterial.replace(/_/g, ' ')}.`)
  if (profile.worktopPreference) lines.push(`Worktop: ${profile.worktopPreference.replace(/_/g, ' ')}.`)
  while (lines.length < 3) lines.push('See the brief below for the full capture.')
  return lines.slice(0, 6)
}
