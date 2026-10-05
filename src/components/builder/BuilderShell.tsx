'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslations, tDynamic } from '@/lib/i18n'
import {
  BUILDER_GROUPS,
  nextBuilderGroup,
  prevBuilderGroup,
  type BuilderScreenId,
  type BuilderState,
} from '@/lib/builder/inventory'
import {
  confirmGroupMetas,
  hydrateFromHypothesis,
  relockBuilderState,
  useBuilderState,
} from '@/lib/builder/state'
import {
  BUILDER_AUTOSAVE_MS,
  builderSaveKey,
  createSaveGate,
  resumeBuilderGroup,
  visibleRerenders,
} from '@/lib/builder/autosave'
import { useDebouncedCallback } from '@/lib/use-debounced-callback'
import type { UnitEdits } from '@/lib/builder/unit-assembly'
import type { BuilderHypothesis } from '@/lib/builder/hypothesis'
import type { LayoutContract } from '@/lib/contract/layout-contract'
import { LiveBOMPanel } from './LiveBOMPanel'
import { RerenderPanel } from './RerenderPanel'
import { RenderCarousel } from './RenderCarousel'
import { LayoutConfirm } from './LayoutConfirm'
import { JourneyNavRail, journeyPillLabel, type RailVoice } from '@/components/JourneyNavRail'
import { RenderAnchorCard } from '@/components/RenderAnchorCard'
import { MobileRangeDock } from './MobileRangeDock'
import { AppShell } from '@/components/AppShell'
import type { LeadProfile } from '@/lib/types'
import { GROUP_MODULES } from './groups/registry'

