'use client'

import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, RotateCcw } from 'lucide-react'
import { JourneyNavRail, journeyPillLabel } from '@/components/JourneyNavRail'
import { RenderAnchorCard } from '@/components/RenderAnchorCard'
import { LiveBOMPanel } from '@/components/builder/LiveBOMPanel'
import { MobileRangeDock } from '@/components/builder/MobileRangeDock'
import { AppShell } from '@/components/AppShell'
import { useTranslations, tDynamic, type Locale } from '@/lib/i18n'
import { SpaceCapture } from './SpaceCapture'
import { Inspiration } from './Inspiration'
import { ConceptRender as ConceptRenderUI, type ProductReference } from './ConceptRender'
import { LayoutReview } from './LayoutReview'
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
  stepNumber,
  type FlowStepId,
} from '@/lib/flow'
import { BuilderShell } from '@/components/builder/BuilderShell'
import { LayoutConfirm } from '@/components/builder/LayoutConfirm'
import type { BuilderHypothesis } from '@/lib/builder/hypothesis'
import type { BuilderState } from '@/lib/builder/inventory'
import type { UnitEdits } from '@/lib/builder/unit-assembly'
import { derivePrefills } from '@/lib/derive-prefills'
import { renderDerivedFloorPlan } from '@/lib/derive-layout'
import { DESIGNER_NAME } from '@/lib/system-prompt'
import type { UploadedReference } from './ImageSelect'
import type { FloorPlan } from '@/lib/floor-plan'
import { planFromProfile, validate, fromShapePreset } from '@/lib/floor-plan'
import { floorPlanToLayout } from '@/lib/contract/layout-contract'
import type {
  ClientMessage,
  ConceptRender,
  LeadProfile,
  SpaceVisionResult,
  WrapUpData,
} from '@/lib/types'
import type { InspirationVisionResult } from '@/app/api/inspiration-vision/route'

/** Sign-off timestamp, read through a module-level helper so the React purity
 * lint doesn't flag `Date.now()` in the component's event handlers. */
function nowMs(): number {
  return Date.now()
}

const TIMELINE_BANDS = [
  { value: 'asap', label: 'ASAP', caption: 'Within 4 weeks' },
  { value: '1_3_months', label: '1–3 months', caption: 'Soonish' },
  { value: '3_6_months', label: '3–6 months', caption: 'Planning' },
  { value: '6_12_months', label: '6–12 months', caption: 'Researching' },
  { value: 'no_rush', label: 'No rush', caption: 'Just exploring' },
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

/** Selected scope chips → the scope flags object. The estimate (computeBom)
 * drops out-of-scope lines from these flags; see LINE_SCOPE_KEY in bom.ts. */
function scopeFromSelected(selected: string[]): NonNullable<LeadProfile['scope']> {
  const scope: Record<string, boolean> = {}
  for (const opt of SCOPE_OPTIONS) scope[opt.value] = selected.includes(opt.value)
  return scope as NonNullable<LeadProfile['scope']>
}

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
}

