/**
 * Builder inventory — the typed component schema for Phase 2.
 *
 * The Builder walks the homeowner through 10 component groups. The AI render
 * from Phase 1 is the *starting hypothesis*; for each group, vision pre-fills
 * a best-guess + confidence, and the user confirms or swaps.
 *
 * `BuilderState` is the persisted output: every confirmed selection, dimension
 * tweak, and quantity. The BOM calculator reads `BuilderState`. The maker
 * dashboard reads `BuilderState` plus the cost model output.
 *
 * Per Principle 6 of product-foundations.md: every field carries a confidence
 * (H/M/L) + provenance (vision / homeowner-confirmed / homeowner-edited) so
 * the maker knows what to verify on the call.
 */

export type ConfidenceLevel = 'H' | 'M' | 'L'
export type Provenance =
  | 'ai-vision' // inferred from render or photos
  | 'ai-default' // sensible default when vision couldn't tell
  | 'homeowner-confirmed' // user accepted the AI guess as-is
  | 'homeowner-edited' // user changed the value

export interface FieldMeta {
  confidence: ConfidenceLevel
  provenance: Provenance
}

/* ─────────────────────────── 1. Layout & dimensions ─────────────────────── */

export type LayoutShape =
  | 'galley'
  | 'l_shape'
  | 'u_shape'
  | 'island'
  | 'peninsula'
  | 'open'
  | 'unsure'

export interface WallRunDimensions {
  /** Identifier within the layout (e.g. "main", "return", "island_left"). */
  id: string
  label: string
  /** Length of this run along the wall, in cm. */
  lengthCm: number
  /** Whether this run will hold base, wall, or both cabinet rows. */
  hasBase: boolean
  hasWall: boolean
  hasTall: boolean
}

export interface LayoutGroup {
  shape: LayoutShape
  /**
   * Wall runs in cm. Critical for non-rectangular shapes (L/U) where one
   * length+width pair under-specifies the kitchen. The AI proposes runs from
   * the photo; user can edit each one.
   */
  runs: WallRunDimensions[]
  ceilingHeightCm: number
  /** Whether the room has a free-standing island. */
  hasIsland: boolean
  meta: { runs: FieldMeta; shape: FieldMeta }
}

/* ─────────────────────────── 2. Cabinet boxes (carcass) ────────────────── */

export type CarcassMaterial =
  | 'white_melamine_standard'
  | 'colored_melamine'
  | 'moisture_resistant_p3'
  | 'matched_to_door'

export type CornerSolution =
  | 'magic_corner'
  | 'lazy_susan'
  | 'diagonal_corner'
  | 'dead_corner'
  | 'none'

/**
 * Trade-language pattern for a cabinet unit. Replaces the old
 * `drawers` count + `isCorner` flag — door/drawer counts and corner
 * status are derived from the pattern (see PATTERN_SPECS).
 */
export type CabinetPattern =
  | 'doors_shelf'
  | 'drawer_bank'
  | 'pullouts_inside_doors'
  | 'drawer_door_combo'
  | 'sink_unit'
  | 'trash_pullout'
  | 'corner_magic'
  | 'corner_lazy'
  | 'oven_housing'
  | 'pullout_larder'
  | 'wine_pullout'
  | 'open_shelves'

export interface CabinetUnit {
  id: string
  /** "base", "wall", "tall" — drives module presets. */
  type: 'base' | 'wall' | 'tall'
  widthMm: 300 | 400 | 450 | 500 | 600 | 800 | 900 | 1000 | 1200
  heightMm: number
  depthMm: number
  /** Which run + position-along-run this lives on. */
  runId: string
  positionPctAlongRun: number
  /** Maker-trade pattern. Drives drawer count, corner flag, accessories, BOM. */
  pattern: CabinetPattern
}