export interface BuilderShellProps {
  /**
   * AI hypothesis from /api/builder-hypothesis. Pass null to start from
   * defaults (e.g. user skipped the render).
   */
  hypothesis: BuilderHypothesis | null
  /**
   * Layout contract derived from the frozen Part-1 FloorPlan — the COMPLETE,
   * authoritative source for the builder's layout (runs, shape, island, ceiling,
   * hasWall/hasTall, corners). Required: the builder never guesses layout.
   * See context/layout-contract.md.
   */
  layoutContract: LayoutContract
  /**
   * The homeowner's per-row cabinet-unit edits from the Part-1 contract card
   * (see UnitEdits in lib/builder/unit-assembly). Replayed through the one
   * assembler at hydration so the seed equals the confirmed tally.
   */
  unitEdits?: UnitEdits | null
  /** The render the hypothesis was derived from, if any. Shown in the left preview pane. */
  renderImageDataUrl?: string
  /** Anchor photo (Phase-1 space upload) shown when no render is available. */
  anchorPhotoDataUrl?: string
  /** No paid re-render: the room was never measured (a journey saved before IMP-31). */
  rerenderBlocked?: boolean
  /**
   * Read-only summary line about the room — layout shape + dimensions captured
   * in Phase 1. Shown under the persistent render preview so the user always
   * has the room context, without re-asking.
   */
  layoutSummary?: string
  /**
   * Funnel profile, so the shared "Your brief" rail can show the capture
   * read-backs (Act 1) and the close steps (Act 3) while in the builder. Omitted
   * by the standalone /builder dev harness, which has no funnel context.
   */
  profile?: LeadProfile
  /**
   * The maker's display name, for the range line ("a range {maker} confirms").
   * Omitted by the dev harness and the anonymous funnel: "your maker" then.
   */
  makerName?: string | null
  /**
   * Whose words the journey rail and its mobile pill use: 'maker' when the
   * maker looks in at the customer's kitchen. Only the rail — the rest of the
   * builder still speaks to the homeowner.
   */
  railVoice?: RailVoice
  /**
   * True when the contract was already confirmed at the end of Part 1 (the
   * capture "confirm everything" step). The builder then skips its own confirm
   * gate. The dev harness omits this, so it still shows the gate.
   */
  layoutPreconfirmed?: boolean
  /**
   * A previously completed/abandoned build to resume (from
   * `profile.builderState`). Takes precedence over hypothesis hydration so
   * re-entering the builder keeps every pick instead of starting over.
   */
  savedState?: BuilderState
  /**
   * The group to open at — where a saved build was left (IMP-06). Read once,
   * on mount; anything that is not a live builder screen opens the first group,
   * and so does a build that is not saved yet (no `savedState`): a new build
   * is walked from the first group, never opened mid-walk on defaults the
   * homeowner has not seen (IMP-07: a review fix or rail click before a build).
   */
  initialGroupId?: BuilderScreenId
  /**
   * Autosave (IMP-06): the live build and the group, debounced
   * (BUILDER_AUTOSAVE_MS), on every real homeowner change — never for the
   * state the shell mounted with. `urgent` is set when the tab is being
   * hidden or left, or the shell unmounts, inside the window: the caller
   * should then write through instead of waiting for its own debounced save —
   * synchronously, for anything that must survive a reload or a closed tab
   * (an async write started then is lost; see lib/page-hide.ts).
   * Omitted by the maker's read-only view and the /builder harness, which
   * must never write to a project.
   */
  onStateChange?: (state: BuilderState, groupId: BuilderScreenId, info: { urgent: boolean }) => void
  /** Callback fired when the user finishes the builder (with the group it finished on). */
  onComplete?: (state: BuilderState, groupId: BuilderScreenId) => void
  /**
   * Escape hatch: persist the LIVE state and jump back to Part 1's
   * confirm_look step so the homeowner can change the locked layout. On
   * re-lock the units re-derive while every other pick survives.
   */
  onEditLayout?: (state: BuilderState, groupId: BuilderScreenId) => void
  /**
   * Editing from the review (IMP-07): back to the review with the live build
   * and the group it was left on, without walking the remaining groups.
   * Absent on the first walk, for the maker looking in and in the harness —
   * and not offered until there is a build to go back with (`savedState`): a
   * build started from the review is walked from its first group, and offers
   * the way back once the homeowner has made it theirs (its first save).
   */
  onBackToReview?: (state: BuilderState, groupId: BuilderScreenId) => void
  /**
   * The review is being built from this build (IMP-07: an AI summary call
   * after "Natrag na pregled" or the last Continue). The build holds still —
   * the screen's picks, the re-render and the footer are disabled and the
   * footer says it is working — so the review is of the build on screen, not
   * of one a tap made while it loaded.
   */
  busy?: boolean
  /**
   * The review has been reached (IMP-07): the rail shows every step of the
   * journey done, this group current, and the progress bar stays full —
   * a finished brief being edited never looks unfinished. Funnel steps are
   * reached from here through "Natrag na pregled". Not for a build this
   * mount starts (no `savedState`): the review never covered it, so its
   * groups are walked as on the first walk — to do, no read-backs of
   * defaults nobody chose, the bar at the group it is on.
   */
  reviewed?: boolean
}

