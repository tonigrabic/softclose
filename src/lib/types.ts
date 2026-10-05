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
 * An image the homeowner supplied as inspiration — uploaded from their device
 * or pasted as a link.
 *
 * Declared here rather than in ImageSelect.tsx (its original home, re-exported
 * there for back-compat) because the project snapshot carries these and is read
 * by server code. A 'use client' module must never become a server module's
 * import edge — see tests/server-client-boundary.test.ts for why.
 */
export interface UploadedReference {
  id: string
  imageUrl: string
  source: 'upload' | 'url'
}

/** A specific product photo the homeowner wants the render to honour. */
export interface ProductReference {
  id: string
  photo: string
  label: string
}

/**
 * The contact step's draft. A signed-in customer's email is their account
 * address, so they only add a name and, optionally, a phone. `contactType` /
 * `contactValue` are the anonymous funnel's single "best way to reach you".
 */
export interface ContactValue {
  name: string
  contactType: 'phone' | 'email'
  contactValue: string
  phone?: string
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

/** What the homeowner wants to do with the layout they have (room step). */
export type LayoutIntent = 'keep' | 'add_island' | 'move_sink' | 'change'

/** Compass-style positional reference for floor-plan features inferred by vision. */
export type WallSide = 'top' | 'bottom' | 'left' | 'right'
export type ConfidenceLevel = 'H' | 'M' | 'L'

export interface WallRun {
  wall: WallSide
  /** Where this wall run starts and ends along the room edge, as percentages 0–100. */
  spanPct: { start: number; end: number }
}

/** A corner of the room, named by the two walls that meet there (plan frame). */
export type WallCorner = 'top_left' | 'top_right' | 'bottom_right' | 'bottom_left'
/** What one space photo mainly shows: a wall it faces, a corner it is centred on, or neither. */
export type PhotoViewTarget = WallSide | WallCorner | 'unclear'

/**
 * Where one space photo sits in the room. All photos are one room from
 * different positions; each gets a view in the ONE plan frame, so a wall seen
 * from two angles is one wall and a wall seen in only one photo is not lost.
 */
export interface PhotoView {
  /** 0-based index into the space photos, in upload order. */
  photoIndex: number
  shows: PhotoViewTarget
  /** Walls with base cabinets or a worktop visible in THIS photo; ⊆ the walls of `shows`. */
  counterWalls: WallSide[]
  confidence: ConfidenceLevel
  /** 'homeowner' once they corrected the label on the room step. */
  source: 'ai_vision' | 'homeowner'
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
  /** Built-in oven (separate from the hob). */
  oven?: FeaturePosition
  /** Extractor hood / cooker hood over the hob. */
  hood?: FeaturePosition
  island?: IslandPosition
}

/** Raw structured output from /api/space-vision — kept separate from confirmed values. */
export interface SpaceVisionResult {
  layoutShape?: string
  hasIsland?: boolean
  lengthCm?: number
  widthCm?: number
  /** AI estimate of ceiling height (cm); homeowner confirms. Defaults ~270. */
  ceilingHeightCm?: number
  wallRuns?: WallRun[]
  windows?: OpeningPosition[]
  doors?: OpeningPosition[]
  features?: SpaceFeatures
  /** Style direction the AI eyeballed in the photos. */
  styleHints?: string[]
  /** Material direction the AI eyeballed (e.g. existing worktop colour). */
  materialHints?: string[]
  /** One view per space photo, in upload order (absent on reads saved before 2026-10-03). */
  photoViews?: PhotoView[]
  /** A room meant for a kitchen with no cabinets in it yet. Not a rejection: lookedLikeKitchen stays true. */
  emptyRoom?: boolean
  /** False if the photos didn't look like a kitchen — triggers re-upload affordance. */
  lookedLikeKitchen: boolean
  /** What the model thinks it saw — short, used for chip read-back. */
  summary?: string
}

/** One iteration of the AI img2img concept render. Capped at 5 per session. */
export type ConceptRenderInputRole =
  | 'anchor'
  | 'style'
  | 'product'
  | 'previous_render'
  /** Another space photo of the same room, from another position (IMP-32). */
  | 'room_reference'
  /** A render of the same redesign from another camera; its finishes are matched. */
  | 'design_reference'

export interface ConceptRenderInput {
  role: ConceptRenderInputRole
  /** Thumbnail (data URL) so the maker can see what the homeowner pointed at. */
  imageDataUrl: string
  /** Required for role='product' (e.g. "stove"). Optional for the others. */
  label?: string
  /** role='room_reference': 0-based index into the space photos. */
  photoIndex?: number
  /** Which wall or corner the photo shows (anchor, room_reference). */
  shows?: PhotoViewTarget
}

export interface ConceptRender {
  id: string
  imageDataUrl: string
  prompt: string
  modelVersion: string
  /** Index of the user-uploaded photo this render was anchored to. */
  anchorPhotoIndex: number
  /** Chip nudges applied (e.g. "warmer", "darker cabinets"). */
  nudges: string[]
  /** Free-text adjustment the homeowner typed for this iteration, if any. */
  freeTextNudge?: string
  /**
   * Ordered manifest of every image we sent to the renderer for this version,
   * with the role each one played. Lets the maker dashboard show the
   * homeowner's actual references (their stove photo, the inspiration shot,
   * the prior render they iterated on, etc.) — not just the AI output.
   */
  inputs: ConceptRenderInput[]
  generatedAt: string
  /** 'other_side' = rendered from another photo to show the rest of the room. Absent = main (older saves too). */
  view?: 'main' | 'other_side'
  /** For an 'other_side' render: the main render it matches. */
  basedOnRenderId?: string
}

export interface LeadProfile {
  // ---- Project meta
  projectType?: string
  timeline?: string
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
  /**
   * Confirmed cm-based floor plan. Created from `spaceVisionResult` (or a
   * shape preset, if the homeowner skipped photos), then mutated as the
   * homeowner adjusts dimensions, walls, openings, and features in the
   * Konva editor. Per-element `confidence` + `source` carries provenance
   * for the maker dashboard. Always prefer this over `spaceVisionResult`
   * when rendering or quoting against the brief.
   */
  floorPlan?: import('@/lib/floor-plan').FloorPlan
  /**
   * The room as it is today, as confirmed on the room step: shape and the walls
   * the homeowner measured. Never edited after that step, so later steps can
   * compare the kitchen they want with the one they have (where the sink moves).
   */
  existingFloorPlan?: import('@/lib/floor-plan').FloorPlan
  /** Whether the room has a kitchen in it today, from the room step. */
  existingRoom?: 'kitchen' | 'empty'
  /** What the homeowner wants to do with today's layout (room step). */
  layoutIntent?: LayoutIntent
  /**
   * Set when the room step was completed — every counter wall measured. The
   * render's gate and the resume rule read this, not the live plan: a later
   * layout edit on the confirm step must not take back a measurement. The
   * fingerprint and intent say which room the working plan was built from.
   */
  roomConfirmed?: { at: number; intent?: LayoutIntent; fingerprint: string }
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
  /** Signed-in customers: their account email (stamped server-side on handoff). */
  email?: string
  /** Signed-in customers: optional, for makers who would rather call. */
  phone?: string
  /** Anonymous funnel only: the one channel they typed. Read via contactChannels. */
  contactValue?: string

