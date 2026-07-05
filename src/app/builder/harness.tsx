/**
 * Builder test harness (dev-only).
 *
 * Not a product route — the builder is reached through the funnel (`/`) as Act 2
 * of the journey. This harness is gated to development in `page.tsx` (404 in
 * production) so there's a single product entry point.
 *
 * Three ways to seed the builder, no funnel replay needed:
 *  1. Contract fixture (l/u/galley/island/…) — `src/lib/builder/fixtures.ts`.
 *  2. × Hypothesis fixture (none/decor/tall-tower/patterns/low-confidence) —
 *     `src/lib/builder/hypothesis-fixtures.ts`, built against the picked
 *     contract so run ids always match.
 *  3. Import a real session JSON — either a raw LeadProfile or
 *     `{ profile, hypothesis?, builderState? }` (the handoff bundle shape);
 *     passing builderState exercises resume/relock.
 *
 * The fixture picker is a floating, collapsible panel so it never overlaps the
 * real app chrome — it's a dev tool, not part of the product.
 */
'use client'

import { useMemo, useRef, useState } from 'react'
import { FlaskConical, X } from 'lucide-react'
import { BuilderShell } from '@/components/builder/BuilderShell'
import { floorPlanToLayout, type LayoutContract } from '@/lib/contract/layout-contract'
import { planFromProfile, renderFloorPlanSvg, validate } from '@/lib/floor-plan'
import { CONTRACT_FIXTURES, fixtureById } from '@/lib/builder/fixtures'
import {
  HYPOTHESIS_FIXTURES,
  hypothesisFixtureById,
} from '@/lib/builder/hypothesis-fixtures'
import type { BuilderHypothesis } from '@/lib/builder/hypothesis'
import type { BuilderState } from '@/lib/builder/inventory'
import type { LeadProfile } from '@/lib/types'

interface ImportedSession {
  label: string
  contract: LayoutContract
  hypothesis: BuilderHypothesis | null
  savedState?: BuilderState
}

