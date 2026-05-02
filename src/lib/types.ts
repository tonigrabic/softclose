export interface MoodBoardItem {
  id: string
  source: 'upload' | 'url' | 'catalog'
  imageUrl: string
  title?: string
  vendorSku?: string
  vendor?: string
  notes?: string
  tags?: string[]
}

export interface ConceptVisualRef {
  url: string
  prompt: string
  reaction?: string
  illustrativeOnly: true
}

/**
 * Translation provenance: when the AI captures an informal homeowner phrase
 * as a trade-grade field, it must also store the originating verbatim quote
 * so the designer can cross-check the interpretation. Per Principle 6 of
 * product-foundations.md (every inference is traceable).
 */
export interface TranslatedField {
  /** The trade-grade capture the maker reads. */
  trade: string
  /** The homeowner's actual words. Designer cross-checks against this. */
  verbatim?: string
  /** Conversation turn index for context (optional). */
  turnIndex?: number
}

/** Compass-style positional reference for floor-plan features inferred by vision. */
export type WallSide = 'top' | 'bottom' | 'left' | 'right'
export type ConfidenceLevel = 'H' | 'M' | 'L'

export interface WallRun {
  wall: WallSide
  /** Where this wall run starts and ends along the room edge, as percentages 0–100. */
  spanPct: { start: number; end: number }
}

export interface OpeningPosition {
  wall: WallSide
  positionPct: number
  widthPct: number
  swing?: 'in' | 'out'
}

export interface FeaturePosition {
  wall: WallSide
  positionPct: number
  confidence: ConfidenceLevel
}

export interface IslandPosition {
  positionPct: { x: number; y: number }
  sizePct: { w: number; h: number }
}

export interface SpaceFeatures {
  sink?: FeaturePosition
  hob?: FeaturePosition
  fridge?: FeaturePosition
  dishwasher?: FeaturePosition
  island?: IslandPosition
}

/** Raw structured output from /api/space-vision — kept separate from confirmed values. */
export interface SpaceVisionResult {
  layoutShape?: string
  hasIsland?: boolean
  lengthCm?: number
  widthCm?: number
  wallRuns?: WallRun[]
  windows?: OpeningPosition[]
  doors?: OpeningPosition[]
  features?: SpaceFeatures
  /** Style direction the AI eyeballed in the photos. */
  styleHints?: string[]
  /** Material direction the AI eyeballed (e.g. existing worktop colour). */
  materialHints?: string[]
  /** False if the photos didn't look like a kitchen — triggers re-upload affordance. */
  lookedLikeKitchen: boolean
  /** What the model thinks it saw — short, used for chip read-back. */
  summary?: string
}

/** One iteration of the AI img2img concept render. Capped at 5 per session. */
export interface ConceptRender {
  id: string
  imageDataUrl: string
  prompt: string
  modelVersion: string
  /** Index of the user-uploaded photo this render was anchored to. */
  anchorPhotoIndex: number
  /** Chip nudges applied (e.g. "warmer", "darker cabinets"). */
  nudges: string[]
  generatedAt: string
}

export interface LeadProfile {
  // ---- Project meta
  projectType?: string
  timeline?: string
  budgetRange?: string
  budgetShared?: boolean
  /** Under-budget priorities: where to invest, where to flex. */
  priorities?: {
    investCategories?: string[]
    flexCategories?: string[]
  }

  // ---- Scope of work (what's actually being touched)
  /** Each scope key true = included; missing/false = not in scope. */
  scope?: {
    cabinets?: boolean
    worktops?: boolean
    sinkTaps?: boolean
    appliancesSupply?: boolean
    flooring?: boolean
    walls?: boolean
    ceiling?: boolean
    lighting?: boolean
    plumbingRelocation?: boolean
    electricalWork?: boolean
    structural?: boolean
    demolitionDisposal?: boolean
    installation?: boolean
    notes?: string
  }

  // ---- Structural changes (only if scope.structural === true)
  structural?: {
    wallRemoval?: boolean
    wallLoadBearing?: 'yes' | 'no' | 'unsure'
    soffitRemoval?: boolean
    windowChanges?: boolean
    doorChanges?: boolean
    notes?: string
  }

  // ---- Space (existing fields kept for back-compat)
  spaceSize?: string
  spaceLayout?: string
  layoutShape?: string
  hasIsland?: boolean
  spaceLengthCm?: number
  spaceWidthCm?: number
  /** Raw vision inferences from /api/space-vision — separate from confirmed values. */
  spaceVisionResult?: SpaceVisionResult
  /** Anchor photos (data URLs) the homeowner uploaded at the opener. */
  spacePhotos?: string[]

  // ---- Trades & utilities
  trades?: {
    plumbing?: {
      sinkPosition?: 'same' | 'moving' | 'new'
      notes?: string
    }
    electrical?: {
      cookerType?: 'induction' | 'gas' | 'electric_resistive' | 'unsure'
      panelProximity?: 'close' | 'far' | 'unknown'
      newCircuits?: boolean
    }
    gas?: {
      available?: 'yes' | 'no' | 'unsure'
      capping?: boolean
    }
    ventilation?: {
      currentPath?: 'external_wall' | 'recirculating' | 'roof' | 'unsure'
      desiredPath?: 'external_wall' | 'recirculating' | 'roof' | 'unsure'
      feasibilityNotes?: string
    }
    hvac?: {
      notes?: string
    }
  }

  // ---- Lighting (often a forgotten cost line)
  lighting?: {
    taskLayer?: boolean
    ambientLayer?: boolean
    accentLayer?: boolean
    smartControls?: boolean
    notes?: string
  }

