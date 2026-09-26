'use client'

import { useMemo, useState } from 'react'
import { ArrowLeft, Check, AlertTriangle, MessageCircle, X, Quote } from 'lucide-react'
import type { HandoffBundle, LeadProfile, TranslatedField } from '@/lib/types'
import type { BomLineItem } from '@/lib/builder/bom'
import type { FloorPlan } from '@/lib/floor-plan'
import { formatLength, renderFloorPlanSvg } from '@/lib/floor-plan'
import { useTranslations, type Locale } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { contactChannels } from '@/lib/contact'

type Confidence = 'H' | 'M' | 'L' | null

interface MakerDashboardPreviewProps {
  bundle: HandoffBundle
  /** Present only in the in-funnel demo; the real /maker/[id] page passes nothing and gets no DEMO banner. */
  onBack?: () => void
  /**
   * Hide quote / clarify / decline.
   *
   * Set on the live view of a brief the customer is still writing: that range
   * comes from an incomplete build, and "Quote-ready" against it is precisely
   * the committed number AGENTS.md rule 6 forbids. The decision belongs on a
   * submitted brief and nowhere else.
   */
  hideActions?: boolean
}

// EUR everywhere (AGENTS.md): the maker sees the same currency as the
// homeowner. Compact (12k €) for the range headline; symbol-after per the
// Croatian convention used by formatEUR elsewhere.
function fmtMoney(n: number): string {
  return n >= 1000
    ? `${Math.round(n / 1000).toLocaleString('hr-HR')}k €`
    : `${n.toLocaleString('hr-HR')} €`
}

type Source = 'homeowner' | 'ai_vision' | 'ai_inferred' | 'preset' | 'maker_catalog'

/** The plan model says `inferred`; the pills say `ai_inferred`. */
function planSource(source: FloorPlan['room']['source']): Source {
  return source === 'inferred' ? 'ai_inferred' : source
}

function humanize(v: string): string {
  return v.replace(/_/g, ' ')
}

function ConfidencePill({ confidence }: { confidence: Confidence }) {
  const { t } = useTranslations()
  if (!confidence) return null
  const meta = {
    H: { label: 'H', tone: 'bg-emerald-100 text-emerald-800 ring-emerald-200' },
    M: { label: 'M', tone: 'bg-amber-100 text-amber-800 ring-amber-200' },
    L: { label: 'L', tone: 'bg-rose-100 text-rose-800 ring-rose-200' },
  }[confidence]
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded px-1.5 py-0 font-mono text-[10px] font-bold uppercase ring-1 ring-inset',
        meta.tone
      )}
      title={t('maker.confidence').replace('{c}', confidence)}
    >
      {meta.label}
    </span>
  )
}

const SOURCE_TONE: Record<Source, string> = {
  homeowner: 'bg-slate-100 text-slate-700',
  ai_vision: 'bg-violet-100 text-violet-800',
  ai_inferred: 'bg-amber-100 text-amber-800',
  preset: 'bg-blue-100 text-blue-800',
  maker_catalog: 'bg-emerald-100 text-emerald-800',
}

function SourcePill({ source }: { source: Source }) {
  const { tDynamic: td } = useTranslations()
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0 font-mono text-[10px] font-medium uppercase tracking-wide',
        SOURCE_TONE[source]
      )}
    >
      {td(`maker.source.${source}`)}
    </span>
  )
}

function FieldRow({
  label,
  value,
  confidence,
  source,
  verbatim,
}: {
  label: string
  value: string | number | null | undefined
  confidence?: Confidence
  source?: Source
  verbatim?: string
}) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="grid grid-cols-[140px_1fr] items-baseline gap-3 border-b border-slate-200 py-2 last:border-b-0">
      <dt className="font-mono text-[11px] uppercase tracking-wide text-slate-500">{label}</dt>
      <dd>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium text-slate-900">{value}</span>
          {confidence && <ConfidencePill confidence={confidence} />}
          {source && <SourcePill source={source} />}
        </div>
        {verbatim && (
          <div className="mt-1 flex items-start gap-1 text-[11px] italic text-slate-500">
            <Quote className="mt-0.5 size-2.5 shrink-0" aria-hidden />
            <span>&ldquo;{verbatim}&rdquo;</span>
          </div>
        )}
      </dd>
    </div>
  )
}

