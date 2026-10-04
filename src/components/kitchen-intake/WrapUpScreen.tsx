'use client'

import { useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Download, Eye, ListChecks, Send, Sparkles, AlertCircle, Hammer } from 'lucide-react'
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
import {
  formatEUR,
  formatRange,
  groupEstimateLines,
  withGoodsKey,
  type EstimateGroup,
  type EstimateGroupId,
} from '@/lib/builder/range'
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
import { ApiError, apiErrorKey, readJson } from '@/lib/api/client'
import { mintBriefId } from '@/lib/handoff/brief-id'
import { customerEstimate, estimateFromBuild } from '@/lib/handoff/estimate'
import { reviewState, sendOffer } from '@/lib/handoff/review'
import { REVIEW_FIX, type ReviewSection, type ReviewTarget } from '@/lib/review-nav'
import { contactChannels } from '@/lib/contact'
import { cn } from '@/lib/utils'

interface WrapUpScreenProps {
  data: WrapUpData
  profile: LeadProfile
  explorationRefs: ConceptVisualRef[]
  transcript: ClientMessage[]
  /** Ties the brief to its project, and so to a maker. Without it the brief is
   *  ownerless and nobody — not even the maker who asked for it — can open it. */
  projectId?: string
  /**
   * The project's current brief: the one the page loaded with, or one sent
   * from this screen in this visit. With it the review knows whether it IS
   * the brief the maker has (nothing to send) or a newer one (send the
   * changes). Absent: nothing has gone out yet.
   */
  onFileBriefId?: string | null
  /**
   * The brief on file as the page loaded it: its id and its stored estimate
   * (the customer's copy). When the review IS that brief, a revisit shows its
   * range, what happens next and the download — without sending again.
   */
  initialResult?: { briefId: string; estimate: HandoffEstimate | null } | null
  /** The maker closed the project (IMP-03): the handoff refuses a send, so none is offered. */
  closed?: boolean
  /** Runs before the brief is sent — the intake flushes its pending save and
   *  hands back the image-free snapshot the brief is built from, which the
   *  submit stores as the project's copy (lib/project/submit-snapshot), so the
   *  brief never arrives flagged as edited — over a copy the claim says is
   *  this tab's, never another device's. */
  beforeSubmit?: () => Promise<{ snapshot?: unknown; snapshotClaim?: unknown } | void>
  /** Back to the builder, for a homeowner who skipped it and so has no range.
   *  Absent where nobody may edit (the maker looking in). */
  onOpenBuilder?: () => void
  /** Called with the brief's id once a send from this screen has saved it, so
   *  the intake knows which brief the maker has now. */
  onSent?: (briefId: string) => void
  /** "Nešto ispraviti?" on a section: reopen the step that asks it (IMP-07,
   *  lib/review-nav REVIEW_FIX). Absent where nobody may edit. */
  onFix?: (target: ReviewTarget) => void
  /** Back to the steps (the contact step). Absent where nobody may edit. */
  onBack?: () => void
  /** The maker's display name, for "a range {maker} confirms". Absent → "your maker". */
  makerName?: string | null
  /** True when the viewer is the maker looking in at their customer's kitchen.
   *  Sending is the customer's act (/api/handoff answers the maker 404), so a
   *  read-only wrap-up never sends — there is no send control at all — and
   *  says where the brief got to instead. The header and the back link are
   *  worded for the maker (no homeowner thank-you, no "fix anything"); nothing
   *  on this screen is maker-only. */
  readOnly?: boolean
}

function humanize(v: string): string {
  return v.replace(/_/g, ' ')
}

function listSummary(items: { trade: string }[] | undefined): string | null {
  if (!items || items.length === 0) return null
  return items.map((i) => i.trade).join(' · ')
}

/**
 * The wrap-up is a review (IMP-07, Pattern C: "Here's what I'll send to your
 * maker. Anything I got wrong?"). Arriving here sends nothing: there is no
 * effect in this component at all. The brief leaves only when the homeowner
 * presses "Pošalji izrađivaču" (or, once the maker has an earlier version,
 * "Pošalji izmjene"); the range shown before that is priced from the build by
 * the same function the handoff uses (lib/handoff/estimate).
 */
