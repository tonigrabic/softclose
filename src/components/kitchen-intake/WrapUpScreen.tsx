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
import { FloorPlanStatic } from './FloorPlanStatic'
import { MakerDashboardPreview } from './MakerDashboardPreview'

interface WrapUpScreenProps {
  data: WrapUpData
  profile: LeadProfile
  explorationRefs: ConceptVisualRef[]
  transcript: ClientMessage[]
}

function fmtMoney(n: number): string {
  return n >= 1000 ? `$${Math.round(n / 1000).toLocaleString()}k` : `$${n.toLocaleString()}`
}

function listSummary(items: { trade: string }[] | undefined): string | null {
  if (!items || items.length === 0) return null
  return items.map((i) => i.trade).join(' · ')
}

export function WrapUpScreen({ data, profile, explorationRefs, transcript }: WrapUpScreenProps) {
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
        <h2 className="text-2xl font-semibold text-foreground">Here&apos;s your brief</h2>
        <p className="mt-1 text-sm text-muted-foreground">{data.thankYouMessage}</p>
        <p className="text-xs text-muted-foreground/70">
          Review what we&apos;re sending — fix anything that&apos;s off.
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground/60">
          — {DESIGNER_NAME}, {STUDIO_NAME}
        </p>
      </div>

      {/* Stub estimate — homeowner-facing preview */}
      <section className="rounded-2xl border border-border bg-card p-5 text-left shadow-sm">
        <div className="mb-2 flex items-baseline justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Rough estimate range
          </p>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">
            Placeholder
          </span>
        </div>
        {isLoadingBundle ? (
          <p className="text-sm text-muted-foreground">Crunching a rough range…</p>
        ) : estimate ? (
          <>
            <p className="text-3xl font-bold text-foreground">
              {fmtMoney(estimate.low)} <span className="text-muted-foreground">–</span> {fmtMoney(estimate.high)}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">{estimate.basis}</p>
            <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
              <AlertCircle className="mt-0.5 size-3 shrink-0 stroke-[1.75]" aria-hidden />
              Your designer will refine this into a real quote on follow-up. We never send a single number to you without a human on the other side.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Estimate not available yet.</p>
        )}
      </section>

      {/* Chosen concept render */}
      {chosenRender && (
        <SectionWithFix title="Your concept render" badge="AI Concept" onFix={null}>
          <div className="overflow-hidden rounded-xl border border-border bg-background">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={chosenRender.imageDataUrl}
              alt="AI concept render"
              className="h-auto w-full"
            />
            <div className="border-t border-border/70 px-3 py-2 text-[11px] text-muted-foreground">
              <p className="flex items-center gap-1.5">
                <Sparkles className="size-3 stroke-[1.75]" aria-hidden />
                AI-generated concept anchored to your space photo. Discussion only — your designer is the source of truth.
              </p>
              {chosenRender.nudges.length > 0 && (
                <p className="mt-1">Tweaks applied: {chosenRender.nudges.join(' · ')}</p>
              )}
            </div>
          </div>
        </SectionWithFix>
      )}

      {/* Floor plan */}
      {showPlan && plan && (
        <SectionWithFix title="Your space" onFix={null}>
          <FloorPlanStatic plan={plan} mode="homeowner" />
        </SectionWithFix>
      )}

      {/* Project basics */}
      <BriefSection title="Project basics" onFix={null}>
        <SummaryRow label="Project type" value={profile.projectType} />
        <SummaryRow label="Timeline" value={profile.timeline} />
        <SummaryRow label="Budget band" value={profile.budgetRange ?? (profile.budgetShared === false ? 'Prefer not to say' : null)} />
      </BriefSection>

      {/* Scope */}
      {profile.scope && (
        <BriefSection title="Scope of work" onFix={null}>
          <SummaryRow
            label="Items in scope"
            value={Object.entries(profile.scope)
              .filter(([, v]) => v === true)
              .map(([k]) => k)
              .join(', ') || null}
          />
        </BriefSection>
      )}

      {/* Style + materials */}
      <BriefSection title="Style + materials" onFix={null}>
        <SummaryRow label="Style" value={profile.stylePreferences?.join(', ')} />
        <SummaryRow label="Cabinet door" value={profile.doorMaterial} />
        <SummaryRow label="Construction" value={profile.cabinetConstruction} />
        <SummaryRow label="Worktop" value={profile.worktopPreference} />
        <SummaryRow label="Backsplash" value={profile.backsplashPreference} />
        <SummaryRow label="Hardware tier" value={profile.hardwareTier} />
        <SummaryRow label="Hardware brand" value={profile.hardwareBrand} />
        <SummaryRow label="Specialty cabinets" value={profile.specialtyCabinets?.join(', ')} />
        <SummaryRow label="Appliances" value={profile.appliancesIntegrated} />
      </BriefSection>

      {/* Trades */}
      {profile.trades && Object.keys(profile.trades).length > 0 && (
        <BriefSection title="Trades & utilities" onFix={null}>
          <SummaryRow label="Sink position" value={profile.trades.plumbing?.sinkPosition} />
          <SummaryRow label="Cooker type" value={profile.trades.electrical?.cookerType} />
          <SummaryRow label="Gas available" value={profile.trades.gas?.available} />
          <SummaryRow label="Vent path desired" value={profile.trades.ventilation?.desiredPath} />
        </BriefSection>
      )}

      {/* Lighting */}
      {profile.lighting && Object.keys(profile.lighting).length > 0 && (
        <BriefSection title="Lighting" onFix={null}>
          <SummaryRow
            label="Layers"
            value={
              [
                profile.lighting.taskLayer && 'task',
                profile.lighting.ambientLayer && 'ambient',
                profile.lighting.accentLayer && 'accent',
              ]
                .filter(Boolean)
                .join(', ') || null
            }
          />
          <SummaryRow
            label="Smart controls"
            value={
              profile.lighting.smartControls === undefined
                ? null
                : profile.lighting.smartControls
                  ? 'Yes'
                  : 'No'
            }
          />
        </BriefSection>
      )}

      {/* Wishlist */}
      {(profile.mustHaves?.length || profile.niceToHaves?.length || profile.dealBreakers?.length) && (
        <BriefSection title="Wishlist" onFix={null}>
          <SummaryRow label="Must-haves" value={listSummary(profile.mustHaves)} />
          <SummaryRow label="Nice-to-haves" value={listSummary(profile.niceToHaves)} />
          <SummaryRow label="Deal-breakers" value={listSummary(profile.dealBreakers)} />
        </BriefSection>
      )}

      {/* Logistics */}
      {profile.logistics && Object.keys(profile.logistics).length > 0 && (
        <BriefSection title="Logistics" onFix={null}>
          <SummaryRow label="Site access" value={profile.logistics.siteAccess} />
          <SummaryRow label="Living during build" value={profile.logistics.livingDuringBuild} />
          <SummaryRow label="Phasing" value={profile.logistics.phasing} />
          <SummaryRow label="Permits" value={profile.logistics.permits} />
        </BriefSection>
      )}

      {/* Decisions */}
      {profile.decisionConfidence && Object.keys(profile.decisionConfidence).length > 0 && (
        <BriefSection title="Decision confidence" onFix={null}>
          {Object.entries(profile.decisionConfidence).map(([cat, val]) => (
            <SummaryRow key={cat} label={cat[0].toUpperCase() + cat.slice(1)} value={val ?? null} />
          ))}
        </BriefSection>
      )}

      {/* Mood board */}
      {moodBoard.length > 0 && (
        <SectionWithFix title={`Mood board (${moodBoard.length})`} onFix={null}>
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
                +{moodBoard.length - 8} more
              </div>
            )}
          </div>
        </SectionWithFix>
      )}

      {/* Original captured summary lines from the AI (a "TL;DR") */}
      {data.summaryLines.length > 0 && (
        <section className="rounded-2xl border border-border bg-card/60 p-5 text-left shadow-sm">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Designer&apos;s TL;DR
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
          {isExporting ? 'Preparing…' : 'Download brief (JSON)'}
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
          Demo: see what the maker sees
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
