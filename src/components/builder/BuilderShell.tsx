'use client'

import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LocaleProvider, useTranslations, tDynamic, type Locale, DEFAULT_LOCALE } from '@/lib/i18n'
import {
  BUILDER_GROUPS,
  nextBuilderGroup,
  prevBuilderGroup,
  type BuilderGroupId,
  type BuilderState,
} from '@/lib/builder/inventory'
import { hydrateFromHypothesis, useBuilderState } from '@/lib/builder/state'
import type { BuilderHypothesis } from '@/lib/builder/hypothesis'
import type { LayoutContract } from '@/lib/contract/layout-contract'
import { LiveBOMPanel } from './LiveBOMPanel'
import { RerenderPanel } from './RerenderPanel'
import { RenderCarousel } from './RenderCarousel'
import { FactsRecap } from './FactsRecap'
import { LayoutConfirm } from './LayoutConfirm'
import { JourneyNavRail } from '@/components/JourneyNavRail'
import { RenderAnchorCard } from '@/components/RenderAnchorCard'
import { AppShell } from '@/components/AppShell'
import type { LeadProfile } from '@/lib/types'
import { DoorsGroup } from './groups/DoorsGroup'
import { WorktopGroup } from './groups/WorktopGroup'
import { CabinetBoxesGroup } from './groups/CabinetBoxesGroup'
import { BacksplashGroup } from './groups/BacksplashGroup'
import { HardwareGroup } from './groups/HardwareGroup'
import { AppliancesGroup } from './groups/AppliancesGroup'
import { SinkTapsGroup } from './groups/SinkTapsGroup'
import { LightingGroup } from './groups/LightingGroup'
import { FinishingGroup } from './groups/FinishingGroup'

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
  /** The render the hypothesis was derived from, if any. Shown in the left preview pane. */
  renderImageDataUrl?: string
  /** Anchor photo (Phase-1 space upload) shown when no render is available. */
  anchorPhotoDataUrl?: string
  /**
   * Read-only summary line about the room — layout shape + dimensions captured
   * in Phase 1. Shown under the persistent render preview so the user always
   * has the room context, without re-asking.
   */
  layoutSummary?: string
  /** Locale override. Defaults to hr-HR. */
  locale?: Locale
  /**
   * Funnel profile, so the shared "Your brief" rail can show the capture
   * read-backs (Act 1) and the close steps (Act 3) while in the builder. Omitted
   * by the standalone /builder dev harness, which has no funnel context.
   */
  profile?: LeadProfile
  /** Callback fired when the user finishes the builder. */
  onComplete?: (state: BuilderState) => void
}

export function BuilderShell({
  hypothesis,
  layoutContract,
  renderImageDataUrl,
  anchorPhotoDataUrl,
  layoutSummary,
  locale = DEFAULT_LOCALE,
  profile,
  onComplete,
}: BuilderShellProps) {
  const initial = useMemo(
    () => hydrateFromHypothesis(hypothesis, { layoutContract }),
    [hypothesis, layoutContract]
  )
  const [state, dispatch] = useBuilderState(initial)
  // Builder now opens on Cabinet Boxes — Layout/dimensions are owned by Phase 1.
  const [currentId, setCurrentId] = useState<BuilderGroupId>('cabinetBoxes')

  return (
    <LocaleProvider locale={locale}>
      {!state.layoutConfirmed ? (
        // "What we counted" — the close of capture. A calm, full-width screen
        // confirming the frozen contract BEFORE any builder chrome appears.
        <ConfirmScreen
          contract={layoutContract}
          state={state}
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
          renderImageDataUrl={renderImageDataUrl}
          anchorPhotoDataUrl={anchorPhotoDataUrl}
          layoutSummary={layoutSummary}
          profile={profile}
          onComplete={onComplete}
        />
      )}
    </LocaleProvider>
  )
}