export function BuilderShell({
  hypothesis,
  layoutContract,
  unitEdits,
  renderImageDataUrl,
  anchorPhotoDataUrl,
  rerenderBlocked = false,
  layoutSummary,
  profile,
  makerName,
  railVoice = 'homeowner',
  layoutPreconfirmed,
  savedState,
  initialGroupId,
  onStateChange,
  onComplete,
  onEditLayout,
  onBackToReview,
  busy = false,
  reviewed = false,
}: BuilderShellProps) {
  // Mount-only, like the reducer that consumes it: the intake rebuilds the
  // contract on every render (and now re-renders on every autosave), so a memo
  // would relock and re-assemble units each time for a value nobody reads.
  // A different saved state means a remount — the escape-hatch return, the
  // harness's `key` — and that relocks.
  const [initial] = useState(() => {
    if (savedState) {
      // Deterministic + idempotent, so every resume re-locks against the
      // CURRENT contract: the escape-hatch return path re-derives units while
      // every pick survives, and stale pre-assembler unit lists self-heal.
      return relockBuilderState(savedState, { layoutContract, hypothesis, unitEdits })
    }
    const s = hydrateFromHypothesis(hypothesis, { layoutContract, unitEdits })
    if (layoutPreconfirmed) s.layoutConfirmed = true
    return s
  })
  const [state, dispatch] = useBuilderState(initial)
  // A build started on this mount (a review without a range, "Sastavi
  // kuhinju"): its first save makes `savedState` defined, but the review it
  // is walked from still covers none of it (`reviewed`).
  const [newBuild] = useState(() => !savedState)
  // Opens where a saved build was left; Cabinet Boxes otherwise — Layout and
  // dimensions are owned by Phase 1.
  const [currentId, setCurrentId] = useState<BuilderScreenId>(() =>
    resumeBuilderGroup(savedState ? initialGroupId : undefined)
  )

  // ── Autosave (IMP-06). Every builder action is a homeowner action (no group
  // dispatches from an effect), so "the state changed" is "they changed
  // something" — except on mount, which the gate swallows: the mount value is
  // what is stored (or its relock), and saving it would flag a sent brief as
  // changed. The content key ignores the reducer's timestamp, so a re-tap of
  // the same chip writes nothing either.
  const autosave = useDebouncedCallback(
    (cause, s: BuilderState, g: BuilderScreenId) => onStateChange?.(s, g, { urgent: cause !== 'timer' }),
    BUILDER_AUTOSAVE_MS,
    { flushOnUnmount: true, flushOnPageHide: true }
  )
  const [gate] = useState(createSaveGate)
  const autosaving = Boolean(onStateChange)
  useEffect(() => {
    if (!autosaving) return
    if (gate(builderSaveKey(state, currentId))) autosave.run(state, currentId)
  }, [state, currentId, autosaving, gate, autosave])

  // Handing the build off cancels the pending save first: the builder unmounts
  // right after, and an unmount flush of the pre-Continue state would land on
  // top of the confirmed one the callback just stored.
  const complete = onComplete
    ? (s: BuilderState) => {
        autosave.cancel()
        onComplete(s, currentId)
      }
    : undefined
  const editLayout = onEditLayout
    ? (s: BuilderState) => {
        autosave.cancel()
        onEditLayout(s, currentId)
      }
    : undefined
  const backToReview = onBackToReview && savedState
    ? (s: BuilderState) => {
        autosave.cancel()
        onBackToReview(s, currentId)
      }
    : undefined

  // Locale comes from the root LocaleProvider (and the language switcher) — the
  // builder no longer forces its own; it inherits whatever the homeowner chose.
  return !state.layoutConfirmed ? (
    // "What we counted" — the close of capture. A calm, full-width screen
    // confirming the frozen contract BEFORE any builder chrome appears.
    <ConfirmScreen
      contract={layoutContract}
      hypothesis={hypothesis}
      previewSrc={renderImageDataUrl ?? anchorPhotoDataUrl}
      onConfirm={() => dispatch({ type: 'confirm_layout' })}
    />
  ) : (
    <Shell
      state={state}
      dispatch={dispatch}
      layoutContract={layoutContract}
      currentId={currentId}
      onCurrentChange={setCurrentId}
      hypothesis={hypothesis}
      unitEdits={unitEdits}
      renderImageDataUrl={renderImageDataUrl}
      anchorPhotoDataUrl={anchorPhotoDataUrl}
      rerenderBlocked={rerenderBlocked}
      layoutSummary={layoutSummary}
      profile={profile}
      makerName={makerName}
      railVoice={railVoice}
      onComplete={complete}
      onEditLayout={editLayout}
      onBackToReview={backToReview}
      busy={busy}
      reviewed={reviewed && !newBuild}
    />
  )
}

/** The end-of-capture confirmation — its own screen, no builder chrome. */
function ConfirmScreen({
  contract,
  hypothesis,
  previewSrc,
  onConfirm,
}: {
  contract: LayoutContract
  hypothesis: BuilderHypothesis | null
  previewSrc?: string
  onConfirm: () => void
}) {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <div className="mx-auto w-full max-w-2xl px-6 py-12 lg:py-16">
        {previewSrc && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewSrc}
            alt=""
            className="mb-6 aspect-[4/3] w-full rounded-2xl border border-border object-cover shadow-sm"
          />
        )}
        <LayoutConfirm contract={contract} hypothesis={hypothesis} onConfirm={onConfirm} />
      </div>
    </div>
  )
}

