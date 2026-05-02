'use client'

import { useState } from 'react'
import { ArrowLeft, Check, AlertTriangle, MessageCircle, X, Quote } from 'lucide-react'
import type { HandoffBundle, LeadProfile, TranslatedField } from '@/lib/types'
import type { FloorPlan } from '@/lib/floor-plan'
import { FEATURE_DEFAULTS, OPENING_DEFAULTS, formatLength } from '@/lib/floor-plan'
import { cn } from '@/lib/utils'

type Confidence = 'H' | 'M' | 'L' | null

interface MakerDashboardPreviewProps {
  bundle: HandoffBundle
  onBack: () => void
}

function fmtMoney(n: number): string {
  return n >= 1000 ? `$${Math.round(n / 1000).toLocaleString()}k` : `$${n.toLocaleString()}`
}

function ConfidencePill({ confidence }: { confidence: Confidence }) {
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
      title={`Confidence ${confidence}`}
    >
      {meta.label}
    </span>
  )
}

function SourcePill({ source }: { source: 'homeowner' | 'ai_vision' | 'ai_inferred' | 'maker_catalog' }) {
  const meta = {
    homeowner: { label: 'homeowner', tone: 'bg-slate-100 text-slate-700' },
    ai_vision: { label: 'ai · vision', tone: 'bg-violet-100 text-violet-800' },
    ai_inferred: { label: 'ai · inferred', tone: 'bg-amber-100 text-amber-800' },
    maker_catalog: { label: 'studio catalog', tone: 'bg-emerald-100 text-emerald-800' },
  }[source]
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0 font-mono text-[10px] font-medium uppercase tracking-wide',
        meta.tone
      )}
    >
      {meta.label}
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
  source?: 'homeowner' | 'ai_vision' | 'ai_inferred' | 'maker_catalog'
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

function listFromTrue(obj: Record<string, unknown> | undefined): string | null {
  if (!obj) return null
  const keys = Object.keys(obj).filter((k) => obj[k] === true)
  return keys.length > 0 ? keys.join(', ') : null
}

