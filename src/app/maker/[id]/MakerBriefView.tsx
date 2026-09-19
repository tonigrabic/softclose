'use client'

import type { HandoffBundle } from '@/lib/types'
import { MakerDashboardPreview } from '@/components/kitchen-intake/MakerDashboardPreview'

/** Client wrapper so the server page can hand a serialized bundle to the (stateful) dashboard. */
export function MakerBriefView({ bundle, briefId, createdAt }: { bundle: HandoffBundle; briefId: string; createdAt: string }) {
  return (
    <main className="mx-auto max-w-5xl px-5 sm:px-8">
      <p className="pt-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">
        Brief {briefId.slice(0, 8)} · received {new Date(createdAt).toLocaleString('hr-HR')}
      </p>
      <MakerDashboardPreview bundle={bundle} />
    </main>
  )
}
