/**
 * Builder state — local React reducer + hypothesis hydration.
 *
 * Kept dependency-free (no Zustand / Jotai). The Builder is a single screen
 * with a deterministic flow; useReducer is enough. If we later split state
 * across many surfaces (maker dashboard sees the same builder state), swap
 * to a store without changing the public hooks.
 */

'use client'

import { useReducer } from 'react'
import type { BuilderHypothesis } from './hypothesis'
import type {
  BuilderGroupId,
  BuilderState,
  CornerSolution,
  DoorStyle,
  FieldMeta,
  LayoutShape,
  Provenance,
  WallRunDimensions,
  WorktopFamily,
} from './inventory'

const META_DEFAULT: FieldMeta = { confidence: 'L', provenance: 'ai-default' }

function metaFromHint(
  hint: { confidence: 'H' | 'M' | 'L' } | undefined,
  fallback: Provenance = 'ai-vision'
): FieldMeta {
  return hint
    ? { confidence: hint.confidence, provenance: fallback }
    : { ...META_DEFAULT }
}

/**
 * Build an initial BuilderState from a (possibly partial) BuilderHypothesis.
 * Missing fields fall through to sensible defaults so the UI never crashes
 * on undefined values. The user can edit anything afterwards.
 */
export function hydrateFromHypothesis(
  hypothesis: BuilderHypothesis | null,
  context: { renderId?: string; leadProfileRef?: string } = {}
): BuilderState {
  const now = new Date().toISOString()

  // Layout
  const layoutHy = hypothesis?.layout
  const runs: WallRunDimensions[] =
    layoutHy?.runs?.map((r) => ({
      id: r.id,
      label: r.label,
      lengthCm: r.lengthCm.value,
      hasBase: r.hasBase?.value ?? true,
      hasWall: r.hasWall?.value ?? true,
      hasTall: r.hasTall?.value ?? false,
    })) ??
    // Single run fallback so the UI always has at least one row to edit.
    [{ id: 'main', label: 'Glavni zid', lengthCm: 300, hasBase: true, hasWall: true, hasTall: false }]

  // Doors
  const doorsHy = hypothesis?.doors
  const initialDoorsDecorCode = doorsHy?.decorCode?.value ?? 'W1000'
  const initialDoorsDecorStructure = doorsHy?.decorStructure?.value ?? 'ST9'

  // Worktop — match doors decor by default if the AI didn't pin one.
  const worktopHy = hypothesis?.worktop
  const initialWorktopCode = worktopHy?.decorCode?.value ?? 'F186'
  const initialWorktopStructure = worktopHy?.decorStructure?.value ?? 'ST9'

  // Backsplash
  const backsplashHy = hypothesis?.backsplash

  return {
    version: 1,
    startedAt: now,
    lastUpdatedAt: now,
    leadProfileRef: context.leadProfileRef,
    renderId: context.renderId,
    activeRenderId: null,
    originalRenderRef: context.renderId,

    layout: {
      shape: (layoutHy?.shape?.value ?? 'l_shape') as LayoutShape,
      hasIsland: layoutHy?.hasIsland?.value ?? false,
      runs,
      ceilingHeightCm: layoutHy?.ceilingHeightCm?.value ?? 270,
      meta: {
        runs: metaFromHint(layoutHy?.runs?.[0]?.lengthCm),
        shape: metaFromHint(layoutHy?.shape),
      },
    },

    cabinetBoxes: {
      carcassMaterial: hypothesis?.cabinetBoxes?.carcassMaterial?.value ?? 'white_melamine_standard',
      cornerSolution: (hypothesis?.cabinetBoxes?.cornerSolution?.value ?? 'magic_corner') as CornerSolution,
      units: [],
      meta: {
        carcassMaterial: metaFromHint(hypothesis?.cabinetBoxes?.carcassMaterial),
        cornerSolution: metaFromHint(hypothesis?.cabinetBoxes?.cornerSolution),
      },
    },

    doors: {
      style: (doorsHy?.style?.value ?? 'slab') as DoorStyle,
      decorCode: initialDoorsDecorCode,
      decorStructure: initialDoorsDecorStructure,
      overlay: doorsHy?.overlay?.value ?? 'full',
      edgeProfile: doorsHy?.edgeProfile?.value ?? 'square',
      meta: {
        style: metaFromHint(doorsHy?.style),
        decorCode: metaFromHint(doorsHy?.decorCode),
        overlay: metaFromHint(doorsHy?.overlay),
      },
    },

    worktop: {
      family: (worktopHy?.family?.value ?? 'laminate') as WorktopFamily,
      decorCode: initialWorktopCode,
      decorStructure: initialWorktopStructure,
      thicknessMm: (worktopHy?.thicknessMm?.value ?? 38) as 38 | 20 | 12,
      edge: worktopHy?.edge?.value ?? 'square',
      // Sum of all run lengths that will host base cabinets.
      totalLengthM: runs.filter((r) => r.hasBase).reduce((s, r) => s + r.lengthCm / 100, 0),
      mitreJoinCount: runs.filter((r) => r.hasBase).length - 1,
      meta: {
        family: metaFromHint(worktopHy?.family),
        decorCode: metaFromHint(worktopHy?.decorCode),
      },
    },

    backsplash: {
      kind: backsplashHy?.kind?.value ?? 'matching_slab',
      decorCode: backsplashHy?.decorCode?.value ?? initialWorktopCode,
      decorStructure: backsplashHy?.decorStructure?.value ?? initialWorktopStructure,
      heightCm: (backsplashHy?.heightCm?.value ?? 60) as 60 | 90 | 120 | 150,
      meta: {
        kind: metaFromHint(backsplashHy?.kind),
        decorCode: metaFromHint(backsplashHy?.decorCode),
        heightCm: metaFromHint(backsplashHy?.heightCm),
      },
    },

    hardware: {
      drawerSystemTier: hypothesis?.hardware?.drawerSystemTier?.value ?? 'mid',
      hingeType: hypothesis?.hardware?.hingeType?.value ?? 'soft_close',
      handleStyle: hypothesis?.hardware?.handleStyle?.value ?? 'integrated_jpull',
      handleFinish: hypothesis?.hardware?.handleFinish?.value ?? 'matched_to_door',
      organisers: [],
      meta: {
        drawerSystemTier: metaFromHint(hypothesis?.hardware?.drawerSystemTier),
        hingeType: metaFromHint(hypothesis?.hardware?.hingeType),
        handleStyle: metaFromHint(hypothesis?.hardware?.handleStyle),
        handleFinish: metaFromHint(hypothesis?.hardware?.handleFinish),
      },
    },

    appliances: {
      supply: 'maker_supplies',
      selections: [],
      meta: {
        supply: { ...META_DEFAULT, provenance: 'ai-default' },
        hob: metaFromHint(hypothesis?.appliances?.hob),
        oven: metaFromHint(hypothesis?.appliances?.oven),
        extractor: metaFromHint(hypothesis?.appliances?.extractor),
        fridge: metaFromHint(hypothesis?.appliances?.fridgeIntegrated),
        dishwasher: metaFromHint(hypothesis?.appliances?.dishwasherIntegrated),
      },
    },

    sinkTaps: {
      sink: {
        bowls: hypothesis?.sinkTaps?.sinkBowls?.value ?? 'single',
        mount: hypothesis?.sinkTaps?.sinkMount?.value ?? 'undermount',
        material: hypothesis?.sinkTaps?.sinkMaterial?.value ?? 'stainless',
      },
      tap: {
        type: hypothesis?.sinkTaps?.tapType?.value ?? 'pull_out',
        finish: hypothesis?.sinkTaps?.tapFinish?.value ?? 'matte_black',
      },
      meta: {
        sinkBowls: metaFromHint(hypothesis?.sinkTaps?.sinkBowls),
        sinkMount: metaFromHint(hypothesis?.sinkTaps?.sinkMount),
        sinkMaterial: metaFromHint(hypothesis?.sinkTaps?.sinkMaterial),
        tapType: metaFromHint(hypothesis?.sinkTaps?.tapType),
        tapFinish: metaFromHint(hypothesis?.sinkTaps?.tapFinish),
      },
    },

    lighting: {
      underCabinetLed: hypothesis?.lighting?.underCabinetLed?.value ?? true,
      plinthLed: hypothesis?.lighting?.plinthLed?.value ?? false,
      pendantOverIsland: hypothesis?.lighting?.pendantOverIsland?.value ?? false,
      pendantCount: hypothesis?.lighting?.pendantCount?.value ?? 0,
      smartControls: false,
      meta: {
        underCabinetLed: metaFromHint(hypothesis?.lighting?.underCabinetLed),
        plinthLed: metaFromHint(hypothesis?.lighting?.plinthLed),
        pendantOverIsland: metaFromHint(hypothesis?.lighting?.pendantOverIsland),
        smartControls: { ...META_DEFAULT, provenance: 'ai-default' },
      },
    },

    finishing: {
      plinthHeightMm: (hypothesis?.finishing?.plinthHeightMm?.value ?? 100) as 100 | 120 | 150,
      plinthMaterial: hypothesis?.finishing?.plinthMaterial?.value ?? 'matched_door',
      corniceStyle: hypothesis?.finishing?.corniceStyle?.value ?? 'none',
      endPanelsCount: 0,
      openShelvingMeters: 0,
      meta: {
        plinthHeightMm: metaFromHint(hypothesis?.finishing?.plinthHeightMm),
        plinthMaterial: metaFromHint(hypothesis?.finishing?.plinthMaterial),
        corniceStyle: metaFromHint(hypothesis?.finishing?.corniceStyle),
        endPanelsCount: { ...META_DEFAULT, provenance: 'ai-default' },
        openShelvingMeters: { ...META_DEFAULT, provenance: 'ai-default' },
      },
    },
  }
}

