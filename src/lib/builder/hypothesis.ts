/**
 * BuilderHypothesis — the AI's first-pass guess at every component group.
 *
 * Produced once at builder entry by /api/builder-hypothesis (single vision
 * call against the chosen render + Phase-1 profile). The Builder UI hydrates
 * BuilderState from this hypothesis so each group opens *pre-filled* with the
 * AI's suggestion + confidence, and the user only has to confirm or swap.
 *
 * Each field is shape-compatible with the equivalent BuilderState field, so
 * the hydration step is a structural copy (no transformation required).
 *
 * Fields are intentionally OPTIONAL: the AI returns only what it can see /
 * infer. Anything missing falls back to a sensible default at hydration time.
 */

import type {
  CabinetPattern,
  CarcassMaterial,
  ConfidenceLevel,
  CornerSolution,
  DoorOverlay,
  DoorStyle,
  DrawerSystemTier,
  FrontMaterial,
  MdfProfile,
  EdgeProfile,
  HandleFinish,
  HandleStyle,
  HingeType,
  LayoutShape,
  PlinthMaterial,
  SinkBowls,
  SinkMaterial,
  SinkMount,
  TapType,
  WorktopFamily,
  BacksplashKind,
} from './inventory'

interface Hint<T> {
  value: T
  confidence: ConfidenceLevel
  /** Short reason — shown to the user as "we saw X in your render". i18n key OR free text. */
  reason?: string
}

/* 1. Layout */
export interface LayoutHypothesis {
  shape?: Hint<LayoutShape>
  hasIsland?: Hint<boolean>
  ceilingHeightCm?: Hint<number>
  /**
   * Inferred wall runs — one per cabinet-bearing wall. For non-rectangular
   * shapes (L/U) the AI returns each run separately so we don't lose info.
   */
  runs?: {
    id: string
    label: string
    lengthCm: Hint<number>
    hasBase?: Hint<boolean>
    hasWall?: Hint<boolean>
    hasTall?: Hint<boolean>
  }[]
}

/* 2. Cabinet boxes */
export interface CabinetBoxesHypothesis {
  carcassMaterial?: Hint<CarcassMaterial>
  cornerSolution?: Hint<CornerSolution>
  /** Suggested module breakdown by run, summed by type. */
  unitCounts?: {
    base?: Hint<number>
    wall?: Hint<number>
    tall?: Hint<number>
  }
  /**
   * Pre-segmented cabinet patterns from vision. Each entry pins a pattern at
   * a position along a run; hydration overrides the heuristic in
   * `cabinet-suggest` for matching slots.
   */
  unitPatterns?: {
    runId: string
    positionPctAlongRun: number
    pattern: CabinetPattern
    confidence: ConfidenceLevel
  }[]
}

/* 3. Doors */
export interface DoorsHypothesis {
  /** What the fronts are made of, read from the render. */
  material?: Hint<FrontMaterial>
  /** Lacquered MDF only: flat / inset panel / routed relief. */
  profile?: Hint<MdfProfile>
  /** Legacy look read — hydration maps it when `material` is absent. */
  style?: Hint<DoorStyle>
  /** Catalog decor code suggestion — must match a code in elgrad-decors.json. */
  decorCode?: Hint<string>
  decorStructure?: Hint<string>
  overlay?: Hint<DoorOverlay>
  edgeProfile?: Hint<EdgeProfile>
  /** Free-form color description for fallback ("warm matte black, no grain"). */
  colorDescription?: string
}

/* 4. Worktop */
export interface WorktopHypothesis {
  family?: Hint<WorktopFamily>
  decorCode?: Hint<string>
  decorStructure?: Hint<string>
  thicknessMm?: Hint<38 | 20 | 12>
}

/* 5. Backsplash */
export interface BacksplashHypothesis {
  kind?: Hint<BacksplashKind>
}

/* 6. Hardware */
export interface HardwareHypothesis {
  drawerSystemTier?: Hint<DrawerSystemTier>
  hingeType?: Hint<HingeType>
  handleStyle?: Hint<HandleStyle>
  handleFinish?: Hint<HandleFinish>
}

/* 7. Appliances */
export interface AppliancesHypothesis {
  hob?: Hint<'induction' | 'gas' | 'ceramic' | 'unknown'>
  oven?: Hint<'single' | 'double' | 'combi' | 'unknown'>
  extractor?: Hint<'chimney' | 'island' | 'downdraft' | 'recirculating' | 'ceiling_recessed' | 'unknown'>
  /** @deprecated kept for back-compat with older payloads — prefer `fridge.integrated`. */
  fridgeIntegrated?: Hint<boolean>
  /** @deprecated kept for back-compat with older payloads — prefer `dishwasher.integrated`. */
  dishwasherIntegrated?: Hint<boolean>
  fridge?: { present: Hint<boolean>; integrated?: Hint<boolean> }
  dishwasher?: { present: Hint<boolean>; integrated?: Hint<boolean> }
  microwave?: Hint<{ present: boolean; integrated?: boolean }>
  wineFridge?: Hint<boolean>
  coffeeStation?: Hint<boolean>
}

/* Visible features that don't slot into a single component group. */
export interface FeaturesHypothesis {
  tallPantry?: { present: Hint<boolean>; runId?: string }
  windowOnRun?: { runId: string; widthCm?: Hint<number> }
  openShelving?: Hint<boolean>
  corniceVisible?: Hint<boolean>
  /** Free-text colour hints for the maker (floor / wall reference). */
  floorColorHint?: string
  wallColorHint?: string
}

/* 8. Sink & taps */
export interface SinkTapsHypothesis {
  sinkBowls?: Hint<SinkBowls>
  sinkMount?: Hint<SinkMount>
  sinkMaterial?: Hint<SinkMaterial>
  tapType?: Hint<TapType>
  tapFinish?: Hint<HandleFinish>
}

/* 9. Lighting */
export interface LightingHypothesis {
  /** Built-in LED visible (under wall units, in shelves or the plinth). */
  led?: Hint<boolean>
}

/* 10. Finishing */
export interface FinishingHypothesis {
  plinthHeightMm?: Hint<100 | 150>
  plinthMaterial?: Hint<PlinthMaterial>
}

/** The full hypothesis returned in one shot. */
export interface BuilderHypothesis {
  /** Was the render usable? If false, the builder shows a "skip to manual" affordance. */
  usable: boolean
  /** Brief one-liner for the user: "Looks like an L-shaped kitchen with matte black doors…" */
  summary?: string

  layout?: LayoutHypothesis
  cabinetBoxes?: CabinetBoxesHypothesis
  doors?: DoorsHypothesis
  worktop?: WorktopHypothesis
  backsplash?: BacksplashHypothesis
  hardware?: HardwareHypothesis
  appliances?: AppliancesHypothesis
  sinkTaps?: SinkTapsHypothesis
  lighting?: LightingHypothesis
  finishing?: FinishingHypothesis
  features?: FeaturesHypothesis
}
