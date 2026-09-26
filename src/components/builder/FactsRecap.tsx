'use client'

import { Sparkles } from 'lucide-react'
import { useTranslations, tDynamic, type Locale } from '@/lib/i18n'
import type { BuilderHypothesis } from '@/lib/builder/hypothesis'

/**
 * Compact recap of high-confidence Phase-1 facts. Shown on the first Builder
 * step (Cabinet Boxes) so the homeowner sees what the AI already locked in
 * before they start refining.
 */
export function FactsRecap({ hypothesis }: { hypothesis: BuilderHypothesis | null }) {
  const { t, locale } = useTranslations()
  if (!hypothesis) return null
  const facts = collectFacts(hypothesis, locale)
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

function collectFacts(h: BuilderHypothesis, locale: Locale): string[] {
  const out: string[] = []
  const tr = (key: string) => tDynamic(key, locale)

  // Layout summary — shape + total run length when high confidence.
  if (h.layout?.shape && h.layout.shape.confidence !== 'L') {
    const totalCm = (h.layout.runs ?? []).reduce((s, r) => s + r.lengthCm.value, 0)
    const shape = tr(`layout.shape.${h.layout.shape.value}`)
    out.push(
      totalCm > 0 ? tr('facts.shapeTotal').replace('{shape}', shape).replace('{cm}', String(totalCm)) : shape
    )
  }

  // Doors style + decor.
  if (h.doors?.style && h.doors.style.confidence !== 'L') {
    const decor = h.doors.colorDescription ?? h.doors.decorCode?.value
    const style = tr(`doors.style.${h.doors.style.value}`)
    out.push(decor ? `${style} · ${decor}` : style)
  }

  // Worktop family.
  if (h.worktop?.family && h.worktop.family.confidence !== 'L') {
    out.push(tr('facts.worktop').replace('{v}', tr(`worktop.family.${h.worktop.family.value}`)))
  }

  // Window on a run — strong layout constraint.
  if (h.features?.windowOnRun) {
    const w = h.features.windowOnRun
    // Run ids are wall sides ("top"); anything else is shown as-is.
    const wallKey = `floorPlan.wall.${w.runId}.on`
    const wall = tr(wallKey) === wallKey ? w.runId : tr(wallKey)
    const where = tr('facts.windowOn').replace('{wall}', wall)
    out.push(w.widthCm ? `${where} · ${w.widthCm.value} cm` : where)
  }

  // Visible appliances.
  const ap = h.appliances
  const appliances: string[] = []
  if (ap?.fridge?.present?.value) {
    appliances.push(tr(ap.fridge.integrated?.value ? 'facts.fridgeIntegrated' : 'facts.fridge'))
  }
  if (ap?.dishwasher?.present?.value) {
    appliances.push(tr(ap.dishwasher.integrated?.value ? 'facts.dishwasherIntegrated' : 'facts.dishwasher'))
  }
  if (ap?.hob && ap.hob.confidence !== 'L' && ap.hob.value !== 'unknown') {
    appliances.push(tr('facts.hob').replace('{v}', tr(`appliances.hob.${ap.hob.value}`).toLowerCase()))
  }
  if (appliances.length > 0) out.push(appliances.join(' + '))

  if (h.features?.tallPantry?.present?.value) out.push(tr('facts.tallPantry'))
  if (h.features?.corniceVisible?.value) out.push(tr('facts.cornice'))
  if (h.features?.openShelving?.value) out.push(tr('facts.openShelving'))
  if (h.features?.floorColorHint) out.push(h.features.floorColorHint)

  return out.slice(0, 5)
}