export function MakerDashboardPreview({ bundle, onBack }: MakerDashboardPreviewProps) {
  const [actionTaken, setActionTaken] = useState<'quote' | 'clarify' | 'decline' | null>(null)
  const profile: LeadProfile = bundle.brief
  const summary = bundle.estimate

  return (
    <div className="-mx-5 mt-2 flex min-h-[80dvh] flex-col bg-slate-100 text-slate-900 sm:-mx-8">
      {/* Demo banner */}
      <div className="border-b border-amber-300 bg-amber-100 px-4 py-2 text-center text-[11px] font-semibold text-amber-900">
        DEMO — this is the maker view of the same brief. The homeowner does not see this surface.
        <button
          type="button"
          onClick={onBack}
          className="ml-3 inline-flex items-center gap-1 rounded border border-amber-400 bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-900 hover:bg-amber-300"
        >
          <ArrowLeft className="size-3 stroke-[2]" aria-hidden />
          Back to homeowner view
        </button>
      </div>

      {/* App-like header */}
      <header className="border-b border-slate-300 bg-white px-5 py-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
              Studio dashboard / Inbound brief
            </p>
            <h1 className="mt-0.5 text-lg font-bold text-slate-900">
              {profile.name ?? 'Anonymous lead'} · Kitchen
            </h1>
            <p className="mt-0.5 font-mono text-[11px] text-slate-500">
              Generated {new Date(bundle.generatedAt).toLocaleString()}
            </p>
          </div>
          <div className="flex items-center gap-2 text-right">
            {profile.contactValue && (
              <span className="font-mono text-[11px] text-slate-600">{profile.contactValue}</span>
            )}
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
                Cost-model estimate
              </h2>
              {summary?.placeholder && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase text-amber-900">
                  Placeholder · v0
                </span>
              )}
            </div>
            {summary ? (
              <>
                <p className="font-mono text-2xl font-bold text-slate-900">
                  {fmtMoney(summary.low)} <span className="text-slate-400">–</span> {fmtMoney(summary.high)}
                </p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600">{summary.basis}</p>
              </>
            ) : (
              <p className="text-sm text-slate-500">No estimate available.</p>
            )}
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
                Quote-ready
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
                Clarify
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
                Decline
              </button>
            </div>
            {actionTaken && (
              <p className="mt-2 font-mono text-[10px] text-slate-500">
                Demo action: {actionTaken} (no-op).
              </p>
            )}
          </section>

          {/* Floor plan */}
          {bundle.floorPlan && (
            <section className="rounded-lg border border-slate-300 bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Schematic
                </h2>
                <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                  {bundle.floorPlan.plan.measurementMethod.replace(/_/g, ' ')}
                </span>
              </div>
              <div
                className="overflow-hidden rounded border border-slate-200 bg-white"
                dangerouslySetInnerHTML={{ __html: bundle.floorPlan.svg }}
              />
              <PlanProvenanceList plan={bundle.floorPlan.plan} />
              <p className="mt-2 font-mono text-[10px] text-slate-500">
                {bundle.floorPlan.disclaimer}
              </p>
            </section>
          )}

          {/* Spec — main brief */}
          <section className="rounded-lg border border-slate-300 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-700">
              Spec
            </h2>
            <dl>
              <FieldRow
                label="Project type"
                value={profile.projectType}
                confidence="H"
                source="homeowner"
              />
              <FieldRow label="Timeline" value={profile.timeline} confidence="H" source="homeowner" />
              <FieldRow
                label="Budget band"
                value={profile.budgetRange ?? (profile.budgetShared === false ? 'Prefer not to say' : null)}
                confidence={profile.budgetShared === false ? 'L' : 'H'}
                source="homeowner"
              />

              <FieldRow
                label="Layout shape"
                value={profile.layoutShape ?? profile.spaceVisionResult?.layoutShape}
                confidence={profile.layoutShape ? 'H' : 'M'}
                source={profile.layoutShape ? 'homeowner' : 'ai_vision'}
              />
              <FieldRow
                label="Island"
                value={
                  profile.hasIsland === undefined
                    ? null
                    : profile.hasIsland
                      ? 'Yes'
                      : 'No'
                }
                confidence={profile.hasIsland !== undefined ? 'H' : 'M'}
                source="homeowner"
              />
              <FieldRow
                label="Length × width"
                value={
                  profile.spaceLengthCm && profile.spaceWidthCm
                    ? `${profile.spaceLengthCm} × ${profile.spaceWidthCm} cm`
                    : null
                }
                confidence="L"
                source="ai_vision"
              />

              <FieldRow
                label="Style"
                value={profile.stylePreferences?.join(', ')}
                confidence="H"
                source="homeowner"
              />
              <FieldRow
                label="Door material"
                value={profile.doorMaterial}
                confidence="H"
                source="homeowner"
              />
              <FieldRow
                label="Cab construction"
                value={profile.cabinetConstruction}
                confidence="M"
                source="homeowner"
              />
              <FieldRow
                label="Worktop"
                value={profile.worktopPreference}
                confidence="H"
                source="homeowner"
              />
              <FieldRow
                label="Backsplash"
                value={profile.backsplashPreference}
                confidence="M"
                source="homeowner"
              />
              <FieldRow
                label="Hardware tier"
                value={profile.hardwareTier}
                confidence="H"
                source="homeowner"
              />
              <FieldRow
                label="Hardware brand"
                value={profile.hardwareBrand}
                confidence="M"
                source="homeowner"
              />
              <FieldRow
                label="Specialty cabs"
                value={profile.specialtyCabinets?.join(', ')}
                confidence="H"
                source="homeowner"
              />
              <FieldRow
                label="Appliances"
                value={profile.appliancesIntegrated}
                confidence="H"
                source="homeowner"
              />

              <FieldRow
                label="Scope"
                value={listFromTrue(profile.scope as Record<string, unknown>)}
                confidence="H"
                source="homeowner"
              />
              <FieldRow
                label="Structural"
                value={listFromTrue(profile.structural as Record<string, unknown>)}
                confidence="M"
                source="homeowner"
              />
              <FieldRow
                label="Wall load-bearing"
                value={profile.structural?.wallLoadBearing}
                confidence={profile.structural?.wallLoadBearing === 'unsure' ? 'L' : 'M'}
                source="homeowner"
              />

              <FieldRow
                label="Plumbing"
                value={profile.trades?.plumbing?.sinkPosition}
                confidence="M"
                source="homeowner"
              />
              <FieldRow
                label="Cooker type"
                value={profile.trades?.electrical?.cookerType}
                confidence="H"
                source="homeowner"
              />
              <FieldRow
                label="Gas available"
                value={profile.trades?.gas?.available}
                confidence="M"
                source="homeowner"
              />
              <FieldRow
                label="Vent path"
                value={profile.trades?.ventilation?.desiredPath}
                confidence="M"
                source="homeowner"
              />

              <FieldRow
                label="Lighting layers"
                value={
                  [
                    profile.lighting?.taskLayer && 'task',
                    profile.lighting?.ambientLayer && 'ambient',
                    profile.lighting?.accentLayer && 'accent',
                  ]
                    .filter(Boolean)
                    .join(', ') || null
                }
                confidence="H"
                source="homeowner"
              />
              <FieldRow
                label="Smart controls"
                value={
                  profile.lighting?.smartControls === undefined
                    ? null
                    : profile.lighting.smartControls
                      ? 'Yes'
                      : 'No'
                }
                confidence="H"
                source="homeowner"
              />

              <FieldRow
                label="Site access"
                value={profile.logistics?.siteAccess}
                confidence="H"
                source="homeowner"
              />
              <FieldRow
                label="Living plan"
                value={profile.logistics?.livingDuringBuild}
                confidence="H"
                source="homeowner"
              />
              <FieldRow
                label="Phasing"
                value={profile.logistics?.phasing}
                confidence="M"
                source="homeowner"
              />
              <FieldRow
                label="Permits"
                value={profile.logistics?.permits}
                confidence="L"
                source="homeowner"
              />
            </dl>
          </section>

          {/* Translated wishlist with provenance */}
          {(profile.mustHaves?.length || profile.niceToHaves?.length || profile.dealBreakers?.length) && (
            <section className="rounded-lg border border-slate-300 bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Wishlist
                </h2>
                <span className="font-mono text-[10px] text-slate-500">
                  Trade capture · verbatim original
                </span>
              </div>
              <TranslatedList label="Must-haves" items={profile.mustHaves} tone="emerald" />
              <TranslatedList label="Nice-to-haves" items={profile.niceToHaves} tone="slate" />
              <TranslatedList label="Deal-breakers" items={profile.dealBreakers} tone="rose" />
              {profile.applianceNotes && (
                <TranslatedList label="Appliance notes" items={[profile.applianceNotes]} tone="slate" />
              )}
              {profile.additionalNotes && (
                <TranslatedList label="Additional" items={[profile.additionalNotes]} tone="slate" />
              )}
            </section>
          )}

          {/* Decision confidence */}
          {profile.decisionConfidence && Object.keys(profile.decisionConfidence).length > 0 && (
            <section className="rounded-lg border border-slate-300 bg-white p-4 shadow-sm">
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-700">
                Decision confidence map
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
                      <p className="font-mono text-[10px] uppercase tracking-wider">{cat}</p>
                      <p className="text-xs font-bold uppercase">{val}</p>
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
                  Concept render
                </h2>
                <span className="rounded bg-amber-500 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase text-white">
                  conceptOnly
                </span>
              </div>
              <div className="overflow-hidden rounded border border-amber-300 bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={bundle.chosenRender.imageDataUrl}
                  alt="AI concept render"
                  className="h-auto w-full"
                />
              </div>
              <div className="mt-2 space-y-1.5">
                <p className="flex items-start gap-1 font-mono text-[10px] leading-relaxed text-slate-700">
                  <AlertTriangle className="mt-0.5 size-3 shrink-0 text-amber-700" aria-hidden />
                  Homeowner direction, not binding spec. Treat as reference for the maker conversation.
                </p>

                {bundle.chosenRender.inputs && bundle.chosenRender.inputs.length > 0 && (
                  <div className="rounded border border-slate-300 bg-white p-2">
                    <p className="mb-1.5 font-mono text-[10px] font-semibold uppercase text-slate-600">
                      Render inputs ({bundle.chosenRender.inputs.length})
                    </p>
                    <p className="mb-2 font-mono text-[10px] leading-snug text-slate-500">
                      The actual photos the homeowner pointed at. The render above is AI; these are the real references.
                    </p>
                    <div className="space-y-2">
                      {(['anchor', 'previous_render', 'style', 'product'] as const).map((role) => {
                        const items = bundle.chosenRender!.inputs.filter((i) => i.role === role)
                        if (items.length === 0) return null
                        const heading = {
                          anchor: 'Existing kitchen (anchor)',
                          previous_render: 'Iterated from prior render',
                          style: 'Style references',
                          product: 'Specific items',
                        }[role]
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
                    Prompt + nudges that shaped this
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap font-mono text-[10px] text-slate-700">
                    {bundle.chosenRender.prompt}
                  </p>
                  {bundle.chosenRender.nudges.length > 0 && (
                    <p className="mt-2 font-mono text-[10px] text-slate-500">
                      Chip iterations: {bundle.chosenRender.nudges.join(', ')}
                    </p>
                  )}
                  {bundle.chosenRender.freeTextNudge && (
                    <p className="mt-2 font-mono text-[10px] text-slate-500">
                      Final free-text adjustment: &ldquo;{bundle.chosenRender.freeTextNudge}&rdquo;
                    </p>
                  )}
                  <p className="mt-2 font-mono text-[10px] text-slate-500">
                    Model: {bundle.chosenRender.modelVersion}
                  </p>
                </details>
              </div>
            </section>
          )}

          {/* Vision summary */}
          {profile.spaceVisionResult && (
            <section className="rounded-lg border border-slate-300 bg-white p-4 shadow-sm">
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-700">
                AI vision read
              </h2>
              {profile.spaceVisionResult.summary && (
                <p className="mb-2 text-xs italic text-slate-700">
                  &ldquo;{profile.spaceVisionResult.summary}&rdquo;
                </p>
              )}
              {profile.spaceVisionResult.styleHints && profile.spaceVisionResult.styleHints.length > 0 && (
                <div className="mb-2">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                    Style hints
                  </p>
                  <p className="text-xs text-slate-800">
                    {profile.spaceVisionResult.styleHints.join(' · ')}
                  </p>
                </div>
              )}
              {profile.spaceVisionResult.materialHints && profile.spaceVisionResult.materialHints.length > 0 && (
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                    Material hints
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
                Mood board ({bundle.moodBoard.length})
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
                  Includes studio catalog picks (mapped to vendor SKUs).
                </p>
              )}
            </section>
          )}

          {/* Transcript collapsed */}
          <section className="rounded-lg border border-slate-300 bg-white p-4 shadow-sm">
            <details>
              <summary className="cursor-pointer font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                Conversation transcript ({bundle.transcript.length} turns)
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
                      {turn.role}
                    </p>
                    <p className="mt-0.5 text-slate-800">{turn.content}</p>
                    {turn.images && turn.images.length > 0 && (
                      <p className="mt-0.5 font-mono text-[10px] text-slate-500">
                        +{turn.images.length} image{turn.images.length > 1 ? 's' : ''}
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
  type Row = {
    key: string
    label: string
    detail: string
    confidence: 'H' | 'M' | 'L'
    source: 'homeowner' | 'ai_vision' | 'inferred' | 'preset'
  }
  const rows: Row[] = []
  rows.push({
    key: 'room',
    label: 'Room',
    detail: `${formatLength(plan.room.lengthCm, plan.units)} × ${formatLength(plan.room.widthCm, plan.units)}`,
    confidence: plan.room.confidence,
    source: plan.room.source,
  })
  for (const o of plan.openings) {
    rows.push({
      key: o.id,
      label: OPENING_DEFAULTS[o.kind].label,
      detail: `${o.wall} · ${formatLength(o.widthCm, plan.units)}`,
      confidence: o.confidence,
      source: o.source,
    })
  }
  for (const f of plan.features) {
    rows.push({
      key: f.id,
      label: FEATURE_DEFAULTS[f.kind].label,
      detail: `${f.wall} · ${formatLength(f.widthCm, plan.units)}`,
      confidence: f.confidence,
      source: f.source,
    })
  }
  if (plan.island) {
    rows.push({
      key: plan.island.id,
      label: 'Island',
      detail: `${formatLength(plan.island.lengthCm, plan.units)} × ${formatLength(plan.island.widthCm, plan.units)}`,
      confidence: plan.island.confidence,
      source: plan.island.source,
    })
  }
  if (rows.length === 1) return null
  return (
    <div className="mt-3 rounded border border-slate-200 bg-slate-50/50 p-2">
      <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-slate-500">
        Per-element provenance
      </p>
      <ul className="space-y-1">
        {rows.map((r) => {
          const sourceMeta = {
            homeowner: { label: 'homeowner', tone: 'bg-slate-200 text-slate-800' },
            ai_vision: { label: 'ai · vision', tone: 'bg-violet-100 text-violet-800' },
            inferred: { label: 'ai · inferred', tone: 'bg-amber-100 text-amber-800' },
            preset: { label: 'preset', tone: 'bg-blue-100 text-blue-800' },
          }[r.source]
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
                title={`Confidence ${r.confidence}`}
              >
                {r.confidence}
              </span>
              <span
                className={cn(
                  'rounded px-1.5 font-mono text-[9px] font-medium uppercase tracking-wide',
                  sourceMeta.tone
                )}
              >
                {sourceMeta.label}
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
