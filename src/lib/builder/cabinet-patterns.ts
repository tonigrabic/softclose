/**
 * PATTERN_SPECS — the deterministic table that turns a CabinetPattern into
 * BOM-ready facts: drawer count, hardware multiplier, accessory cost,
 * width/type constraints, and the i18n + icon tags the picker needs.
 *
 * The pattern is the trade language the maker reads. Door/drawer counts and
 * corner status are derived from this table, never stored on the unit.
 */

import type { CabinetPattern, CabinetUnit } from './inventory'

export type PatternIcon =
  | 'doors'
  | 'drawers'
  | 'mixed'
  | 'sink'
  | 'trash'
  | 'corner'
  | 'tall'
  | 'wine'
  | 'shelves'

export interface PatternSpec {
  /** Drawer count used by the hardware BOM (0 = doors only). */
  defaultDrawers: number
  /** Multiplier applied to per-base-unit hardware. Larders & sink units > 1. */
  hardwareMultiplier: number
  minWidthMm: number
  maxWidthMm: number
  /** Range cost per unit for the dedicated mechanism (magic corner, larder gear, etc). */
  accessoryCost: { low: number; high: number } | null
  allowedTypes: CabinetUnit['type'][]
  /** i18n key for the pattern label. */
  labelKey: string
  iconKey: PatternIcon
  isCorner: boolean
}

export const PATTERN_SPECS: Record<CabinetPattern, PatternSpec> = {
  doors_shelf: {
    defaultDrawers: 0,
    hardwareMultiplier: 1.0,
    minWidthMm: 300,
    maxWidthMm: 1200,
    accessoryCost: null,
    allowedTypes: ['base', 'wall', 'tall'],
    labelKey: 'builder.cabinetBoxes.pattern.doors_shelf',
    iconKey: 'doors',
    isCorner: false,
  },
  drawer_bank: {
    defaultDrawers: 4,
    hardwareMultiplier: 1.0,
    minWidthMm: 400,
    maxWidthMm: 1200,
    accessoryCost: null,
    allowedTypes: ['base'],
    labelKey: 'builder.cabinetBoxes.pattern.drawer_bank',
    iconKey: 'drawers',
    isCorner: false,
  },
  pullouts_inside_doors: {
    defaultDrawers: 2,
    hardwareMultiplier: 1.2,
    minWidthMm: 400,
    maxWidthMm: 1200,
    accessoryCost: { low: 80, high: 220 },
    allowedTypes: ['base', 'tall'],
    labelKey: 'builder.cabinetBoxes.pattern.pullouts_inside_doors',
    iconKey: 'mixed',
    isCorner: false,
  },
  drawer_door_combo: {
    defaultDrawers: 1,
    hardwareMultiplier: 1.0,
    minWidthMm: 400,
    maxWidthMm: 1200,
    accessoryCost: null,
    allowedTypes: ['base'],
    labelKey: 'builder.cabinetBoxes.pattern.drawer_door_combo',
    iconKey: 'mixed',
    isCorner: false,
  },
  sink_unit: {
    defaultDrawers: 0,
    hardwareMultiplier: 1.1,
    minWidthMm: 600,
    maxWidthMm: 1200,
    accessoryCost: { low: 30, high: 90 },
    allowedTypes: ['base'],
    labelKey: 'builder.cabinetBoxes.pattern.sink_unit',
    iconKey: 'sink',
    isCorner: false,
  },
  trash_pullout: {
    defaultDrawers: 1,
    hardwareMultiplier: 1.1,
    minWidthMm: 300,
    maxWidthMm: 600,
    accessoryCost: { low: 90, high: 220 },
    allowedTypes: ['base'],
    labelKey: 'builder.cabinetBoxes.pattern.trash_pullout',
    iconKey: 'trash',
    isCorner: false,
  },
  corner_magic: {
    defaultDrawers: 0,
    hardwareMultiplier: 1.0,
    minWidthMm: 800,
    maxWidthMm: 1200,
    accessoryCost: { low: 180, high: 380 },
    allowedTypes: ['base'],
    labelKey: 'builder.cabinetBoxes.pattern.corner_magic',
    iconKey: 'corner',
    isCorner: true,
  },
  corner_lazy: {
    defaultDrawers: 0,
    hardwareMultiplier: 1.0,
    minWidthMm: 800,
    maxWidthMm: 1200,
    accessoryCost: { low: 90, high: 220 },
    allowedTypes: ['base'],
    labelKey: 'builder.cabinetBoxes.pattern.corner_lazy',
    iconKey: 'corner',
    isCorner: true,
  },
  oven_housing: {
    defaultDrawers: 1,
    hardwareMultiplier: 1.2,
    minWidthMm: 600,
    maxWidthMm: 600,
    accessoryCost: { low: 40, high: 120 },
    allowedTypes: ['tall'],
    labelKey: 'builder.cabinetBoxes.pattern.oven_housing',
    iconKey: 'tall',
    isCorner: false,
  },
  pullout_larder: {
    defaultDrawers: 5,
    hardwareMultiplier: 1.6,
    minWidthMm: 400,
    maxWidthMm: 600,
    accessoryCost: { low: 280, high: 600 },
    allowedTypes: ['tall'],
    labelKey: 'builder.cabinetBoxes.pattern.pullout_larder',
    iconKey: 'tall',
    isCorner: false,
  },
  wine_pullout: {
    defaultDrawers: 0,
    hardwareMultiplier: 1.0,
    minWidthMm: 300,
    maxWidthMm: 600,
    accessoryCost: { low: 90, high: 260 },
    allowedTypes: ['base', 'tall'],
    labelKey: 'builder.cabinetBoxes.pattern.wine_pullout',
    iconKey: 'wine',
    isCorner: false,
  },
  open_shelves: {
    defaultDrawers: 0,
    hardwareMultiplier: 0.4,
    minWidthMm: 300,
    maxWidthMm: 1200,
    accessoryCost: null,
    allowedTypes: ['wall'],
    labelKey: 'builder.cabinetBoxes.pattern.open_shelves',
    iconKey: 'shelves',
    isCorner: false,
  },
}

export function patternsForType(type: CabinetUnit['type']): CabinetPattern[] {
  return (Object.keys(PATTERN_SPECS) as CabinetPattern[]).filter((p) =>
    PATTERN_SPECS[p].allowedTypes.includes(type)
  )
}

export function defaultPatternForType(type: CabinetUnit['type']): CabinetPattern {
  if (type === 'wall') return 'doors_shelf'
  if (type === 'tall') return 'oven_housing'
  return 'doors_shelf'
}

export function unitDrawerCount(unit: CabinetUnit): number {
  return PATTERN_SPECS[unit.pattern].defaultDrawers
}

export function unitIsCorner(unit: CabinetUnit): boolean {
  return PATTERN_SPECS[unit.pattern].isCorner
}

export function unitAccessoryCost(unit: CabinetUnit): { low: number; high: number } | null {
  return PATTERN_SPECS[unit.pattern].accessoryCost
}

export function unitHardwareMultiplier(unit: CabinetUnit): number {
  return PATTERN_SPECS[unit.pattern].hardwareMultiplier
}