  // ---- Attachments
  photosShared?: boolean
  moodBoardItems?: MoodBoardItem[]
  conceptVisualReactions?: string[]

  // ---- Concept render (img2img anchored to a space photo)
  conceptRenders?: ConceptRender[]
  conceptRenderChosenId?: string

  /**
   * Phase-2 builder state — every confirmed component selection plus the
   * computed BOM + price range. Stored as `unknown` here to avoid pulling the
   * full builder type tree into LeadProfile; the builder module casts on read.
   * Set when the homeowner walks through (and finishes) the Builder step.
   */
  builderState?: unknown

  /**
   * Epoch ms when the homeowner signed off the derived layout contract at the
   * `confirm_look` step (where they see the cabinet tally we'll price below the
   * editor). Records the sign-off for the maker's provenance trail.
   */
  contractConfirmedAt?: number

  /**
   * Per-row cabinet-unit edits from the confirm-layout card (sparse pattern
   * sequences — see `UnitEdits` in lib/builder/unit-assembly). Stored as
   * `unknown` like `builderState` to keep builder types out of LeadProfile;
   * the builder casts on read. Applied LAST in the one assembler, so the tally
   * the homeowner locked is exactly what the builder prices.
   */
  unitEdits?: unknown

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
  /**
   * The id this submit's brief is saved under, minted on the client when the
   * homeowner sends (lib/handoff/brief-id). Rides in the snapshot so a wrap-up
   * that remounts re-sends the SAME brief — which the server recognises —
   * rather than creating a second one. Absent on snapshots from before.
   */
  briefId?: string
  /**
   * The content print (lib/handoff/review `briefPrint`) of the profile this
   * review was built from (IMP-07). Finishing again with the same print keeps
   * this review and its `briefId`, so a walk back through the steps that
   * changed nothing never becomes a second brief. Absent on snapshots from
   * before: those are rebuilt once.
   */
  profilePrint?: string
}

export interface ClientMessage {
  role: 'user' | 'assistant'
  content: string
  images?: string[]
}

/**
 * The range a brief carries, priced from the homeowner's build. A brief whose
 * homeowner skipped the builder carries none (`estimate: null`): there is no
 * fallback number.
 */
export interface HandoffEstimate {
  /** Main range: kitchen only, excluding appliance supply. */
  low: number
  high: number
  /**
   * The kitchen plus the goods the maker supplies (appliances, sink + tap, or
   * both); null when the maker supplies none. The name is historical: label it
   * by what the goods hold (`withGoodsKey(lines)`), never "with appliances"
   * blindly — the homeowner may buy the appliances and leave the sink with the maker.
   */
  withAppliances: { low: number; high: number } | null
  basis: string
  /** Half-width of the range in percent (e.g. 20 for ±20%), for localized display. */
  bandPct?: number
  /**
   * MAKER-ONLY B2B cost basis for the all-in figure (retail stays the
   * homeowner number), at cost: no workshop margin. Computed by `makerCostFor`
   * on the maker's brief page at view time, once the maker has supplied B2B
   * prices (src/lib/catalog/maker-pricing.json). Never stored with the brief,
   * never sent to the homeowner (IMP-05); toCustomerBundle drops it as a guard.
   */
  makerCost?: { low: number; high: number }
  /**
   * MAKER-ONLY. The works at cost (material + make + install, before the
   * margin), what the workshop margin adds, and the margin in percent. For the
   * brief page; stored with the brief, stripped from the customer's response
   * (toCustomerBundle). Absent on briefs priced before IMP-04.
   */
  maker?: import('@/lib/builder/bom').BomMakerOnly
  /**
   * How the range was priced. 'gross-margin-v1' (IMP-04): every line incl.
   * PDV, workshop margin inside material + make. Absent ⇒ a brief priced
   * before IMP-04, at net cost with no margin: flag it as the old calculation
   * and keep it out of the ±20% hit rate (its quotes land high by design).
   */
  priceBasis?: 'gross-margin-v1'
  /**
   * What the range assumes and leaves out, as keys (`range.assumption.<key>`),
   * copied from the same computeBom call. Absent on briefs sent before IMP-04:
   * read it through `normalizeAssumptions`, which gives those the legacy list.
   */
  assumptions?: import('@/lib/builder/range').BomAssumption[]
  /**
   * The build line by line, priced by the same computeBom call as the totals
   * above so the two always agree. Stored at submit because prices and the
   * catalog move between deploys. Absent on briefs sent before it was stored.
   */
  lines?: import('@/lib/builder/bom').BomLineItem[]
}

/** Shape returned by /api/handoff for the designer-facing pack. */
export interface HandoffBundle {
  brief: LeadProfile
  moodBoard: MoodBoardItem[]
  /**
   * Floor plan for the maker. Includes both the structured cm-based model
   * (so the maker dashboard can render provenance pills per element) and a
   * static SVG (so the bundle is human-skimmable / printable).
   */
  floorPlan: {
    plan: import('@/lib/floor-plan').FloorPlan
    svg: string
    disclaimer: string
  } | null
  /** Legacy concept_visual references (catalog-based; superseded by conceptRenders). */
  explorationRefs: ConceptVisualRef[]
  /** The homeowner's chosen img2img concept render. */
  chosenRender: (ConceptRender & { conceptOnly: true }) | null
  estimate: HandoffEstimate | null
  transcript: ClientMessage[]
  generatedAt: string
  /**
   * Set when the brief was persisted (Supabase configured): the row id. Absent
   * in DB-less dev — the wrap-up then says so and offers the JSON download
   * instead of pretending it was sent. No maker path: the homeowner gets this
   * bundle, and the maker's page is not theirs to open (IMP-05).
   */
  briefId?: string
}
