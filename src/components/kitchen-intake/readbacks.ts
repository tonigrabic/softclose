import type { LeadProfile } from '@/lib/types'
import type { FlowStepId } from '@/lib/flow'
import { tDynamic, DEFAULT_LOCALE, type Locale } from '@/lib/i18n'

/**
 * Short captured-value summary shown under a completed funnel step in the
 * journey rail (status visibility is a P0 design constraint). Pure function —
 * no React; the rail passes the active locale through.
 */
export function readbackFor(
  stepId: FlowStepId,
  p: LeadProfile,
  locale: Locale = DEFAULT_LOCALE
): string | null {
  const td = (key: string) => tDynamic(key, locale)
  switch (stepId) {
    case 'space_photos': {
      const n = p.spacePhotos?.length ?? 0
      if (n === 0) return null
      const photos = td('readback.photos').replace('{n}', String(n))
      const layout = p.layoutShape ?? p.spaceVisionResult?.layoutShape
      return layout && layout !== 'unsure' ? `${photos} · ${td(`layout.shape.${layout}`)}` : photos
    }
    case 'inspiration': {
      const styles = p.stylePreferences ?? []
      if (styles.length === 0) return null
      return styles.map((s) => s.replace(/_/g, ' ')).join(', ')
    }
    case 'concept_render': {
      if (!p.conceptRenderChosenId) return null
      return td('readback.renderChosen')
    }
    case 'confirm_look': {
      // The contract is layout, not decor: report the shape + footprint we locked.
      const fp = p.floorPlan
      const shape = fp?.layoutShape ?? p.layoutShape
      const dims = fp ? `${Math.round(fp.room.lengthCm)}×${Math.round(fp.room.widthCm)} cm` : null
      const parts = [
        shape && shape !== 'unsure' ? td(`layout.shape.${shape}`) : null,
        dims,
      ].filter(Boolean) as string[]
      return parts.length > 0 ? parts.join(' · ') : null
    }
    case 'builder': {
      return p.builderState ? td('readback.built') : null
    }
    case 'scope': {
      const trueKeys = Object.entries(p.scope ?? {})
        .filter(([, v]) => v === true)
        .map(([k]) => k)
      if (trueKeys.length === 0) return null
      return td('readback.scopeItems').replace('{n}', String(trueKeys.length))
    }
    case 'wishlist': {
      const total =
        (p.mustHaves?.length ?? 0) +
        (p.niceToHaves?.length ?? 0) +
        (p.dealBreakers?.length ?? 0)
      if (total === 0) return null
      return td('readback.wishlistItems').replace('{n}', String(total))
    }
    case 'logistics': {
      const parts = [
        p.timeline ? td(`option.timeline.${p.timeline}`) : null,
        p.logistics?.siteAccess ? td(`option.siteAccess.${p.logistics.siteAccess}`) : null,
        p.logistics?.livingDuringBuild
          ? td(`option.living.${p.logistics.livingDuringBuild}`)
          : null,
      ].filter(Boolean)
      return parts.length > 0 ? parts.join(' · ') : null
    }
    case 'contact': {
      if (!p.name && !p.contactValue) return null
      return [p.name, p.contactValue].filter(Boolean).join(' · ')
    }
  }
}
