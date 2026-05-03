/**
 * BOM (Bill of Materials) calculator.
 *
 * Translates BuilderState into priced line items using the Elgrad catalog
 * (boards, worktops, services) plus reference RRP for hardware/appliances/
 * sink-taps until the Schachermayer scrape lands.
 *
 * Output is always a *range* (low/high), never a single number — see
 * Principle 6 of product-foundations.md. The width of the range reflects
 * uncertainty: ±10 % when most fields are H confidence, ±25 % otherwise,
 * widened further for any missing source price.
 */

import { decors as catalogDecors, services, doorPricePerM2, worktopPricePerM, findDecor } from '@/lib/catalog'
import { PATTERN_SPECS } from './cabinet-patterns'
import type { BuilderState, CabinetUnit, DrawerSystemTier } from './inventory'

export interface BomLineItem {
  /** Stable id usable as React key + i18n routing. */
  key:
    | 'boards'
    | 'worktop'
    | 'backsplash'
    | 'edgeBanding'
    | 'services'
    | 'hardware'
    | 'accessories'
    | 'appliances'
    | 'sinkTaps'
    | 'lighting'
    | 'installLabour'
  /** Plain-language explanation suitable for the side panel + maker handoff. */
  detail: string
  /** Quantity + unit (e.g. "8.4 m²", "12 doors"). */
  quantity: string
  /** Range in EUR. */
  low: number
  high: number
}

export interface BomEstimate {
  lineItems: BomLineItem[]
  total: { low: number; high: number }
  /** ±X% width of the range — informative for the disclaimer copy. */
  bandWidthPct: number
  currency: 'EUR'
}

/* ───────────────────────── Helpers ───────────────────────── */

const BOARD_AREA_M2_PER_LINEAR_M = {
  /** Base cabinet door + carcass front + back panel approximation, per linear metre of run. */
  base: 1.6,
  /** Wall cabinet (smaller doors, less back panel). */
  wall: 0.9,
  /** Tall units include full-height door + side panel. */
  tall: 4.5,
}

/** Layout-only fallback used when no cabinet units have been seeded yet. */
function boardAreaForRun(lengthM: number, hasBase: boolean, hasWall: boolean, hasTall: boolean): number {
  let m2 = 0
  if (hasBase) m2 += lengthM * BOARD_AREA_M2_PER_LINEAR_M.base
  if (hasWall) m2 += lengthM * BOARD_AREA_M2_PER_LINEAR_M.wall
  if (hasTall) m2 += BOARD_AREA_M2_PER_LINEAR_M.tall // one tall unit per run that has tall = true
  return m2
}

/**
 * Per-unit board areas — separate door-face area (priced at the chosen decor)
 * from carcass area (priced at standard white melamine). Numbers are
 * conservative averages tuned against typical Croatian-market frameless
 * carcasses; they're meant to react to user edits, not to be quote-accurate.
 */
function unitDoorAreaM2(u: CabinetUnit): number {
  const wM = u.widthMm / 1000
  if (u.type === 'tall') return wM * (u.heightMm / 1000) // full-height door
  // Base + wall: door height tracks unit height (≈ 0.72 m typical).
  return wM * (u.heightMm / 1000)
}

function unitCarcassAreaM2(u: CabinetUnit): number {
  const wM = u.widthMm / 1000
  const hM = u.heightMm / 1000
  const dM = u.depthMm / 1000
  // Two side panels + bottom + top + back ≈ 2·(h·d) + 2·(w·d) + (w·h)
  return 2 * hM * dM + 2 * wM * dM + wM * hM
}

function widenByConfidence(low: number, high: number, missingSource: boolean): { low: number; high: number } {
  if (missingSource) {
    return { low: low * 0.7, high: high * 1.4 }
  }
  return { low, high }
}

/**
 * Hardware reference RRP fallback by tier — generic drawer + 2 hinges +
 * handles per "cabinet equivalent". `perDrawer` is the marginal cost added
 * for every internal drawer (which is the chunk that scales most strongly
 * with user choices).
 */
