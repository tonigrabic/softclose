'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Download, ExternalLink, Sparkles, AlertCircle, Hammer } from 'lucide-react'
import type {
  ClientMessage,
  ConceptVisualRef,
  HandoffBundle,
  HandoffEstimate,
  LeadProfile,
  WallSide,
  WrapUpData,
} from '@/lib/types'
import type { BomLineItem } from '@/lib/builder/bom'
import { formatEUR, formatRange, groupEstimateLines, type EstimateGroupId } from '@/lib/builder/range'
import { RangeLine } from '@/components/range/RangeLine'
import {
  WALL_LETTER,
  counterWalls,
  hasPlan,
  homeownerSinkLine,
  isValidWallLength,
  planFromProfile,
  tradeMovesFromProfile,
} from '@/lib/floor-plan'
import { builderPickLabels } from '@/lib/builder/pick-labels'
import { useTranslations, type TranslationKey } from '@/lib/i18n'
import { FloorPlanStatic } from './FloorPlanStatic'
import { MakerDashboardPreview } from './MakerDashboardPreview'
import { ApiError, apiErrorKey, readJson } from '@/lib/api/client'
import { mintBriefId } from '@/lib/handoff/brief-id'
import { contactChannels } from '@/lib/contact'

interface WrapUpScreenProps {
  data: WrapUpData
  profile: LeadProfile
  explorationRefs: ConceptVisualRef[]
  transcript: ClientMessage[]
  /** Ties the brief to its project, and so to a maker. Without it the brief is
   *  ownerless and nobody — not even the maker who asked for it — can open it. */
  projectId?: string
  /** True when this project already has a brief with the maker. Submitting is
   *  then an explicit act, not something that happens by arriving here. */
  hasExistingBrief?: boolean
  /** Runs before the brief is sent — the intake flushes its pending save, so the
   *  brief is the project's last write and never arrives flagged as edited. */
  beforeSubmit?: () => Promise<void>
  /** Back to the builder, for a homeowner who skipped it and so has no range.
   *  Absent where nobody may edit (the maker looking in). */
  onOpenBuilder?: () => void
  /** Called once this screen has saved a brief, so the intake knows one went
   *  out in this visit and the next send is an explicit act, not a mount. */
  onSent?: () => void
  /** The maker's display name, for "a range {maker} confirms". Absent → "your maker". */
  makerName?: string | null
}

function humanize(v: string): string {
  return v.replace(/_/g, ' ')
}

function listSummary(items: { trade: string }[] | undefined): string | null {
  if (!items || items.length === 0) return null
  return items.map((i) => i.trade).join(' · ')
}