export interface CabinetBoxesGroup {
  carcassMaterial: CarcassMaterial
  cornerSolution: CornerSolution
  units: CabinetUnit[]
  meta: { carcassMaterial: FieldMeta; cornerSolution: FieldMeta }
}

/* ─────────────────────────── 3. Doors & fronts ─────────────────────────── */

export type DoorStyle =
  | 'slab' // flat front, modern
  | 'shaker' // 5-piece frame
  | 'handleless_jpull' // J-pull integrated grip
  | 'handleless_groove' // top groove
  | 'glass_front' // framed glass
  | 'beaded' // traditional

export type DoorOverlay = 'full' | 'partial' | 'inset'
export type EdgeProfile = 'square' | 'softened' | 'bevel' | 'radius'

export interface DoorsGroup {
  style: DoorStyle
  /** Reference to a decor in elgrad-decors.json (CatalogDecor.code). */
  decorCode: string
  decorStructure: string
  overlay: DoorOverlay
  edgeProfile: EdgeProfile
  meta: { style: FieldMeta; decorCode: FieldMeta; overlay: FieldMeta }
}

/* ─────────────────────────── 4. Worktop ────────────────────────────────── */

export type WorktopFamily =
  | 'laminate' // Elgrad standard 38mm
  | 'compact' // Fenix-like
  | 'quartz'
  | 'sintered_stone'
  | 'solid_wood'
  | 'stainless'

export type WorktopEdge = 'square' | 'bevel' | 'mitred_waterfall' | 'radius'

export interface WorktopGroup {
  family: WorktopFamily
  /** Decor code if family = laminate or compact (Elgrad catalog). */
  decorCode?: string
  decorStructure?: string
  thicknessMm: 38 | 20 | 12
  edge: WorktopEdge
  /** Total linear meters across all runs (computed from layout, editable). */
  totalLengthM: number
  /** Mitre joins (each adds labor cost). */
  mitreJoinCount: number
  meta: { family: FieldMeta; decorCode: FieldMeta }
}

/* ─────────────────────────── 5. Backsplash ─────────────────────────────── */

export type BacksplashKind =
  | 'matching_slab' // continuation of worktop
  | 'tile'
  | 'glass'
  | 'wall_panel' // Elgrad zidne letve
  | 'painted'
  | 'none'

export interface BacksplashGroup {
  kind: BacksplashKind
  /** If matching slab or wall panel, which decor. */
  decorCode?: string
  decorStructure?: string
  /** Strip height in cm (60 = standard between worktop and wall cabinets). */
  heightCm: 60 | 90 | 120 | 150
  meta: { kind: FieldMeta; decorCode: FieldMeta; heightCm: FieldMeta }
}

/* ─────────────────────────── 6. Hardware ───────────────────────────────── */

export type DrawerSystemTier = 'budget' | 'mid' | 'premium' // generic, Grass Nova Pro, Blum Tandembox/Legrabox
export type HingeType = 'soft_close' | 'standard' | 'push_to_open'
export type HandleStyle =
  | 'integrated_jpull'
  | 'integrated_groove'
  | 'pull_bar'
  | 'knob'
  | 'cup_pull'

export type HandleFinish = 'matte_black' | 'brushed_steel' | 'brass' | 'chrome' | 'matched_to_door'

export interface HardwareGroup {
  drawerSystemTier: DrawerSystemTier
  /** Specific Schachermayer SKU once a tier + brand picked. */
  drawerSystemSku?: string
  /** Denormalised name/brand of the picked drawer system, for BOM line text. */
  drawerSystemPickedName?: string
  drawerSystemPickedBrand?: string
  hingeType: HingeType
  handleStyle: HandleStyle
  handleFinish: HandleFinish
  /** Internal organisers selected (cutlery insert, magic corner, pull-out larder, etc). */
  organisers: string[]
  meta: {
    drawerSystemTier: FieldMeta
    hingeType: FieldMeta
    handleStyle: FieldMeta
    handleFinish: FieldMeta
  }
}

