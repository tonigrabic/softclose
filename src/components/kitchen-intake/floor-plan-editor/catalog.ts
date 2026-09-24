/**
 * Editor-facing catalog of element kinds: icon, size buckets ("small / medium /
 * large") with their cm widths, and the default width. Used by the toolbar,
 * the sentence builder, and the chip-style selection panel.
 *
 * Words live in the locale files, keyed by kind: floorPlan.kind.* (label),
 * floorPlan.kindShort.* (toolbar + canvas), floorPlan.kindAdd.* (inside the
 * "Add …" sentence) and floorPlan.size.<kind>.<bucket>.
 */
import {
  Box,
  CookingPot,
  DoorOpen,
  Droplet,
  Fan,
  Flame,
  Square,
  SquareSquare,
  Wind,
} from 'lucide-react'
import type { ComponentType, SVGProps } from 'react'
import { parseLengthToCm, type FeatureKind, type OpeningKind } from '@/lib/floor-plan'
import type { TranslationKey } from '@/lib/i18n/core'

// Discriminator for "what can we add to a kitchen?". Excludes Island — island
// is a special case (no wall, has its own UX path).
export type AddableKind =
  | { kind: 'opening'; openingKind: OpeningKind }
  | { kind: 'feature'; featureKind: FeatureKind }

export interface SizeBucket {
  /** Stable id for keys / equality. */
  id: 'small' | 'medium' | 'large'
  /** Word label ("Narrow"). Absent when the bucket is just its width (hob: "60 cm"). */
  labelKey?: TranslationKey
  cm: number
}

export interface ElementCatalogEntry {
  /** Lucide icon component used in toolbar + chips. */
  icon: ComponentType<SVGProps<SVGSVGElement>>
  /** Size buckets in cm — first entry is the default for "Add". */
  sizes: SizeBucket[]
  /** Default cm width for new elements (used when no size chip picked). */
  defaultCm: number
}

export const ELEMENT_CATALOG: Record<OpeningKind | FeatureKind, ElementCatalogEntry> = {
  window: {
    icon: SquareSquare,
    sizes: [
      { id: 'small', labelKey: 'floorPlan.size.window.small', cm: 60 },
      { id: 'medium', labelKey: 'floorPlan.size.window.medium', cm: 110 },
      { id: 'large', labelKey: 'floorPlan.size.window.large', cm: 180 },
    ],
    defaultCm: 110,
  },
  door: {
    icon: DoorOpen,
    sizes: [
      { id: 'small', labelKey: 'floorPlan.size.door.small', cm: 70 },
      { id: 'medium', labelKey: 'floorPlan.size.door.medium', cm: 80 },
      { id: 'large', labelKey: 'floorPlan.size.door.large', cm: 100 },
    ],
    defaultCm: 80,
  },
  passage: {
    icon: Wind,
    sizes: [
      { id: 'small', labelKey: 'floorPlan.size.passage.small', cm: 100 },
      { id: 'medium', labelKey: 'floorPlan.size.passage.medium', cm: 130 },
      { id: 'large', labelKey: 'floorPlan.size.passage.large', cm: 200 },
    ],
    defaultCm: 130,
  },
  sink: {
    icon: Droplet,
    sizes: [
      { id: 'small', labelKey: 'floorPlan.size.sink.small', cm: 60 },
      { id: 'medium', labelKey: 'floorPlan.size.sink.medium', cm: 80 },
      { id: 'large', labelKey: 'floorPlan.size.sink.large', cm: 100 },
    ],
    defaultCm: 80,
  },
  hob: {
    icon: CookingPot,
    sizes: [
      { id: 'small', cm: 60 },
      { id: 'medium', cm: 75 },
      { id: 'large', cm: 90 },
    ],
    defaultCm: 75,
  },
  fridge: {
    icon: Box,
    sizes: [
      { id: 'small', labelKey: 'floorPlan.size.fridge.small', cm: 60 },
      { id: 'medium', labelKey: 'floorPlan.size.fridge.medium', cm: 75 },
      { id: 'large', labelKey: 'floorPlan.size.fridge.large', cm: 90 },
    ],
    defaultCm: 75,
  },
  dishwasher: {
    icon: Square,
    sizes: [
      { id: 'small', labelKey: 'floorPlan.size.dishwasher.small', cm: 45 },
      { id: 'medium', labelKey: 'floorPlan.size.dishwasher.medium', cm: 60 },
      { id: 'large', labelKey: 'floorPlan.size.dishwasher.large', cm: 60 },
    ],
    defaultCm: 60,
  },
  oven: {
    icon: Flame,
    sizes: [
      { id: 'small', cm: 45 },
      { id: 'medium', cm: 60 },
      { id: 'large', cm: 90 },
    ],
    defaultCm: 60,
  },
  hood: {
    icon: Fan,
    sizes: [
      { id: 'small', cm: 60 },
      { id: 'medium', cm: 75 },
      { id: 'large', cm: 90 },
    ],
    defaultCm: 60,
  },
}

export const OPENING_KINDS: OpeningKind[] = ['window', 'door', 'passage']
// Cooking cluster grouped together: sink, hob, oven, hood, then cold + dishwasher.
export const FEATURE_KINDS: FeatureKind[] = ['sink', 'hob', 'oven', 'hood', 'fridge', 'dishwasher']

export function entryForOpening(kind: OpeningKind): ElementCatalogEntry {
  return ELEMENT_CATALOG[kind]
}
export function entryForFeature(kind: FeatureKind): ElementCatalogEntry {
  return ELEMENT_CATALOG[kind]
}

/** Convert a typed string ("70cm", "8'6") to cm, clamped to a safe element band. */
export function parseSizeToCm(raw: string): number | null {
  const cm = parseLengthToCm(raw)
  if (cm === null) return null
  if (cm < 20 || cm > 600) return null
  return Math.round(cm)
}

/** A bucket's chip label: its word ("Narrow") or, for width-only buckets, "60 cm". */
export function sizeBucketLabel(bucket: SizeBucket, t: (key: TranslationKey) => string): string {
  return bucket.labelKey ? t(bucket.labelKey) : `${bucket.cm} cm`
}

/** Map a cm width back to the closest size bucket id for a given element. */
export function bucketForCm(entry: ElementCatalogEntry, cm: number): SizeBucket['id'] | 'custom' {
  const exact = entry.sizes.find((s) => s.cm === cm)
  if (exact) return exact.id
  return 'custom'
}
