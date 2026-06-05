'use client'

import { useTranslations, tDynamic, type Locale } from '@/lib/i18n'
import { BUILDER_GROUPS, type BuilderGroupId, type BuilderState } from '@/lib/builder/inventory'
import { JourneyRail, type RailAct, type RailStatus } from '@/components/JourneyRail'

/**
 * Builder's view of the "Your brief" rail: we're in the Build act, so Capture is
 * done, Close is ahead, and the builder's component groups are Build's steps.
 * (Funnel capture/close steps nest under their acts via FunnelNavRail.)
 */
export function BuilderNavRail({
  currentId,
  onNavigate,
  state,
}: {
  currentId: BuilderGroupId
  onNavigate: (id: BuilderGroupId) => void
  state: BuilderState
}) {
  const { t, locale } = useTranslations()
  const currentOrder = BUILDER_GROUPS.find((g) => g.id === currentId)?.order ?? 0
  const buildDone = Math.max(0, currentOrder - 1)

  const acts: RailAct[] = [
    { id: 'space', num: 1, label: tDynamic('journey.act.space', locale), status: 'done' },
    {
      id: 'build',
      num: 2,
      label: tDynamic('journey.act.build', locale),
      status: 'current',
      count: { done: buildDone, total: BUILDER_GROUPS.length },
      steps: BUILDER_GROUPS.map((g) => {
        const status: RailStatus =
          g.order < currentOrder ? 'done' : g.order === currentOrder ? 'current' : 'todo'
        return {
          id: g.id,
          label: tDynamic(g.labelKey, locale),
          status,
          readback: status === 'done' ? groupReadback(g.id, state, locale) : null,
          onSelect: () => onNavigate(g.id),
        }
      }),
    },
    { id: 'offer', num: 3, label: tDynamic('journey.act.offer', locale), status: 'todo' },
  ]

  return <JourneyRail brief={t('journey.brief')} acts={acts} />
}

/** Short captured-value summary under a completed step (status visibility). */
function groupReadback(id: BuilderGroupId, state: BuilderState, locale: Locale): string | null {
  switch (id) {
    case 'cabinetBoxes':
      return tDynamic(`cabinetBoxes.carcass.${state.cabinetBoxes.carcassMaterial}`, locale)
    case 'doors':
      return tDynamic(`doors.style.${state.doors.style}`, locale)
    case 'worktop':
      return tDynamic(`worktop.family.${state.worktop.family}`, locale)
    case 'backsplash':
      return state.backsplash.kind === 'none'
        ? null
        : tDynamic(`backsplash.kind.${state.backsplash.kind}`, locale)
    case 'hardware':
      return tDynamic(`hardware.tier.${state.hardware.drawerSystemTier}`, locale)
    case 'sinkTaps':
      return tDynamic(`sinkTaps.material.${state.sinkTaps.sink.material}`, locale)
    case 'finishing':
      return tDynamic(`finishing.plinthMaterial.${state.finishing.plinthMaterial}`, locale)
    default:
      return null
  }
}
