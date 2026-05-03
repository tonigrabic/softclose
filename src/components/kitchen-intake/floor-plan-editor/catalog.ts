/**
 * Editor-facing catalog of element kinds, their friendly labels for sentence
 * UIs, and size buckets ("small / medium / large") with their cm widths. Used
 * by the toolbar, the sentence builder, and the chip-style selection panel.
 *
 * Single source of truth so renaming "Hob" to "Cooktop" only happens here.
 */
import {
  Box,
  CookingPot,
  DoorOpen,
  Droplet,
  Square,
  SquareSquare,
  Wind,
} from 'lucide-react'
import type { ComponentType, SVGProps } from 'react'
import { parseLengthToCm, type FeatureKind, type OpeningKind } from '@/lib/floor-plan'

// Discriminator for "what can we add to a kitchen?". Excludes Island — island
// is a special case (no wall, has its own UX path).
export type AddableKind =
  | { kind: 'opening'; openingKind: OpeningKind }
  | { kind: 'feature'; featureKind: FeatureKind }

export interface SizeBucket {
  /** Stable id for keys / equality. */
  id: 'small' | 'medium' | 'large'
  label: string
  cm: number
}

export interface ElementCatalogEntry {
  /** Friendly singular noun for sentences: "a window". */
  article: string
  /** Title-case label: "Window". */
  label: string
  /** Short label for tight chips: "Window". */
  shortLabel: string
  /** Lucide icon component used in toolbar + chips. */
  icon: ComponentType<SVGProps<SVGSVGElement>>
  /** Size buckets in cm — first entry is the default for "Add". */
  sizes: SizeBucket[]
  /** Default cm width for new elements (used when no size chip picked). */
  defaultCm: number
}

export const ELEMENT_CATALOG: Record<string, ElementCatalogEntry> = {
  window: {
    article: 'a window',
    label: 'Window',
    shortLabel: 'Window',
    icon: SquareSquare,
    sizes: [
      { id: 'small', label: 'Small', cm: 60 },
      { id: 'medium', label: 'Medium', cm: 110 },
      { id: 'large', label: 'Large', cm: 180 },
    ],
    defaultCm: 110,
  },
  door: {
    article: 'a door',
    label: 'Door',
    shortLabel: 'Door',
    icon: DoorOpen,
    sizes: [
      { id: 'small', label: 'Narrow', cm: 70 },
      { id: 'medium', label: 'Standard', cm: 80 },
      { id: 'large', label: 'Wide', cm: 100 },
    ],
    defaultCm: 80,
  },
  passage: {
    article: 'a passage',
    label: 'Passage',
    shortLabel: 'Passage',
    icon: Wind,
    sizes: [
      { id: 'small', label: 'Narrow', cm: 100 },
      { id: 'medium', label: 'Standard', cm: 130 },
      { id: 'large', label: 'Wide', cm: 200 },
    ],
    defaultCm: 130,
  },
  sink: {
    article: 'a sink',
    label: 'Sink',
    shortLabel: 'Sink',
    icon: Droplet,
    sizes: [
      { id: 'small', label: 'Single', cm: 60 },
      { id: 'medium', label: 'Standard', cm: 80 },
      { id: 'large', label: 'Double', cm: 100 },
    ],
    defaultCm: 80,
  },
  hob: {
    article: 'a hob',
    label: 'Hob',
    shortLabel: 'Hob',
    icon: CookingPot,
    sizes: [
      { id: 'small', label: '60 cm', cm: 60 },
      { id: 'medium', label: '75 cm', cm: 75 },
      { id: 'large', label: '90 cm', cm: 90 },
    ],
    defaultCm: 75,
  },
  fridge: {
    article: 'a fridge',
    label: 'Fridge',
    shortLabel: 'Fridge',
    icon: Box,
    sizes: [
      { id: 'small', label: 'Standard', cm: 60 },
      { id: 'medium', label: 'Wide', cm: 75 },
      { id: 'large', label: 'American', cm: 90 },
    ],
    defaultCm: 75,
  },
  dishwasher: {
    article: 'a dishwasher',
    label: 'Dishwasher',
    shortLabel: 'DW',
    icon: Square,
    sizes: [
      { id: 'small', label: 'Slim', cm: 45 },
      { id: 'medium', label: 'Standard', cm: 60 },
      { id: 'large', label: 'Standard', cm: 60 },
    ],
    defaultCm: 60,
  },
}

export const OPENING_KINDS: OpeningKind[] = ['window', 'door', 'passage']
export const FEATURE_KINDS: FeatureKind[] = ['sink', 'hob', 'fridge', 'dishwasher']

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

/** Map a cm width back to the closest size bucket id for a given element. */
export function bucketForCm(entry: ElementCatalogEntry, cm: number): SizeBucket['id'] | 'custom' {
  const exact = entry.sizes.find((s) => s.cm === cm)
  if (exact) return exact.id
  return 'custom'
}