const HARDWARE_TIER_RRP: Record<
  DrawerSystemTier,
  { perBaseUnit: { low: number; high: number }; perDrawer: { low: number; high: number } }
> = {
  budget: { perBaseUnit: { low: 35, high: 60 }, perDrawer: { low: 18, high: 30 } },
  mid: { perBaseUnit: { low: 70, high: 130 }, perDrawer: { low: 40, high: 75 } }, // Grass Nova Pro
  premium: { perBaseUnit: { low: 140, high: 240 }, perDrawer: { low: 90, high: 160 } }, // Blum Legrabox
}

/* ───────────────────────── Main calculator ───────────────────────── */

export function computeBom(state: BuilderState): BomEstimate {
  const lineItems: BomLineItem[] = []

  /* 1. Boards (carcass + door panels) ─────────────────────────────────── */
  const units = state.cabinetBoxes.units
  const usingUnitModel = units.length > 0

  let doorAreaM2 = 0
  let carcassAreaM2 = 0
  if (usingUnitModel) {
    for (const u of units) {
      doorAreaM2 += unitDoorAreaM2(u)
      carcassAreaM2 += unitCarcassAreaM2(u)
    }
  } else {
    // Layout-only fallback (Builder just opened, no units seeded yet).
    const totalBoardM2 = state.layout.runs.reduce(
      (s, r) => s + boardAreaForRun(r.lengthCm / 100, r.hasBase, r.hasWall, r.hasTall),
      0
    )
    doorAreaM2 = totalBoardM2 * 0.4
    carcassAreaM2 = totalBoardM2 * 0.6
  }
  const totalBoardM2 = doorAreaM2 + carcassAreaM2

  const doorDecor = findDecor(state.doors.decorCode, state.doors.decorStructure)
  const doorPriceM2 = doorDecor ? doorPricePerM2(doorDecor) ?? 22 : 22 // catalog mean fallback
  // Carcass: standard white melamine 18mm if mismatched to door, otherwise
  // the door price (matched-to-door costs the same as the door panel).
  const carcassPriceM2 =
    state.cabinetBoxes.carcassMaterial === 'matched_to_door'
      ? doorPriceM2
      : state.cabinetBoxes.carcassMaterial === 'moisture_resistant_p3'
        ? 18
        : state.cabinetBoxes.carcassMaterial === 'colored_melamine'
          ? 16
          : 13 // white_melamine_standard
  const boardLow = doorAreaM2 * doorPriceM2 + carcassAreaM2 * carcassPriceM2
  const boardHigh = boardLow * 1.18 // waste factor
  const boardsRange = widenByConfidence(boardLow, boardHigh, !doorDecor)
  const unitCountSuffix = usingUnitModel ? ` · ${units.length} cabinets` : ''
  lineItems.push({
    key: 'boards',
    detail: `${doorDecor?.name ?? state.doors.decorCode} (${state.doors.decorCode}/${state.doors.decorStructure}) door + ${state.cabinetBoxes.carcassMaterial.replace(/_/g, ' ')} carcass${unitCountSuffix}`,
    quantity: `${totalBoardM2.toFixed(1)} m²`,
    low: round(boardsRange.low),
    high: round(boardsRange.high),
  })

  /* 2. Worktop ─────────────────────────────────────────────────────────── */
  const wtDecor = state.worktop.decorCode
    ? findDecor(state.worktop.decorCode, state.worktop.decorStructure)
    : null
  let wtPricePerM = wtDecor ? worktopPricePerM(wtDecor, 600) ?? null : null
  // Fall back by family if catalog row has no worktop price.
  if (!wtPricePerM) {
    wtPricePerM = state.worktop.family === 'quartz' ? 90 : state.worktop.family === 'sintered_stone' ? 130 : 35
  }
  const wtLow = state.worktop.totalLengthM * wtPricePerM
  const wtHigh = wtLow * 1.15 + state.worktop.mitreJoinCount * 25
  const wtRange = widenByConfidence(wtLow, wtHigh, !wtDecor)
  lineItems.push({
    key: 'worktop',
    detail: `${wtDecor?.name ?? state.worktop.family} ${state.worktop.thicknessMm} mm, edge: ${state.worktop.edge}`,
    quantity: `${state.worktop.totalLengthM.toFixed(2)} m`,
    low: round(wtRange.low),
    high: round(wtRange.high),
  })

  /* 3. Backsplash ──────────────────────────────────────────────────────── */
  if (state.backsplash.kind !== 'none') {
    const bsArea = state.worktop.totalLengthM * (state.backsplash.heightCm / 100)
    const bsRate =
      state.backsplash.kind === 'tile'
        ? 60
        : state.backsplash.kind === 'glass'
          ? 80
          : state.backsplash.kind === 'matching_slab'
            ? wtPricePerM // reuse worktop rate per linear m
            : 25
    const bsLow = state.backsplash.kind === 'matching_slab' ? state.worktop.totalLengthM * wtPricePerM * 0.6 : bsArea * bsRate
    const bsHigh = bsLow * 1.25
    lineItems.push({
      key: 'backsplash',
      detail: `${state.backsplash.kind.replace('_', ' ')}, ${state.backsplash.heightCm} cm tall`,
      quantity: `${state.worktop.totalLengthM.toFixed(2)} m`,
      low: round(bsLow),
      high: round(bsHigh),
    })
  }

  /* 4. Edge banding + cutting services ─────────────────────────────────── */
  // Rough proxy: edge banding length scales with board area — ~3 m of edge per m² of board.
  const edgeM = totalBoardM2 * 3
  const edgePerM = services.edgeBanding.abs_08mm_under20mmThick_pricePerM ?? 1.02
  const edgeLow = edgeM * edgePerM
  const edgeHigh = edgeLow * 1.15
  lineItems.push({
    key: 'edgeBanding',
    detail: 'Matching ABS edge banding 0,8 mm × 23 mm',
    quantity: `${edgeM.toFixed(0)} m`,
    low: round(edgeLow),
    high: round(edgeHigh),
  })

  // Cutting service: linear m of cuts ~ 4 m per m² of board.
  const cutM = totalBoardM2 * 4
  const cutPerM = services.cutting.iverica10_18mm_pricePerM ?? 0.78
  const cutLow = cutM * cutPerM + state.worktop.totalLengthM * (services.cutting.worktop38mm_pricePerM ?? 5.36)
  lineItems.push({
    key: 'services',
    detail: 'Rezanje + CNC obrada',
    quantity: `${cutM.toFixed(0)} m`,
    low: round(cutLow * 0.9),
    high: round(cutLow * 1.25),
  })

  /* 5. Hardware (RRP reference) ────────────────────────────────────────── */
  // Linear-metre proxies — used both as a hardware fallback (no units yet)
  // and as the input to the lighting calc below. Derived from cabinet units
  // when available so under-cabinet/plinth LED reacts to user edits too.
  const baseM = usingUnitModel
    ? units.filter((u) => u.type === 'base').reduce((s, u) => s + u.widthMm / 1000, 0)
    : state.layout.runs.filter((r) => r.hasBase).reduce((s, r) => s + r.lengthCm / 100, 0)
  const wallM = usingUnitModel
    ? units.filter((u) => u.type === 'wall').reduce((s, u) => s + u.widthMm / 1000, 0)
    : state.layout.runs.filter((r) => r.hasWall).reduce((s, r) => s + r.lengthCm / 100, 0)
  const tallM = usingUnitModel
    ? units.filter((u) => u.type === 'tall').reduce((s, u) => s + u.widthMm / 1000, 0)
    : state.layout.runs.filter((r) => r.hasTall).reduce((s, r) => s + r.lengthCm / 100, 0)

  const tierRRP = HARDWARE_TIER_RRP[state.hardware.drawerSystemTier]
  const hingeMultiplier =
    state.hardware.hingeType === 'soft_close' ? 1.0 : state.hardware.hingeType === 'push_to_open' ? 1.15 : 0.85

  let hwLow = 0
  let hwHigh = 0
  let drawerCount = 0
  let unitEquivalents = 0
  let accessoryLow = 0
  let accessoryHigh = 0
  if (usingUnitModel) {
    for (const u of units) {
      const spec = PATTERN_SPECS[u.pattern]
      const typeFactor = u.type === 'tall' ? 1.4 : u.type === 'wall' ? 0.6 : 1.0
      const unitEq = typeFactor * spec.hardwareMultiplier
      unitEquivalents += unitEq
      drawerCount += spec.defaultDrawers
      hwLow += unitEq * tierRRP.perBaseUnit.low + spec.defaultDrawers * tierRRP.perDrawer.low
      hwHigh += unitEq * tierRRP.perBaseUnit.high + spec.defaultDrawers * tierRRP.perDrawer.high
      if (spec.accessoryCost) {
        accessoryLow += spec.accessoryCost.low
        accessoryHigh += spec.accessoryCost.high
      }
    }
    hwLow *= hingeMultiplier
    hwHigh *= hingeMultiplier
  } else {
    unitEquivalents =
      Math.ceil(baseM / 0.6) + Math.ceil(wallM / 0.6) * 0.6 + Math.ceil(tallM / 0.6) * 1.4
    hwLow = unitEquivalents * tierRRP.perBaseUnit.low * hingeMultiplier
    hwHigh = unitEquivalents * tierRRP.perBaseUnit.high * hingeMultiplier
  }
  const hwQuantity = drawerCount > 0
    ? `${unitEquivalents.toFixed(1)} unit eq. · ${drawerCount} drawers`
    : `${unitEquivalents.toFixed(1)} unit eq.`
  lineItems.push({
    key: 'hardware',
    detail: `Drawer + hinges, tier: ${state.hardware.drawerSystemTier}; ${state.hardware.hingeType}`,
    quantity: hwQuantity,
    low: round(hwLow),
    high: round(hwHigh),
  })

  if (accessoryLow > 0 || accessoryHigh > 0) {
    const accessoryUnitCount = units.filter((u) => PATTERN_SPECS[u.pattern].accessoryCost).length
    lineItems.push({
      key: 'accessories',
      detail: 'Magic corner, larder mech, trash pullout & similar mechanisms',
      quantity: `${accessoryUnitCount} mechanism${accessoryUnitCount === 1 ? '' : 's'}`,
      low: round(accessoryLow),
      high: round(accessoryHigh),
    })
  }

  /* 6. Sink + tap ──────────────────────────────────────────────────────── */
  const sinkBaseLow =
    state.sinkTaps.sink.material === 'ceramic'
      ? 220
      : state.sinkTaps.sink.material === 'granite_composite'
        ? 180
        : state.sinkTaps.sink.material === 'fragranite'
          ? 200
          : 120
  // Bowl count: 1.5 ≈ +35 %, 2 bowls ≈ +60 %.
  const bowlMultiplier =
    state.sinkTaps.sink.bowls === 'double' ? 1.6 : state.sinkTaps.sink.bowls === 'one_and_half' ? 1.35 : 1.0
  // Mounting: undermount/flush more expensive than inset; belfast premium.
  const mountMultiplier =
    state.sinkTaps.sink.mount === 'belfast'
      ? 1.5
      : state.sinkTaps.sink.mount === 'undermount' || state.sinkTaps.sink.mount === 'flush'
        ? 1.2
        : 1.0
  const sinkLow = sinkBaseLow * bowlMultiplier * mountMultiplier
  const sinkHigh = sinkLow * 2.2
  const tapBaseLow =
    state.sinkTaps.tap.type === 'boiling_water'
      ? 350
      : state.sinkTaps.tap.type === 'filtered_three_way'
        ? 280
        : state.sinkTaps.tap.type === 'pull_out'
          ? 130
          : 80
  const tapLow = tapBaseLow
  const tapHigh = tapBaseLow * 2.0
  lineItems.push({
    key: 'sinkTaps',
    detail: `${state.sinkTaps.sink.bowls} bowl ${state.sinkTaps.sink.material} sink, ${state.sinkTaps.tap.type} tap`,
    quantity: '1 set',
    low: round(sinkLow + tapLow),
    high: round(sinkHigh + tapHigh),
  })

  /* 7. Appliances ──────────────────────────────────────────────────────── */
  // Skip when the homeowner supplies their own kit. Otherwise: count the
  // appliance kinds that have actually been selected (or pinned to a SKU)
  // and price each by class so swapping induction → gas, single → double
  // oven actually moves the line.
  if (state.appliances.supply !== 'homeowner_supplies') {
    const APPLIANCE_PRICE: Record<string, { low: number; high: number }> = {
      hob: { low: 250, high: 900 },
      oven: { low: 350, high: 1500 },
      extractor: { low: 200, high: 900 },
      fridge: { low: 500, high: 1800 },
      dishwasher: { low: 350, high: 1100 },
      microwave: { low: 150, high: 600 },
      wine_fridge: { low: 600, high: 1800 },
      coffee: { low: 800, high: 3200 },
    }
    // Always-on minimum kit so an empty pick still surfaces a sensible range.
    const ALWAYS_ON: (keyof typeof APPLIANCE_PRICE)[] = ['hob', 'oven', 'fridge', 'dishwasher']
    const selectedTypes = new Set<string>(state.appliances.selections.map((s) => s.type))
    for (const t of ALWAYS_ON) selectedTypes.add(t)
    let apLow = 0
    let apHigh = 0
    for (const t of selectedTypes) {
      const p = APPLIANCE_PRICE[t]
      if (!p) continue
      apLow += p.low
      apHigh += p.high
    }
    // Mixed supply: maker still bills install + a few items, halve the spread.
    if (state.appliances.supply === 'mixed') {
      apLow *= 0.5
      apHigh *= 0.5
    }
    lineItems.push({
      key: 'appliances',
      detail: `${selectedTypes.size} appliances, supplied by ${state.appliances.supply.replace('_', ' ')}`,
      quantity: `${selectedTypes.size} pcs`,
      low: round(apLow),
      high: round(apHigh),
    })
  }

  /* 8. Lighting ────────────────────────────────────────────────────────── */
  let lightLow = 0
  let lightHigh = 0
  if (state.lighting.underCabinetLed) {
    lightLow += wallM * 25
    lightHigh += wallM * 60
  }
  if (state.lighting.plinthLed) {
    lightLow += baseM * 15
    lightHigh += baseM * 40
  }
  if (state.lighting.pendantOverIsland && state.lighting.pendantCount > 0) {
    lightLow += state.lighting.pendantCount * 80
    lightHigh += state.lighting.pendantCount * 350
  }
  if (lightLow > 0) {
    lineItems.push({
      key: 'lighting',
      detail: 'LED + pendants',
      quantity: 'Layered',
      low: round(lightLow),
      high: round(lightHigh),
    })
  }

  /* 9. Installation labour ─────────────────────────────────────────────── */
  // Rough multiplier on materials: 35 % low, 60 % high for Croatian bespoke.
  const materialsTotal = lineItems.reduce((s, l) => s + l.high, 0)
  const labourLow = materialsTotal * 0.35
  const labourHigh = materialsTotal * 0.6
  lineItems.push({
    key: 'installLabour',
    detail: 'Maker labour, delivery, install',
    quantity: 'Project',
    low: round(labourLow),
    high: round(labourHigh),
  })

  const total = lineItems.reduce(
    (acc, l) => ({ low: acc.low + l.low, high: acc.high + l.high }),
    { low: 0, high: 0 }
  )
  const bandWidthPct = total.low > 0 ? Math.round(((total.high - total.low) / total.low) * 100) : 0

  return {
    lineItems,
    total: { low: round(total.low), high: round(total.high) },
    bandWidthPct,
    currency: 'EUR',
  }
}

function round(n: number): number {
  return Math.round(n)
}

/** Format an EUR amount as "12.450 €" (Croatian convention: dot thousands). */
export function formatEUR(amount: number, locale: 'hr-HR' | 'en-US' = 'hr-HR'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(amount)
}

// Re-export the catalog count for the hypothesis route's logging if needed.
export const CATALOG_DECOR_COUNT = catalogDecors.length
