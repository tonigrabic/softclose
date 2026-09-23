/**
 * Legacy builder state → the current shape.
 *
 * Builder states are persisted (IndexedDB, the server snapshot, the submitted
 * brief) and outlive schema changes. Maker testing (2026-09-23) cut several
 * choices; a state saved before that still carries them. This maps each
 * retired value onto the nearest current one so the UI shows a selection and
 * the estimate prices the same kitchen.
 *
 * Server-safe (no 'use client') because computeBom runs it too — the maker's
 * dashboard and the handoff bundle price saved briefs on the server. Pure and
 * idempotent: a current-shape state comes back unchanged.
 */
import type { BuilderState, CarcassMaterial, FieldMeta, PlinthMaterial } from './inventory'

type Loose = Record<string, unknown>

const META_DEFAULT: FieldMeta = { confidence: 'L', provenance: 'ai-default' }

const CARCASS: Record<string, CarcassMaterial> = {
  white_melamine_standard: 'white_melamine_standard',
  colored_melamine: 'colored_melamine',
  // P3 is a board grade, not a look — it is (almost always) white.
  moisture_resistant_p3: 'white_melamine_standard',
  matched_to_door: 'colored_melamine',
}

const PLINTH_MATERIAL: Record<string, PlinthMaterial> = {
  wood: 'wood',
  plastic: 'plastic',
  matched_door: 'wood',
  matched_floor: 'wood',
  black_recessed: 'plastic',
  metal_strip: 'plastic', // alu-look strips are plastic-core in this market
}

const BACKSPLASH_KIND: Record<string, BuilderState['backsplash']['kind']> = {
  matching_slab: 'matching_slab',
  tile: 'tile',
  glass: 'glass',
  other: 'other',
  none: 'none',
  wall_panel: 'other',
  painted: 'other',
}

function meta(m: unknown): FieldMeta {
  return m && typeof m === 'object' ? (m as FieldMeta) : { ...META_DEFAULT }
}

export function normalizeBuilderState(state: BuilderState): BuilderState {
  const cab = state.cabinetBoxes as unknown as Loose
  const bs = state.backsplash as unknown as Loose & { meta?: Loose }
  const light = state.lighting as unknown as Loose & { meta?: Loose }
  const fin = state.finishing as unknown as Loose & { meta?: Loose }

  const carcassMaterial = CARCASS[String(cab.carcassMaterial)] ?? 'white_melamine_standard'

  const kind = BACKSPLASH_KIND[String(bs.kind)] ?? 'none'

  // Old lighting had four layers; any LED layer means "yes, LED".
  const led =
    typeof light.led === 'boolean' ? light.led : Boolean(light.underCabinetLed || light.plinthLed)
  const ledMeta = meta(light.meta?.led ?? light.meta?.underCabinetLed)

  const plinthHeightMm: 100 | 150 = Number(fin.plinthHeightMm) >= 150 ? 150 : 100
  const plinthMaterial = PLINTH_MATERIAL[String(fin.plinthMaterial)] ?? 'wood'

  const unchanged =
    carcassMaterial === cab.carcassMaterial &&
    kind === bs.kind &&
    typeof light.led === 'boolean' &&
    plinthHeightMm === fin.plinthHeightMm &&
    plinthMaterial === fin.plinthMaterial
  if (unchanged) return state

  return {
    ...state,
    cabinetBoxes: { ...state.cabinetBoxes, carcassMaterial },
    backsplash: {
      kind,
      ...(typeof bs.otherDecor === 'string' ? { otherDecor: bs.otherDecor } : {}),
      meta: { kind: meta(bs.meta?.kind) },
    },
    lighting: { led, meta: { led: ledMeta } },
    finishing: {
      plinthHeightMm,
      plinthMaterial,
      meta: {
        plinthHeightMm: meta(fin.meta?.plinthHeightMm),
        plinthMaterial: meta(fin.meta?.plinthMaterial),
      },
    },
  }
}