export function BuilderHarness() {
  const [fixtureId, setFixtureId] = useState(CONTRACT_FIXTURES[0].id)
  const [hypId, setHypId] = useState(HYPOTHESIS_FIXTURES[0].id)
  const [open, setOpen] = useState(false)
  const [imported, setImported] = useState<ImportedSession | null>(null)
  const [importNonce, setImportNonce] = useState(0)
  const [importError, setImportError] = useState<string | null>(null)
  const pasteRef = useRef<HTMLTextAreaElement>(null)
  const fixture = fixtureById(fixtureId)
  const hypFixture = hypothesisFixtureById(hypId)

  const { contract, hypothesis, savedState, svg, summaryLabel } = useMemo(() => {
    if (imported) {
      return {
        contract: imported.contract,
        hypothesis: imported.hypothesis,
        savedState: imported.savedState,
        svg: null,
        summaryLabel: imported.label,
      }
    }
    const plan = fixture.build()
    const c = floorPlanToLayout(plan)
    return {
      contract: c,
      hypothesis: hypFixture.build(c),
      savedState: undefined,
      // includeDataAttrs:false → no random element ids, so SSR/client match.
      svg: renderFloorPlanSvg(plan, { mode: 'maker', includeDataAttrs: false }),
      summaryLabel: fixture.label,
    }
  }, [fixture, hypFixture, imported])

  /** Accepts a raw LeadProfile or { profile, hypothesis?, builderState? }. */
  function importSession(raw: string) {
    try {
      const parsed = JSON.parse(raw) as
        | LeadProfile
        | { profile: LeadProfile; hypothesis?: BuilderHypothesis; builderState?: BuilderState }
      const isBundle = typeof parsed === 'object' && parsed !== null && 'profile' in parsed
      const profile = (isBundle ? parsed.profile : parsed) as LeadProfile
      const plan = planFromProfile(profile)
      if (!plan) throw new Error('No floor plan derivable from this profile (missing floorPlan/layoutShape).')
      const contract = floorPlanToLayout(validate(plan))
      const bundle = isBundle
        ? (parsed as { hypothesis?: BuilderHypothesis; builderState?: BuilderState })
        : {}
      setImported({
        label: `imported · ${contract.shape}`,
        contract,
        hypothesis: bundle.hypothesis ?? null,
        savedState: bundle.builderState ?? (profile.builderState as BuilderState | undefined),
      })
      setImportError(null)
      setImportNonce((n) => n + 1)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Could not parse that JSON.')
    }
  }

  return (
    <>
      {/* The real app, rendered purely from the selected contract (+hypothesis). */}
      <BuilderShell
        key={`${imported ? `import-${importNonce}` : `${fixture.id}·${hypFixture.id}`}`}
        layoutContract={contract}
        hypothesis={hypothesis}
        savedState={savedState}
        layoutSummary={summaryLabel}
        onComplete={(state) => console.log('Builder complete', state)}
      />

      {/* ── Floating, collapsible dev harness (never overlaps the app) ──── */}
      {open ? (
        // bottom-14, not bottom-4 — the MOCK AI badge owns the corner below.
        <div className="fixed bottom-14 right-4 z-[60] flex max-h-[80vh] w-80 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
              <FlaskConical className="size-3.5 stroke-[2.5]" aria-hidden />
              Builder harness
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              aria-label="Hide harness"
            >
              <X className="size-3.5 stroke-[2]" aria-hidden />
            </button>
          </div>

          <div className="flex flex-col gap-3 overflow-y-auto p-3">
            {imported ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/40 bg-primary/5 px-2.5 py-1.5 text-[11px]">
                <span className="font-medium text-foreground">{imported.label}</span>
                <button
                  type="button"
                  onClick={() => {
                    setImported(null)
                    setImportError(null)
                  }}
                  className="font-semibold text-muted-foreground hover:text-foreground"
                >
                  Clear import
                </button>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {CONTRACT_FIXTURES.map((f) => (
                    <Chip
                      key={f.id}
                      label={f.label}
                      title={f.description}
                      active={f.id === fixtureId}
                      onClick={() => setFixtureId(f.id)}
                    />
                  ))}
                </div>
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    Hypothesis
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {HYPOTHESIS_FIXTURES.map((h) => (
                      <Chip
                        key={h.id}
                        label={h.label}
                        title={h.description}
                        active={h.id === hypId}
                        onClick={() => setHypId(h.id)}
                      />
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Import a real session (LeadProfile or {profile,hypothesis,builderState}). */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                Import session JSON
              </p>
              <textarea
                ref={pasteRef}
                rows={3}
                placeholder='Paste a LeadProfile or {"profile": …} bundle'
                className="w-full rounded-lg border border-border bg-background p-2 font-mono text-[10px] text-foreground placeholder:text-muted-foreground/50 focus:border-primary/60 focus:outline-none"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => pasteRef.current?.value && importSession(pasteRef.current.value)}
                  className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                >
                  Load pasted
                </button>
                <label className="cursor-pointer rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground">
                  Load file…
                  <input
                    type="file"
                    accept=".json,application/json"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      void file.text().then(importSession)
                      e.target.value = ''
                    }}
                  />
                </label>
              </div>
              {importError && <p className="text-[10.5px] text-destructive">{importError}</p>}
            </div>

            {/* Derived-contract readout */}
            <div className="space-y-2 text-[11px] text-muted-foreground">
              {svg && (
                <div
                  className="h-24 w-full overflow-hidden rounded-md border border-border bg-background"
                  dangerouslySetInnerHTML={{ __html: svg }}
                />
              )}
              <dl className="space-y-1">
                <Row label="Shape">
                  {contract.shape}
                  {contract.hasIsland ? ' · island' : ''}
                </Row>
                <Row label="Runs">
                  {contract.runs.map((r) => `${r.id} ${r.lengthCm}cm${r.hasCorner ? ' ⌐' : ''}`).join(' · ')}
                </Row>
                <Row label="Corners">
                  {contract.corners.length
                    ? contract.corners.map((c) => `${c.runA}+${c.runB}`).join(', ')
                    : 'none'}
                </Row>
                <Row label="Appliances">
                  {contract.appliances.length
                    ? contract.appliances
                        .map((a) => `${a.kind}@${a.runId} ${Math.round(a.positionPctAlongRun)}%`)
                        .join(' · ')
                    : 'none'}
                </Row>
              </dl>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-14 right-4 z-[60] inline-flex items-center gap-1.5 rounded-full border border-border bg-card/95 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground shadow-lg backdrop-blur hover:text-foreground"
        >
          <FlaskConical className="size-3.5 stroke-[2.5]" aria-hidden />
          {imported ? imported.label : `${fixture.label} · ${hypFixture.label}`}
        </button>
      )}
    </>
  )
}

function Chip({
  label,
  title,
  active,
  onClick,
}: {
  label: string
  title: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={
        'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ' +
        (active
          ? 'border-primary bg-primary/10 text-foreground'
          : 'border-border bg-card text-muted-foreground hover:text-foreground')
      }
    >
      {label}
    </button>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-semibold uppercase tracking-wider text-muted-foreground/70">{label}</dt>
      <dd className="break-words text-foreground">{children}</dd>
    </div>
  )
}