/* ─────────────────────────── 7. Appliances ─────────────────────────────── */

export type ApplianceSupply = 'homeowner_supplies' | 'maker_supplies' | 'mixed'

export interface ApplianceSelection {
  type: 'hob' | 'oven' | 'extractor' | 'fridge' | 'dishwasher' | 'microwave' | 'wine_fridge' | 'coffee'
  /** Main configuration field; per appliance the meaning differs. */
  config: string // e.g. "induction_60", "single_oven", "ceiling_recessed_extractor"
  integrated: boolean
  widthMm?: number
  /** Pinned Schachermayer SKU when the homeowner picks a specific product. */
  pickedSku?: string
  pickedName?: string
  pickedBrand?: string
  /** Free-text notes for the maker (intent, dimensions). Not for SKU encoding. */
  notes?: string
}

export interface AppliancesGroup {
  supply: ApplianceSupply
  selections: ApplianceSelection[]
  meta: {
    supply: FieldMeta
    hob: FieldMeta
    oven: FieldMeta
    extractor: FieldMeta
    fridge: FieldMeta
    dishwasher: FieldMeta
  }
}

/* ─────────────────────────── 8. Sink & taps ────────────────────────────── */

export type SinkBowls = 'single' | 'one_and_half' | 'double'
export type SinkMount = 'undermount' | 'inset' | 'flush' | 'belfast'
export type SinkMaterial = 'stainless' | 'granite_composite' | 'ceramic' | 'fragranite'

export type TapType = 'single_lever' | 'pull_out' | 'boiling_water' | 'filtered_three_way'

export interface SinkTapsGroup {
  sink: {
    bowls: SinkBowls
    mount: SinkMount
    material: SinkMaterial
    /** Schachermayer SKU once specific model picked. */
    sku?: string
    pickedName?: string
    pickedBrand?: string
    /** Bowl outer dimensions, useful for cabinet sizing. */
    widthMm?: number
    depthMm?: number
  }
  tap: {
    type: TapType
    finish: HandleFinish
    sku?: string
    pickedName?: string
    pickedBrand?: string
  }
  meta: {
    sinkBowls: FieldMeta
    sinkMount: FieldMeta
    sinkMaterial: FieldMeta
    tapType: FieldMeta
    tapFinish: FieldMeta
  }
}

/* ─────────────────────────── 9. Lighting ───────────────────────────────── */

export interface LightingGroup {
  underCabinetLed: boolean
  plinthLed: boolean
  pendantOverIsland: boolean
  pendantCount: number
  smartControls: boolean
  meta: {
    underCabinetLed: FieldMeta
    plinthLed: FieldMeta
    pendantOverIsland: FieldMeta
    smartControls: FieldMeta
  }
}

/* ─────────────────────────── 10. Finishing ─────────────────────────────── */

export type CorniceStyle = 'none' | 'flat' | 'crown' | 'custom_match_door'
export type PlinthMaterial = 'matched_door' | 'matched_floor' | 'black_recessed' | 'metal_strip'

export interface FinishingGroup {
  plinthHeightMm: 100 | 120 | 150
  plinthMaterial: PlinthMaterial
  corniceStyle: CorniceStyle
  endPanelsCount: number
  openShelvingMeters: number
  meta: {
    plinthHeightMm: FieldMeta
    plinthMaterial: FieldMeta
    corniceStyle: FieldMeta
    endPanelsCount: FieldMeta
    openShelvingMeters: FieldMeta
  }
}

/* ─────────────────────────── BuilderState ──────────────────────────────── */

export interface BuilderState {
  /** Builder schema version — bump when groups change shape. */
  version: 1
  startedAt: string
  lastUpdatedAt: string
  /** Reference to the Phase-1 LeadProfile this builder run was anchored to. */
  leadProfileRef?: string
  /** Reference to the chosen ConceptRender (id) the hypothesis was derived from. */
  renderId?: string