function Shell({
  state,
  dispatch,
  layoutContract,
  currentId,
  onCurrentChange,
  hypothesis,
  unitEdits,
  renderImageDataUrl,
  anchorPhotoDataUrl,
  rerenderBlocked,
  layoutSummary,
  profile,
  makerName,
  railVoice,
  onComplete,
  onEditLayout,
  onBackToReview,
  busy,
  reviewed,
}: {
  state: BuilderState
  dispatch: React.Dispatch<Parameters<ReturnType<typeof useBuilderState>[1]>[0]>
  layoutContract: LayoutContract
  currentId: BuilderScreenId
  onCurrentChange: (id: BuilderScreenId) => void
  hypothesis: BuilderHypothesis | null
  unitEdits?: UnitEdits | null
  renderImageDataUrl?: string
  anchorPhotoDataUrl?: string
  rerenderBlocked: boolean
  layoutSummary?: string
  profile?: LeadProfile
  makerName?: string | null
  railVoice: RailVoice
  onComplete?: (state: BuilderState) => void
  onEditLayout?: (state: BuilderState) => void
  onBackToReview?: (state: BuilderState) => void
  busy: boolean
  reviewed: boolean
}) {
  const { locale } = useTranslations()
  // The big preview always reads from `activeRenderId`: null = Phase-1
  // Original (renderImageDataUrl), otherwise the matching entry in rerenders[].
  // The Original is structurally protected — it lives outside rerenders[] so
  // the cap can't evict it. A re-render restored without its pixels (the
  // server copy is image-free) is not shown, so the preview falls back to it.
  const originalSrc = renderImageDataUrl ?? anchorPhotoDataUrl
  const activeRerender = state.activeRenderId
    ? visibleRerenders(state).find((r) => r.id === state.activeRenderId)
    : undefined
  const previewSrc = activeRerender?.imageDataUrl ?? originalSrc ?? null

  function goNext() {
    // Continuing past a screen confirms its prefilled values — the estimate
    // band narrows as the homeowner walks the builder (see confirmGroupMetas).
    const confirmed = confirmGroupMetas(state, currentId)
    if (confirmed !== state) dispatch({ type: 'replace', state: confirmed })
    const n = nextBuilderGroup(currentId)
    if (n) onCurrentChange(n)
    else onComplete?.(confirmed)
  }
  function goBack() {
    const p = prevBuilderGroup(currentId)
    if (p) onCurrentChange(p)
  }

  const currentOrder = BUILDER_GROUPS.find((g) => g.id === currentId)?.order ?? 0
  const progressPercent = reviewed ? 100 : Math.round((currentOrder / BUILDER_GROUPS.length) * 100)
  const GroupBody = GROUP_MODULES[currentId].Body

  // Left nav: the ONE "Your brief" act/step rail, spanning the whole journey.
  // While in the builder we feed it the live builder position; the funnel
  // profile (if present) keeps Act 1 read-backs and Act 3 steps visible.
  const nav = (
    <JourneyNavRail
      funnelStepId="builder"
      profile={profile ?? {}}
      builderState={state}
      builderGroupId={currentId}
      onBuilderNavigate={onCurrentChange}
      voice={railVoice}
      reviewed={reviewed}
      locale={locale}
    />
  )

  // Right rail: live price range first, then the re-render offer, then the
  // render it would replace and its carousel. The offer sits high so it is on
  // screen without scrolling the rail at laptop heights (1280×800): it only
  // appears after a visible change, and it spends one of the five renders. The
  // carousel and the re-render change the build, so they hold still with the
  // screen while the review is built (a disabled fieldset disables every
  // control inside it). `empty:hidden`: no offer, no box, no double gap.
  const rightRail = (
    <div className="flex flex-col gap-5">
      <LiveBOMPanel state={state} makerName={makerName} />

      <fieldset disabled={busy} className="min-w-0 empty:hidden">
        <RerenderPanel
          state={state}
          anchorPhotoDataUrl={anchorPhotoDataUrl}
          blocked={rerenderBlocked}
          currentRenderDataUrl={previewSrc ?? undefined}
          onRendered={(imageDataUrl, trigger) => dispatch({ type: 'push_rerender', imageDataUrl, trigger })}
        />
      </fieldset>

      {previewSrc && <RenderAnchorCard src={previewSrc} summary={layoutSummary} locale={locale} />}

      <fieldset disabled={busy} className="min-w-0 empty:hidden">
        <RenderCarousel
          state={state}
          originalImageDataUrl={renderImageDataUrl}
          anchorPhotoDataUrl={anchorPhotoDataUrl}
          onSetActive={(id) => dispatch({ type: 'set_active_render', id })}
        />
      </fieldset>
    </div>
  )

  return (
      <AppShell
        progressPercent={progressPercent}
        nav={nav}
        rightRail={rightRail}
        mobilePillLabel={journeyPillLabel({
          funnelStepId: 'builder',
          profile: profile ?? {},
          builderGroupId: currentId,
          voice: railVoice,
          reviewed,
          locale,
        })}
        mobileDock={<MobileRangeDock state={state} makerName={makerName} />}
      >
          <AnimatePresence mode="wait">
            <motion.section
              key={currentId}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-6"
            >
              <header>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">
                  {String(BUILDER_GROUPS.find((g) => g.id === currentId)?.order ?? 0).padStart(2, '0')}
                </p>
                <h2 className="mt-1 text-2xl font-semibold leading-tight text-foreground md:text-3xl">
                  {tDynamic(`builder.groups.${currentId}.label`, locale)}
                </h2>
                <p className="mt-1 max-w-prose text-[14px] text-muted-foreground">
                  {tDynamic(`builder.groups.${currentId}.why`, locale)}
                </p>
              </header>

              {/* The screen body comes from the registry — adding/removing a
                  builder screen never touches this shell. */}
              <fieldset disabled={busy} className="min-w-0" data-builder-busy={busy || undefined}>
                <GroupBody
                  state={state}
                  hypothesis={hypothesis}
                  layoutContract={layoutContract}
                  unitEdits={unitEdits}
                  dispatch={dispatch}
                  onEditLayout={onEditLayout ? () => onEditLayout(state) : undefined}
                />
              </fieldset>

              <FooterNav
                currentId={currentId}
                onBack={goBack}
                onNext={goNext}
                onBackToReview={onBackToReview ? () => onBackToReview(state) : undefined}
                busy={busy}
              />
            </motion.section>
          </AnimatePresence>
      </AppShell>
  )
}

