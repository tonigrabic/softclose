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
import { assembleUnits, hintsFromHypothesis, type UnitEdits } from './unit-assembly'
import type { LayoutContract } from '@/lib/contract/layout-contract'
import { applianceFootprintCm } from '@/lib/contract/layout-contract'
import type {
  ApplianceSelection,
  BuilderGroupId,
  BuilderScreenId,
  BuilderState,
  ConfidenceLevel,
  DoorStyle,
  FieldMeta,
  Provenance,
  WallRunDimensions,
  WorktopFamily,
} from './inventory'

const META_DEFAULT: FieldMeta = { confidence: 'L', provenance: 'ai-default' }
const RANK: Record<ConfidenceLevel, number> = { H: 0, M: 1, L: 2 }

function metaFromHint(
  hint: { confidence: 'H' | 'M' | 'L' } | undefined,
  fallback: Provenance = 'ai-vision'
): FieldMeta {
  return hint
    ? { confidence: hint.confidence, provenance: fallback }
    : { ...META_DEFAULT }
}

/**
 * Meta for an appliance the contract may know about. Part 1 measured the
 * appliance's position on the plan and the homeowner confirmed the layout —
 * that presence is homeowner-confirmed at the feature's own confidence, which
 * beats an absent or weaker AI hint. A vision hint still wins when stronger.
 */
function applianceMeta(
  kind: 'hob' | 'fridge' | 'dishwasher',
  contract: LayoutContract,
  hint: { confidence: 'H' | 'M' | 'L' } | undefined
): FieldMeta {
  const fromContract = contract.appliances.find((a) => a.kind === kind)
  if (!fromContract) return metaFromHint(hint)
  if (hint && hint.confidence === 'H') return metaFromHint(hint)
  return { confidence: fromContract.confidence, provenance: 'homeowner-confirmed' }
}

/**
 * Build an initial BuilderState from a (possibly partial) BuilderHypothesis.
 * Missing fields fall through to sensible defaults so the UI never crashes
 * on undefined values. The user can edit anything afterwards.
 */