export function WrapUpScreen({
  data,
  profile,
  explorationRefs,
  transcript,
  projectId,
  onFileBriefId = null,
  initialResult = null,
  closed = false,
  beforeSubmit,
  onOpenBuilder,
  onSent,
  onFix,
  onBack,
  makerName,
  readOnly = false,
}: WrapUpScreenProps) {
  const { t, tDynamic: td, locale } = useTranslations()
  const contact = contactChannels(profile)
  // The send's response. Null until the homeowner sends from this screen.
  const [bundle, setBundle] = useState<HandoffBundle | null>(null)
  const [bundleError, setBundleError] = useState<TranslationKey | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState<TranslationKey | null>(null)

  // What this review is and what it may send (lib/handoff/review): the first
  // send, the changes, or nothing — the maker looking in, the brief the maker
  // already has, a send already made here, a project the maker closed.
  const state = reviewState({ readOnly, onFileBriefId, reviewBriefId: data.briefId })
  const isClosed = closed || bundleError === 'api.error.closed'
  const offer = sendOffer(state, { sentNow: bundle !== null, closed: isClosed })
  // Heads its sentence ("{maker} dobiva sažetak…"), so the fallback is capitalised.
  const makerLabel = makerName?.trim() || t('kitchen.home.yourMaker')

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

  /** A section's "Nešto ispraviti?": reopens its step; none for the maker
   *  looking in, and none where no step asks it any more. */
  function fix(section: ReviewSection): (() => void) | null {
    const target = REVIEW_FIX[section]
    return onFix && !readOnly && target ? () => onFix(target) : null
  }

  // Single-flight: a double click must not send twice. (The id below makes a
  // repeat harmless on the server too; this keeps it from being made at all.)
  const inflight = useRef(false)
  // The id a review from before IMP-06 sends under — it carries none. Minted
  // on the first press, so a retry after a lost response repeats the SAME send
  // and the server hands back the brief it already made.
  const legacyId = useRef<string | null>(null)

  /**
   * The ONLY way a brief leaves this screen: the homeowner presses send. It
   * saves under the review's own id (minted when the review was built, saved
   * in the snapshot by the flush below), so a retry, or the same review sent
   * from a second tab, finds the brief it already made instead of inserting a
   * second one and emailing the maker again.
   */
  async function sendBrief() {
    if (!offer || inflight.current) return
    inflight.current = true
    setIsSending(true)
    setBundleError(null)
    try {
      // A failed save must never stop the brief.
      const extras = (await beforeSubmit?.().catch(() => undefined)) || undefined
      if (!data.briefId && !legacyId.current) legacyId.current = mintBriefId()
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
          briefId: data.briefId ?? legacyId.current,
          snapshot: extras?.snapshot,
          snapshotClaim: extras?.snapshotClaim,
        }),
      })
      const sent = await readJson<HandoffBundle & { code?: string }>(res)
      if (!res.ok || sent.error) {
        throw new ApiError(sent.error ?? `Bundle build failed (${res.status})`, res.status, sent.code)
      }
      setBundle(sent)
      if (sent.briefId) onSent?.(sent.briefId)
    } catch (err) {
      console.warn('[handoff]', err)
      setBundleError(apiErrorKey(err, 'wrapup.error.bundle'))
    } finally {
      inflight.current = false
      setIsSending(false)
    }
  }

  /**
   * The brief as JSON: this send's response, or — on a revisit — the brief on
   * file, read from the server on the click (the customer's own copy, signed
   * media links; nothing is fetched until they ask for it).
   */
  async function downloadHandoff() {
    if (isExporting) return
    setIsExporting(true)
    setExportError(null)
    try {
      let brief = bundle
      if (!brief) {
        const res = await fetch(`/api/projects/${projectId}/brief`, { cache: 'no-store' })
        const body = await readJson<HandoffBundle>(res)
        if (!res.ok || body.error) throw new ApiError(body.error ?? `Brief read failed (${res.status})`, res.status)
        brief = body
      }
      const blob = new Blob([JSON.stringify(brief, null, 2)], {
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

  // The range is priced from the build alone, before anything is sent — the
  // same function the handoff prices with, without the maker-only money. No
  // build, no range — say how to get one rather than showing a number made of
  // nothing. After a send, the figures the brief stored; on a revisit of the
  // brief on file, the figures it stored (initialResult).
  const preview = useMemo(() => customerEstimate(estimateFromBuild(profile)), [profile])
  // A revisit of the brief on file: the figures it stored, the ones the maker
  // has — only while the review on screen is that brief.
  const saved = !bundle && state === 'sent' && initialResult?.briefId === data.briefId ? initialResult : null
  const estimate = bundle?.estimate ?? saved?.estimate ?? preview
  const noBuild = !profile.builderState
  // The maker has this review (sent from here, or the brief on file).
  const done = bundle !== null || state === 'sent'
  // The brief "Što slijedi" refers to: this send's, or the one on file.
  const briefRef = bundle ? bundle.briefId : data.briefId
  // The download is the brief the maker has: this send's response, or the
  // brief on file, read on the click (the project's current brief).
  const canDownload = !readOnly && (bundle !== null || (state === 'sent' && Boolean(projectId)))

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="flex flex-col gap-7 py-4"
    >
      {/* Back to the steps — the review is a place to check, not a dead end. */}
      {onBack && !readOnly && (
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 self-start rounded-full border border-border bg-card px-4 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5 stroke-[2]" aria-hidden />
          {t('wrapup.actions.backToSteps')}
        </button>
      )}

      {/* The header speaks to whoever is looking. The homeowner: their brief,
          to review before it goes — a check only once the maker has it. The
          maker looking in: what this is, the customer's own view, to look at
          (never the homeowner's thank-you or "fix anything"). */}
      <div className="text-center">
        {readOnly ? (
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Eye className="size-6 stroke-[1.75]" aria-hidden />
          </div>
        ) : done ? (
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-2xl text-primary-foreground">
            ✓
          </div>
        ) : (
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ListChecks className="size-6 stroke-[1.75]" aria-hidden />
          </div>
        )}
        <h2 className="text-2xl font-semibold text-foreground">
          {t(readOnly ? 'wrapup.readOnly.title' : 'wrapup.title')}
        </h2>
        {readOnly ? (
          <p className="mt-1 text-sm text-muted-foreground">{t('wrapup.readOnly.lede')}</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted-foreground">{data.thankYouMessage}</p>
            {offer ? (
              <p className="text-xs text-muted-foreground/70">{t('wrapup.review')}</p>
            ) : state === 'sent' && !bundle ? (
              <p className="text-xs text-muted-foreground/70" data-sent-line>
                {t('wrapup.sent.line').replace('{maker}', makerLabel)}
              </p>
            ) : null}
          </>
        )}
      </div>

      {/* Estimate — always a range, never a quote, and only ever from the
          homeowner's own build. */}
      <section className="rounded-2xl border border-border bg-card p-5 text-left shadow-sm">
        <div className="mb-2 flex items-baseline justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('wrapup.estimate.title')}
          </p>
          {!readOnly && !noBuild && estimate && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
              {t(bundle?.briefId || state === 'sent' ? 'wrapup.estimate.sentBadge' : 'wrapup.estimate.bomBadge')}
            </span>
          )}
        </div>
        {readOnly ? (
          // The maker looking in: nothing is sent or priced from here, so no
          // "send the changes" either — just where the brief got to.
          <p className="text-sm text-muted-foreground" data-readonly-status>
            {t(onFileBriefId ? 'wrapup.readOnly.sent' : 'wrapup.readOnly.notSent')}
          </p>
        ) : noBuild ? (
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
        ) : estimate ? (
          <WrapUpEstimate estimate={estimate} makerName={makerName} />
        ) : null}
      </section>

      {/* What happens next — status visibility is a P0 (AGENTS.md rule 8).
          Only once the maker has this brief, and honest about persistence:
          "sent" only when the server said so. */}
      {done && (
        <section className="rounded-2xl border border-border bg-card p-5 text-left shadow-sm" data-next>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('wrapup.next.title')}
          </p>
          {briefRef ? (
            <ul className="space-y-1.5 text-sm text-foreground/85">
              <li>{t('wrapup.next.saved')}</li>
              {contact.length > 0 && (
                <li>{t('wrapup.next.contact').replace('{contact}', contact.join(` ${t('common.or')} `))}</li>
              )}
              <li className="font-mono text-[11px] text-muted-foreground">
                {t('wrapup.next.ref').replace('{id}', briefRef.slice(0, 8))}
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
          onFix={fix('render')}
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
        <SectionWithFix title={t('wrapup.section.space')} onFix={fix('space')}>
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
        <BriefSection title={t('wrapup.section.basics')} onFix={fix('basics')}>
          <SummaryRow label={t('wrapup.row.projectType')} value={optionLabel('projectType', profile.projectType)} />
          <SummaryRow label={t('wrapup.row.timeline')} value={optionLabel('timeline', profile.timeline)} />
        </BriefSection>
      )}

      {/* Scope */}
      {profile.scope && (
        <BriefSection title={t('wrapup.section.scope')} onFix={fix('scope')}>
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
        <BriefSection title={t('wrapup.section.style')} onFix={fix('style')}>
          <SummaryRow label={t('wrapup.row.style')} value={styles} />
          <SummaryRow label={t('wrapup.row.door')} value={picks?.doors} />
          <SummaryRow label={t('wrapup.row.worktop')} value={picks?.worktop} />
          <SummaryRow label={t('wrapup.row.backsplash')} value={picks?.backsplash} />
        </BriefSection>
      )}

      {/* Trades — shown when any row has something to say. */}
      {(sinkLine || tradeRows.cookerType || tradeRows.gas || tradeRows.ventPath) && (
        <BriefSection title={t('wrapup.section.trades')} onFix={fix('trades')}>
          <SummaryRow label={t('wrapup.row.sinkPosition')} value={sinkLine} />
          <SummaryRow label={t('wrapup.row.cookerType')} value={tradeRows.cookerType} />
          <SummaryRow label={t('wrapup.row.gas')} value={tradeRows.gas} />
          <SummaryRow label={t('wrapup.row.ventPath')} value={tradeRows.ventPath} />
        </BriefSection>
      )}

      {/* Lighting */}
      {profile.lighting && Object.keys(profile.lighting).length > 0 && (
        <BriefSection title={t('wrapup.section.lighting')} onFix={fix('lighting')}>
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
        <BriefSection title={t('wrapup.section.wishlist')} onFix={fix('wishlist')}>
          <SummaryRow label={t('wrapup.row.mustHaves')} value={listSummary(profile.mustHaves)} />
          <SummaryRow label={t('wrapup.row.niceToHaves')} value={listSummary(profile.niceToHaves)} />
          <SummaryRow label={t('wrapup.row.dealBreakers')} value={listSummary(profile.dealBreakers)} />
        </BriefSection>
      )}

      {/* Logistics */}
      {profile.logistics && Object.keys(profile.logistics).length > 0 && (
        <BriefSection title={t('wrapup.section.logistics')} onFix={fix('logistics')}>
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

      {/* Contact — how the maker reaches them, as the brief carries it. */}
      {(profile.name || contact.length > 0) && (
        <BriefSection title={t('wrapup.section.contact')} onFix={fix('contact')}>
          <SummaryRow label={t('wrapup.row.name')} value={profile.name} />
          <SummaryRow label={t('wrapup.row.channels')} value={contact.join(' · ') || null} />
        </BriefSection>
      )}

      {/* Decisions */}
      {profile.decisionConfidence && Object.keys(profile.decisionConfidence).length > 0 && (
        <BriefSection title={t('wrapup.section.confidence')} onFix={fix('confidence')}>
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
        <SectionWithFix title={`${t('wrapup.section.moodboard')} (${moodBoard.length})`} onFix={fix('moodboard')}>
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

      {/* Send — after the whole brief, so it is read first (Pattern C). The
          one control on this screen that reaches the maker. */}
      {(offer || bundleError) && (
        <section
          className="rounded-2xl border border-primary/30 bg-primary/5 p-5 text-left shadow-sm"
          data-send={offer ?? undefined}
        >
          {offer && (
            <>
              <p className="text-sm font-semibold text-foreground">
                {t(offer === 'first' ? 'wrapup.send.title' : 'wrapup.changes.title')}
              </p>
              <p className="mb-3 mt-1 text-xs leading-relaxed text-muted-foreground">
                {t(offer === 'first' ? 'wrapup.send.body' : 'wrapup.changes.body').replace('{maker}', makerLabel)}
              </p>
              <button
                type="button"
                onClick={() => void sendBrief()}
                disabled={isSending}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                <Send className="size-4 stroke-[1.75]" aria-hidden />
                {isSending ? t('wrapup.send.sending') : t(offer === 'first' ? 'wrapup.send.cta' : 'wrapup.changes.cta')}
              </button>
            </>
          )}
          {/* A failed send keeps the button above: pressing it again is the
              retry, under the same id. A closed project (409) keeps only the
              line — nothing can be sent there any more. */}
          {bundleError && (
            <p role="alert" className={cn('text-xs font-medium text-destructive', offer && 'mt-3')}>
              {t(bundleError)}
            </p>
          )}
        </section>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-2">
        {/* The download is the brief the maker received, so it exists only
            once there is one; the maker looking in gets none. */}
        {canDownload && (
          <button
            type="button"
            onClick={downloadHandoff}
            disabled={isExporting}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-accent/40 disabled:opacity-60"
          >
            <Download className="size-4 stroke-[1.75]" aria-hidden />
            {isExporting ? t('wrapup.actions.preparing') : t('wrapup.actions.download')}
          </button>
        )}
        {exportError && <p className="text-xs font-medium text-destructive">{t(exportError)}</p>}

        {/* Back to the kitchen home, which says where the brief got to. No
            link into the maker's side and no maker demo (IMP-05): this screen
            is the homeowner's, and the maker looking in sees the same one.
            A plain <a>, not next/link: this screen sits inside KitchenHome at
            this same URL, and a soft navigation keeps its `entered` state, so
            the wrap-up would stay up. The full load also re-reads the brief. */}
        {projectId && (
          <a
            href={`/kitchen/${projectId}`}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-accent/40"
          >
            <ArrowLeft className="size-4 stroke-[1.75]" aria-hidden />
            {t(readOnly ? 'wrapup.actions.backToKitchenMaker' : 'wrapup.actions.backToKitchen')}
          </a>
        )}
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
 * then what the range is made of: material, make and install, line by line,
 * adding up to it. Whatever the maker prices alongside the kitchen (the goods
 * they supply, legacy project allowances) sits apart, under its own heading,
 * closed by the kitchen with those goods, labelled by what they are. Every
 * figure prints through `formatRange`; an exact sum (picked models) prints as is.
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
  const inRange = groups.filter((g) => g.inRange)
  const outside = groups.filter((g) => !g.inRange)
  const money = (r: { low: number; high: number }, exact: boolean) =>
    exact ? formatEUR(r.low, locale) : formatRange(r, locale)
  const lineLabel = (key: string) => {
    const label = td(`bom.lineItem.${key}`)
    return label === `bom.lineItem.${key}` ? humanize(key) : label
  }
  const renderGroups = (list: EstimateGroup<BomLineItem>[]) => (
    <div className="mt-2 space-y-3">
      {list.map((g) => (
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
  )

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
      {inRange.length > 0 && (
        <div className="mt-4 border-t border-border/60 pt-3" data-estimate-lines>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('wrapup.estimate.linesTitle')}
          </p>
          {renderGroups(inRange)}
        </div>
      )}
      {(outside.length > 0 || estimate.withAppliances) && (
        <div className="mt-4 border-t border-border/60 pt-3" data-estimate-outside>
          {outside.length > 0 && (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('wrapup.estimate.outsideTitle')}
              </p>
              {renderGroups(outside)}
            </>
          )}
          {estimate.withAppliances && (
            <div
              className={cn(
                'flex items-baseline justify-between gap-3 text-sm',
                outside.length > 0 && 'mt-3 border-t border-border/60 pt-2'
              )}
              data-with-goods
            >
              {/* "with appliances" only when an appliances row is priced; the
                  sink and tap alone say so (the homeowner may buy the rest). */}
              <span className="text-muted-foreground">{t(withGoodsKey(estimate.lines))}</span>
              <span className="shrink-0 font-semibold tabular-nums text-foreground">
                {formatRange(estimate.withAppliances, locale)}
              </span>
            </div>
          )}
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
            aria-label={`${t('wrapup.fixAnything')}: ${title}`}
            data-fix
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
            aria-label={`${t('wrapup.fixAnything')}: ${title}`}
            data-fix
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