/** The end-of-capture confirmation — its own screen, no builder chrome. */
function ConfirmScreen({
  contract,
  state,
  previewSrc,
  onConfirm,
}: {
  contract: LayoutContract
  state: BuilderState
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
        <LayoutConfirm contract={contract} state={state} onConfirm={onConfirm} />
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
  renderImageDataUrl,
  anchorPhotoDataUrl,
  layoutSummary,
  profile,
  onComplete,
}: {
  state: BuilderState
  dispatch: React.Dispatch<Parameters<ReturnType<typeof useBuilderState>[1]>[0]>
  layoutContract: LayoutContract
  currentId: BuilderGroupId
  onCurrentChange: (id: BuilderGroupId) => void
  hypothesis: BuilderHypothesis | null
  renderImageDataUrl?: string
  anchorPhotoDataUrl?: string
  layoutSummary?: string
  profile?: LeadProfile
  onComplete?: (state: BuilderState) => void
}) {
  const { locale } = useTranslations()
  // The big preview always reads from `activeRenderId`: null = Phase-1
  // Original (renderImageDataUrl), otherwise the matching entry in rerenders[].
  // The Original is structurally protected — it lives outside rerenders[] so
  // the cap can't evict it.
  const originalSrc = renderImageDataUrl ?? anchorPhotoDataUrl
  const activeRerender = state.activeRenderId
    ? state.rerenders?.find((r) => r.id === state.activeRenderId)
    : undefined
  const previewSrc = activeRerender?.imageDataUrl ?? originalSrc ?? null

  function goNext() {
    const n = nextBuilderGroup(currentId)
    if (n) onCurrentChange(n)
    else onComplete?.(state)
  }
  function goBack() {
    const p = prevBuilderGroup(currentId)
    if (p) onCurrentChange(p)
  }

  const currentOrder = BUILDER_GROUPS.find((g) => g.id === currentId)?.order ?? 0
  const progressPercent = Math.round((currentOrder / BUILDER_GROUPS.length) * 100)

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
      locale={locale}
    />
  )

  // Right rail: live price range first (always visible), then render anchor.
  const rightRail = (
    <div className="flex flex-col gap-5">
      <LiveBOMPanel state={state} />
      {previewSrc && <RenderAnchorCard src={previewSrc} summary={layoutSummary} locale={locale} />}

      <RenderCarousel
        state={state}
        originalImageDataUrl={renderImageDataUrl}
        anchorPhotoDataUrl={anchorPhotoDataUrl}
        onSetActive={(id) => dispatch({ type: 'set_active_render', id })}
      />

      <RerenderPanel
        state={state}
        anchorPhotoDataUrl={anchorPhotoDataUrl}
        currentRenderDataUrl={previewSrc ?? undefined}
        onRendered={(imageDataUrl, trigger) => dispatch({ type: 'push_rerender', imageDataUrl, trigger })}
      />
    </div>
  )

  return (
      <AppShell progressPercent={progressPercent} nav={nav} rightRail={rightRail}>
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

              {currentId === 'cabinetBoxes' && (
                <>
                  <FactsRecap hypothesis={hypothesis} />
                  <CabinetBoxesGroup
                    state={state}
                    hypothesis={hypothesis}
                    layoutContract={layoutContract}
                    onPatch={(patch) => dispatch({ type: 'patch_cabinetBoxes', patch })}
                  />
                </>
              )}
              {currentId === 'doors' && (
                <DoorsGroup
                  state={state}
                  onPatch={(patch) => dispatch({ type: 'patch_doors', patch })}
                />
              )}
              {currentId === 'worktop' && (
                <WorktopGroup
                  state={state}
                  onPatch={(patch) => dispatch({ type: 'patch_worktop', patch })}
                />
              )}
              {currentId === 'backsplash' && (
                <BacksplashGroup
                  state={state}
                  onPatch={(patch) => dispatch({ type: 'patch_backsplash', patch })}
                />
              )}
              {currentId === 'hardware' && (
                <HardwareGroup
                  state={state}
                  onPatch={(patch) => dispatch({ type: 'patch_hardware', patch })}
                />
              )}
              {currentId === 'appliances' && (
                <AppliancesGroup
                  state={state}
                  layoutContract={layoutContract}
                  onPatch={(patch) => dispatch({ type: 'patch_appliances', patch })}
                />
              )}
              {currentId === 'sinkTaps' && (
                <SinkTapsGroup
                  state={state}
                  onPatch={(patch) => dispatch({ type: 'patch_sinkTaps', patch })}
                />
              )}
              {currentId === 'lighting' && (
                <LightingGroup
                  state={state}
                  onPatch={(patch) => dispatch({ type: 'patch_lighting', patch })}
                />
              )}
              {currentId === 'finishing' && (
                <FinishingGroup
                  state={state}
                  onPatch={(patch) => dispatch({ type: 'patch_finishing', patch })}
                />
              )}

              <FooterNav currentId={currentId} onBack={goBack} onNext={goNext} />
            </motion.section>
          </AnimatePresence>
      </AppShell>
  )
}

function FooterNav({
  currentId,
  onBack,
  onNext,
}: {
  currentId: BuilderGroupId
  onBack: () => void
  onNext: () => void
}) {
  const { t } = useTranslations()
  const canBack = prevBuilderGroup(currentId) !== null
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
      <button
        type="button"
        onClick={onNext}
        className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-5 py-2 text-[13px] font-semibold text-background shadow-sm transition-all hover:brightness-110"
      >
        {t('builder.shell.continue')}
        <ArrowRight className="size-3.5 stroke-[2]" aria-hidden />
      </button>
    </div>
  )
}
