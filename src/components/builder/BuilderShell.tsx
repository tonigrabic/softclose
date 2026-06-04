'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, ArrowRight, Maximize2, X } from 'lucide-react'
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
        onComplete={onComplete}
      />
    </LocaleProvider>
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
  onComplete?: (state: BuilderState) => void
}) {
  const { t, locale } = useTranslations()
  // The big preview always reads from `activeRenderId`: null = Phase-1
  // Original (renderImageDataUrl), otherwise the matching entry in rerenders[].
  // The Original is structurally protected — it lives outside rerenders[] so
  // the cap can't evict it.
  const originalSrc = renderImageDataUrl ?? anchorPhotoDataUrl
  const activeRerender = state.activeRenderId
    ? state.rerenders?.find((r) => r.id === state.activeRenderId)
    : undefined
  const previewSrc = activeRerender?.imageDataUrl ?? originalSrc ?? null
  const [lightboxOpen, setLightboxOpen] = useState(false)

  // Close the lightbox on Escape.
  useEffect(() => {
    if (!lightboxOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxOpen])

  function goNext() {
    const n = nextBuilderGroup(currentId)
    if (n) onCurrentChange(n)
    else onComplete?.(state)
  }
  function goBack() {
    const p = prevBuilderGroup(currentId)
    if (p) onCurrentChange(p)
  }

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      {/* Mobile / narrow viewport: render preview pinned to the top so it's
          always visible even when the desktop sidebar is hidden. */}
      {previewSrc && (
        <div className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2">
            <button
              type="button"
              onClick={() => setLightboxOpen(true)}
              className="shrink-0"
              aria-label={t('builder.shell.preview.enlarge')}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewSrc}
                alt=""
                className="h-12 w-16 rounded-md object-cover ring-1 ring-border/60"
              />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold text-foreground">{t('builder.shell.title')}</p>
              {layoutSummary && (
                <p className="truncate text-[10.5px] text-muted-foreground">{layoutSummary}</p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto flex w-full max-w-[88rem] gap-6 px-6 py-8 lg:gap-8 lg:px-10 lg:py-10">
        {/* LEFT — sticky preview + stepper. Wider so the render is readable. */}
        <aside className="sticky top-6 hidden h-fit w-80 shrink-0 flex-col gap-5 xl:w-96 lg:flex">
          {/* Persistent render preview — large, sticky, with layout caption.
              This is the user's "anchor" — they should always see what they're
              detailing. Click to open in a full-screen lightbox. Layout is
              established in Phase 1 and surfaced here as a read-only caption. */}
          {previewSrc && (
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-md">
              <button
                type="button"
                onClick={() => setLightboxOpen(true)}
                className="group relative block w-full"
                aria-label={t('builder.shell.preview.enlarge')}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewSrc}
                  alt=""
                  className="aspect-[4/3] w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                />
                <span className="pointer-events-none absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-background/85 px-2 py-1 text-[10px] font-semibold text-foreground opacity-0 shadow-sm backdrop-blur transition-opacity group-hover:opacity-100">
                  <Maximize2 className="size-3 stroke-[2]" aria-hidden />
                  {t('builder.shell.preview.enlarge')}
                </span>
              </button>
              <div className="border-t border-border/60 bg-card/80 px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {t('builder.shell.title')}
                </p>
                {layoutSummary && (
                  <p className="mt-0.5 text-[12px] font-medium leading-snug text-foreground">{layoutSummary}</p>
                )}
              </div>
            </div>
          )}

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
            onRendered={(imageDataUrl, trigger) =>
              dispatch({ type: 'push_rerender', imageDataUrl, trigger })
            }
          />

          <ol className="flex flex-col gap-1">
            {BUILDER_GROUPS.map((g) => {
              const active = g.id === currentId
              return (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => onCurrentChange(g.id)}
                    className={cn(
                      'flex w-full items-baseline gap-2 rounded-xl px-3 py-2 text-left transition-colors',
                      active
                        ? 'bg-primary/10 text-foreground'
                        : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                    )}
                  >
                    <span className="w-5 shrink-0 text-[10px] font-mono text-muted-foreground/70">
                      {String(g.order).padStart(2, '0')}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">
                        {tDynamic(g.labelKey, locale)}
                      </p>
                      {active && (
                        <p className="text-[11px] leading-snug text-muted-foreground">
                          {tDynamic(g.whyKey, locale)}
                        </p>
                      )}
                    </div>
                  </button>
                </li>
              )
            })}
          </ol>
        </aside>

        {/* MIDDLE — current group body */}
        <main className="min-w-0 flex-1">
          <AnimatePresence mode="wait">
            {!state.layoutConfirmed ? (
              <motion.section
                key="layout-confirm"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              >
                <LayoutConfirm
                  contract={layoutContract}
                  state={state}
                  onConfirm={() => dispatch({ type: 'confirm_layout' })}
                />
              </motion.section>
            ) : (
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
            )}
          </AnimatePresence>
        </main>

        {/* RIGHT — live BOM */}
        <LiveBOMPanel state={state} />
      </div>

      {/* Click-to-enlarge lightbox over the render preview. */}
      <AnimatePresence>
        {lightboxOpen && previewSrc && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4 backdrop-blur-md sm:p-8"
            onClick={() => setLightboxOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label={t('builder.shell.preview.lightboxLabel')}
          >
            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              className="absolute right-4 top-4 inline-flex size-9 items-center justify-center rounded-full bg-card/90 text-foreground shadow-md transition-colors hover:bg-card"
              aria-label={t('builder.shell.preview.close')}
            >
              <X className="size-4 stroke-[2]" aria-hidden />
            </button>
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="flex max-h-full max-w-6xl flex-col gap-3"
              onClick={(e) => e.stopPropagation()}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewSrc}
                alt=""
                className="max-h-[80vh] w-auto rounded-2xl object-contain shadow-2xl"
              />
              {layoutSummary && (
                <p className="text-center text-[12px] text-muted-foreground">{layoutSummary}</p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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