  // ---- Style + materials
  stylePreferences?: string[]
  doorMaterial?: string
  cabinetConstruction?: 'inset' | 'overlay_full' | 'overlay_partial' | 'frameless' | 'unsure'
  worktopPreference?: string
  backsplashPreference?: string
  hardwareTier?: string
  hardwareBrand?: 'blum' | 'hafele' | 'studio' | 'budget' | 'unsure'
  specialtyCabinets?: string[] // pantry, glass_front, magic_corner, plinth_drawers, wine_storage, ...
  appliancesIntegrated?: 'integrated' | 'freestanding' | 'mixed' | 'unsure'

  // ---- Wishlist (translated fields with verbatim provenance)
  mustHaves?: TranslatedField[]
  niceToHaves?: TranslatedField[]
  dealBreakers?: TranslatedField[]
  applianceNotes?: TranslatedField
  softCloseDrawers?: boolean

  // ---- Logistics & site access
  logistics?: {
    siteAccess?: 'street_level' | 'one_flight' | 'multi_flight' | 'lift' | 'restricted'
    livingDuringBuild?: 'in_place' | 'partial_move' | 'fully_relocate'
    phasing?: 'one_phase' | 'staged' | 'unsure'
    permits?: 'needed' | 'not_needed' | 'unsure'
    notes?: string
  }

  // ---- Decision confidence map
  decisionConfidence?: {
    layout?: 'locked' | 'flexible' | 'undecided'
    style?: 'locked' | 'flexible' | 'undecided'
    materials?: 'locked' | 'flexible' | 'undecided'
    appliances?: 'locked' | 'flexible' | 'undecided'
    timeline?: 'locked' | 'flexible' | 'undecided'
    budget?: 'locked' | 'flexible' | 'undecided'
  }

  // ---- Decision context + contact
  decisionContext?: TranslatedField
  name?: string
  contactValue?: string

  // ---- Attachments
  photosShared?: boolean
  moodBoardItems?: MoodBoardItem[]
  conceptVisualReactions?: string[]

  // ---- Concept render (img2img anchored to a space photo)
  conceptRenders?: ConceptRender[]
  conceptRenderChosenId?: string

  // ---- Catch-all (also translated)
  additionalNotes?: TranslatedField
}

export type QuestionFormat =
  | 'select_cards'
  | 'image_select'
  | 'free_text'
  | 'photo_upload'
  | 'mood_board'
  | 'concept_visual'
  | 'contact'
  | 'space_capture'
  | 'visual_scale'
  | 'material_picker'
  | 'chip_multi'
  | 'decision_map'
  | 'concept_render'

export interface SelectOption {
  label: string
  value: string
  emoji?: string
  description?: string
  imageUrl?: string
  imageAlt?: string
  /** Lucide icon key (see option-icons.ts) for SelectCards. */
  icon?: string
  /** Inline SVG / image data URL for richer illustrated cards. */
  illustration?: string
}

/** Anchored band on the visual_scale (e.g. timeline + budget). */
export interface ScaleBand {
  value: string
  label: string
  /** Optional micro-label shown beneath the anchor. */
  caption?: string
  /** Optional Lucide icon key for the band. */
  icon?: string
}

/** Categories the decision_map asks about. */
export type DecisionCategory =
  | 'layout'
  | 'style'
  | 'materials'
  | 'appliances'
  | 'timeline'
  | 'budget'

export interface Step {
  questionText: string
  format: QuestionFormat
  options?: SelectOption[]
  placeholder?: string
  allowFreeText?: boolean
  freeTextPlaceholder?: string
  multiSelect?: boolean
  /**
   * Show a photo uploader alongside the primary input on this step.
   * Use when photos enrich the answer (layout/space) or seed inspiration (style).
   */
  allowPhotos?: boolean
  /** Helper text shown above the optional photo uploader when allowPhotos is true. */
  photosHelpText?: string
  /** For concept_visual (legacy): a 1–2 sentence visual prompt. */
  conceptPrompt?: string

  // ---- Format-specific configuration ----

  /** For visual_scale: ordered bands left → right. */
  bands?: ScaleBand[]
  /** For visual_scale: short caption explaining the axis ("Roughly when?"). */
  scaleAxis?: string

  /** For material_picker: which slot we're filling. */
  materialSlot?: 'door' | 'worktop' | 'backsplash' | 'hardware' | 'island' | 'lighting'

  /** For chip_multi: optional grouping for the chips. */
  chipGroups?: { label: string; values: string[] }[]

  /** For decision_map: which categories to ask about (default all). */
  decisionCategories?: DecisionCategory[]
}

export interface WrapUpData {
  thankYouMessage: string
  summaryLines: string[]
  /** Naive scope-band-based stub estimate range. PLACEHOLDER, not a quote. */
  estimateLow?: number
  estimateHigh?: number
}

export interface ClientMessage {
  role: 'user' | 'assistant'
  content: string
  images?: string[]
}

/** Stub estimate produced at wrap-up. Marked placeholder so the maker dashboard can render it differently. */
export interface StubEstimate {
  low: number
  high: number
  basis: string
  placeholder: true
}

/** Shape returned by /api/handoff for the designer-facing pack. */
export interface HandoffBundle {
  brief: LeadProfile
  moodBoard: MoodBoardItem[]
  floorPlan: { svg: string; disclaimer: string } | null
  /** Legacy concept_visual references (catalog-based; superseded by conceptRenders). */
  explorationRefs: ConceptVisualRef[]
  /** The homeowner's chosen img2img concept render. */
  chosenRender: (ConceptRender & { conceptOnly: true }) | null
  estimate: StubEstimate | null
  transcript: ClientMessage[]
  generatedAt: string
}
