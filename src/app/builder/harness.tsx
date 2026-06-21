/**
 * Builder test harness (dev-only).
 *
 * Not a product route — the builder is reached through the funnel (`/`) as Act 2
 * of the journey. This harness is gated to development in `page.tsx` (404 in
 * production) so there's a single product entry point.
 *
 * Pick a contract fixture; the builder is rendered **purely from that contract**
 * (hypothesis = null), so we can see exactly what each layout produces — runs,
 * corners, appliances, cabinet sections, price range — and catch screens that
 * aren't yet contract-driven. Add a case in `src/lib/builder/fixtures.ts`.
 *
 * The fixture picker is a floating, collapsible panel so it never overlaps the
 * real app chrome — it's a dev tool, not part of the product.
 */
'use client'

import { useMemo, useState } from 'react'
import { FlaskConical, X } from 'lucide-react'
import { BuilderShell } from '@/components/builder/BuilderShell'
import { floorPlanToLayout } from '@/lib/contract/layout-contract'
import { renderFloorPlanSvg } from '@/lib/floor-plan'
import { CONTRACT_FIXTURES, fixtureById } from '@/lib/builder/fixtures'

export function BuilderHarness() {
  const [fixtureId, setFixtureId] = useState(CONTRACT_FIXTURES[0].id)
  const [open, setOpen] = useState(false)
  const fixture = fixtureById(fixtureId)

  const { contract, svg } = useMemo(() => {
    const plan = fixture.build()
    return {
      contract: floorPlanToLayout(plan),
      // includeDataAttrs:false → no random element ids, so SSR/client match.
      svg: renderFloorPlanSvg(plan, { mode: 'maker', includeDataAttrs: false }),
    }
  }, [fixture])

  return (
    <>
      {/* The real app, rendered purely from the selected contract. */}
      <BuilderShell
        key={fixture.id}
        layoutContract={contract}
        hypothesis={null}
        layoutSummary={fixture.label}
        onComplete={(state) => console.log('Builder complete', state)}
      />

      {/* ── Floating, collapsible dev harness (never overlaps the app) ──── */}
      {open ? (
        <div className="fixed bottom-4 right-4 z-[60] flex max-h-[80vh] w-80 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
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
            <div className="flex flex-wrap gap-1.5">
              {CONTRACT_FIXTURES.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFixtureId(f.id)}
                  title={f.description}
                  className={
                    'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ' +
                    (f.id === fixtureId
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border bg-card text-muted-foreground hover:text-foreground')
                  }
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Derived-contract readout */}
            <div className="space-y-2 text-[11px] text-muted-foreground">
              <div
                className="h-24 w-full overflow-hidden rounded-md border border-border bg-background"
                dangerouslySetInnerHTML={{ __html: svg }}
              />
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
          className="fixed bottom-4 right-4 z-[60] inline-flex items-center gap-1.5 rounded-full border border-border bg-card/95 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground shadow-lg backdrop-blur hover:text-foreground"
        >
          <FlaskConical className="size-3.5 stroke-[2.5]" aria-hidden />
          {fixture.label}
        </button>
      )}
    </>
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