export function hydrateFromHypothesis(
  hypothesis: BuilderHypothesis | null,
  context: {
    renderId?: string
    leadProfileRef?: string
    layoutContract: LayoutContract
    /** The homeowner's per-row unit edits from the Part-1 contract card. */
    unitEdits?: UnitEdits | null
  }
): BuilderState {
  const now = new Date().toISOString()

  // Layout comes ENTIRELY from the contract (Part 1). The contract is complete —
  // it delivers runs, shape, island, ceiling height, hasWall/hasTall and corner
  // ownership — so the builder never falls back to the AI hypothesis or its own
  // defaults for layout. The render hypothesis only drives decor/material/etc.
  // See context/layout-contract.md.
  const contract = context.layoutContract

  // Render-seen tall towers + per-unit pattern hints, folded through the ONE
  // assembler (unit-assembly.ts) — the same call the Part-1 tally renders, so
  // what the homeowner confirmed is exactly what seeds here (tally parity).
  const hints = hintsFromHypothesis(hypothesis)
  const runs = runsFromContract(contract, new Set<string>(hints?.tallRunIds ?? []))
  const worktopGeo = worktopGeometryFromRuns(runs)

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

  // Appliance selections first — the fridge's integrated flag feeds the unit
  // assembly (an integrated fridge gets a tall housing carcass).
  const selections = seedApplianceSelections(hypothesis, contract)
  const integratedFridge = selections.find((s) => s.type === 'fridge')?.integrated ?? false

  // THE unit list — same assembler as the Part-1 tally card and computeBom.
  const assembled = assembleUnits({
    contract,
    hints,
    edits: context.unitEdits ?? null,
    integratedFridge,
  })

  return {
    version: 1,
    startedAt: now,
    lastUpdatedAt: now,
    leadProfileRef: context.leadProfileRef,
    renderId: context.renderId,
    activeRenderId: null,
    originalRenderRef: context.renderId,
    layoutConfirmed: false,

    layout: {
      shape: contract.shape,
      hasIsland: contract.hasIsland,
      runs,
      ceilingHeightCm: contract.ceilingHeightCm,
      meta: {
        // Layout came from Part 1, where the homeowner confirmed it. The
        // aggregate confidence is the WORST run (one shaky wall = shaky BOM).
        runs: {
          confidence: contract.runs.reduce<ConfidenceLevel>(
            (worst, r) => (RANK[r.confidence] > RANK[worst] ? r.confidence : worst),
            'H'
          ),
          provenance: 'homeowner-confirmed',
        },
        shape: { confidence: 'H', provenance: 'homeowner-confirmed' },
      },
    },

    cabinetBoxes: {
      carcassMaterial: hypothesis?.cabinetBoxes?.carcassMaterial?.value ?? 'white_melamine_standard',
      // Materialized from the ONE assembler at hydration — the builder never
      // re-seeds or re-layers units (that divergence was the multi-sink bug).
      units: assembled.units,
      meta: {
        carcassMaterial: metaFromHint(hypothesis?.cabinetBoxes?.carcassMaterial),
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
      totalLengthM: worktopGeo.totalLengthM,
      mitreJoinCount: worktopGeo.mitreJoinCount,
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
      meta: {
        drawerSystemTier: metaFromHint(hypothesis?.hardware?.drawerSystemTier),
        hingeType: metaFromHint(hypothesis?.hardware?.hingeType),
        handleStyle: metaFromHint(hypothesis?.hardware?.handleStyle),
        handleFinish: metaFromHint(hypothesis?.hardware?.handleFinish),
      },
    },

    appliances: {
      supply: 'maker_supplies',
      selections,
      meta: {
        supply: { ...META_DEFAULT, provenance: 'ai-default' },
        hob: applianceMeta('hob', contract, hypothesis?.appliances?.hob),
        oven: metaFromHint(hypothesis?.appliances?.oven),
        extractor: metaFromHint(hypothesis?.appliances?.extractor),
        fridge: applianceMeta(
          'fridge',
          contract,
          hypothesis?.appliances?.fridge?.present ?? hypothesis?.appliances?.fridgeIntegrated
        ),
        dishwasher: applianceMeta(
          'dishwasher',
          contract,
          hypothesis?.appliances?.dishwasher?.present ?? hypothesis?.appliances?.dishwasherIntegrated
        ),
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

/**
 * The floor plan calls the extractor "hood"; the builder appliance group calls
 * it "extractor". Sink is excluded (it lives in the sink/taps group).
 */
const FEATURE_TO_APPLIANCE: Partial<Record<string, ApplianceSelection['type']>> = {
  hob: 'hob',
  oven: 'oven',
  fridge: 'fridge',
  dishwasher: 'dishwasher',
  hood: 'extractor',
}

/** Appliance types whose presence the floor plan can express. */
const FLOOR_PLAN_APPLIANCE_TYPES: ReadonlySet<ApplianceSelection['type']> = new Set([
  'hob',
  'oven',
  'fridge',
  'dishwasher',
  'extractor',
])

/** Contract runs → builder run dimensions (render-seen tall towers folded in). */
function runsFromContract(contract: LayoutContract, renderTallRunIds: Set<string>): WallRunDimensions[] {
  return contract.runs.map((r) => ({
    id: r.id,
    label: r.label,
    lengthCm: r.lengthCm,
    hasBase: r.hasBase,
    hasWall: r.hasWall,
    hasTall: r.hasTall || renderTallRunIds.has(r.id),
    hasCorner: r.hasCorner,
    applianceFootprintCm: applianceFootprintCm(contract, r.id),
  }))
}

/**
 * Worktop never runs over a fridge (full-height appliance), so its length is
 * the base-bearing total minus measured fridge footprints. Dishwashers keep
 * their worktop. A freestanding island worktop isn't mitre-joined to the runs.
 */
function worktopGeometryFromRuns(runs: WallRunDimensions[]): {
  totalLengthM: number
  mitreJoinCount: number
} {
  const fridgeFootprintM = runs.reduce(
    (sum, r) => sum + (r.applianceFootprintCm?.fridgeCm ?? 0) / 100,
    0
  )
  return {
    totalLengthM: Math.max(
      0,
      runs.filter((r) => r.hasBase).reduce((s, r) => s + r.lengthCm / 100, 0) - fridgeFootprintM
    ),
    mitreJoinCount: Math.max(0, runs.filter((r) => r.hasBase && r.id !== 'island').length - 1),
  }
}

function seedApplianceSelections(
  hy: BuilderHypothesis | null,
  contract?: LayoutContract
): ApplianceSelection[] {
  const out: ApplianceSelection[] = []
  const ap = hy?.appliances

  // Hob / oven / extractor: legacy hint-shaped fields. Seed only when
  // confidence isn't 'L' AND the value isn't 'unknown'.
  function pushTyped(
    type: ApplianceSelection['type'],
    raw: { value: string; confidence: 'H' | 'M' | 'L' } | undefined
  ) {
    if (!raw || raw.value === 'unknown' || raw.confidence === 'L') return
    out.push({ type, config: raw.value, integrated: false })
  }
  if (ap) {
    pushTyped('hob', ap.hob)
    pushTyped('oven', ap.oven)
    pushTyped('extractor', ap.extractor)

    // Presence-flagged appliances: only seed when present === true.
    if (ap.fridge?.present?.value) {
      out.push({
        type: 'fridge',
        config: 'standard',
        integrated: ap.fridge.integrated?.value ?? false,
      })
    } else if (ap.fridgeIntegrated?.value !== undefined) {
      // Back-compat: older payloads only had `fridgeIntegrated`. Treat the
      // flag itself as a presence signal.
      out.push({ type: 'fridge', config: 'standard', integrated: ap.fridgeIntegrated.value })
    }

    if (ap.dishwasher?.present?.value) {
      out.push({
        type: 'dishwasher',
        config: 'standard',
        integrated: ap.dishwasher.integrated?.value ?? false,
      })
    } else if (ap.dishwasherIntegrated?.value !== undefined) {
      out.push({
        type: 'dishwasher',
        config: 'standard',
        integrated: ap.dishwasherIntegrated.value,
      })
    }

    if (ap.microwave?.value?.present) {
      out.push({
        type: 'microwave',
        config: 'standard',
        integrated: ap.microwave.value.integrated ?? false,
      })
    }
    if (ap.wineFridge?.value) out.push({ type: 'wine_fridge', config: 'standard', integrated: true })
    if (ap.coffeeStation?.value) out.push({ type: 'coffee', config: 'standard', integrated: true })
  }

  // Floor-plan-known appliances: Part 1 geometry is authoritative for *presence*,
  // so guarantee they exist in the builder and backfill the measured width. The
  // AI's richer config (induction/gas, integrated) wins when it already seeded one.
  // Sink lives in the sink/taps group, so it's excluded.
  for (const a of contract?.appliances ?? []) {
    const type = FEATURE_TO_APPLIANCE[a.kind]
    if (!type) continue // sink + anything not represented in the builder group
    const widthMm = Math.round(a.widthCm * 10)
    const existing = out.find((s) => s.type === type)
    if (existing) {
      if (existing.widthMm === undefined) existing.widthMm = widthMm
      continue
    }
    out.push({
      type,
      config: type === 'hob' ? 'induction' : 'standard',
      integrated: type === 'dishwasher',
      widthMm,
    })
  }

  return out
}

/**
 * Re-lock a resumed builder state against a (possibly changed) contract — the
 * escape-hatch return path, and the mount path for every saved session (it's
 * idempotent, and it self-heals stale unit lists from before the assembler).
 *
 * REPLACED from the fresh contract: the layout group, `cabinetBoxes.units`
 * (through the one assembler, hints + homeowner unit edits included) and the
 * worktop's derived geometry (total length, mitre joins).
 * SURVIVES: every specifics pick — doors, hardware, worktop decor/family/
 * thickness/edge, backsplash, sink/taps, lighting, finishing, carcass, all
 * metas, renders and timestamps.
 * RE-SYNCED: appliance selections — measured widths update, newly drawn kinds
 * appear, and floor-plan kinds DELETED from the plan drop out (a selection
 * with `widthMm` came from the plan; AI-only extras without a measured width
 * survive). The confirmed tally rules the estimate.
 */
export function relockBuilderState(
  saved: BuilderState,
  context: {
    layoutContract: LayoutContract
    hypothesis?: BuilderHypothesis | null
    unitEdits?: UnitEdits | null
  }
): BuilderState {
  const contract = context.layoutContract
  const hints = hintsFromHypothesis(context.hypothesis ?? null)
  const runs = runsFromContract(contract, new Set<string>(hints?.tallRunIds ?? []))
  const worktopGeo = worktopGeometryFromRuns(runs)

  const selections = syncSelectionsWithContract(saved.appliances.selections, contract)
  const integratedFridge = selections.find((s) => s.type === 'fridge')?.integrated ?? false
  const assembled = assembleUnits({
    contract,
    hints,
    edits: context.unitEdits ?? null,
    integratedFridge,
  })

  return {
    ...saved,
    lastUpdatedAt: new Date().toISOString(),
    layoutConfirmed: true,
    layout: {
      shape: contract.shape,
      hasIsland: contract.hasIsland,
      runs,
      ceilingHeightCm: contract.ceilingHeightCm,
      meta: {
        runs: {
          confidence: contract.runs.reduce<ConfidenceLevel>(
            (worst, r) => (RANK[r.confidence] > RANK[worst] ? r.confidence : worst),
            'H'
          ),
          provenance: 'homeowner-confirmed',
        },
        shape: { confidence: 'H', provenance: 'homeowner-confirmed' },
      },
    },
    cabinetBoxes: { ...saved.cabinetBoxes, units: assembled.units },
    worktop: {
      ...saved.worktop,
      totalLengthM: worktopGeo.totalLengthM,
      mitreJoinCount: worktopGeo.mitreJoinCount,
    },
    appliances: { ...saved.appliances, selections },
  }
}

/**
 * Bring appliance selections in line with a fresh contract: measured widths
 * win, newly drawn kinds appear, and floor-plan kinds deleted from the plan
 * drop out. A selection with `widthMm` came from the plan (only the contract
 * backfill sets it); AI-seeded extras without one are left alone.
 */
function syncSelectionsWithContract(
  selections: ApplianceSelection[],
  contract: LayoutContract
): ApplianceSelection[] {
  const out = selections.map((s) => ({ ...s }))
  const planTypes = new Set<ApplianceSelection['type']>()
  for (const a of contract.appliances) {
    const type = FEATURE_TO_APPLIANCE[a.kind]
    if (!type) continue
    planTypes.add(type)
    const widthMm = Math.round(a.widthCm * 10)
    const existing = out.find((s) => s.type === type)
    if (existing) {
      existing.widthMm = widthMm
      continue
    }
    out.push({
      type,
      config: type === 'hob' ? 'induction' : 'standard',
      integrated: type === 'dishwasher',
      widthMm,
    })
  }
  return out.filter(
    (s) =>
      !FLOOR_PLAN_APPLIANCE_TYPES.has(s.type) ||
      planTypes.has(s.type) ||
      s.widthMm === undefined
  )
}

/**
 * Walking past a screen is an answer: the homeowner saw the prefilled values
 * and moved on, so every field meta in that group flips to
 * homeowner-confirmed — `narrowByMeta` then grades the lines it drives as H.
 * Pure (no reducer dispatch) so BuilderShell can hand the confirmed state to
 * `onComplete` without racing the last dispatch.
 */
export function confirmGroupMetas(state: BuilderState, group: BuilderScreenId): BuilderState {
  const current = state[group] as { meta?: Record<string, FieldMeta | undefined> }
  if (!current.meta) return state
  const meta = Object.fromEntries(
    Object.entries(current.meta).map(([k, m]) =>
      m ? [k, { ...m, provenance: 'homeowner-confirmed' as Provenance }] : [k, m]
    )
  )
  return { ...state, [group]: { ...current, meta } }
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
  | { type: 'confirm_layout' }
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
  if (action.type === 'confirm_layout') {
    return { ...state, layoutConfirmed: true, lastUpdatedAt: now }
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