export function WrapUpScreen({
  data,
  profile,
  explorationRefs,
  transcript,
  projectId,
  hasExistingBrief = false,
  beforeSubmit,
  onOpenBuilder,
  onSent,
  makerName,
}: WrapUpScreenProps) {
  const { t, tDynamic: td, locale } = useTranslations()
  const contact = contactChannels(profile)
  const [bundle, setBundle] = useState<HandoffBundle | null>(null)
  const [bundleError, setBundleError] = useState<TranslationKey | null>(null)
  // Only "loading" when we are about to submit on mount; on a revisit there
  // is nothing in flight until the customer asks for it.
  const [isLoadingBundle, setIsLoadingBundle] = useState(!hasExistingBrief)
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState<TranslationKey | null>(null)
  const [showMakerView, setShowMakerView] = useState(false)

  const plan = planFromProfile(profile)
  const showPlan = hasPlan(profile) && plan !== null
  // Does the sink move (IMP-32)? Today's room vs the confirmed plan, the intent
  // and the confirm step's answer — in words, hidden when nobody knows.
  const tradeMoves = tradeMovesFromProfile(profile)
  const sinkLine = homeownerSinkLine(tradeMoves.sink, td)
  // The room step's letters on the plan picture, so "seli se na zid D" points
  // at a wall: the counter walls and wherever the sink and hob are drawn;
  // filled once measured, as on the room step.
  const letterWalls: WallSide[] = plan
    ? [...new Set([...counterWalls(plan), tradeMoves.sink.toWall, tradeMoves.hob.toWall])].filter(
        (w): w is WallSide => w !== null
      )
    : []
  const tradeRows = {
    cookerType: profile.trades?.electrical?.cookerType && humanize(profile.trades.electrical.cookerType),
    gas: profile.trades?.gas?.available && humanize(profile.trades.gas.available),
    ventPath: profile.trades?.ventilation?.desiredPath && humanize(profile.trades.ventilation.desiredPath),
  }
  const moodBoard = profile.moodBoardItems ?? []
  const chosenRender = profile.conceptRenders?.find((r) => r.id === profile.conceptRenderChosenId)
  const picks = builderPickLabels(profile.builderState, locale)

  /** Translate an option value via its `option.*` family, humanized fallback. */
  function optionLabel(family: string, value: string | null | undefined): string | null {
    if (!value) return null
    const key = `option.${family}.${value}`
    const label = td(key)
    return label === key ? humanize(value) : label
  }

  /** Style ids have their own style.* family (the inspiration tiles). */
  function styleLabel(value: string): string {
    const label = td(`style.${value}`)
    return label === `style.${value}` ? humanize(value) : label
  }
  const styles = profile.stylePreferences?.map(styleLabel).join(', ') || null

  // Wrap-up renders after the flow completes, so the bundle inputs are frozen —
  // loadBundle captures them once (deps []) and is reused for the manual retry.
  // Single-flight: the mount effect double-fires under React StrictMode (dev),
  // which persisted TWO briefs per submit. The ref makes a retry explicit.
  const inflight = useRef(false)
  // The id this send saves under. The submit minted it into the snapshot, so a
  // remount — or a retry after a lost response — repeats the SAME send and the
  // server hands back the brief it already made. Only the explicit re-submit
  // below mints a new one: that one is meant to be a new brief.
  const sendId = useRef<string | undefined>(data.briefId)
  const loadBundle = useCallback(async () => {
    if (inflight.current) return
    inflight.current = true
    setIsLoadingBundle(true)
    setBundleError(null)
    try {
      // A failed save must never stop the brief.
      await beforeSubmit?.().catch(() => {})
      const res = await fetch('/api/handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brief: profile,
          moodBoard,
          explorationRefs,
          transcript,
          locale,
          projectId,
          briefId: sendId.current,
        }),
      })
      const data = await readJson<HandoffBundle & { code?: string }>(res)
      if (!res.ok || data.error) {
        throw new ApiError(data.error ?? `Bundle build failed (${res.status})`, res.status, data.code)
      }
      setBundle(data)
      if (data.briefId) onSent?.()
    } catch (err) {
      console.warn('[handoff]', err)
      setBundleError(apiErrorKey(err, 'wrapup.error.bundle'))
    } finally {
      inflight.current = false
      setIsLoadingBundle(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // Submitting on mount is right the FIRST time — the homeowner has just
    // finished and the brief is the point of the whole journey.
    //
    // It is wrong on every visit after that. Once a project has a brief, simply
    // navigating back to this screen would insert another one and email the
    // maker again, every time. So a re-submit is an explicit act: the button
    // below. (The inflight ref only ever guarded StrictMode's double-fire
    // within one mount; it cannot help across visits.)
    if (hasExistingBrief) return
    void loadBundle()
  }, [loadBundle, hasExistingBrief])

  /** An explicit re-submit is a NEW brief, so it gets a new id. */
  function resubmit() {
    sendId.current = mintBriefId()
    void loadBundle()
  }

  async function downloadHandoff() {
    if (!bundle) return
    setIsExporting(true)
    setExportError(null)
    try {
      const blob = new Blob([JSON.stringify(bundle, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `kitchen-brief-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.warn('[export]', err)
      setExportError('wrapup.error.export')
    } finally {
      setIsExporting(false)
    }
  }

  if (showMakerView && bundle) {
    return <MakerDashboardPreview bundle={bundle} onBack={() => setShowMakerView(false)} />
  }

  const estimate = bundle?.estimate
  // The range is priced from the build alone. No build, no range — say how to
  // get one rather than showing a number made of nothing.
  const noBuild = !profile.builderState

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="flex flex-col gap-7 py-4"
    >
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-2xl text-primary-foreground">
          ✓
        </div>
        <h2 className="text-2xl font-semibold text-foreground">{t('wrapup.title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{data.thankYouMessage}</p>
        <p className="text-xs text-muted-foreground/70">{t('wrapup.review')}</p>
      </div>

      {/* Estimate — always a range, never a quote, and only ever from the
          homeowner's own build. */}
      <section className="rounded-2xl border border-border bg-card p-5 text-left shadow-sm">
        <div className="mb-2 flex items-baseline justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('wrapup.estimate.title')}
          </p>
          {estimate && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
              {t('wrapup.estimate.bomBadge')}
            </span>
          )}
        </div>
        {noBuild ? (
          <>
            <p className="text-sm text-foreground">{t('wrapup.estimate.noBuild')}</p>
            {onOpenBuilder && (
              <button
                type="button"
                onClick={onOpenBuilder}
                className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-border px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                <Hammer className="size-3.5 stroke-[1.75]" aria-hidden />
                {t('wrapup.estimate.openBuilder')}
              </button>
            )}
          </>
        ) : isLoadingBundle ? (
          <p className="text-sm text-muted-foreground">{t('wrapup.estimate.loading')}</p>
        ) : estimate ? (
          <WrapUpEstimate estimate={estimate} makerName={makerName} />
        ) : hasExistingBrief && !bundle ? (
          // Built, not sent yet: the maker's copy is older than this build.
          <p className="text-sm text-muted-foreground">{t('wrapup.estimate.afterResend')}</p>
        ) : (
          <p className="text-sm text-muted-foreground">{t('wrapup.estimate.unavailable')}</p>
        )}
      </section>

      {/* Re-submit, explicitly. The maker already has a brief for this kitchen;
          sending changes is a decision the customer makes, not a side effect of
          landing on this screen. */}
      {hasExistingBrief && !bundle && (
        <section className="rounded-2xl border border-border bg-card p-5 text-left shadow-sm">
          <p className="mb-1 text-sm font-medium text-foreground">{t('wrapup.resubmit.title')}</p>
          <p className="mb-3 text-xs leading-relaxed text-muted-foreground">{t('wrapup.resubmit.body')}</p>
          <button
            type="button"
            onClick={resubmit}
            disabled={isLoadingBundle}
            className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isLoadingBundle ? t('wrapup.resubmit.sending') : t('wrapup.resubmit.cta')}
          </button>
        </section>
      )}

      {/* What happens next — status visibility is a P0 (AGENTS.md rule 8).
          Honest about persistence: only claims "saved" when the server said so. */}
      {!isLoadingBundle && bundle && (
        <section className="rounded-2xl border border-border bg-card p-5 text-left shadow-sm">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('wrapup.next.title')}
          </p>
          {bundle.briefId ? (
            <ul className="space-y-1.5 text-sm text-foreground/85">
              <li>{t('wrapup.next.saved')}</li>
              {contact.length > 0 && (
                <li>{t('wrapup.next.contact').replace('{contact}', contact.join(` ${t('common.or')} `))}</li>
              )}
              <li className="font-mono text-[11px] text-muted-foreground">
                {t('wrapup.next.ref').replace('{id}', bundle.briefId.slice(0, 8))}
              </li>
            </ul>
          ) : (
            <p className="text-sm text-amber-800 dark:text-amber-200">{t('wrapup.next.unsaved')}</p>
          )}
        </section>
      )}

      {/* Chosen concept render */}
      {chosenRender && (
        <SectionWithFix
          title={t('wrapup.section.render')}
          badge={t('wrapup.section.renderBadge')}
          onFix={null}
        >
          <div className="overflow-hidden rounded-xl border border-border bg-background">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={chosenRender.imageDataUrl}
              alt={t('wrapup.section.render')}
              className="h-auto w-full"
            />
            <div className="border-t border-border/70 px-3 py-2 text-[11px] text-muted-foreground">
              <p className="flex items-center gap-1.5">
                <Sparkles className="size-3 stroke-[1.75]" aria-hidden />
                {t('wrapup.render.note')}
              </p>
              {chosenRender.nudges.length > 0 && (
                <p className="mt-1">
                  {t('wrapup.render.tweaks')} {chosenRender.nudges.join(' · ')}
                </p>
              )}
            </div>
          </div>
        </SectionWithFix>
      )}

      {/* Floor plan */}
      {showPlan && plan && (
        <SectionWithFix title={t('wrapup.section.space')} onFix={null}>
          <FloorPlanStatic
            plan={plan}
            mode="homeowner"
            wallLetters={Object.fromEntries(letterWalls.map((w) => [w, WALL_LETTER[w]]))}
            wallLettersDone={letterWalls.filter((w) => isValidWallLength(plan.room.sides[w].measuredLengthCm))}
          />
        </SectionWithFix>
      )}

      {/* Project basics. No budget row: the flow has no up-front budget any
          more — the live range above is the budget conversation. */}
      {(profile.projectType || profile.timeline) && (
        <BriefSection title={t('wrapup.section.basics')} onFix={null}>
          <SummaryRow label={t('wrapup.row.projectType')} value={optionLabel('projectType', profile.projectType)} />
          <SummaryRow label={t('wrapup.row.timeline')} value={optionLabel('timeline', profile.timeline)} />
        </BriefSection>
      )}

      {/* Scope */}
      {profile.scope && (
        <BriefSection title={t('wrapup.section.scope')} onFix={null}>
          <SummaryRow
            label={t('wrapup.row.scopeItems')}
            value={
              Object.entries(profile.scope)
                .filter(([, v]) => v === true)
                .map(([k]) => optionLabel('scope', k))
                .filter(Boolean)
                .join(', ') || null
            }
          />
        </BriefSection>
      )}

      {/* Style + materials — the tagged styles, then what the homeowner picked
          in the builder. Not profile.doorMaterial & co.: those are the
          inspiration-photo guesses from before the builder, and can contradict
          the build (see lib/builder/pick-labels). Fittings are the maker's
          standard spec, so there is no hardware row. */}
      {(styles || picks) && (
        <BriefSection title={t('wrapup.section.style')} onFix={null}>
          <SummaryRow label={t('wrapup.row.style')} value={styles} />
          <SummaryRow label={t('wrapup.row.door')} value={picks?.doors} />
          <SummaryRow label={t('wrapup.row.worktop')} value={picks?.worktop} />
          <SummaryRow label={t('wrapup.row.backsplash')} value={picks?.backsplash} />
        </BriefSection>
      )}

      {/* Trades — shown when any row has something to say. */}
      {(sinkLine || tradeRows.cookerType || tradeRows.gas || tradeRows.ventPath) && (
        <BriefSection title={t('wrapup.section.trades')} onFix={null}>
          <SummaryRow label={t('wrapup.row.sinkPosition')} value={sinkLine} />
          <SummaryRow label={t('wrapup.row.cookerType')} value={tradeRows.cookerType} />
          <SummaryRow label={t('wrapup.row.gas')} value={tradeRows.gas} />
          <SummaryRow label={t('wrapup.row.ventPath')} value={tradeRows.ventPath} />
        </BriefSection>
      )}

      {/* Lighting */}
      {profile.lighting && Object.keys(profile.lighting).length > 0 && (
        <BriefSection title={t('wrapup.section.lighting')} onFix={null}>
          <SummaryRow
            label={t('wrapup.row.lightLayers')}
            value={
              [
                profile.lighting.taskLayer && t('wrapup.light.task'),
                profile.lighting.ambientLayer && t('wrapup.light.ambient'),
                profile.lighting.accentLayer && t('wrapup.light.accent'),
              ]
                .filter(Boolean)
                .join(', ') || null
            }
          />
          <SummaryRow
            label={t('wrapup.row.smartControls')}
            value={
              profile.lighting.smartControls === undefined
                ? null
                : profile.lighting.smartControls
                  ? t('wrapup.yes')
                  : t('wrapup.no')
            }
          />
        </BriefSection>
      )}

      {/* Wishlist */}
      {(profile.mustHaves?.length || profile.niceToHaves?.length || profile.dealBreakers?.length) && (
        <BriefSection title={t('wrapup.section.wishlist')} onFix={null}>
          <SummaryRow label={t('wrapup.row.mustHaves')} value={listSummary(profile.mustHaves)} />
          <SummaryRow label={t('wrapup.row.niceToHaves')} value={listSummary(profile.niceToHaves)} />
          <SummaryRow label={t('wrapup.row.dealBreakers')} value={listSummary(profile.dealBreakers)} />
        </BriefSection>
      )}

      {/* Logistics */}
      {profile.logistics && Object.keys(profile.logistics).length > 0 && (
        <BriefSection title={t('wrapup.section.logistics')} onFix={null}>
          <SummaryRow
            label={t('wrapup.row.siteAccess')}
            value={optionLabel('siteAccess', profile.logistics.siteAccess)}
          />
          <SummaryRow
            label={t('wrapup.row.living')}
            value={optionLabel('living', profile.logistics.livingDuringBuild)}
          />
          <SummaryRow
            label={t('wrapup.row.phasing')}
            value={profile.logistics.phasing && humanize(profile.logistics.phasing)}
          />
          <SummaryRow
            label={t('wrapup.row.permits')}
            value={profile.logistics.permits && humanize(profile.logistics.permits)}
          />
        </BriefSection>
      )}

      {/* Decisions */}
      {profile.decisionConfidence && Object.keys(profile.decisionConfidence).length > 0 && (
        <BriefSection title={t('wrapup.section.confidence')} onFix={null}>
          {Object.entries(profile.decisionConfidence).map(([cat, val]) => (
            <SummaryRow
              key={cat}
              label={cat[0].toUpperCase() + cat.slice(1)}
              value={val ? humanize(val) : null}
            />
          ))}
        </BriefSection>
      )}

      {/* Mood board */}
      {moodBoard.length > 0 && (
        <SectionWithFix title={`${t('wrapup.section.moodboard')} (${moodBoard.length})`} onFix={null}>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {moodBoard.slice(0, 8).map((item) => (
              <div
                key={item.id}
                className="aspect-square overflow-hidden rounded-xl border border-border bg-card"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.imageUrl}
                  alt={item.title ?? ''}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </div>
            ))}
            {moodBoard.length > 8 && (
              <div className="flex aspect-square items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-xs font-medium text-muted-foreground">
                {t('wrapup.moodboard.more').replace('{n}', String(moodBoard.length - 8))}
              </div>
            )}
          </div>
        </SectionWithFix>
      )}

      {/* Original captured summary lines from the AI (a "TL;DR") */}
      {data.summaryLines.length > 0 && (
        <section className="rounded-2xl border border-border bg-card/60 p-5 text-left shadow-sm">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('wrapup.section.tldr')}
          </p>
          <ul className="space-y-2">
            {data.summaryLines.map((line, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground/85">
                <span className="mt-0.5 text-muted-foreground/50">—</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={downloadHandoff}
          disabled={isExporting || !bundle}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-accent/40 disabled:opacity-60"
        >
          <Download className="size-4 stroke-[1.75]" aria-hidden />
          {isExporting ? t('wrapup.actions.preparing') : t('wrapup.actions.download')}
        </button>
        {exportError && <p className="text-xs font-medium text-destructive">{t(exportError)}</p>}
        {bundleError && (
          <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-destructive">
            <span>{t(bundleError)}</span>
            <button
              type="button"
              onClick={() => void loadBundle()}
              disabled={isLoadingBundle}
              className="rounded-full border border-destructive/40 px-3 py-1 font-semibold transition-colors hover:bg-destructive/10 disabled:opacity-50"
            >
              {t('common.retry')}
            </button>
          </div>
        )}

        {bundle?.makerPath && (
          <a
            href={bundle.makerPath}
            target="_blank"
            rel="noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-accent/40"
          >
            <ExternalLink className="size-4 stroke-[1.75]" aria-hidden />
            {t('wrapup.actions.openMaker')}
          </a>
        )}

        {/* Demo-only link to the maker dashboard preview. Production removes this. */}
        <button
          type="button"
          onClick={() => setShowMakerView(true)}
          disabled={!bundle}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          <ExternalLink className="size-3 stroke-[1.75]" aria-hidden />
          {t('wrapup.actions.makerDemo')}
        </button>
      </div>
    </motion.div>
  )
}

const GROUP_LABEL: Record<EstimateGroupId, TranslationKey> = {
  material: 'builder.shell.bom.material',
  make: 'builder.shell.bom.make',
  install: 'builder.shell.bom.install',
  goods: 'builder.shell.bom.goods',
  project: 'builder.shell.bom.project',
}

/**
 * The estimate on the wrap-up (IMP-04): the one range line every surface
 * shows (what the homeowner pays, the ±, who confirms it, what it leaves out),
 * the kitchen with appliances when the maker supplies them, then the build
 * line by line, grouped the way the kitchen is quoted. Every figure prints
 * through `formatRange`; an exact sum (picked models) prints as is.
 */
export function WrapUpEstimate({
  estimate,
  makerName,
}: {
  estimate: HandoffEstimate
  makerName?: string | null
}) {
  const { t, tDynamic: td, locale } = useTranslations()
  const groups = groupEstimateLines<BomLineItem>(estimate.lines)
  const money = (r: { low: number; high: number }, exact: boolean) =>
    exact ? formatEUR(r.low, locale) : formatRange(r, locale)
  const lineLabel = (key: string) => {
    const label = td(`bom.lineItem.${key}`)
    return label === `bom.lineItem.${key}` ? humanize(key) : label
  }

  return (
    <>
      <RangeLine
        voice="homeowner"
        makerName={makerName}
        label={t('wrapup.estimate.kitchenLabel')}
        range={{
          low: estimate.low,
          high: estimate.high,
          bandPct: estimate.bandPct,
          assumptions: estimate.assumptions,
        }}
      />
      {estimate.withAppliances && (
        <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-border/60 pt-2 text-sm">
          <span className="text-muted-foreground">{t('wrapup.estimate.allInLabel')}</span>
          <span className="shrink-0 font-semibold tabular-nums text-foreground">
            {formatRange(estimate.withAppliances, locale)}
          </span>
        </div>
      )}
      {groups.length > 0 && (
        <div className="mt-4 border-t border-border/60 pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('wrapup.estimate.linesTitle')}
          </p>
          <div className="mt-2 space-y-3" data-estimate-lines>
            {groups.map((g) => (
              <div key={g.id} data-estimate-group={g.id}>
                <p className="flex items-baseline justify-between gap-3 text-[13px] font-medium text-foreground">
                  <span>{t(GROUP_LABEL[g.id])}</span>
                  <span className="shrink-0 tabular-nums">{money(g, g.exact)}</span>
                </p>
                <ul className="mt-1 space-y-0.5">
                  {g.lines.map((l) => (
                    <li
                      key={l.key}
                      className="flex items-baseline justify-between gap-3 text-[12px] text-muted-foreground"
                    >
                      <span className="min-w-0">
                        {lineLabel(l.key)}
                        {l.quantity ? (
                          <>
                            <span aria-hidden> · </span>
                            <span className="tabular-nums">{l.quantity}</span>
                          </>
                        ) : null}
                      </span>
                      <span className="shrink-0 tabular-nums">{money(l, l.exact === true)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
        <AlertCircle className="mt-0.5 size-3 shrink-0 stroke-[1.75]" aria-hidden />
        {t('wrapup.estimate.makerConfirms')}
      </p>
    </>
  )
}

function BriefSection({
  title,
  children,
  onFix,
}: {
  title: string
  children: React.ReactNode
  onFix: (() => void) | null
}) {
  const { t } = useTranslations()
  return (
    <section className="rounded-2xl border border-border bg-card p-5 text-left shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
        {onFix && (
          <button
            type="button"
            onClick={onFix}
            className="text-[11px] font-medium text-primary hover:underline"
          >
            {t('wrapup.fixAnything')}
          </button>
        )}
      </div>
      <dl className="space-y-1.5">{children}</dl>
    </section>
  )
}

function SectionWithFix({
  title,
  badge,
  children,
  onFix,
}: {
  title: string
  badge?: string
  children: React.ReactNode
  onFix: (() => void) | null
}) {
  const { t } = useTranslations()
  return (
    <section className="text-left">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
          {badge && (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">
              {badge}
            </span>
          )}
        </p>
        {onFix && (
          <button
            type="button"
            onClick={onFix}
            className="text-[11px] font-medium text-primary hover:underline"
          >
            {t('wrapup.fixAnything')}
          </button>
        )}
      </div>
      {children}
    </section>
  )
}

function SummaryRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      {/* Wraps rather than truncates: builder picks carry the decor name and
          code ("Shaker (s okvirom) · Bijela premium (W1000)"), too long for a
          phone row, and a summary the homeowner can't read to the end hides
          exactly the detail they came to check. */}
      <dd className="min-w-0 break-words text-right font-medium text-foreground">{value}</dd>
    </div>
  )
}