/* ────────────────────────── Reducer ────────────────────────── */

export type BuilderAction =
  | { type: 'patch_layout'; patch: Partial<BuilderState['layout']> }
  | { type: 'patch_doors'; patch: Partial<BuilderState['doors']> }
  | { type: 'patch_worktop'; patch: Partial<BuilderState['worktop']> }
  | { type: 'patch_backsplash'; patch: Partial<BuilderState['backsplash']> }
  | { type: 'patch_hardware'; patch: Partial<BuilderState['hardware']> }
  | { type: 'patch_appliances'; patch: Partial<BuilderState['appliances']> }
  | { type: 'patch_sinkTaps'; patch: Partial<BuilderState['sinkTaps']> }
  | { type: 'patch_lighting'; patch: Partial<BuilderState['lighting']> }
  | { type: 'patch_finishing'; patch: Partial<BuilderState['finishing']> }
  | { type: 'patch_cabinetBoxes'; patch: Partial<BuilderState['cabinetBoxes']> }
  | { type: 'push_rerender'; trigger: string; imageDataUrl: string }
  | { type: 'set_active_render'; id: string | null }
  | { type: 'replace'; state: BuilderState }

function reducer(state: BuilderState, action: BuilderAction): BuilderState {
  const now = new Date().toISOString()
  if (action.type === 'replace') return { ...action.state, lastUpdatedAt: now }
  if (action.type === 'push_rerender') {
    const id = generateId('render')
    return {
      ...state,
      rerenders: [
        ...(state.rerenders ?? []),
        { id, trigger: action.trigger, imageDataUrl: action.imageDataUrl, createdAt: now },
      ],
      activeRenderId: id,
      lastUpdatedAt: now,
    }
  }
  if (action.type === 'set_active_render') {
    return { ...state, activeRenderId: action.id, lastUpdatedAt: now }
  }
  if (action.type.startsWith('patch_')) {
    const groupKey = action.type.replace('patch_', '') as BuilderGroupId
    const current = state[groupKey] as object
    return {
      ...state,
      [groupKey]: { ...current, ...(action as { patch: object }).patch },
      lastUpdatedAt: now,
    } as BuilderState
  }
  return state
}

function generateId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function useBuilderState(initial: BuilderState) {
  return useReducer(reducer, initial)
}
