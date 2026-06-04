/**
 * Builder test harness (dev route).
 *
 * Pick a contract fixture; the builder is rendered **purely from that contract**
 * (hypothesis = null), so we can see exactly what each layout produces — runs,
 * corners, appliances, cabinet sections, price range — and catch screens that
 * aren't yet contract-driven. Add a case in `src/lib/builder/fixtures.ts`.
 */
'use client'

import { useMemo, useState } from 'react'
import { BuilderShell } from '@/components/builder/BuilderShell'
import { floorPlanToLayout } from '@/lib/contract/layout-contract'
import { renderFloorPlanSvg } from '@/lib/floor-plan'
import { CONTRACT_FIXTURES, fixtureById } from '@/lib/builder/fixtures'

export default function BuilderHarness() {
  const [fixtureId, setFixtureId] = useState(CONTRACT_FIXTURES[0].id)
  const fixture = fixtureById(fixtureId)

  const { contract, svg } = useMemo(() => {
    const plan = fixture.build()
    return { contract: floorPlanToLayout(plan), svg: renderFloorPlanSvg(plan, { mode: 'maker' }) }
  }, [fixture])

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      {/* ── Harness bar ───────────────────────────────────────────────── */}
      <div className="sticky top-0 z-40 border-b border-border bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-[88rem] flex-col gap-3 px-6 py-3">
          <div className="flex items-center gap-3">
            <span className="rounded-md bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
              Builder harness
            </span>
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
          </div>

          {/* Derived-contract readout */}
          <div className="flex flex-wrap items-start gap-4 text-[11px] text-muted-foreground">
            <div
              className="h-20 w-28 shrink-0 overflow-hidden rounded-md border border-border bg-background"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
            <dl className="flex flex-wrap gap-x-6 gap-y-1">
              <div>
                <dt className="font-semibold uppercase tracking-wider text-muted-foreground/70">Shape</dt>
                <dd className="text-foreground">{contract.shape}{contract.hasIsland ? ' · island' : ''}</dd>
              </div>
              <div>
                <dt className="font-semibold uppercase tracking-wider text-muted-foreground/70">Runs</dt>
                <dd className="text-foreground">
                  {contract.runs
                    .map((r) => `${r.id} ${r.lengthCm}cm${r.hasCorner ? ' ⌐' : ''}`)
                    .join(' · ')}
                </dd>
              </div>
              <div>
                <dt className="font-semibold uppercase tracking-wider text-muted-foreground/70">Corners</dt>
                <dd className="text-foreground">
                  {contract.corners.length
                    ? contract.corners.map((c) => `${c.runA}+${c.runB}`).join(', ')
                    : 'none'}
                </dd>
              </div>
              <div>
                <dt className="font-semibold uppercase tracking-wider text-muted-foreground/70">Appliances</dt>
                <dd className="text-foreground">
                  {contract.appliances.length
                    ? contract.appliances
                        .map((a) => `${a.kind}@${a.runId} ${Math.round(a.positionPctAlongRun)}%`)
                        .join(' · ')
                    : 'none'}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      {/* ── Builder, rendered purely from the contract ────────────────── */}
      <BuilderShell
        key={fixture.id}
        layoutContract={contract}
        hypothesis={null}
        layoutSummary={fixture.label}
        locale="hr-HR"
        onComplete={(state) => console.log('Builder complete', state)}
      />
    </div>
  )
}