export function KitchenIntake() {
  const { locale } = useTranslations()
  const [state, setState] = useState<IntakeFlowState>({
    currentStepId: 'space_photos',
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
  const [floorPlan, setFloorPlan] = useState<FloorPlan | null>(null)
  // Bumped ONLY when the contract card edits the plan, so the canvas editor
  // re-seeds (remounts) from the new plan. Canvas edits go through plain
  // setFloorPlan and never bump this — so the canvas never remounts itself
  // mid-drag, and the two surfaces can't fight over one shared plan.
  const [layoutEditNonce, setLayoutEditNonce] = useState(0)
  const editLayoutFromContract = (p: FloorPlan) => {
    setFloorPlan(p)
    setLayoutEditNonce((n) => n + 1)
  }
  // Per-row cabinet-unit edits from the contract card (sparse pattern
  // sequences). Frozen into the profile with the plan at commitConfirmLook.
  const [unitEdits, setUnitEdits] = useState<UnitEdits | null>(null)
  const [inspirationStyles, setInspirationStyles] = useState<string[]>([])
  const [inspirationRefs, setInspirationRefs] = useState<UploadedReference[]>([])
  const [inspirationVision, setInspirationVision] = useState<InspirationVisionResult | null>(null)
  const [conceptRenders, setConceptRenders] = useState<ConceptRender[]>([])
  const [chosenRenderId, setChosenRenderId] = useState<string | null>(null)
  const [productReferences, setProductReferences] = useState<ProductReference[]>([])
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

  // Phase-2 Builder state — populated lazily on entry to the builder step.
  const [builderHypothesis, setBuilderHypothesis] = useState<BuilderHypothesis | null>(null)
  const [isLoadingHypothesis, setIsLoadingHypothesis] = useState(false)
  const [hypothesisError, setHypothesisError] = useState<string | null>(null)
  // True once the user explicitly starts building without the AI suggestion.
  const [builderStartedNoAI, setBuilderStartedNoAI] = useState(false)

  /** Patch the central LeadProfile (replace strategy at top-level keys). */
  function patchProfile(patch: Partial<LeadProfile>) {
    setProfile((prev) => ({ ...prev, ...patch }))
  }

  /** Move to a specific step. */
  function goTo(id: FlowStepId) {
    setState({ currentStepId: id })
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
   * Apply space-vision + editor results to the profile. Called when SpaceCapture confirms.
   *
   * Persists three things to LeadProfile:
   *   - the raw photos and the raw vision result (provenance for the maker),
   *   - top-level layoutShape / hasIsland / dims (for back-compat with legacy
   *     consumers that haven't migrated to `floorPlan` yet),
   *   - the confirmed `floorPlan` object — the new source of truth.
   */
  /**
   * Anchor-only commit (post-merge step 1). Stores the photos + the raw vision
   * read (the scale anchor + provenance for the maker). The LAYOUT is NOT
   * frozen here — it's derived from the AI render and confirmed later at
   * "Confirm layout & look" (see the confirm_look effects + commitConfirmLook).
   */
  function commitSpacePhotos() {
    const inferred: Partial<LeadProfile> = { spacePhotos }
    if (spaceVision) inferred.spaceVisionResult = spaceVision
    patchProfile(inferred)
    const summary = spaceVision?.summary ? `AI read: ${spaceVision.summary}` : null
    const photoNote = spacePhotos.length
      ? `Uploaded ${spacePhotos.length} space photo${spacePhotos.length === 1 ? '' : 's'} (anchor).`
      : 'No photos uploaded.'
    logTurn('user', [photoNote, summary].filter(Boolean).join(' '), spacePhotos)
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

  /**
   * Freeze the reviewed layout — the contract the builder prices from — and
   * record the explicit sign-off. This is where the contract is locked: the
   * homeowner has seen the render-derived plan, adjusted everything on the
   * canvas, and watched the live cabinet breakdown (LayoutConfirm) update.
   * Decor (door/worktop/hardware) is NOT captured here — it lives in the builder.
   */
  function commitConfirmLook() {
    // The plan the homeowner reviewed (render-derived, then their edits).
    const planToFreeze = floorPlan
    if (planToFreeze) {
      const frozen = validate(planToFreeze)
      patchProfile({
        floorPlan: frozen,
        layoutShape: frozen.layoutShape,
        hasIsland: frozen.hasIsland,
        spaceLengthCm: Math.round(frozen.room.lengthCm),
        spaceWidthCm: Math.round(frozen.room.widthCm),
        // The per-unit sequence edits lock WITH the plan — the builder replays
        // them through the same assembler that rendered the confirmed tally.
        unitEdits: unitEdits ?? undefined,
        contractConfirmedAt: nowMs(),
      })
      logTurn(
        'user',
        `Confirmed layout contract: ${frozen.layoutShape} ${Math.round(frozen.room.lengthCm)}×${Math.round(frozen.room.widthCm)} cm${frozen.hasIsland ? ' + island' : ''}`
      )
    } else {
      logTurn('user', 'Confirmed layout contract: (skipped)')
    }
    goNext()
  }

  function commitScope() {
    patchProfile({ scope: scopeFromSelected(scopeSelected) })
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
      `Logistics: ${[profile.timeline, siteAccess, livingPlan].filter(Boolean).join(' · ') || '(skipped)'}`
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
        summaryLines: buildFallbackSummary(finalProfile, locale),
      })
      setFinaliseError(err instanceof Error ? err.message : 'Summary unavailable')
      setIsDone(true)
    } finally {
      setIsFinalising(false)
    }
  }

  function resetAll() {
    setState({ currentStepId: 'space_photos' })
    setProfile({})
    setTranscript([])
    setIsDone(false)
    setWrapUpData(null)
    setIsFinalising(false)
    setFinaliseError(null)
    setSpacePhotos([])
    setSpaceVision(null)
    setFloorPlan(null)
    setUnitEdits(null)
    setInspirationStyles([])
    setInspirationRefs([])
    setInspirationVision(null)
    setConceptRenders([])
    setChosenRenderId(null)
    setProductReferences([])
    setScopeSelected([])
    setSiteAccess(null)
    setLivingPlan(null)
    setContactDraft({ name: '', contactType: 'email', contactValue: '' })
    setMustHavesText('')
    setNiceToHavesText('')
    setDealBreakersText('')
    setBuilderHypothesis(null)
    setHypothesisError(null)
    setBuilderStartedNoAI(false)
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

  /**
   * Fire the builder-hypothesis vision call; the builder mounts when it lands.
   * Hands the measured layout to the vision call so it reuses our run ids /
   * lengths instead of inventing its own (context/layout-contract.md).
   */
  async function loadHypothesis() {
    const render = chosenRender
    if (!render?.imageDataUrl) return
    setIsLoadingHypothesis(true)
    setHypothesisError(null)
    try {
      const plan = planFromProfile(profile)
      const layoutContract = plan ? floorPlanToLayout(validate(plan)) : undefined
      const res = await fetch('/api/builder-hypothesis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          renderImage: render.imageDataUrl,
          anchorPhoto: spacePhotos[0],
          profile,
          layoutContract,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error ?? `Hypothesis failed (${res.status})`)
      setBuilderHypothesis(data.hypothesis as BuilderHypothesis)
    } catch (err) {
      setHypothesisError(err instanceof Error ? err.message : 'Builder hypothesis failed')
    } finally {
      setIsLoadingHypothesis(false)
    }
  }

  const progress = useMemo(
    () => Math.round(((flowIndex(state.currentStepId) + (isDone ? 1 : 0)) / FLOW.length) * 100),
    [state.currentStepId, isDone]
  )

  // The render the builder anchors to: the explicitly chosen one, else the latest.
  const chosenRender = chosenRenderId
    ? conceptRenders.find((r) => r.id === chosenRenderId)
    : conceptRenders[conceptRenders.length - 1]

  // The render-derived layout is still being computed when a render exists but
  // the vision pass hasn't returned (or errored) yet. While pending, the
  // confirm step shows a loading state rather than seeding a premature plan.
  const layoutPending = Boolean(chosenRender) && !builderHypothesis && !hypothesisError

  // On reaching "Confirm layout & look", fire the render vision pass ONCE. It
  // yields both the layout geometry (→ the proposed FloorPlan below) and the
  // decor hypothesis the builder reuses — decoupled from builder entry so the
  // homeowner confirms the layout derived from their render BEFORE building.
  // Synchronises with an external system (the vision API) on step entry.
  useEffect(() => {
    if (state.currentStepId !== 'confirm_look') return
    if (!chosenRender) return
    if (builderHypothesis || isLoadingHypothesis || hypothesisError) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadHypothesis()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentStepId, chosenRender, builderHypothesis, isLoadingHypothesis, hypothesisError])

  // Seed the floor plan for the editor: render configuration over photo scale
  // (see lib/derive-layout.ts). Fires once the render layout has landed (or
  // errored → photo-only / preset fallback), or immediately when there's no
  // render to wait for. Guarded so it never clobbers homeowner edits, and
  // seeds exactly once (the plan carries random element ids, so it must be
  // stored, not recomputed each render).
  useEffect(() => {
    if (state.currentStepId !== 'confirm_look') return
    if (floorPlan || layoutPending) return
    if (!builderHypothesis && !spaceVision) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFloorPlan(renderDerivedFloorPlan(spaceVision, builderHypothesis ?? null))
  }, [state.currentStepId, floorPlan, layoutPending, builderHypothesis, spaceVision])

  // ── Wrap-up / offer — still inside the one shell: the journey rail stays,
  // with every act marked done (status visibility to the very last screen).
  if (isDone && wrapUpData) {
    return (
      <AppShell
        progressPercent={100}
        mobilePillLabel={journeyPillLabel({
          funnelStepId: 'contact',
          profile,
          journeyDone: true,
          locale,
        })}
        nav={
          <>
            <header className="mb-5 flex items-center justify-end">
              <button
                type="button"
                onClick={resetAll}
                className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
                title={tDynamic('nav.startOver', locale)}
              >
                <RotateCcw className="size-3 stroke-[2]" aria-hidden />
                {tDynamic('nav.startOver', locale)}
              </button>
            </header>
            <JourneyNavRail funnelStepId="contact" profile={profile} journeyDone locale={locale} />
          </>
        }
      >
        <WrapUpScreen
          data={wrapUpData}
          profile={profile}
          explorationRefs={[]}
          transcript={transcript}
        />
      </AppShell>
    )
  }

  // ── The builder proper. Mounts once the homeowner actually starts building
  // (AI hypothesis loaded, explicit "without AI", or a saved build to resume).
  // BuilderShell renders through the same AppShell internally, so there is no
  // chrome swap — until then the builder step shows its entry body below, inside
  // the very same shell as every other step.
  const builderSavedState = profile.builderState as BuilderState | undefined
  if (
    state.currentStepId === 'builder' &&
    (builderHypothesis || builderStartedNoAI || builderSavedState)
  ) {
    // Freeze the Part-1 FloorPlan and project it into the COMPLETE layout
    // contract the builder seeds from. Always produced (an 'unsure' single-wall
    // preset when the homeowner somehow reached the builder without a plan) so
    // the builder never lacks a contract. See context/layout-contract.md.
    const plan = planFromProfile(profile) ?? fromShapePreset('unsure')
    const layoutContract = floorPlanToLayout(validate(plan))
    return (
      <BuilderShell
        hypothesis={builderHypothesis}
        layoutContract={layoutContract}
        unitEdits={(profile.unitEdits as UnitEdits | undefined) ?? unitEdits}
        savedState={builderSavedState}
        renderImageDataUrl={chosenRender?.imageDataUrl}
        anchorPhotoDataUrl={spacePhotos[0]}
        layoutSummary={summariseLayoutFromProfile(profile, locale, floorPlan)}
        profile={profile}
        layoutPreconfirmed
        onComplete={(builderState) => {
          patchProfile({ builderState })
          logTurn(
            'user',
            `Builder complete — doors: ${builderState.doors.decorCode}, worktop: ${builderState.worktop.decorCode}`
          )
          goNext()
        }}
        onEditLayout={(builderState) => {
          // Escape hatch: keep every pick, reopen the layout. On re-lock the
          // builder remounts with this savedState and relockBuilderState
          // re-derives the units against the new contract.
          patchProfile({ builderState })
          logTurn('user', 'Went back to edit the layout from the builder.')
          setState({ currentStepId: 'confirm_look' })
        }}
      />
    )
  }

  // ── Persistent right rail (render anchor + live range), present from the
  // confirm-look step onward so the right column never appears/disappears as the
  // homeowner crosses into and back out of the builder. The live range only
  // shows once the builder has produced a BOM (profile.builderState).
  const funnelRenderSrc =
    (chosenRenderId
      ? conceptRenders.find((r) => r.id === chosenRenderId)?.imageDataUrl
      : undefined) ??
    conceptRenders[conceptRenders.length - 1]?.imageDataUrl ??
    spacePhotos[0]
  const funnelBuilderState = profile.builderState as BuilderState | undefined
  const rightRailSteps: FlowStepId[] = [
    'confirm_look',
    'builder',
    'scope',
    'wishlist',
    'logistics',
    'contact',
  ]
  // The live range respects scope. On the scope step itself it tracks the
  // homeowner's live picks (so the range reacts as they tick items) — but only
  // once at least one is picked, so arriving on an empty selection still shows
  // the full kitchen, not €0. Elsewhere it uses the committed profile.scope.
  const liveScope =
    state.currentStepId === 'scope' && scopeSelected.length > 0
      ? scopeFromSelected(scopeSelected)
      : profile.scope
  const funnelRightRail =
    rightRailSteps.includes(state.currentStepId) && funnelRenderSrc ? (
      <div className="flex flex-col gap-5">
        {funnelBuilderState && <LiveBOMPanel state={funnelBuilderState} scope={liveScope} />}
        <RenderAnchorCard
          src={funnelRenderSrc}
          summary={summariseLayoutFromProfile(profile, locale, floorPlan)}
          locale={locale}
        />
      </div>
    ) : undefined

  return (
    <AppShell
      progressPercent={progress}
      rightRail={funnelRightRail}
      mobilePillLabel={journeyPillLabel({ funnelStepId: state.currentStepId, profile, locale })}
      mobileDock={
        funnelBuilderState && rightRailSteps.includes(state.currentStepId) ? (
          <MobileRangeDock state={funnelBuilderState} scope={liveScope} />
        ) : undefined
      }
      nav={
        <>
          {Object.keys(profile).length > 0 && (
            <header className="mb-5 flex items-center justify-end">
              <button
                type="button"
                onClick={resetAll}
                className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
                title={tDynamic('nav.startOver', locale)}
              >
                <RotateCcw className="size-3 stroke-[2]" aria-hidden />
                {tDynamic('nav.startOver', locale)}
              </button>
            </header>
          )}
          <JourneyNavRail funnelStepId={state.currentStepId} profile={profile} locale={locale} />
        </>
      }
    >
          <AnimatePresence mode="wait">
            <motion.section
              key={state.currentStepId}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-7"
            >
              {state.currentStepId === 'builder' ? (
                <BuilderEntryBody
                  hasRender={Boolean(chosenRender?.imageDataUrl)}
                  isLoading={isLoadingHypothesis}
                  error={hypothesisError}
                  onStartWithAI={() => void loadHypothesis()}
                  onStartWithoutAI={() => setBuilderStartedNoAI(true)}
                  onSkip={() => {
                    logTurn('user', 'Skipped the builder — sending minimal brief.')
                    goNext()
                  }}
                />
              ) : (
              <StepBody
                stepId={state.currentStepId}
                profile={profile}
                onPatchProfile={patchProfile}
                spacePhotos={spacePhotos}
                onSpacePhotosChange={setSpacePhotos}
                spaceVision={spaceVision}
                onSpaceVisionChange={setSpaceVision}
                floorPlan={floorPlan}
                onFloorPlanChange={setFloorPlan}
                onContractPlanChange={editLayoutFromContract}
                layoutEditNonce={layoutEditNonce}
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
                productReferences={productReferences}
                onProductReferencesChange={setProductReferences}
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
                onSpacePhotosSkip={() => {
                  logTurn('user', 'Skipped uploading space photos')
                  goNext()
                }}
                onConceptRenderSkip={() => {
                  logTurn('user', 'Skipped concept render')
                  goNext()
                }}
                layoutLoading={layoutPending || isLoadingHypothesis}
                builderHypothesis={builderHypothesis}
                unitEdits={unitEdits}
                onUnitEditsChange={setUnitEdits}
                anchorRenderUrl={funnelRenderSrc}
              />
              )}

              {translateError && (
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-2.5 text-xs text-destructive">
                  <span>{translateError}</span>
                  <button
                    type="button"
                    onClick={() => void commitWishlist()}
                    disabled={isTranslating}
                    className="rounded-full border border-destructive/40 px-3 py-1 font-semibold transition-colors hover:bg-destructive/10 disabled:opacity-50"
                  >
                    {tDynamic('common.retry', locale)}
                  </button>
                </div>
              )}
              {finaliseError && (
                <p className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-2.5 text-xs text-destructive">
                  {tDynamic('funnel.finaliseError', locale)}
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
                hasFloorPlan={Boolean(floorPlan)}
                hasSpacePhotos={spacePhotos.length > 0}
              />
            </motion.section>
          </AnimatePresence>
    </AppShell>
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
      case 'builder':
        // The Builder owns its own continue/back; the footer Continue here
        // is a "skip the builder" affordance and just advances the outer flow.
        logTurn('user', 'Skipped the detailed builder — using minimal brief.')
        goNext()
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
  floorPlan: FloorPlan | null
  onFloorPlanChange: (p: FloorPlan | null) => void
  /** Edit from the contract card — sets the plan AND re-seeds the canvas. */
  onContractPlanChange: (p: FloorPlan) => void
  /** Bumped on contract-card edits so the canvas editor remounts from the new plan. */
  layoutEditNonce: number
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
  productReferences: ProductReference[]
  onProductReferencesChange: (refs: ProductReference[]) => void
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
  onSpacePhotosSkip: () => void
  onConceptRenderSkip: () => void
  /** True while the render→layout vision pass is in flight (confirm_look). */
  layoutLoading: boolean
  /** Render hypothesis — folds AI unit hints into the confirm tally (parity). */
  builderHypothesis: BuilderHypothesis | null
  /** Per-row unit edits from the contract card + their setter. */
  unitEdits: UnitEdits | null
  onUnitEditsChange: (e: UnitEdits) => void
  /** Chosen render (preferred) or anchor photo — editor background at confirm_look. */
  anchorRenderUrl?: string
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
    floorPlan,
    onFloorPlanChange,
    onContractPlanChange,
    layoutEditNonce,
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
    productReferences,
    onProductReferencesChange,
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
    onSpacePhotosSkip,
    onConceptRenderSkip,
    layoutLoading,
    builderHypothesis,
    unitEdits,
    onUnitEditsChange,
    anchorRenderUrl,
  } = props
  const { t, tDynamic } = useTranslations()
  // "Korak {n}" computed from FLOW order — the old per-step eyebrow strings
  // went stale every time a step was added or removed.
  const stepEyebrow = (id: FlowStepId) =>
    t('funnel.stepEyebrow').replace('{n}', String(stepNumber(id)))

  switch (stepId) {
    case 'space_photos':
      return (
        <StepFrame
          eyebrow={stepEyebrow('space_photos')}
          title={t('funnel.space_photos.title')}
          subtitle={t('funnel.space_photos.subtitle')}
        >
          <SpaceCapture
            photos={spacePhotos}
            onPhotosChange={onSpacePhotosChange}
            visionResult={spaceVision}
            onVisionResult={onSpaceVisionChange}
            onSkip={onSpacePhotosSkip}
            captureOnly
          />
        </StepFrame>
      )

    case 'inspiration':
      return (
        <StepFrame
          eyebrow={stepEyebrow('inspiration')}
          title={t('funnel.inspiration.title')}
          subtitle={t('funnel.inspiration.subtitle')}
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
          eyebrow={stepEyebrow('concept_render')}
          title={t('funnel.concept_render.title')}
          subtitle={t('funnel.concept_render.subtitle')}
        >
          <ConceptRenderUI
            anchorPhotos={spacePhotos}
            styleReferences={inspirationRefs.map((r) => r.imageUrl)}
            productReferences={productReferences}
            onProductReferencesChange={onProductReferencesChange}
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

    case 'confirm_look': {
      // The contract tally derived from the CURRENT edited plan — shown
      // read-only below the editor so the homeowner sees exactly what we'll
      // price before the footer Continue freezes it and records the sign-off.
      const reviewContract = floorPlan ? floorPlanToLayout(validate(floorPlan)) : null
      return (
        <StepFrame
          eyebrow={stepEyebrow('confirm_look')}
          title={t('funnel.confirm_look.title')}
          subtitle={t('funnel.confirm_look.subtitle')}
        >
          {/* The layout DERIVED FROM THE RENDER — the homeowner adjusts walls,
              sizes, appliances, island and the per-wall upper/tall toggles right
              here; the footer Continue freezes it and locks the contract. Decor
              (door/worktop/hardware) is NOT here — it belongs to the builder. */}
          <LayoutReview
            key={layoutEditNonce}
            floorPlan={floorPlan}
            onFloorPlanChange={onFloorPlanChange}
            anchorPhotoUrl={anchorRenderUrl}
            isLoading={layoutLoading}
          />
          {/* The contract we'll price — appliances + the per-wall cabinet
              sequence. EDITABLE here (lengths, walls, rows) and on the plan
              above; both stay in sync. The footer Continue locks it. */}
          {reviewContract && (
            <LayoutConfirm
              contract={reviewContract}
              hypothesis={builderHypothesis}
              plan={floorPlan}
              onPlanChange={onContractPlanChange}
              edits={unitEdits}
              onEditsChange={onUnitEditsChange}
            />
          )}
        </StepFrame>
      )
    }

    case 'scope':
      return (
        <StepFrame
          eyebrow={stepEyebrow('scope')}
          title={t('funnel.scope.title')}
          subtitle={t('funnel.scope.subtitle')}
        >
          <ChipMulti
            options={SCOPE_OPTIONS.map((o) => ({ ...o, label: tDynamic(`option.scope.${o.value}`) }))}
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
          eyebrow={stepEyebrow('wishlist')}
          title={t('funnel.wishlist.title')}
          subtitle={t('funnel.wishlist.subtitle')}
        >
          <div className="space-y-5">
            <FreeTextField
              label={t('funnel.wishlist.mustHaves.label')}
              hint={t('funnel.wishlist.mustHaves.hint')}
              placeholder={t('funnel.wishlist.mustHaves.placeholder')}
              value={mustHavesText}
              onChange={onMustHavesTextChange}
            />
            <FreeTextField
              label={t('funnel.wishlist.niceToHaves.label')}
              hint={t('funnel.wishlist.niceToHaves.hint')}
              placeholder={t('funnel.wishlist.niceToHaves.placeholder')}
              value={niceToHavesText}
              onChange={onNiceToHavesTextChange}
            />
            <FreeTextField
              label={t('funnel.wishlist.dealBreakers.label')}
              hint={t('funnel.wishlist.dealBreakers.hint')}
              placeholder={t('funnel.wishlist.dealBreakers.placeholder')}
              value={dealBreakersText}
              onChange={onDealBreakersTextChange}
            />
          </div>
        </StepFrame>
      )

    case 'logistics':
      return (
        <StepFrame
          eyebrow={stepEyebrow('logistics')}
          title={t('funnel.logistics.title')}
          subtitle={t('funnel.logistics.subtitle')}
        >
          <div className="space-y-7">
            <div>
              <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {t('funnel.field.timeline')}
              </p>
              <VisualScale
                bands={TIMELINE_BANDS.map((b) => ({
                  ...b,
                  label: tDynamic(`option.timeline.${b.value}`),
                  caption: tDynamic(`option.timeline.${b.value}.caption`),
                }))}
                selected={profile.timeline ?? null}
                onSelect={(v) => onPatchProfile({ timeline: v })}
                axisCaption={t('funnel.field.timelineAxis')}
              />
            </div>
            <div>
              <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {t('funnel.field.siteAccess')}
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
                    {tDynamic(`option.siteAccess.${opt.value}`)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {t('funnel.field.living')}
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
                    {tDynamic(`option.living.${opt.value}`)}
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
          eyebrow={t('funnel.contact.eyebrow')}
          title={t('funnel.contact.title')}
          subtitle={t('funnel.contact.subtitle')}
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
  hasFloorPlan,
  hasSpacePhotos,
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
  hasFloorPlan: boolean
  hasSpacePhotos: boolean
}) {
  const { t } = useTranslations()
  // Per-step continue gating + label.
  const ctaLabel = stepId === 'contact' ? t('nav.send') : t('nav.continue')

  const canContinue = (() => {
    switch (stepId) {
      case 'space_photos':
        // SpaceCapture handles its own internal "Confirm" button when a vision result
        // is ready. The footer Continue is a "skip and move on" — always enabled.
        return true
      case 'builder':
        // The entry body owns its CTAs (begin / skip); no footer Continue.
        return false
      case 'inspiration':
        return hasInspirationInput
      case 'concept_render':
        return true
      case 'confirm_look':
        // The layout is the lock (it freezes the contract the builder prices);
        // decor below is optional. Gate on having a plan to confirm.
        return hasFloorPlan
      case 'scope':
        return scopeCount > 0
      case 'wishlist':
        return true
      case 'logistics':
        // Timeline moved here from the old project-basics step; it's the one
        // piece the maker can't plan without.
        return Boolean(profile.timeline)
      case 'contact':
        return hasContactDraft
    }
  })()

  // Step 1 (anchor capture) advances via the footer: "Continue" once photos
  // are in, "Skip" when the homeowner has none.
  const isSpaceStep = stepId === 'space_photos'
  const spaceLabel = hasSpacePhotos ? ctaLabel : t('nav.skip')

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
        {t('nav.back')}
      </button>
      {stepId !== 'builder' && (
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
              {t('nav.working')}
            </>
          ) : (
            <>
              {isSpaceStep ? spaceLabel : ctaLabel}
              <ArrowRight className="size-3.5 stroke-[2]" aria-hidden />
            </>
          )}
        </button>
      )}
    </div>
  )
}

/**
 * The builder step's entry body — rendered INSIDE the shared AppShell (same
 * nav, progress and right rail as every other step; no chrome swap). Idle:
 * introduce the builder + CTAs. Loading: dots while the vision pass runs.
 * Once the hypothesis lands (or the user starts without it / has a saved
 * build), the parent mounts BuilderShell instead.
 */
function BuilderEntryBody({
  hasRender,
  isLoading,
  error,
  onStartWithAI,
  onStartWithoutAI,
  onSkip,
}: {
  hasRender: boolean
  isLoading: boolean
  error: string | null
  onStartWithAI: () => void
  onStartWithoutAI: () => void
  onSkip: () => void
}) {
  const { t, tDynamic: td } = useTranslations()
  return (
    <StepFrame
      eyebrow={td('journey.act.build')}
      title={t('funnel.builderEntry.title')}
      subtitle={t('funnel.builderEntry.subtitle')}
    >
      <div className="space-y-6">
        {error && (
          <p className="max-w-prose rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={hasRender ? onStartWithAI : onStartWithoutAI}
            disabled={isLoading}
            className={cn(
              'inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-md transition-all',
              isLoading ? 'opacity-70' : 'hover:brightness-[1.06]'
            )}
          >
            {isLoading ? (
              <>
                <span className="inline-block size-1.5 animate-pulse rounded-full bg-primary-foreground/80" />
                {t('funnel.builderEntry.loading')}
              </>
            ) : error ? (
              <>{t('common.retry')}</>
            ) : hasRender ? (
              <>{t('funnel.builderEntry.ctaWithAI')}</>
            ) : (
              <>{t('funnel.builderEntry.cta')}</>
            )}
          </button>
          {hasRender && (
            <button
              type="button"
              onClick={onStartWithoutAI}
              disabled={isLoading}
              className={cn(
                'rounded-2xl border border-border bg-card px-5 py-3 text-sm font-medium text-muted-foreground transition-colors',
                !isLoading && 'hover:text-foreground'
              )}
            >
              {t('funnel.builderEntry.noAI')}
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onSkip}
          disabled={isLoading}
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {t('funnel.builderEntry.skip')}
        </button>
      </div>
    </StepFrame>
  )
}

/**
 * Render a one-line summary of the room (shape + key dimensions) using only
 * Phase-1 captures. Surfaced under the Builder's persistent preview so the
 * user always sees the room context without needing to re-edit it.
 */
function summariseLayoutFromProfile(
  p: LeadProfile,
  locale: Locale,
  plan?: FloorPlan | null
): string | undefined {
  // Prefer the LIVE plan (the same source the contract derives from) so the
  // anchor card can never contradict the "what we counted" card — e.g. anchor
  // saying "L-shape" while the contract reads "U-shape". Fall back to the
  // profile only before any plan exists.
  const shape = plan?.layoutShape ?? p.layoutShape ?? p.spaceVisionResult?.layoutShape
  const length = plan ? Math.round(plan.room.lengthCm) : p.spaceLengthCm ?? p.spaceVisionResult?.lengthCm
  const width = plan ? Math.round(plan.room.widthCm) : p.spaceWidthCm ?? p.spaceVisionResult?.widthCm
  const hasIsland = plan ? plan.hasIsland : p.hasIsland
  const parts: string[] = []
  if (shape && shape !== 'unsure') {
    parts.push(tDynamic(`layout.shape.${shape}`, locale))
  }
  if (length && width) parts.push(`${length} × ${width} cm`)
  else if (length) parts.push(`${length} cm`)
  if (hasIsland) parts.push(tDynamic('layout.suffix.island', locale))
  return parts.length > 0 ? parts.join(' · ') : undefined
}

function buildFallbackSummary(profile: LeadProfile, locale: Locale): string[] {
  const fill = (key: string, v: string) => tDynamic(key, locale).replace('{v}', v.replace(/_/g, ' '))
  const lines: string[] = []
  if (profile.projectType) lines.push(fill('fallback.projectType', profile.projectType))
  if (profile.timeline) lines.push(fill('fallback.timeline', profile.timeline))
  if (profile.budgetRange) lines.push(fill('fallback.budget', profile.budgetRange))
  if (profile.stylePreferences?.length) {
    lines.push(fill('fallback.style', profile.stylePreferences.join(', ')))
  }
  if (profile.doorMaterial) lines.push(fill('fallback.door', profile.doorMaterial))
  if (profile.worktopPreference) lines.push(fill('fallback.worktop', profile.worktopPreference))
  while (lines.length < 3) lines.push(tDynamic('fallback.more', locale))
  return lines.slice(0, 6)
}
