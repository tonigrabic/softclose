'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, RotateCcw } from 'lucide-react'
import { JourneyNavRail, journeyPillLabel } from '@/components/JourneyNavRail'
import { RenderAnchorCard } from '@/components/RenderAnchorCard'
import { LiveBOMPanel } from '@/components/builder/LiveBOMPanel'
import { MobileRangeDock } from '@/components/builder/MobileRangeDock'
import { AppShell } from '@/components/AppShell'
import { useTranslations, tDynamic, type Locale, type TranslationKey } from '@/lib/i18n'
import { SpaceCapture } from './SpaceCapture'
import { Inspiration } from './Inspiration'
import { ConceptRender as ConceptRenderUI, type ProductReference } from './ConceptRender'
import { LayoutReview } from './LayoutReview'
import { ConfirmToggles, EditPlanDisclosure } from './ConfirmToggles'
import { FloorPlanStatic } from './FloorPlanStatic'
import { VisualScale } from './VisualScale'
import { ContactForm, type ContactValue } from './ContactForm'
import { WrapUpScreen } from './WrapUpScreen'
import { RoomStep, type RoomPhase, type RoomStepProps, type SaveLaterResult } from './RoomStep'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  FLOW,
  flowIndex,
  nextStepId,
  prevStepId,
  resolveStepId,
  resumeStepId,
  stepNumber,
  type FlowStepId,
} from '@/lib/flow'
import { BuilderShell } from '@/components/builder/BuilderShell'
import { LayoutConfirm } from '@/components/builder/LayoutConfirm'
import { decorHypothesis, type BuilderHypothesis } from '@/lib/builder/hypothesis'
import type { BuilderState } from '@/lib/builder/inventory'
import type { UnitEdits } from '@/lib/builder/unit-assembly'
import { builderPickLabels } from '@/lib/builder/pick-labels'
import { derivePrefills } from '@/lib/derive-prefills'
import { seedConfirmPlan } from '@/lib/derive-layout'
import { clearSnapshot, loadSnapshot, saveSnapshot, type StoredSnapshot } from '@/lib/session-store'
import type { ProjectSnapshot as IntakeSnapshot } from '@/lib/project/snapshot'
import { useProjectCheckpoint } from './useProjectCheckpoint'
import type { UploadedReference } from './ImageSelect'
import type { FloorPlan } from '@/lib/floor-plan'
import {
  planFromProfile,
  validate,
  fromShapePreset,
  WALL_LETTER,
  counterWalls,
  isRoomMeasured,
  missingWalls,
  relabelPhotoView,
  reseedRoomPlan,
  roomPlanFromVision,
  roomStepReady,
  roomStepDone,
  tradeMovesFromProfile,
  workingPlanFromRoom,
  type TradeMove,
} from '@/lib/floor-plan'
import { OMITTED_IMAGE, snapshotFingerprint } from '@/lib/project/checkpoint'
import { requestSpaceVision } from '@/lib/api/space-vision-client'
import { floorPlanToLayout } from '@/lib/contract/layout-contract'
import type {
  ClientMessage,
  ConceptRender,
  LeadProfile,
  SpaceVisionResult,
  WrapUpData,
} from '@/lib/types'
import type { InspirationVisionResult } from '@/app/api/inspiration-vision/route'
import { ApiError, apiErrorKey, readJson } from '@/lib/api/client'
import { decorProfileHints } from '@/lib/api/decor-profile-hints'
import { roomConstraintsFor } from '@/lib/render/room-constraints'
import { contactChannels } from '@/lib/contact'
import { mintBriefId } from '@/lib/handoff/brief-id'

/** Sign-off timestamp, read through a module-level helper so the React purity
 * lint doesn't flag `Date.now()` in the component's event handlers. */
function nowMs(): number {
  return Date.now()
}

/** "sink moves A→D", "sink moves A→?", "hob stays" — the confirm turn's trade line. */
function tradeNote(part: 'sink' | 'hob', m: TradeMove): string {
  const walls =
    m.status === 'moves' && m.fromWall ? ` ${WALL_LETTER[m.fromWall]}→${m.toWall ? WALL_LETTER[m.toWall] : '?'}` : ''
  return `${part} ${m.status}${walls}`
}

// Labels and captions are option.timeline.* / option.siteAccess.* in the locale files.
const TIMELINE_BANDS = ['asap', '1_3_months', '3_6_months', '6_12_months', 'no_rush']

const SITE_ACCESS_OPTIONS = ['street_level', 'one_flight', 'multi_flight', 'lift', 'restricted']

interface IntakeFlowState {
  currentStepId: FlowStepId
}

export interface KitchenIntakeProps {
  /** Set when the journey belongs to a customer's project. Absent = the old
   *  anonymous, local-only funnel, whose behaviour is unchanged. */
  projectId?: string
  /** The maker's display name, for the line telling the customer who can see
   *  their progress. AGENTS.md rule 8 cuts both ways. */
  makerName?: string | null
  /** The project row's current revision, for optimistic-concurrency writes. */
  initialRevision?: number
  /** True when the viewer is the maker looking in. The brief's whole value is
   *  that it is the homeowner's own answers, so the maker never writes to it. */
  readOnly?: boolean
  /** The project already has a brief: re-submitting becomes explicit. */
  hasExistingBrief?: boolean
  /**
   * The journey as the server last saw it. Image-free by design (checkpoints
   * strip inline images), so it restores everything structural and nothing
   * visual — which is exactly what a second device can be given today.
   */
  initialSnapshot?: IntakeSnapshot | null
  /** The customer's account email. It is the brief's contact address, so the
   *  contact step shows it and asks only for a name and an optional phone.
   *  Absent in the anonymous funnel, which still asks for one way to reach them. */
  customerEmail?: string | null
  /** The name the maker invited them under — prefilled, still editable. */
  customerName?: string | null
  /** Open the journey at this step instead of where it was left, e.g. the
   *  builder for a customer whose brief went out without a range. */
  startAt?: FlowStepId
}