/** Full-figure EUR for line items (the headline uses the compact fmtMoney). */
function fmtEur(n: number): string {
  return `${Math.round(n).toLocaleString('hr-HR')} €`
}

const LINE_GROUPS = [
  { section: 'works', titleKey: 'maker.build.group.works' },
  { section: 'goods', titleKey: 'builder.shell.bom.goods' },
  { section: 'project', titleKey: 'builder.shell.bom.project' },
] as const

/**
 * What the homeowner actually built, as the builder priced it: fronts, carcasses,
 * worktop, cladding, hardware, appliances… each with its trade detail, quantity
 * and range. Without it the maker gets a total and none of what it is made of.
 */
function BuildLines({ lines }: { lines: BomLineItem[] }) {
  const { t, tDynamic: td } = useTranslations()
  const lineLabel = (key: string) => {
    const label = td(`bom.lineItem.${key}`)
    return label === `bom.lineItem.${key}` ? humanize(key) : label
  }
  return (
    <section className="rounded-lg border border-slate-300 bg-white p-4 shadow-sm">
      <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">{t('maker.build.title')}</h2>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-600">{t('maker.build.subtitle')}</p>
      <div className="mt-3 space-y-3">
        {LINE_GROUPS.map(({ section, titleKey }) => {
          const group = lines.filter((l) => l.section === section)
          if (group.length === 0) return null
          return (
            <div key={section}>
              <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-slate-500">{t(titleKey)}</p>
              <ul className="mt-1 divide-y divide-slate-100">
                {group.map((line) => (
                  <li key={line.key} className="flex items-baseline justify-between gap-3 py-1.5">
                    <div className="min-w-0">
                      <p className="text-[12px] font-semibold text-slate-800">
                        {lineLabel(line.key)}
                        {line.exact && (
                          <span className="ml-1.5 rounded bg-emerald-100 px-1 py-px font-mono text-[9px] font-bold uppercase text-emerald-800">
                            {t('maker.build.exact')}
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] leading-snug text-slate-600">
                        {line.detail}
                        {line.quantity ? ` · ${line.quantity}` : ''}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-slate-700">
                      {line.low === line.high ? fmtEur(line.low) : `${fmtEur(line.low)} – ${fmtEur(line.high)}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function listFromTrue(obj: Record<string, unknown> | undefined): string[] | null {
  if (!obj) return null
  const keys = Object.keys(obj).filter((k) => obj[k] === true)
  return keys.length > 0 ? keys : null
}

/** The stored plan drawn now, in the viewer's language — briefs keep their plan
 *  as data, and an SVG saved before a drawing fix would otherwise keep the bug. */
function useSchematicSvg(floorPlan: HandoffBundle['floorPlan'], locale: Locale): string | null {
  return useMemo(() => {
    if (!floorPlan) return null
    try {
      return renderFloorPlanSvg(floorPlan.plan, { mode: 'maker', locale })
    } catch {
      return floorPlan.svg
    }
  }, [floorPlan, locale])
}

export function MakerDashboardPreview({ bundle, onBack, hideActions = false }: MakerDashboardPreviewProps) {
  const { t, tDynamic: td, locale } = useTranslations()
  const [actionTaken, setActionTaken] = useState<'quote' | 'clarify' | 'decline' | null>(null)
  const profile: LeadProfile = bundle.brief
  const summary = bundle.estimate
  const plan = bundle.floorPlan?.plan ?? null
  const schematicSvg = useSchematicSvg(bundle.floorPlan, locale)

  /** An enum value in words — its label from `<family>.<value>`, else humanized. */
  const opt = (family: string, value: string | null | undefined): string | null => {
    if (!value) return null
    const label = td(`${family}.${value}`)
    return label === `${family}.${value}` ? humanize(value) : label
  }
  const optList = (family: string, values: string[] | null | undefined): string | null =>
    values && values.length > 0 ? values.map((v) => opt(family, v)).join(', ') : null
  const yesNo = (v: boolean | undefined): string | null =>
    v === undefined ? null : v ? t('common.yes') : t('common.no')
  const actionLabel = { quote: t('maker.action.quote'), clarify: t('maker.action.clarify'), decline: t('maker.action.decline') }

  // The builder is where the homeowner actually chose. These profile fields are
  // the inspiration-photo read taken before it (see lib/builder/pick-labels) —
  // AI inferences, not homeowner answers, and they can disagree with the build.
  const photoRead: { label: string; value: string | null | undefined }[] = [
    { label: t('maker.spec.doorMaterial'), value: profile.doorMaterial },
    { label: t('maker.spec.construction'), value: profile.cabinetConstruction },
    { label: t('maker.spec.worktop'), value: profile.worktopPreference },
    { label: t('maker.spec.backsplash'), value: profile.backsplashPreference },
    { label: t('maker.spec.hardwareTier'), value: profile.hardwareTier },
    { label: t('maker.spec.hardwareBrand'), value: profile.hardwareBrand },
    { label: t('maker.spec.specialty'), value: profile.specialtyCabinets?.join(', ') },
    { label: t('maker.spec.appliances'), value: profile.appliancesIntegrated },
  ]
  const hasPhotoRead = photoRead.some((r) => r.value)

  return (
    <div className="-mx-5 mt-2 flex min-h-[80dvh] flex-col bg-slate-100 text-slate-900 sm:-mx-8">
      {/* Demo banner — only when embedded in the homeowner funnel */}
      {onBack && (
        <div className="border-b border-amber-300 bg-amber-100 px-4 py-2 text-center text-[11px] font-semibold text-amber-900">
          {t('maker.demo.banner')}
          <button
            type="button"
            onClick={onBack}
            className="ml-3 inline-flex items-center gap-1 rounded border border-amber-400 bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-900 hover:bg-amber-300"
          >
            <ArrowLeft className="size-3 stroke-[2]" aria-hidden />
            {t('maker.demo.back')}
          </button>
        </div>
      )}

      {/* App-like header */}
      <header className="border-b border-slate-300 bg-white px-5 py-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
              {t('maker.header.eyebrow')}
            </p>
            <h1 className="mt-0.5 text-lg font-bold text-slate-900">
              {t('maker.header.title').replace('{name}', profile.name ?? t('maker.header.anonymous'))}
            </h1>
            <p className="mt-0.5 font-mono text-[11px] text-slate-500">
              {t('maker.header.generated').replace('{when}', new Date(bundle.generatedAt).toLocaleString(locale))}
            </p>
          </div>
          <div className="flex flex-col items-end gap-0.5 text-right">
            {contactChannels(profile).map((channel) => (
              <span key={channel} className="font-mono text-[11px] text-slate-600">
                {channel}
              </span>
            ))}
          </div>
        </div>
      </header>

      <div className="grid gap-4 p-4 lg:grid-cols-[1.4fr_1fr]">
        {/* Left column */}
        <div className="space-y-4">
          {/* Header row: estimate + action buttons */}
          <section className="rounded-lg border border-slate-300 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                {t('maker.estimate.title')}
              </h2>
              {summary?.placeholder && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase text-amber-900">
                  {t('maker.estimate.placeholder')}
                </span>
              )}
            </div>
            {summary ? (
              <>
                {summary.withAppliances && (
                  <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    {t('maker.estimate.kitchenOnly')}
                  </p>
                )}
                <p className="font-mono text-2xl font-bold text-slate-900">
                  {fmtMoney(summary.low)} <span className="text-slate-400">–</span> {fmtMoney(summary.high)}
                </p>
                {/* The stored `basis` is homeowner-facing (or, for the stub, notes to
                    ourselves) and in English; say it to the maker, in their language. */}
                <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600">
                  {summary.placeholder
                    ? t('maker.estimate.basisStub')
                    : summary.bandPct != null
                      ? t('maker.estimate.basis').replace('{pct}', String(summary.bandPct))
                      : summary.basis}
                </p>
                {summary.withAppliances && (
                  <div className="mt-3 border-t border-slate-200 pt-3">
                    <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      {t('maker.estimate.withAppliances')}
                    </p>
                    <p className="mt-0.5 font-mono text-base font-bold text-slate-700">
                      {fmtMoney(summary.withAppliances.low)} <span className="text-slate-400">–</span>{' '}
                      {fmtMoney(summary.withAppliances.high)}
                    </p>
                  </div>
                )}
                {summary.makerCost && (
                  <div className="mt-3 rounded border border-emerald-300 bg-emerald-50 p-2.5">
                    <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                      {t('maker.estimate.makerCost')}
                    </p>
                    <p className="mt-0.5 font-mono text-base font-bold text-emerald-900">
                      {fmtMoney(summary.makerCost.low)} <span className="text-emerald-500">–</span>{' '}
                      {fmtMoney(summary.makerCost.high)}
                    </p>
                    <p className="mt-1 text-[10px] leading-relaxed text-emerald-700">
                      {t('maker.estimate.makerCostNote')}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-500">{t('maker.estimate.none')}</p>
            )}
            {!hideActions && (
              <>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setActionTaken('quote')}
                disabled={actionTaken !== null}
                className={cn(
                  'flex-1 rounded-md px-3 py-2 text-xs font-bold uppercase tracking-wide transition-all',
                  actionTaken === 'quote'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40'
                )}
              >
                <Check className="mr-1 inline size-3 stroke-[3]" aria-hidden />
                {actionLabel.quote}
              </button>
              <button
                type="button"
                onClick={() => setActionTaken('clarify')}
                disabled={actionTaken !== null}
                className={cn(
                  'flex-1 rounded-md px-3 py-2 text-xs font-bold uppercase tracking-wide transition-all',
                  actionTaken === 'clarify'
                    ? 'bg-amber-600 text-white'
                    : 'bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-40'
                )}
              >
                <MessageCircle className="mr-1 inline size-3 stroke-[2]" aria-hidden />
                {actionLabel.clarify}
              </button>
              <button
                type="button"
                onClick={() => setActionTaken('decline')}
                disabled={actionTaken !== null}
                className={cn(
                  'flex-1 rounded-md px-3 py-2 text-xs font-bold uppercase tracking-wide transition-all',
                  actionTaken === 'decline'
                    ? 'bg-rose-600 text-white'
                    : 'bg-rose-500 text-white hover:bg-rose-600 disabled:opacity-40'
                )}
              >
                <X className="mr-1 inline size-3 stroke-[3]" aria-hidden />
                {actionLabel.decline}
              </button>
            </div>
            {actionTaken && (
              <p className="mt-2 font-mono text-[10px] text-slate-500">
                {t('maker.action.demo').replace('{action}', actionLabel[actionTaken])}
              </p>
            )}
              </>
            )}
          </section>

          {summary?.lines && summary.lines.length > 0 ? (
            <BuildLines lines={summary.lines} />
          ) : profile.builderState ? (
            <section className="rounded-lg border border-slate-300 bg-white p-4 shadow-sm">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">{t('maker.build.title')}</h2>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-600">{t('maker.build.legacy')}</p>
            </section>
          ) : null}

          {/* Floor plan */}
          {bundle.floorPlan && schematicSvg && (
            <section className="rounded-lg border border-slate-300 bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  {t('maker.plan.title')}
                </h2>
                <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                  {opt('maker.plan.method', bundle.floorPlan.plan.measurementMethod)}
                </span>
              </div>
              <div
                className="overflow-hidden rounded border border-slate-200 bg-white"
                dangerouslySetInnerHTML={{ __html: schematicSvg }}
              />
              <PlanProvenanceList plan={bundle.floorPlan.plan} />
              <p className="mt-2 font-mono text-[10px] text-slate-500">{t('maker.plan.disclaimer')}</p>
            </section>
          )}

          {/* Spec — main brief */}
          <section className="rounded-lg border border-slate-300 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-700">
              {t('maker.spec.title')}
            </h2>
            <dl>
              <FieldRow
                label={t('maker.spec.projectType')}
                value={opt('option.projectType', profile.projectType)}
                confidence="H"
                source="homeowner"
              />
              <FieldRow
                label={t('maker.spec.timeline')}
                value={opt('option.timeline', profile.timeline)}
                confidence="H"
                source="homeowner"
              />
              <FieldRow
                label={t('maker.spec.budget')}
                value={
                  opt('option.budget', profile.budgetRange) ??
                  (profile.budgetShared === false ? t('maker.spec.budgetWithheld') : null)
                }
                confidence={profile.budgetShared === false ? 'L' : 'H'}
                source="homeowner"
              />

              <FieldRow
                label={t('maker.spec.layoutShape')}
                value={opt('layout.shape', profile.layoutShape ?? profile.spaceVisionResult?.layoutShape)}
                confidence={profile.layoutShape ? 'H' : 'M'}
                source={profile.layoutShape ? 'homeowner' : 'ai_vision'}
              />
              <FieldRow
                label={t('maker.spec.island')}
                value={yesNo(profile.hasIsland)}
                confidence={profile.hasIsland !== undefined ? 'H' : 'M'}
                source="homeowner"
              />
              {/* Size and its provenance come from the plan when there is one: a
                  shape preset's default room is not an AI reading of a photo. */}
              {plan ? (
                <FieldRow
                  label={t('maker.spec.dimensions')}
                  value={`${formatLength(plan.room.lengthCm, plan.units)} × ${formatLength(plan.room.widthCm, plan.units)}`}
                  confidence={plan.room.confidence}
                  source={planSource(plan.room.source)}
                />
              ) : (
                <FieldRow
                  label={t('maker.spec.dimensions')}
                  value={
                    profile.spaceLengthCm && profile.spaceWidthCm
                      ? `${profile.spaceLengthCm} × ${profile.spaceWidthCm} cm`
                      : null
                  }
                  confidence={profile.spaceVisionResult ? 'L' : 'M'}
                  source={profile.spaceVisionResult ? 'ai_vision' : 'homeowner'}
                />
              )}

              <FieldRow
                label={t('maker.spec.style')}
                value={optList('style', profile.stylePreferences)}
                confidence="H"
                source="homeowner"
              />

              <FieldRow
                label={t('maker.spec.scope')}
                value={optList('option.scope', listFromTrue(profile.scope as Record<string, unknown>))}
                confidence="H"
                source="homeowner"
              />
              <FieldRow
                label={t('maker.spec.structural')}
                value={optList('option.structural', listFromTrue(profile.structural as Record<string, unknown>))}
                confidence="M"
                source="homeowner"
              />
              <FieldRow
                label={t('maker.spec.loadBearing')}
                value={opt('option.loadBearing', profile.structural?.wallLoadBearing)}
                confidence={profile.structural?.wallLoadBearing === 'unsure' ? 'L' : 'M'}
                source="homeowner"
              />

              <FieldRow
                label={t('maker.spec.plumbing')}
                value={opt('option.sinkPosition', profile.trades?.plumbing?.sinkPosition)}
                confidence="M"
                source="homeowner"
              />
              <FieldRow
                label={t('maker.spec.cooker')}
                value={opt('option.cookerType', profile.trades?.electrical?.cookerType)}
                confidence="H"
                source="homeowner"
              />
              <FieldRow
                label={t('maker.spec.gas')}
                value={opt('option.gas', profile.trades?.gas?.available)}
                confidence="M"
                source="homeowner"
              />
              <FieldRow
                label={t('maker.spec.vent')}
                value={opt('option.ventPath', profile.trades?.ventilation?.desiredPath)}
                confidence="M"
                source="homeowner"
              />

              <FieldRow
                label={t('maker.spec.lighting')}
                value={
                  [
                    profile.lighting?.taskLayer && t('maker.spec.lighting.task'),
                    profile.lighting?.ambientLayer && t('maker.spec.lighting.ambient'),
                    profile.lighting?.accentLayer && t('maker.spec.lighting.accent'),
                  ]
                    .filter(Boolean)
                    .join(', ') || null
                }
                confidence="H"
                source="homeowner"
              />
              <FieldRow
                label={t('maker.spec.smart')}
                value={yesNo(profile.lighting?.smartControls)}
                confidence="H"
                source="homeowner"
              />

              <FieldRow
                label={t('maker.spec.siteAccess')}
                value={opt('option.siteAccess', profile.logistics?.siteAccess)}
                confidence="H"
                source="homeowner"
              />
              <FieldRow
                label={t('maker.spec.phasing')}
                value={opt('option.phasing', profile.logistics?.phasing)}
                confidence="M"
                source="homeowner"
              />
              <FieldRow
                label={t('maker.spec.permits')}
                value={opt('option.permits', profile.logistics?.permits)}
                confidence="L"
                source="homeowner"
              />
            </dl>

            {hasPhotoRead && (
              <>
                {profile.builderState ? (
                  <p className="mt-3 border-t border-slate-200 pt-2 font-mono text-[10px] uppercase tracking-wider text-slate-500">
                    {t('maker.spec.fromPhotos')}
                  </p>
                ) : null}
                <dl>
                  {photoRead.map((r) => (
                    <FieldRow
                      key={r.label}
                      label={r.label}
                      value={r.value ? humanize(r.value) : null}
                      confidence="M"
                      source="ai_inferred"
                    />
                  ))}
                </dl>
              </>
            )}
          </section>

          {/* Translated wishlist with provenance */}
          {(profile.mustHaves?.length || profile.niceToHaves?.length || profile.dealBreakers?.length) && (
            <section className="rounded-lg border border-slate-300 bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  {t('maker.wishlist.title')}
                </h2>
                <span className="font-mono text-[10px] text-slate-500">{t('maker.wishlist.note')}</span>
              </div>
              <TranslatedList label={t('maker.wishlist.must')} items={profile.mustHaves} tone="emerald" />
              <TranslatedList label={t('maker.wishlist.nice')} items={profile.niceToHaves} tone="slate" />
              <TranslatedList label={t('maker.wishlist.never')} items={profile.dealBreakers} tone="rose" />
              {profile.applianceNotes && (
                <TranslatedList label={t('maker.wishlist.appliances')} items={[profile.applianceNotes]} tone="slate" />
              )}
              {profile.additionalNotes && (
                <TranslatedList label={t('maker.wishlist.additional')} items={[profile.additionalNotes]} tone="slate" />
              )}
            </section>
          )}

          {/* Decision confidence */}
          {profile.decisionConfidence && Object.keys(profile.decisionConfidence).length > 0 && (
            <section className="rounded-lg border border-slate-300 bg-white p-4 shadow-sm">
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-700">
                {t('maker.decision.title')}
              </h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {Object.entries(profile.decisionConfidence).map(([cat, val]) => {
                  if (!val) return null
                  const tone = {
                    locked: 'bg-emerald-100 text-emerald-800 border-emerald-300',
                    flexible: 'bg-blue-100 text-blue-800 border-blue-300',
                    undecided: 'bg-amber-100 text-amber-800 border-amber-300',
                  }[val]
                  return (
                    <div
                      key={cat}
                      className={cn(
                        'rounded border px-2 py-1.5',
                        tone
                      )}
                    >
                      <p className="font-mono text-[10px] uppercase tracking-wider">{opt('maker.decision', cat)}</p>
                      <p className="text-xs font-bold uppercase">{opt('maker.decision', val)}</p>
                    </div>
                  )
                })}
              </div>
            </section>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Concept render */}
          {bundle.chosenRender && (
            <section className="rounded-lg border border-amber-300 bg-amber-50/40 p-4 shadow-sm">
              <div className="mb-2 flex items-center gap-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  {t('maker.render.title')}
                </h2>
                <span className="rounded bg-amber-500 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase text-white">
                  {t('maker.render.badge')}
                </span>
              </div>
              <div className="overflow-hidden rounded border border-amber-300 bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={bundle.chosenRender.imageDataUrl}
                  alt={t('maker.render.alt')}
                  className="h-auto w-full"
                />
              </div>
              <div className="mt-2 space-y-1.5">
                <p className="flex items-start gap-1 font-mono text-[10px] leading-relaxed text-slate-700">
                  <AlertTriangle className="mt-0.5 size-3 shrink-0 text-amber-700" aria-hidden />
                  {t('maker.render.note')}
                </p>

                {bundle.chosenRender.inputs && bundle.chosenRender.inputs.length > 0 && (
                  <div className="rounded border border-slate-300 bg-white p-2">
                    <p className="mb-1.5 font-mono text-[10px] font-semibold uppercase text-slate-600">
                      {t('maker.render.inputs').replace('{n}', String(bundle.chosenRender.inputs.length))}
                    </p>
                    <p className="mb-2 font-mono text-[10px] leading-snug text-slate-500">
                      {t('maker.render.inputsNote')}
                    </p>
                    <div className="space-y-2">
                      {(['anchor', 'previous_render', 'style', 'product'] as const).map((role) => {
                        const items = bundle.chosenRender!.inputs.filter((i) => i.role === role)
                        if (items.length === 0) return null
                        const heading = td(`maker.render.role.${role}`)
                        return (
                          <div key={role}>
                            <p className="mb-1 font-mono text-[10px] font-semibold uppercase text-slate-500">
                              {heading}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {items.map((item, i) => (
                                <div
                                  key={`${role}-${i}`}
                                  className="w-20 overflow-hidden rounded border border-slate-300 bg-slate-50"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={item.imageDataUrl}
                                    alt={item.label ?? role}
                                    className="h-16 w-full object-cover"
                                  />
                                  {role === 'product' && item.label && (
                                    <p className="border-t border-slate-300 px-1 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-slate-700">
                                      {item.label}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                <details className="rounded border border-slate-300 bg-white px-2 py-1">
                  <summary className="cursor-pointer font-mono text-[10px] font-semibold uppercase text-slate-600">
                    {t('maker.render.prompt')}
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap font-mono text-[10px] text-slate-700">
                    {bundle.chosenRender.prompt}
                  </p>
                  {bundle.chosenRender.nudges.length > 0 && (
                    <p className="mt-2 font-mono text-[10px] text-slate-500">
                      {t('maker.render.nudges').replace('{list}', bundle.chosenRender.nudges.join(', '))}
                    </p>
                  )}
                  {bundle.chosenRender.freeTextNudge && (
                    <p className="mt-2 font-mono text-[10px] text-slate-500">
                      {t('maker.render.freeText').replace('{text}', bundle.chosenRender.freeTextNudge)}
                    </p>
                  )}
                  <p className="mt-2 font-mono text-[10px] text-slate-500">
                    {t('maker.render.model').replace('{model}', bundle.chosenRender.modelVersion)}
                  </p>
                </details>
              </div>
            </section>
          )}

          {/* Vision summary */}
          {profile.spaceVisionResult && (
            <section className="rounded-lg border border-slate-300 bg-white p-4 shadow-sm">
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-700">
                {t('maker.vision.title')}
              </h2>
              {profile.spaceVisionResult.summary && (
                <p className="mb-2 text-xs italic text-slate-700">
                  &ldquo;{profile.spaceVisionResult.summary}&rdquo;
                </p>
              )}
              {profile.spaceVisionResult.styleHints && profile.spaceVisionResult.styleHints.length > 0 && (
                <div className="mb-2">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                    {t('maker.vision.styleHints')}
                  </p>
                  <p className="text-xs text-slate-800">
                    {profile.spaceVisionResult.styleHints.join(' · ')}
                  </p>
                </div>
              )}
              {profile.spaceVisionResult.materialHints && profile.spaceVisionResult.materialHints.length > 0 && (
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                    {t('maker.vision.materialHints')}
                  </p>
                  <p className="text-xs text-slate-800">
                    {profile.spaceVisionResult.materialHints.join(' · ')}
                  </p>
                </div>
              )}
            </section>
          )}

          {/* Mood board */}
          {bundle.moodBoard.length > 0 && (
            <section className="rounded-lg border border-slate-300 bg-white p-4 shadow-sm">
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-700">
                {t('maker.moodboard.title').replace('{n}', String(bundle.moodBoard.length))}
              </h2>
              <div className="grid grid-cols-3 gap-1.5">
                {bundle.moodBoard.slice(0, 9).map((item) => (
                  <div
                    key={item.id}
                    className="aspect-square overflow-hidden rounded border border-slate-200"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.imageUrl}
                      alt={item.title ?? ''}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ))}
              </div>
              {bundle.moodBoard.some((i) => i.source === 'catalog') && (
                <p className="mt-2 font-mono text-[10px] text-slate-500">
                  {t('maker.moodboard.catalog')}
                </p>
              )}
            </section>
          )}

          {/* Transcript collapsed */}
          <section className="rounded-lg border border-slate-300 bg-white p-4 shadow-sm">
            <details>
              <summary className="cursor-pointer font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                {t('maker.transcript.title').replace('{n}', String(bundle.transcript.length))}
              </summary>
              <ol className="mt-3 max-h-96 space-y-2 overflow-y-auto pr-2 text-xs">
                {bundle.transcript.map((turn, i) => (
                  <li
                    key={i}
                    className={cn(
                      'rounded border px-2 py-1.5',
                      turn.role === 'user'
                        ? 'border-blue-200 bg-blue-50/50'
                        : 'border-slate-200 bg-slate-50'
                    )}
                  >
                    <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                      {t(turn.role === 'user' ? 'maker.transcript.user' : 'maker.transcript.assistant')}
                    </p>
                    <p className="mt-0.5 text-slate-800">{turn.content}</p>
                    {turn.images && turn.images.length > 0 && (
                      <p className="mt-0.5 font-mono text-[10px] text-slate-500">
                        {t('maker.transcript.images').replace('{n}', String(turn.images.length))}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </details>
          </section>
        </div>
      </div>
    </div>
  )
}

function PlanProvenanceList({ plan }: { plan: FloorPlan }) {
  const { t, tDynamic: td } = useTranslations()
  type Row = {
    key: string
    label: string
    detail: string
    confidence: 'H' | 'M' | 'L'
    source: Source
  }
  const rows: Row[] = []
  rows.push({
    key: 'room',
    label: t('maker.plan.room'),
    detail: `${formatLength(plan.room.lengthCm, plan.units)} × ${formatLength(plan.room.widthCm, plan.units)}`,
    confidence: plan.room.confidence,
    source: planSource(plan.room.source),
  })
  for (const o of plan.openings) {
    rows.push({
      key: o.id,
      label: td(`floorPlan.kindShort.${o.kind}`),
      detail: `${td(`floorPlan.wall.${o.wall}`)} · ${formatLength(o.widthCm, plan.units)}`,
      confidence: o.confidence,
      source: planSource(o.source),
    })
  }
  for (const f of plan.features) {
    rows.push({
      key: f.id,
      label: td(`floorPlan.kindShort.${f.kind}`),
      detail: `${td(`floorPlan.wall.${f.wall}`)} · ${formatLength(f.widthCm, plan.units)}`,
      confidence: f.confidence,
      source: planSource(f.source),
    })
  }
  if (plan.island) {
    rows.push({
      key: plan.island.id,
      label: t('maker.plan.island'),
      detail: `${formatLength(plan.island.lengthCm, plan.units)} × ${formatLength(plan.island.widthCm, plan.units)}`,
      confidence: plan.island.confidence,
      source: planSource(plan.island.source),
    })
  }
  if (rows.length === 1) return null
  return (
    <div className="mt-3 rounded border border-slate-200 bg-slate-50/50 p-2">
      <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-slate-500">
        {t('maker.plan.provenance')}
      </p>
      <ul className="space-y-1">
        {rows.map((r) => {
          const confTone = {
            H: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
            M: 'bg-amber-100 text-amber-800 ring-amber-200',
            L: 'bg-rose-100 text-rose-800 ring-rose-200',
          }[r.confidence]
          return (
            <li key={r.key} className="flex items-baseline justify-between gap-2 text-[11px]">
              <span className="font-medium text-slate-800">{r.label}</span>
              <span className="font-mono text-[10px] text-slate-600">{r.detail}</span>
              <span
                className={cn(
                  'rounded px-1.5 font-mono text-[9px] font-bold uppercase ring-1 ring-inset',
                  confTone
                )}
                title={t('maker.confidence').replace('{c}', r.confidence)}
              >
                {r.confidence}
              </span>
              <span
                className={cn(
                  'rounded px-1.5 font-mono text-[9px] font-medium uppercase tracking-wide',
                  SOURCE_TONE[r.source]
                )}
              >
                {td(`maker.source.${r.source}`)}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function TranslatedList({
  label,
  items,
  tone,
}: {
  label: string
  items: TranslatedField[] | undefined
  tone: 'emerald' | 'rose' | 'slate'
}) {
  if (!items || items.length === 0) return null
  const dotTone =
    tone === 'emerald'
      ? 'bg-emerald-500'
      : tone === 'rose'
        ? 'bg-rose-500'
        : 'bg-slate-400'
  return (
    <div className="mt-3 first:mt-0">
      <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="rounded border border-slate-200 bg-slate-50/50 px-2 py-1.5">
            <div className="flex items-baseline gap-2">
              <span className={cn('mt-1 inline-block size-1.5 shrink-0 rounded-full', dotTone)} aria-hidden />
              <span className="text-xs font-medium text-slate-900">{item.trade}</span>
            </div>
            {item.verbatim && (
              <p className="mt-1 ml-3.5 flex items-start gap-1 text-[11px] italic text-slate-500">
                <Quote className="mt-0.5 size-2.5 shrink-0" aria-hidden />
                <span>&ldquo;{item.verbatim}&rdquo;</span>
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
