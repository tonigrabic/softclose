'use client'

import { Sparkles } from 'lucide-react'
import { useTranslations } from '@/lib/i18n'
import type { BuilderHypothesis } from '@/lib/builder/hypothesis'

/**
 * Compact recap of high-confidence Phase-1 facts. Shown on the first Builder
 * step (Cabinet Boxes) so the homeowner sees what the AI already locked in
 * before they start refining.
 */
export function FactsRecap({ hypothesis }: { hypothesis: BuilderHypothesis | null }) {
  const { t } = useTranslations()
  if (!hypothesis) return null
  const facts = collectFacts(hypothesis)
  if (facts.length === 0) return null

  return (
    <section className="space-y-2 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
      <header className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary/80">
        <Sparkles className="size-3 stroke-[2.5]" aria-hidden />
        {t('builder.shell.factsRecap.title')}
      </header>
      <ul className="flex flex-wrap gap-1.5">
        {facts.map((f, i) => (
          <li
            key={i}
            className="rounded-full border border-primary/20 bg-background px-2.5 py-1 text-[11px] text-foreground"
          >
            {f}
          </li>
        ))}
      </ul>
    </section>
  )
}

function collectFacts(h: BuilderHypothesis): string[] {
  const out: string[] = []

  // Layout summary — shape + total run length when high confidence.
  if (h.layout?.shape && h.layout.shape.confidence !== 'L') {
    const totalCm = (h.layout.runs ?? []).reduce((s, r) => s + r.lengthCm.value, 0)
    out.push(
      totalCm > 0
        ? `${shapeLabel(h.layout.shape.value)} · ${totalCm} cm total`
        : shapeLabel(h.layout.shape.value)
    )
  }

  // Doors style + decor.
  if (h.doors?.style && h.doors.style.confidence !== 'L') {
    const decor = h.doors.colorDescription ?? h.doors.decorCode?.value
    out.push(decor ? `${styleLabel(h.doors.style.value)} · ${decor}` : styleLabel(h.doors.style.value))
  }

  // Worktop family.
  if (h.worktop?.family && h.worktop.family.confidence !== 'L') {
    out.push(`${h.worktop.family.value.replace(/_/g, ' ')} worktop`)
  }

  // Window on a run — strong layout constraint.
  if (h.features?.windowOnRun) {
    const w = h.features.windowOnRun
    out.push(w.widthCm ? `Window on ${w.runId} · ${w.widthCm.value} cm` : `Window on ${w.runId}`)
  }

  // Visible appliances.
  const ap = h.appliances
  const appliances: string[] = []
  if (ap?.fridge?.present?.value) {
    appliances.push(ap.fridge.integrated?.value ? 'integrated fridge' : 'fridge')
  }
  if (ap?.dishwasher?.present?.value) {
    appliances.push(ap.dishwasher.integrated?.value ? 'integrated dishwasher' : 'dishwasher')
  }
  if (ap?.hob && ap.hob.confidence !== 'L' && ap.hob.value !== 'unknown') {
    appliances.push(`${ap.hob.value} hob`)
  }
  if (appliances.length > 0) out.push(appliances.join(' + '))

  if (h.features?.tallPantry?.present?.value) out.push('Tall pantry visible')
  if (h.features?.corniceVisible?.value) out.push('Cornice visible')
  if (h.features?.openShelving?.value) out.push('Open shelving')
  if (h.features?.floorColorHint) out.push(h.features.floorColorHint)

  return out.slice(0, 5)
}

function shapeLabel(s: string): string {
  if (s === 'l_shape') return 'L-shape'
  if (s === 'u_shape') return 'U-shape'
  return s.replace(/_/g, ' ')
}

function styleLabel(s: string): string {
  return s.replace(/_/g, ' ')
}