export function KitchenIntake({
  projectId,
  makerName,
  initialRevision = 0,
  readOnly = false,
  hasExistingBrief = false,
  initialSnapshot = null,
  customerEmail = null,
  customerName = null,
  startAt,
}: KitchenIntakeProps = {}) {
  const { locale } = useTranslations()
  const [state, setState] = useState<IntakeFlowState>({
    currentStepId: 'space_photos',
  })
  const [profile, setProfile] = useState<LeadProfile>({})
  const [transcript, setTranscript] = useState<ClientMessage[]>([])
  const [isDone, setIsDone] = useState(false)
  const [wrapUpData, setWrapUpData] = useState<WrapUpData | null>(null)
  // A brief went out during this visit. hasExistingBrief comes from the page
  // load, so without this a return to the builder after sending would make the
  // next wrap-up send again on mount — a second brief and a second email.
  const [sentInSession, setSentInSession] = useState(false)
  const [isFinalising, setIsFinalising] = useState(false)
  const [finaliseError, setFinaliseError] = useState<string | null>(null)

  // Per-step transient state lifted to the parent so Back navigation preserves work.
  const [spacePhotos, setSpacePhotos] = useState<string[]>([])
  const [spaceVision, setSpaceVision] = useState<SpaceVisionResult | null>(null)
  const [floorPlan, setFloorPlan] = useState<FloorPlan | null>(null)
  // The room step's two screens (shape, then measure) — one rail number, a
  // resume lands on the screen it was left on.
  const [roomPhase, setRoomPhase] = useState<RoomPhase>('shape')
  // The room as it is today, while the room step edits it — kept apart from
  // `floorPlan` (the kitchen being built): going back to the room step never
  // shows or saves the planned layout (an added island, confirm-step edits)
  // as the existing room.
  const [roomPlan, setRoomPlan] = useState<FloorPlan | null>(null)
  const [isReadingRoom, setIsReadingRoom] = useState(false)
  const [roomReadFailed, setRoomReadFailed] = useState(false)
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
  const [siteAccess, setSiteAccess] = useState<string | null>(null)
  const blankContact = (): ContactValue => ({
    name: customerName ?? '',
    contactType: 'email',
    contactValue: '',
  })
  const [contactDraft, setContactDraft] = useState<ContactValue>(blankContact)

  // Wishlist free-text drafts (translated into TranslatedField on submit).
  const [mustHavesText, setMustHavesText] = useState('')
  const [niceToHavesText, setNiceToHavesText] = useState('')
  const [dealBreakersText, setDealBreakersText] = useState('')
  const [isTranslating, setIsTranslating] = useState(false)
  const [translateError, setTranslateError] = useState<TranslationKey | null>(null)

  // Phase-2 Builder state — populated lazily on entry to the builder step.
  const [builderHypothesis, setBuilderHypothesis] = useState<BuilderHypothesis | null>(null)
  const [isLoadingHypothesis, setIsLoadingHypothesis] = useState(false)
  const [hypothesisError, setHypothesisError] = useState<TranslationKey | null>(null)
  // True once the user explicitly starts building without the AI suggestion.
  const [builderStartedNoAI, setBuilderStartedNoAI] = useState(false)

  // ── Session persistence (AGENTS.md rule 7/8: reload must not wipe the journey).
  // Everything `resetAll` clears is snapshotted to IndexedDB (debounced) and
  // offered back on the next visit. Saving is held until the load attempt has
  // settled, so the empty initial state can never clobber a stored journey.
  const [resumeOffer, setResumeOffer] = useState<StoredSnapshot<IntakeSnapshot> | null>(null)
  const persistenceReady = useRef(false)
  // Dual write: IndexedDB stays the fast local cache, the server copy is what
  // survives a different device and what the maker's dashboard reads.
  const checkpoint = useProjectCheckpoint({
    projectId: readOnly ? undefined : projectId,
    initialRevision,
  })

  useEffect(() => {
    let cancelled = false
    void loadSnapshot<IntakeSnapshot>(projectId).then((rec) => {
      if (cancelled) return
      const d = rec?.data
      const worthResuming =
        d && (d.currentStepId !== 'space_photos' || Object.keys(d.profile ?? {}).length > 0 || d.spacePhotos?.length > 0)
      // In project mode there is nothing to ask about: the customer already
      // chose "continue" on their project home, and the local copy is a cache
      // of their own journey rather than a maybe-stranger's session. Restore it
      // and move on. Leaving the offer up would also hold persistenceReady
      // false, which silently blocks every checkpoint until it is answered.
      //
      // Local wins over the server copy when it exists, because it is the same
      // journey WITH its photos — the server copy is image-free. On a second
      // device there is no local copy, and the server snapshot restores
      // everything except the pictures.
      if (projectId) {
        if (worthResuming) applySnapshot(d)
        else if (initialSnapshot) applySnapshot(initialSnapshot)
      } else if (worthResuming) {
        setResumeOffer(rec)
      }
      if (startAt) {
        setState({ currentStepId: startAt })
        setIsDone(false)
      }
      persistenceReady.current = true
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, [])

  function applySnapshot(d: IntakeSnapshot) {
    // A journey saved on a since-retired step resumes at its successor; one
    // saved past the room without a measured room resumes at the room step —
    // the render is not reachable without typed wall lengths (IMP-31).
    // The completed room step, not the live plan: a layout edit on the confirm
    // step must not take back a measurement.
    const roomMeasured = roomStepDone(d.profile)
    const resumed = resumeStepId(d.currentStepId, {
      roomMeasured,
      contractConfirmed: Boolean(d.profile?.contractConfirmedAt),
    })
    const forwarded = resumed !== (resolveStepId(d.currentStepId) ?? 'space_photos')
    setState({ currentStepId: resumed })
    setProfile(d.profile ?? {})
    setTranscript(d.transcript ?? [])
    setIsDone(Boolean(d.isDone))
    setWrapUpData(d.wrapUpData ?? null)
    setSpacePhotos(d.spacePhotos ?? [])
    setSpaceVision(d.spaceVision ?? null)
    // Forwarded to the room step: an unmeasured plan was read off a render, so
    // drop it and let the room step seed from the photos instead.
    setFloorPlan(forwarded && !roomMeasured ? null : (d.floorPlan ?? null))
    setLayoutEditNonce((n) => n + 1)
    setUnitEdits(forwarded && !roomMeasured ? null : (d.unitEdits ?? null))
    setRoomPhase(d.roomPhase ?? 'shape')
    setRoomPlan(
      forwarded
        ? null
        : (d.roomPlan ?? d.profile?.existingFloorPlan ?? (resumed === 'room' ? (d.floorPlan ?? null) : null))
    )
    setInspirationStyles(d.inspirationStyles ?? [])
    setInspirationRefs(d.inspirationRefs ?? [])
    setInspirationVision(d.inspirationVision ?? null)
    setConceptRenders(d.conceptRenders ?? [])
    setChosenRenderId(d.chosenRenderId ?? null)
    setProductReferences(d.productReferences ?? [])
    setSiteAccess(d.siteAccess ?? null)
    setContactDraft(
      d.contactDraft
        ? { ...d.contactDraft, name: d.contactDraft.name || (customerName ?? '') }
        : blankContact()
    )
    setMustHavesText(d.mustHavesText ?? '')
    setNiceToHavesText(d.niceToHavesText ?? '')
    setDealBreakersText(d.dealBreakersText ?? '')
    setBuilderHypothesis(d.builderHypothesis ?? null)
    setBuilderStartedNoAI(Boolean(d.builderStartedNoAI))
  }

  function resumeSession() {
    if (resumeOffer) applySnapshot(resumeOffer.data)
    setResumeOffer(null)
    persistenceReady.current = true
  }

  function discardSavedSession() {
    void clearSnapshot(projectId)
    setResumeOffer(null)
    persistenceReady.current = true
  }

  // One snapshot per render, shared by the debounced save below and the flush
  // the wrap-up runs before submitting — so the two can never disagree, and the
  // save that follows a flush is recognised as the same write.
  const snapshot = useMemo<IntakeSnapshot>(
    () => ({
      currentStepId: state.currentStepId,
      profile,
      transcript,
      isDone,
      wrapUpData,
      spacePhotos,
      spaceVision,
      floorPlan,
      unitEdits,
      inspirationStyles,
      inspirationRefs,
      inspirationVision,
      conceptRenders,
      chosenRenderId,
      productReferences,
      siteAccess,
      contactDraft,
      mustHavesText,
      niceToHavesText,
      dealBreakersText,
      builderHypothesis,
      builderStartedNoAI,
      roomPhase,
      roomPlan,
    }),
    [
      state.currentStepId, profile, transcript, isDone, wrapUpData, spacePhotos, spaceVision, floorPlan,
      unitEdits, inspirationStyles, inspirationRefs, inspirationVision, conceptRenders, chosenRenderId,
      productReferences, siteAccess, contactDraft, mustHavesText,
      niceToHavesText, dealBreakersText, builderHypothesis, builderStartedNoAI, roomPhase, roomPlan,
    ]
  )

  useEffect(() => {
    if (!persistenceReady.current) return
    const hasSomething =
      snapshot.currentStepId !== 'space_photos' ||
      Object.keys(snapshot.profile).length > 0 ||
      snapshot.spacePhotos.length > 0
    if (!hasSomething) return
    const t = setTimeout(() => void saveSnapshot(snapshot, projectId), 800)
    checkpoint.queue(snapshot)
    return () => clearTimeout(t)
  }, [snapshot, checkpoint, projectId])

  const resumeBanner = resumeOffer && !projectId ? (
    <div
      role="dialog"
      aria-labelledby="resume-title"
      className="mb-6 rounded-2xl border border-primary/30 bg-primary/5 p-4 text-left shadow-sm"
    >
      <p id="resume-title" className="text-sm font-semibold text-foreground">{tDynamic('resume.title', locale)}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {tDynamic('resume.body', locale).replace('{when}', new Date(resumeOffer.savedAt).toLocaleString(locale))}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={resumeSession}
          className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          {tDynamic('resume.continue', locale)}
        </button>
        <button
          type="button"
          onClick={discardSavedSession}
          className="rounded-full border border-border px-4 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent/40"
        >
          {tDynamic('resume.restart', locale)}
        </button>
      </div>
    </div>
  ) : null

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
    // The room step's measure screen goes back to its shape screen first.
    if (state.currentStepId === 'room' && roomPhase === 'measure') {
      setRoomPhase('shape')
      return
    }
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

  /** Real photos on this device — a resumed snapshot carries only markers. */
  const realPhotos = spacePhotos.filter((p) => p && p !== OMITTED_IMAGE)
  /** A photo read happened, on this device or another — for the measured-by stamp. */
  const roomHasPhotos = realPhotos.length > 0 || Boolean(spaceVision)

  /**
   * A new photo read, or a corrected label: the room plan follows it, typed
   * lengths kept. A correction that leaves the counter walls as they were
   * keeps the plan — and the card the homeowner picked — untouched. Nothing is
   * reseeded while they are describing an empty room.
   */
  function handleSpaceVisionChange(v: SpaceVisionResult | null, opts: { keepIfSameWalls?: boolean } = {}) {
    const before = spaceVision
    setSpaceVision(v)
    setRoomReadFailed(false)
    if (profile.existingRoom === 'empty') return
    const walls = (x: SpaceVisionResult | null) => {
      const plan = roomPlanFromVision(x)
      return plan ? counterWalls(plan).join() : null
    }
    if (opts.keepIfSameWalls && walls(before) === walls(v)) return
    setRoomPlan((prev) => reseedRoomPlan(prev, v, { hasPhotos: roomHasPhotos || Boolean(v) }))
  }

  /** Read the photos as one room — on entering the room step when nobody pressed "Pročitaj", and on retry. */
  async function readRoom() {
    if (realPhotos.length === 0) return
    // Only real photos can be sent; map the views back to their place among
    // all photos, so a label never sits under a placeholder.
    const positions = spacePhotos.flatMap((p, i) => (p && p !== OMITTED_IMAGE ? [i] : []))
    setIsReadingRoom(true)
    setRoomReadFailed(false)
    try {
      const read = await requestSpaceVision(realPhotos, locale)
      const v: SpaceVisionResult = {
        ...read,
        photoViews: read.photoViews?.map((view) => ({ ...view, photoIndex: positions[view.photoIndex] ?? view.photoIndex })),
      }
      patchProfile({ spaceVisionResult: v })
      handleSpaceVisionChange(v)
    } catch (err) {
      console.warn('[space-vision]', err)
      setRoomReadFailed(true)
    } finally {
      setIsReadingRoom(false)
    }
  }

  /**
   * Freeze the room as it is today (IMP-31). The plan the homeowner measured
   * is kept as `existingFloorPlan`, never edited after this step, so later
   * steps can tell what moves; the working `floorPlan` the render and the
   * confirm step build on is that room plus the intent (an island added if
   * that is what they want). Coming back without changing the room or the
   * intent keeps the working plan — and every confirm-step edit on it.
   * `roomConfirmed` is the render's gate. The corrected photo labels ride
   * along in `spaceVisionResult`.
   */
  function commitRoom() {
    if (!roomPlan) return
    const room = validate(roomPlan)
    const empty = profile.existingRoom === 'empty'
    const intent = empty ? undefined : profile.layoutIntent
    const fingerprint = snapshotFingerprint(room)
    const unchanged =
      floorPlan && profile.roomConfirmed?.fingerprint === fingerprint && profile.roomConfirmed.intent === intent
    const working = unchanged ? floorPlan : workingPlanFromRoom(room, intent)
    // A sink answer belongs to the intent it was given under (IMP-32): a new
    // intent starts the confirm step's sink chips from the plan again.
    const clearSinkAnswer =
      !unchanged && profile.roomConfirmed?.intent !== intent && profile.trades?.plumbing?.sinkPosition !== undefined
    setRoomPlan(room)
    setFloorPlan(working)
    if (!unchanged) setUnitEdits(null)
    patchProfile({
      ...(clearSinkAnswer
        ? { trades: { ...profile.trades, plumbing: { ...profile.trades?.plumbing, sinkPosition: undefined } } }
        : {}),
      floorPlan: working,
      existingFloorPlan: empty ? undefined : room,
      existingRoom: empty ? 'empty' : 'kitchen',
      roomConfirmed: { at: nowMs(), intent, fingerprint },
      layoutShape: working.layoutShape,
      hasIsland: working.hasIsland,
      spaceLengthCm: Math.round(working.room.lengthCm),
      spaceWidthCm: Math.round(working.room.widthCm),
      ...(spaceVision ? { spaceVisionResult: spaceVision } : {}),
    })
    // One transcript turn per room the homeowner actually confirmed — passing
    // back through the step unchanged says nothing new to the maker.
    if (!unchanged) {
      const walls = counterWalls(room)
        .map((w) => `${WALL_LETTER[w]}=${room.room.sides[w].measuredLengthCm} cm`)
        .join(', ')
      logTurn(
        'user',
        `Room today: ${empty ? 'empty room' : room.layoutShape}; measured walls ${walls}; wants: ${empty ? `a new ${working.layoutShape} kitchen` : (intent ?? 'n/a')}`
      )
    }
    goNext()
  }

  /** "Nemaš metar? Spremi i nastavi kasnije" — says saved only when it was. */
  async function saveRoomForLater(): Promise<SaveLaterResult> {
    const local = await saveSnapshot(snapshot, projectId)
    if (projectId && (await checkpoint.flush(snapshot))) return 'saved_project'
    return local ? 'saved_local' : 'failed'
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
   * homeowner has seen the plan the room step committed, set the island, the
   * sink and the uppers (or changed the layout in the editor), and watched
   * the live cabinet breakdown (LayoutConfirm) update. The transcript turn
   * says whether the sink and the hob move. The sink answer itself was
   * written on its tap. Decor (door/worktop/hardware) is NOT captured here —
   * it lives in the builder.
   */
  function commitConfirmLook() {
    // The plan the homeowner reviewed (the room step's plan, then their edits).
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
      const tm = tradeMovesFromProfile({ ...profile, floorPlan: frozen })
      logTurn(
        'user',
        `Confirmed layout contract: ${frozen.layoutShape} ${Math.round(frozen.room.lengthCm)}×${Math.round(frozen.room.widthCm)} cm${frozen.hasIsland ? ' + island' : ''}; ${tradeNote('sink', tm.sink)}; ${tradeNote('hob', tm.hob)}`
      )
    } else {
      logTurn('user', 'Confirmed layout contract: (skipped)')
    }
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
      const data = await readJson(res)
      if (!res.ok || data.error) {
        throw new ApiError(data.error ?? `Translate failed (${res.status})`, res.status, data.code as string | undefined)
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
      console.warn('[translate-wishlist]', err)
      setTranslateError(apiErrorKey(err, 'funnel.wishlist.error'))
    } finally {
      setIsTranslating(false)
    }
  }

  function commitLogistics() {
    if (!siteAccess) {
      goNext()
      return
    }
    patchProfile({
      logistics: { siteAccess: siteAccess as NonNullable<LeadProfile['logistics']>['siteAccess'] },
    })
    logTurn(
      'user',
      `Logistics: ${[profile.timeline, siteAccess].filter(Boolean).join(' · ') || '(skipped)'}`
    )
    goNext()
  }

  async function commitContact() {
    const name = contactDraft.name.trim()
    if (!name) return
    // Signed in: the account email is the contact and a phone is optional (a
    // stale anonymous-form value is dropped). Anonymous: the one channel typed.
    const patch: Partial<LeadProfile> = customerEmail
      ? { name, email: customerEmail, phone: contactDraft.phone?.trim() || undefined, contactValue: undefined }
      : { name, contactValue: contactDraft.contactValue.trim() }
    if (!customerEmail && !patch.contactValue) return
    patchProfile(patch)
    logTurn('user', `Contact: ${name} (${contactChannels(patch).join(', ')})`)
    await finalise(patch)
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
        body: JSON.stringify({ profile: finalProfile, locale }),
      })
      const data = await readJson(res)
      if (!res.ok || data.error) {
        throw new Error(data.error ?? `Summarise failed (${res.status})`)
      }
      const summary = data.result as { thankYouMessage: string; summaryLines: string[] }
      setProfile(finalProfile)
      setWrapUpData({
        thankYouMessage: summary.thankYouMessage,
        summaryLines: summary.summaryLines,
        briefId: mintBriefId(),
      })
      setIsDone(true)
    } catch (err) {
      // Even if the AI summary fails, let the homeowner see their wrap-up with a fallback message.
      setProfile(finalProfile)
      setWrapUpData({
        thankYouMessage: tDynamic('funnel.thanksFallback', locale)
          .replace('{name}', finalProfile.name ? `, ${finalProfile.name}` : ''),
        summaryLines: buildFallbackSummary(finalProfile, locale),
        briefId: mintBriefId(),
      })
      setFinaliseError(err instanceof Error ? err.message : 'Summary unavailable')
      setIsDone(true)
    } finally {
      setIsFinalising(false)
    }
  }

  /**
   * Wipe the journey and start again.
   *
   * Only reachable in the anonymous funnel. A customer working inside a project
   * has exactly one kitchen and cannot start another without a new invite from
   * their maker, so a one-click irreversible wipe has no safe meaning there —
   * the callers pass `hidden` when projectId is set.
   */
  function resetAll() {
    void clearSnapshot(projectId)
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
    setRoomPlan(null)
    setRoomPhase('shape')
    setRoomReadFailed(false)
    setUnitEdits(null)
    setInspirationStyles([])
    setInspirationRefs([])
    setInspirationVision(null)
    setConceptRenders([])
    setChosenRenderId(null)
    setProductReferences([])
    setSiteAccess(null)
    setContactDraft(blankContact())
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
   * Decor only (IMP-32): the render plus a few preference ids. No plan, no
   * anchor photo and no profile: the layout is measured, and the profile
   * carries every render and photo as data URLs (413 risk).
   */
  async function loadHypothesis() {
    const render = chosenRender
    if (!render?.imageDataUrl) return
    setIsLoadingHypothesis(true)
    setHypothesisError(null)
    try {
      const res = await fetch('/api/builder-hypothesis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ renderImage: render.imageDataUrl, hints: decorProfileHints(profile) }),
      })
      const data = await readJson(res)
      if (!res.ok || data.error) {
        throw new ApiError(data.error ?? `Hypothesis failed (${res.status})`, res.status, data.code as string | undefined)
      }
      setBuilderHypothesis(data.hypothesis as BuilderHypothesis)
    } catch (err) {
      console.warn('[builder-hypothesis]', err)
      setHypothesisError(apiErrorKey(err, 'funnel.builderEntry.error'))
    } finally {
      setIsLoadingHypothesis(false)
    }
  }

  const progress = useMemo(
    () => Math.round(((flowIndex(state.currentStepId) + (isDone ? 1 : 0)) / FLOW.length) * 100),
    [state.currentStepId, isDone]
  )

  // The render the builder anchors to: the explicitly chosen one, else the
  // latest main render — an other-side render (IMP-32) is never the design.
  const mainRenders = conceptRenders.filter((r) => r.view !== 'other_side')
  const latestMainRender = mainRenders[mainRenders.length - 1]
  const chosenRender = chosenRenderId ? conceptRenders.find((r) => r.id === chosenRenderId) : latestMainRender

  // The render read, as the builder may use it (IMP-32). Once the room step is
  // done the plan owns the layout, so the read is demoted to decor and
  // materials: no render-seen tower, unit pattern or fridge housing can move
  // the tally the homeowner confirmed. A journey confirmed before the room
  // step keeps its full read, so its confirmed tally does not shift on resume.
  const roomDone = roomStepDone(profile)
  const builderHyp = useMemo(
    () => (roomDone ? decorHypothesis(builderHypothesis) : builderHypothesis),
    [roomDone, builderHypothesis]
  )

  // On reaching "Confirm layout & look", fire the render vision pass ONCE, as
  // a prefetch for the builder's decor (fronts, worktop, hardware). It no
  // longer feeds the plan or the tally, so nothing on this step waits for it.
  // Synchronises with an external system (the vision API) on step entry.
  useEffect(() => {
    if (state.currentStepId !== 'confirm_look') return
    if (!chosenRender) return
    if (builderHypothesis || isLoadingHypothesis || hypothesisError) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadHypothesis()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentStepId, chosenRender, builderHypothesis, isLoadingHypothesis, hypothesisError])

  // Seed the floor plan for the confirm step from the plan, never the render:
  // the measured room (IMP-31), a legacy journey's plan as it is, or — with
  // no plan at all — the photo read. Guarded so it never clobbers homeowner
  // edits, and seeds exactly once (the plan carries random element ids, so it
  // must be stored, not recomputed each render).
  useEffect(() => {
    if (state.currentStepId !== 'confirm_look') return
    if (floorPlan) return
    if (!profile.floorPlan && !spaceVision) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFloorPlan(seedConfirmPlan(null, profile.floorPlan, spaceVision))
  }, [state.currentStepId, floorPlan, spaceVision, profile.floorPlan])

  // The room step seeds its plan from the photo read (shape pre-selected); an
  // empty-room read pre-selects "Prazna prostorija". Without a read, nothing is
  // pre-selected and the homeowner picks a card.
  useEffect(() => {
    if (state.currentStepId !== 'room') return
    if (roomPlan || profile.existingRoom === 'empty') return
    if (spaceVision?.emptyRoom && profile.existingRoom === undefined) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      patchProfile({ existingRoom: 'empty' })
      return
    }
    const seeded = roomPlanFromVision(spaceVision)
    if (seeded) setRoomPlan(seeded)
  }, [state.currentStepId, roomPlan, spaceVision, profile.existingRoom])

  // Photos that were never read (Continue on the photo step is always open):
  // read them on entering the room step, with a loader — never seed silently.
  // Synchronises with an external system (the vision API) on step entry.
  useEffect(() => {
    if (state.currentStepId !== 'room' || readOnly) return
    if (spaceVision || isReadingRoom || roomReadFailed || realPhotos.length === 0) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void readRoom()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentStepId, spaceVision, isReadingRoom, roomReadFailed, realPhotos.length, readOnly])

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
              {/* Hidden in project mode: see the note on resetAll. */}
              <button
                type="button"
                hidden={Boolean(projectId)}
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
          projectId={projectId}
          hasExistingBrief={hasExistingBrief || sentInSession}
          beforeSubmit={async () => {
            await checkpoint.flush(snapshot)
          }}
          onSent={() => setSentInSession(true)}
          onOpenBuilder={
            readOnly
              ? undefined
              : () => {
                  setIsDone(false)
                  goTo('builder')
                }
          }
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
        hypothesis={builderHyp}
        layoutContract={layoutContract}
        unitEdits={(profile.unitEdits as UnitEdits | undefined) ?? unitEdits}
        savedState={builderSavedState}
        renderImageDataUrl={chosenRender?.imageDataUrl}
        anchorPhotoDataUrl={spacePhotos[0]}
        rerenderBlocked={!roomDone}
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
    latestMainRender?.imageDataUrl ??
    spacePhotos[0]
  const funnelBuilderState = profile.builderState as BuilderState | undefined
  const rightRailSteps: FlowStepId[] = [
    'confirm_look',
    'builder',
    'wishlist',
    'logistics',
    'contact',
  ]
  // Journeys saved before the scope step was cut may still carry a scope;
  // new ones never do, so the range is the whole kitchen.
  const liveScope = profile.scope
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

  const roomProps: RoomStepProps = {
    phase: roomPhase,
    photos: spacePhotos,
    vision: spaceVision,
    isReading: isReadingRoom,
    readFailed: roomReadFailed,
    onRetryRead: () => void readRoom(),
    onRelabel: (photoIndex, shows) => {
      if (spaceVision) handleSpaceVisionChange(relabelPhotoView(spaceVision, photoIndex, shows), { keepIfSameWalls: true })
    },
    plan: roomPlan,
    onPlanChange: setRoomPlan,
    hasPhotos: roomHasPhotos,
    onChooseShape: () => setRoomPhase('shape'),
    existingRoom: profile.existingRoom,
    onExistingRoomChange: (existingRoom) => patchProfile({ existingRoom }),
    layoutIntent: profile.layoutIntent,
    onLayoutIntentChange: (layoutIntent) => patchProfile({ layoutIntent }),
    onSaveLater: saveRoomForLater,
  }
  // The render's gate: the room step was completed (every counter wall typed).
  const roomMeasuredNow = roomStepDone(profile)

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
              {/* Hidden in project mode: see the note on resetAll. */}
              <button
                type="button"
                hidden={Boolean(projectId)}
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
          {projectId && makerName ? (
            <p className="mt-5 text-[10px] leading-relaxed text-muted-foreground">
              {tDynamic('kitchen.makerSees', locale).replace('{maker}', makerName)}
            </p>
          ) : null}
        </>
      }
    >
          {resumeBanner}
          <AnimatePresence mode="wait">
            <motion.section
              key={state.currentStepId === 'room' ? `room:${roomPhase}` : state.currentStepId}
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
                  error={hypothesisError && tDynamic(hypothesisError, locale)}
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
                onSpaceVisionChange={handleSpaceVisionChange}
                room={roomProps}
                roomMeasured={roomMeasuredNow}
                onMeasureRoom={() => {
                  setRoomPhase('measure')
                  goTo('room')
                }}
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
                siteAccess={siteAccess}
                onSiteAccessChange={setSiteAccess}
                contactDraft={contactDraft}
                onContactDraftChange={setContactDraft}
                customerEmail={customerEmail}
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
                unitEdits={unitEdits}
                onUnitEditsChange={setUnitEdits}
                anchorRenderUrl={funnelRenderSrc}
              />
              )}

              {translateError && (
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-2.5 text-xs text-destructive">
                  <span>{tDynamic(translateError, locale)}</span>
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
                isBusy={isTranslating || isFinalising || isReadingRoom}
                onBack={goBack}
                onContinue={() => commitForStep(state.currentStepId)}
                profile={profile}
                hasInspirationInput={
                  inspirationStyles.length > 0 || inspirationRefs.length > 0
                }
                hasContactDraft={
                  Boolean(contactDraft.name.trim() && (customerEmail || contactDraft.contactValue.trim()))
                }
                hasFloorPlan={Boolean(floorPlan)}
                hasSpacePhotos={spacePhotos.length > 0}
                roomReady={roomStepReady({
                  phase: roomPhase,
                  plan: roomPlan,
                  existingRoom: profile.existingRoom,
                  layoutIntent: profile.layoutIntent,
                })}
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
      case 'room':
        if (roomPhase === 'shape') {
          setRoomPhase('measure')
          window.scrollTo({ top: 0 })
        } else {
          commitRoom()
        }
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
  /** The room step (IMP-31): its own props, built by the intake. */
  room: RoomStepProps
  /** Every wall the kitchen stands on has a typed length — the render's gate. */
  roomMeasured: boolean
  onMeasureRoom: () => void
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
  siteAccess: string | null
  onSiteAccessChange: (s: string | null) => void
  contactDraft: ContactValue
  onContactDraftChange: (c: ContactValue) => void
  /** Signed-in customer's account email — the contact step shows it instead of asking. */
  customerEmail: string | null
  mustHavesText: string
  onMustHavesTextChange: (t: string) => void
  niceToHavesText: string
  onNiceToHavesTextChange: (t: string) => void
  dealBreakersText: string
  onDealBreakersTextChange: (t: string) => void
  onSpacePhotosSkip: () => void
  onConceptRenderSkip: () => void
  /** Per-row unit edits from the contract card + their setter. */
  unitEdits: UnitEdits | null
  onUnitEditsChange: (e: UnitEdits) => void
  /** Chosen render (preferred) or anchor photo — editor background at confirm_look. */
  anchorRenderUrl?: string
}

function StepBody(props: StepBodyProps) {
  const {
    stepId,
    room,
    roomMeasured,
    onMeasureRoom,
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
    siteAccess,
    onSiteAccessChange,
    contactDraft,
    onContactDraftChange,
    customerEmail,
    mustHavesText,
    onMustHavesTextChange,
    niceToHavesText,
    onNiceToHavesTextChange,
    dealBreakersText,
    onDealBreakersTextChange,
    onSpacePhotosSkip,
    onConceptRenderSkip,
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

    case 'room':
      return (
        <StepFrame
          eyebrow={stepEyebrow('room')}
          title={t('funnel.room.title')}
          subtitle={t('funnel.room.subtitle')}
        >
          <RoomStep {...room} />
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
            roomMeasured={roomMeasured}
            onMeasureRoom={onMeasureRoom}
            room={roomConstraintsFor({
              plan: floorPlan ?? profile.floorPlan,
              existing: profile.existingFloorPlan,
              intent: profile.layoutIntent,
              existingRoom: profile.existingRoom,
            })}
            photoViews={spaceVision?.photoViews}
          />
        </StepFrame>
      )

    case 'confirm_look': {
      // The light confirm (IMP-32): the plan the room step committed, never
      // re-read from the render. The plan picture, the island and sink
      // toggles, and the tally with its uppers per wall; the full editor
      // waits under "Promijeni raspored". The footer Continue freezes the
      // plan and locks the contract. Decor (door/worktop/hardware) is NOT
      // here — it belongs to the builder.
      const reviewContract = floorPlan ? floorPlanToLayout(validate(floorPlan)) : null
      // An empty room has no intent (commitRoom drops it), whatever is left in the profile.
      const intent = profile.existingRoom === 'empty' ? undefined : profile.layoutIntent
      const walls = floorPlan ? counterWalls(floorPlan) : []
      const unmeasured = floorPlan ? missingWalls(floorPlan) : []
      return (
        <StepFrame
          eyebrow={stepEyebrow('confirm_look')}
          title={t('funnel.confirm_look.title')}
          subtitle={t('funnel.confirm_look.subtitle')}
        >
          {floorPlan && (
            <>
              <FloorPlanStatic
                plan={floorPlan}
                wallLetters={Object.fromEntries(walls.map((w) => [w, WALL_LETTER[w]]))}
                wallLettersDone={walls.filter((w) => !unmeasured.includes(w))}
                hideFooter
                className="mx-auto max-w-md"
              />
              <ConfirmToggles
                plan={floorPlan}
                existing={profile.existingFloorPlan}
                existingRoom={profile.existingRoom}
                intent={intent}
                sinkAnswer={profile.trades?.plumbing?.sinkPosition}
                onPlanChange={onContractPlanChange}
                onSinkAnswer={(sinkPosition) =>
                  // patchProfile replaces top-level keys, so the answer merges in.
                  onPatchProfile({
                    trades: { ...profile.trades, plumbing: { ...profile.trades?.plumbing, sinkPosition } },
                  })
                }
              />
            </>
          )}
          {/* The contract we'll price — appliances + the per-wall cabinet
              sequence, from the plan alone (no render read). The uppers per
              wall and the per-unit picks are edited here; lengths are the
              room step's. */}
          {reviewContract && (
            <LayoutConfirm
              contract={reviewContract}
              plan={floorPlan}
              onPlanChange={onContractPlanChange}
              edits={unitEdits}
              onEditsChange={onUnitEditsChange}
            />
          )}
          <EditPlanDisclosure
            label={t('confirm.editPlan')}
            defaultOpen={intent === 'change' || !floorPlan || !isRoomMeasured(floorPlan)}
          >
            <LayoutReview
              key={layoutEditNonce}
              floorPlan={floorPlan}
              onFloorPlanChange={onFloorPlanChange}
              anchorPhotoUrl={anchorRenderUrl}
              isLoading={false}
            />
          </EditPlanDisclosure>
        </StepFrame>
      )
    }

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
                bands={TIMELINE_BANDS.map((value) => ({
                  value,
                  label: tDynamic(`option.timeline.${value}`),
                  caption: tDynamic(`option.timeline.${value}.caption`),
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
                {SITE_ACCESS_OPTIONS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() =>
                      onSiteAccessChange(siteAccess === value ? null : value)
                    }
                    className={cn(
                      'rounded-full border px-3.5 py-2 text-[13px] font-medium transition-all',
                      siteAccess === value
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card hover:border-primary/40'
                    )}
                  >
                    {tDynamic(`option.siteAccess.${value}`)}
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
          <ContactForm value={contactDraft} onChange={onContactDraftChange} accountEmail={customerEmail} />
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
  hasFloorPlan,
  hasSpacePhotos,
  roomReady,
}: {
  stepId: FlowStepId
  canGoBack: boolean
  isBusy: boolean
  onBack: () => void
  onContinue: () => void
  profile: LeadProfile
  hasInspirationInput: boolean
  hasContactDraft: boolean
  hasFloorPlan: boolean
  hasSpacePhotos: boolean
  /** The room step's current screen can move on (a shape + intent; every wall typed). */
  roomReady: boolean
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
      case 'room':
        // No "use the estimate": the measure screen moves on only when every
        // wall the kitchen stands on has a typed length (IMP-31).
        return roomReady
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

/**
 * The wrap-up's TL;DR when /api/summarize-brief fails. Same sources as the
 * wrap-up rows: translated option labels, and the builder picks rather than
 * the inspiration-photo guesses (see lib/builder/pick-labels).
 */
function buildFallbackSummary(profile: LeadProfile, locale: Locale): string[] {
  const fill = (key: string, v: string) => tDynamic(key, locale).replace('{v}', v)
  const label = (key: string, raw: string) => {
    const text = tDynamic(key, locale)
    return text === key ? raw.replace(/_/g, ' ') : text
  }
  const lines: string[] = []
  if (profile.projectType) {
    lines.push(fill('fallback.projectType', label(`option.projectType.${profile.projectType}`, profile.projectType)))
  }
  if (profile.timeline) {
    lines.push(fill('fallback.timeline', label(`option.timeline.${profile.timeline}`, profile.timeline)))
  }
  if (profile.stylePreferences?.length) {
    const styles = profile.stylePreferences.map((s) => label(`style.${s}`, s)).join(', ')
    lines.push(fill('fallback.style', styles))
  }
  const picks = builderPickLabels(profile.builderState, locale)
  if (picks?.doors) lines.push(fill('fallback.door', picks.doors))
  if (picks?.worktop) lines.push(fill('fallback.worktop', picks.worktop))
  if (picks?.backsplash) lines.push(fill('fallback.backsplash', picks.backsplash))
  while (lines.length < 3) lines.push(tDynamic('fallback.more', locale))
  return lines.slice(0, 6)
}
