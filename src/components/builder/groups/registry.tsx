'use client'

/**
 * Builder screen registry — THE plug-in/plug-out point for builder steps.
 *
 * Every builder screen is one `BuilderGroupModule`: how it renders (`Body`)
 * and how it reads back in the journey rail (`readback`). To ADD a screen:
 *
 *   1. Create its component in this directory.
 *   2. Add its meta (id / labelKey / whyKey / order) to `BUILDER_GROUPS` in
 *      `lib/builder/inventory.ts`, its slice + `patch_<id>` action to the
 *      state types, and the label/why strings to both locales.
 *   3. Register it here. The Record is exhaustive over `BuilderScreenId`, so
 *      the compiler refuses to build until every group has a module.
 *
 * To REMOVE a screen: delete the same entries. Nothing else changes —
 * BuilderShell, the nav rail, the mobile pill, progress, next/prev and the
 * reducer (which accepts any `patch_<groupId>`) are all registry-driven.
 */

import type { ComponentType } from 'react'
import { tDynamic, type Locale } from '@/lib/i18n'
import type { BuilderScreenId, BuilderState } from '@/lib/builder/inventory'
import type { BuilderAction } from '@/lib/builder/state'
import type { BuilderHypothesis } from '@/lib/builder/hypothesis'
import type { LayoutContract } from '@/lib/contract/layout-contract'
import { FactsRecap } from '../FactsRecap'
import { CabinetBoxesGroup } from './CabinetBoxesGroup'
import { DoorsGroup } from './DoorsGroup'
import { HardwareGroup } from './HardwareGroup'
import { WorktopGroup } from './WorktopGroup'
import { BacksplashGroup } from './BacksplashGroup'
import { AppliancesGroup } from './AppliancesGroup'
import { SinkTapsGroup } from './SinkTapsGroup'
import { LightingGroup } from './LightingGroup'
import { FinishingGroup } from './FinishingGroup'

/** Everything a screen may need; each Body adapter picks what it uses. */
export interface GroupBodyProps {
  state: BuilderState
  hypothesis: BuilderHypothesis | null
  layoutContract: LayoutContract
  dispatch: React.Dispatch<BuilderAction>
}

export interface BuilderGroupModule {
  Body: ComponentType<GroupBodyProps>
  /** Captured-value one-liner under the completed step in the nav rail
   * (status visibility, P0). Return null when there's nothing to read back. */
  readback: (state: BuilderState, locale: Locale) => string | null
}

export const GROUP_MODULES: Record<BuilderScreenId, BuilderGroupModule> = {
  cabinetBoxes: {
    Body: ({ state, hypothesis, layoutContract, dispatch }) => (
      <>
        <FactsRecap hypothesis={hypothesis} />
        <CabinetBoxesGroup
          state={state}
          hypothesis={hypothesis}
          layoutContract={layoutContract}
          onPatch={(patch) => dispatch({ type: 'patch_cabinetBoxes', patch })}
        />
      </>
    ),
    readback: (s, locale) => tDynamic(`cabinetBoxes.carcass.${s.cabinetBoxes.carcassMaterial}`, locale),
  },
  doors: {
    Body: ({ state, dispatch }) => (
      <DoorsGroup state={state} onPatch={(patch) => dispatch({ type: 'patch_doors', patch })} />
    ),
    readback: (s, locale) => tDynamic(`doors.style.${s.doors.style}`, locale),
  },
  hardware: {
    Body: ({ state, dispatch }) => (
      <HardwareGroup state={state} onPatch={(patch) => dispatch({ type: 'patch_hardware', patch })} />
    ),
    readback: (s, locale) => tDynamic(`hardware.tier.${s.hardware.drawerSystemTier}`, locale),
  },
  worktop: {
    Body: ({ state, dispatch }) => (
      <WorktopGroup state={state} onPatch={(patch) => dispatch({ type: 'patch_worktop', patch })} />
    ),
    readback: (s, locale) => tDynamic(`worktop.family.${s.worktop.family}`, locale),
  },
  backsplash: {
    Body: ({ state, dispatch }) => (
      <BacksplashGroup state={state} onPatch={(patch) => dispatch({ type: 'patch_backsplash', patch })} />
    ),
    readback: (s, locale) =>
      s.backsplash.kind === 'none' ? null : tDynamic(`backsplash.kind.${s.backsplash.kind}`, locale),
  },
  appliances: {
    Body: ({ state, layoutContract, dispatch }) => (
      <AppliancesGroup
        state={state}
        layoutContract={layoutContract}
        onPatch={(patch) => dispatch({ type: 'patch_appliances', patch })}
      />
    ),
    readback: (s, locale) => {
      const n = s.appliances.selections.length
      return n > 0 ? tDynamic('readback.appliances', locale).replace('{n}', String(n)) : null
    },
  },
  sinkTaps: {
    Body: ({ state, dispatch }) => (
      <SinkTapsGroup state={state} onPatch={(patch) => dispatch({ type: 'patch_sinkTaps', patch })} />
    ),
    readback: (s, locale) => tDynamic(`sinkTaps.material.${s.sinkTaps.sink.material}`, locale),
  },
  lighting: {
    Body: ({ state, dispatch }) => (
      <LightingGroup state={state} onPatch={(patch) => dispatch({ type: 'patch_lighting', patch })} />
    ),
    readback: (s, locale) => {
      const n = [
        s.lighting.underCabinetLed,
        s.lighting.plinthLed,
        s.lighting.pendantOverIsland,
        s.lighting.smartControls,
      ].filter(Boolean).length
      return n > 0 ? tDynamic('readback.lightingLayers', locale).replace('{n}', String(n)) : null
    },
  },
  finishing: {
    Body: ({ state, dispatch }) => (
      <FinishingGroup state={state} onPatch={(patch) => dispatch({ type: 'patch_finishing', patch })} />
    ),
    readback: (s, locale) => tDynamic(`finishing.plinthMaterial.${s.finishing.plinthMaterial}`, locale),
  },
}
