'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Download, ExternalLink, Sparkles, AlertCircle } from 'lucide-react'
import type {
  ClientMessage,
  ConceptVisualRef,
  HandoffBundle,
  LeadProfile,
  WrapUpData,
} from '@/lib/types'
import { DESIGNER_NAME, STUDIO_NAME } from '@/lib/system-prompt'
import { hasPlan, planFromProfile } from '@/lib/floor-plan'
import { useTranslations } from '@/lib/i18n'
import { FloorPlanStatic } from './FloorPlanStatic'
import { MakerDashboardPreview } from './MakerDashboardPreview'

interface WrapUpScreenProps {
  data: WrapUpData
  profile: LeadProfile
  explorationRefs: ConceptVisualRef[]
  transcript: ClientMessage[]
}

function humanize(v: string): string {
  return v.replace(/_/g, ' ')
}

function listSummary(items: { trade: string }[] | undefined): string | null {
  if (!items || items.length === 0) return null
  return items.map((i) => i.trade).join(' · ')
}

export function WrapUpScreen({ data, profile, explorationRefs, transcript }: WrapUpScreenProps) {
  const { t, tDynamic: td, locale } = useTranslations()
  const [bundle, setBundle] = useState<HandoffBundle | null>(null)
  const [bundleError, setBundleError] = useState<string | null>(null)
  const [isLoadingBundle, setIsLoadingBundle] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [showMakerView, setShowMakerView] = useState(false)

  const plan = planFromProfile(profile)
  const showPlan = hasPlan(profile) && plan !== null
  const moodBoard = profile.moodBoardItems ?? []
  const chosenRender = profile.conceptRenders?.find((r) => r.id === profile.conceptRenderChosenId)

  function fmtMoney(n: number): string {
    return `${Math.round(n).toLocaleString(locale)} €`
  }

  /** Translate an option value via its `option.*` family, humanized fallback. */
  function optionLabel(family: string, value: string | null | undefined): string | null {
    if (!value) return null
    const key = `option.${family}.${value}`
    const label = td(key)
    return label === key ? humanize(value) : label
  }

  useEffect(() => {
    let cancelled = false
    async function fetchBundle() {
      setIsLoadingBundle(true)
      setBundleError(null)
      try {
        const res = await fetch('/api/handoff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brief: profile,
            moodBoard,
            explorationRefs,
            transcript,
          }),
        })
        if (!res.ok) throw new Error(`Bundle build failed (${res.status})`)
        const data = (await res.json()) as HandoffBundle
        if (!cancelled) setBundle(data)
      } catch (err) {
        if (!cancelled) {
          setBundleError(err instanceof Error ? err.message : 'Could not assemble brief')
        }
      } finally {
        if (!cancelled) setIsLoadingBundle(false)
      }
    }
    void fetchBundle()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      setExportError(err instanceof Error ? err.message : 'Could not export brief')
    } finally {
      setIsExporting(false)
    }
  }

  if (showMakerView && bundle) {
    return <MakerDashboardPreview bundle={bundle} onBack={() => setShowMakerView(false)} />
  }

  const estimate = bundle?.estimate
  const estimateBasis = estimate
    ? estimate.placeholder
      ? t('wrapup.estimate.basisStub')
      : t('wrapup.estimate.basisBom').replace('{pct}', String(estimate.bandPct ?? 20))
    : null

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
        <p className="mt-1 text-[11px] text-muted-foreground/60">
          — {DESIGNER_NAME}, {STUDIO_NAME}
        </p>
      </div>

      {/* Estimate — always a range, never a quote. The badge is honest about
          provenance: amber placeholder for the budget stub, neutral tag when
          the range comes from the homeowner's real build. */}
      <section className="rounded-2xl border border-border bg-card p-5 text-left shadow-sm">
        <div className="mb-2 flex items-baseline justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('wrapup.estimate.title')}
          </p>
          {estimate &&
            (estimate.placeholder ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">
                {t('wrapup.estimate.placeholderBadge')}
              </span>
            ) : (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                {t('wrapup.estimate.bomBadge')}
              </span>
            ))}
        </div>
        {isLoadingBundle ? (
          <p className="text-sm text-muted-foreground">{t('wrapup.estimate.loading')}</p>
        ) : estimate ? (
          <>
            {estimate.withAppliances && (
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('wrapup.estimate.kitchenLabel')}
              </p>
            )}
            <p className="text-3xl font-bold tabular-nums text-foreground">
              {fmtMoney(estimate.low)} <span className="text-muted-foreground">–</span> {fmtMoney(estimate.high)}
            </p>
            {estimate.withAppliances && (
              <div className="mt-2 border-t border-border/60 pt-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('wrapup.estimate.allInLabel')}
                </p>
                <p className="text-xl font-semibold tabular-nums text-foreground">
                  {fmtMoney(estimate.withAppliances.low)} <span className="text-muted-foreground">–</span>{' '}
                  {fmtMoney(estimate.withAppliances.high)}
                </p>
              </div>
            )}
            {estimateBasis && (
              <p className="mt-2 text-xs text-muted-foreground">{estimateBasis}</p>
            )}
            <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
              <AlertCircle className="mt-0.5 size-3 shrink-0 stroke-[1.75]" aria-hidden />
              {t('wrapup.estimate.makerConfirms')}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t('wrapup.estimate.unavailable')}</p>
        )}
      </section>

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
          <FloorPlanStatic plan={plan} mode="homeowner" />
        </SectionWithFix>
      )}

      {/* Project basics */}
      <BriefSection title={t('wrapup.section.basics')} onFix={null}>
        <SummaryRow label={t('wrapup.row.projectType')} value={optionLabel('projectType', profile.projectType)} />
        <SummaryRow label={t('wrapup.row.timeline')} value={optionLabel('timeline', profile.timeline)} />
        <SummaryRow
          label={t('wrapup.row.budget')}
          value={
            profile.budgetRange
              ? humanize(profile.budgetRange)
              : profile.budgetShared === false
                ? t('wrapup.row.budgetPrivate')
                : null
          }
        />
      </BriefSection>

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

      {/* Style + materials */}
      <BriefSection title={t('wrapup.section.style')} onFix={null}>
        <SummaryRow
          label={t('wrapup.row.style')}
          value={profile.stylePreferences?.map(humanize).join(', ')}
        />
        <SummaryRow label={t('wrapup.row.door')} value={profile.doorMaterial && humanize(profile.doorMaterial)} />
        <SummaryRow
          label={t('wrapup.row.construction')}
          value={profile.cabinetConstruction && humanize(profile.cabinetConstruction)}
        />
        <SummaryRow
          label={t('wrapup.row.worktop')}
          value={profile.worktopPreference && humanize(profile.worktopPreference)}
        />
        <SummaryRow
          label={t('wrapup.row.backsplash')}
          value={profile.backsplashPreference && humanize(profile.backsplashPreference)}
        />
        <SummaryRow
          label={t('wrapup.row.hardwareTier')}
          value={profile.hardwareTier && humanize(profile.hardwareTier)}
        />
        <SummaryRow
          label={t('wrapup.row.hardwareBrand')}
          value={profile.hardwareBrand && humanize(profile.hardwareBrand)}
        />
        <SummaryRow
          label={t('wrapup.row.specialty')}
          value={profile.specialtyCabinets?.map(humanize).join(', ')}
        />
        <SummaryRow
          label={t('wrapup.row.appliances')}
          value={profile.appliancesIntegrated && humanize(profile.appliancesIntegrated)}
        />
      </BriefSection>

      {/* Trades */}
      {profile.trades && Object.keys(profile.trades).length > 0 && (
        <BriefSection title={t('wrapup.section.trades')} onFix={null}>
          <SummaryRow
            label={t('wrapup.row.sinkPosition')}
            value={profile.trades.plumbing?.sinkPosition && humanize(profile.trades.plumbing.sinkPosition)}
          />
          <SummaryRow
            label={t('wrapup.row.cookerType')}
            value={profile.trades.electrical?.cookerType && humanize(profile.trades.electrical.cookerType)}
          />
          <SummaryRow
            label={t('wrapup.row.gas')}
            value={profile.trades.gas?.available && humanize(profile.trades.gas.available)}
          />
          <SummaryRow
            label={t('wrapup.row.ventPath')}
            value={
              profile.trades.ventilation?.desiredPath && humanize(profile.trades.ventilation.desiredPath)
            }
          />
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
        {exportError && <p className="text-xs font-medium text-destructive">{exportError}</p>}
        {bundleError && <p className="text-xs font-medium text-destructive">{bundleError}</p>}

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

function BriefSection({
  title,
  children,
  onFix,
}: {
  title: string
  children: React.ReactNode
  onFix: (() => void) | null
}) {
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
            Fix anything?
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
            Fix anything?
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
      <dd className="min-w-0 truncate text-right font-medium text-foreground" title={value}>
        {value}
      </dd>
    </div>
  )
}