function FooterNav({
  currentId,
  onBack,
  onNext,
  onBackToReview,
  busy,
}: {
  currentId: BuilderScreenId
  onBack: () => void
  onNext: () => void
  /** Editing from the review: back to it from any group (IMP-07). */
  onBackToReview?: () => void
  /** The review is being built: nothing moves, Continue says it is working. */
  busy: boolean
}) {
  const { t } = useTranslations()
  const canBack = prevBuilderGroup(currentId) !== null && !busy
  return (
    <div className="flex items-center justify-between gap-3 pt-4">
      <button
        type="button"
        onClick={onBack}
        disabled={!canBack}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-[13px] font-medium text-muted-foreground transition-all',
          !canBack && 'opacity-30',
          canBack && 'hover:text-foreground'
        )}
      >
        <ArrowLeft className="size-3.5 stroke-[2]" aria-hidden />
        {t('builder.shell.back')}
      </button>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {onBackToReview && (
          <button
            type="button"
            onClick={onBackToReview}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            {t('nav.backToReview')}
          </button>
        )}
        <button
          type="button"
          onClick={onNext}
          disabled={busy}
          aria-busy={busy || undefined}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-[13px] font-semibold transition-all',
            busy
              ? 'cursor-wait bg-muted text-muted-foreground'
              : 'bg-foreground text-background shadow-sm hover:brightness-110'
          )}
        >
          {busy ? (
            <>
              <span className="inline-block size-1.5 animate-pulse rounded-full bg-muted-foreground/80" aria-hidden />
              {t('nav.working')}
            </>
          ) : (
            <>
              {t('builder.shell.continue')}
              <ArrowRight className="size-3.5 stroke-[2]" aria-hidden />
            </>
          )}
        </button>
      </div>
    </div>
  )
}
