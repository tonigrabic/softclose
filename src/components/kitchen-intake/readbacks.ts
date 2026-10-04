import type { LeadProfile } from '@/lib/types'
import type { FlowStepId } from '@/lib/flow'
import { tDynamic, DEFAULT_LOCALE, type Locale } from '@/lib/i18n'
import { contactChannels } from '@/lib/contact'
import { WALL_LETTER, counterWalls, roomStepDone } from '@/lib/floor-plan'

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
      // Photos only: the shape is the room step's, confirmed there.
      return td('readback.photos').replace('{n}', String(n))
    }
    case 'room': {
      // The room as confirmed: shape, each measured wall by its letter.
      const fp = p.existingFloorPlan ?? p.floorPlan
      if (!fp || !roomStepDone(p)) return null
      const shape = fp.layoutShape !== 'unsure' ? td(`layout.shape.${fp.layoutShape}`) : null
      const walls = counterWalls(fp)
        .filter((w) => fp.room.sides[w].measuredLengthCm != null)
        .map((w) => `${WALL_LETTER[w]} ${Math.round(fp.room.sides[w].measuredLengthCm!)}`)
        .join(' · ')
      if (!walls) return null
      return [shape, `${walls} cm`, td('readback.measured')].filter(Boolean).join(' · ')
    }
    case 'inspiration': {
      const styles = p.stylePreferences ?? []
      if (styles.length === 0) return null
      return styles
        .map((s) => {
          const label = td(`style.${s}`)
          return label === `style.${s}` ? s.replace(/_/g, ' ') : label
        })
        .join(', ')
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
      ].filter(Boolean)
      return parts.length > 0 ? parts.join(' · ') : null
    }
    case 'contact': {
      const parts = [p.name, ...contactChannels(p)].filter(Boolean)
      return parts.length > 0 ? parts.join(' · ') : null
    }
  }
}