  layout: LayoutGroup
  cabinetBoxes: CabinetBoxesGroup
  doors: DoorsGroup
  worktop: WorktopGroup
  backsplash: BacksplashGroup
  hardware: HardwareGroup
  appliances: AppliancesGroup
  sinkTaps: SinkTapsGroup
  lighting: LightingGroup
  finishing: FinishingGroup

  /**
   * Re-renders triggered from builder edits. The Phase-1 Original is *not*
   * stored here — it lives outside the array so it can never be evicted by
   * the cap or accidentally promoted away. Hard cap: MAX_RERENDERS_PER_SESSION.
   */
  rerenders?: { id: string; trigger: string; imageDataUrl: string; createdAt: string }[]
  /**
   * Pointer to the render currently shown in the big preview and used as the
   * RerenderPanel baseline. `null` means the Phase-1 Original; any other value
   * is an id from `rerenders[]`.
   */
  activeRenderId: string | null
  /** Canonical id for the Phase-1 render, for the brief / maker dashboard. */
  originalRenderRef?: string
}

/** Group identifiers — for the stepper / current-step state. */
export type BuilderGroupId =
  | 'layout'
  | 'cabinetBoxes'
  | 'doors'
  | 'worktop'
  | 'backsplash'
  | 'hardware'
  | 'appliances'
  | 'sinkTaps'
  | 'lighting'
  | 'finishing'

export interface BuilderGroupMeta {
  id: BuilderGroupId
  /** i18n key. Resolved at render time via the i18n layer. */
  labelKey: string
  /** What this group covers, in one sentence (i18n key). */
  whyKey: string
  /** Visual order in the stepper. */
  order: number
}

export const BUILDER_GROUPS: BuilderGroupMeta[] = [
  // Layout/dimensions are owned by Phase 1 (space photos + space-vision +
  // confirm_look). The Builder focuses on the *details* — what fills the
  // already-defined room.
  { id: 'cabinetBoxes', labelKey: 'builder.groups.cabinetBoxes.label', whyKey: 'builder.groups.cabinetBoxes.why', order: 1 },
  { id: 'doors', labelKey: 'builder.groups.doors.label', whyKey: 'builder.groups.doors.why', order: 2 },
  { id: 'worktop', labelKey: 'builder.groups.worktop.label', whyKey: 'builder.groups.worktop.why', order: 3 },
  { id: 'backsplash', labelKey: 'builder.groups.backsplash.label', whyKey: 'builder.groups.backsplash.why', order: 4 },
  { id: 'hardware', labelKey: 'builder.groups.hardware.label', whyKey: 'builder.groups.hardware.why', order: 5 },
  { id: 'appliances', labelKey: 'builder.groups.appliances.label', whyKey: 'builder.groups.appliances.why', order: 6 },
  { id: 'sinkTaps', labelKey: 'builder.groups.sinkTaps.label', whyKey: 'builder.groups.sinkTaps.why', order: 7 },
  { id: 'lighting', labelKey: 'builder.groups.lighting.label', whyKey: 'builder.groups.lighting.why', order: 8 },
  { id: 'finishing', labelKey: 'builder.groups.finishing.label', whyKey: 'builder.groups.finishing.why', order: 9 },
]

export function builderGroupOrder(id: BuilderGroupId): number {
  return BUILDER_GROUPS.find((g) => g.id === id)?.order ?? 0
}

export function nextBuilderGroup(id: BuilderGroupId): BuilderGroupId | null {
  const i = BUILDER_GROUPS.findIndex((g) => g.id === id)
  return i >= 0 && i < BUILDER_GROUPS.length - 1 ? BUILDER_GROUPS[i + 1].id : null
}

export function prevBuilderGroup(id: BuilderGroupId): BuilderGroupId | null {
  const i = BUILDER_GROUPS.findIndex((g) => g.id === id)
  return i > 0 ? BUILDER_GROUPS[i - 1].id : null
}
