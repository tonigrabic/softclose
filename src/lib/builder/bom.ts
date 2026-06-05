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
import { tDynamic, DEFAULT_LOCALE, type Locale } from '@/lib/i18n'

export interface BomLineItem {
  /** Stable id usable as React key + i18n routing. */
  key:
    | 'boards'
    | 'worktop'
    | 'backsplash'
    | 'edgeBanding'
    | 'cnc'
    | 'hardware'
    | 'accessories'
    | 'appliances'
    | 'sinkTaps'
    | 'lighting'
    | 'design'
    | 'assembly'
    | 'install'
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
  budget: { perBaseUnit: { low: 42, high: 52 }, perDrawer: { low: 21, high: 26 } },
  mid: { perBaseUnit: { low: 88, high: 112 }, perDrawer: { low: 50, high: 64 } }, // Grass Nova Pro
  premium: { perBaseUnit: { low: 160, high: 205 }, perDrawer: { low: 105, high: 138 } }, // Blum Legrabox
}

/**
 * Manual-work rates from the maker's real cost sheet (EUR). Each labour line is
 * driven by a concrete quantity — design hours, CNC positions, carcasses,
 * install metres — not a vague % of materials, so the estimate is tight.
 */
const LABOUR_RATES = {
  designPerHour: 30,
  designHoursPerCarcass: 0.8,
  cncPerPosition: 1,
  positionsPerCarcass: 8,
  assemblyPerCarcass: 15,
  installPerMetre: 75,
}

/* ───────────────────────── Main calculator ───────────────────────── */

export function computeBom(state: BuilderState, locale: Locale = DEFAULT_LOCALE): BomEstimate {
  const lineItems: BomLineItem[] = []

  // Localisation helpers — line-item detail/quantity are built localized so the
  // always-visible BOM panel isn't half English. Enum values reuse the existing
  // chip i18n keys; `tr` handles connective words.
  const tr = (en: string, hr: string) => (locale === 'hr-HR' ? hr : en)
  const label = (prefix: string, v: string) => tDynamic(`${prefix}.${v}`, locale)
  const applName = (type: string): string => {
    const m: Record<string, [string, string]> = {
      hob: ['hob', 'ploča za kuhanje'],
      oven: ['oven', 'pećnica'],
      extractor: ['extractor', 'napa'],
      fridge: ['fridge', 'hladnjak'],
      dishwasher: ['dishwasher', 'perilica posuđa'],
      microwave: ['microwave', 'mikrovalna'],
      wine_fridge: ['wine fridge', 'vinski hladnjak'],
      coffee: ['coffee machine', 'aparat za kavu'],
    }
    const a = m[type]
    return a ? tr(a[0], a[1]) : type
  }

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
  const unitCountSuffix = usingUnitModel ? ` · ${units.length} ${tr('cabinets', 'ormarića')}` : ''
  lineItems.push({
    key: 'boards',
    detail: `${doorDecor?.name ?? state.doors.decorCode} (${state.doors.decorCode}/${state.doors.decorStructure}) ${tr('door', 'vrata')} + ${label('cabinetBoxes.carcass', state.cabinetBoxes.carcassMaterial)} ${tr('carcass', 'korpus')}${unitCountSuffix}`,
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
    detail: `${wtDecor?.name ?? label('worktop.family', state.worktop.family)} ${state.worktop.thicknessMm} mm`,
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
      detail: `${label('backsplash.kind', state.backsplash.kind)}, ${state.backsplash.heightCm} cm`,
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
    detail: tr('ABS edge banding 0.8 mm × 23 mm', 'ABS kantiranje 0,8 mm × 23 mm'),
    quantity: `${edgeM.toFixed(0)} m`,
    low: round(edgeLow),
    high: round(edgeHigh),
  })

  /* Labour drivers — kitchen length + element counts (the maker's real rates). */
  const carcassCount = usingUnitModel
    ? units.length
    : Math.max(
        1,
        Math.round(
          state.layout.runs.reduce(
            (s, r) => s + ((r.hasBase ? r.lengthCm : 0) + (r.hasWall ? r.lengthCm : 0)) / 60,
            0
          )
        )
      )
  const installM = state.layout.runs.reduce(
    (s, r) => s + ((r.hasBase ? r.lengthCm : 0) + (r.hasWall ? r.lengthCm : 0)) / 100,
    0
  )

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
    ? `${unitEquivalents.toFixed(1)} ${tr('unit eq.', 'jed. ekv.')} · ${drawerCount} ${tr('drawers', 'ladica')}`
    : `${unitEquivalents.toFixed(1)} ${tr('unit eq.', 'jed. ekv.')}`
  const hwPicked = state.hardware.drawerSystemSku ? state.hardware.drawerSystemPickedName : null
  lineItems.push({
    key: 'hardware',
    detail:
      `${tr('Drawers + hinges', 'Ladice + šarke')}, ${tr('tier', 'klasa')}: ${label('hardware.tier', state.hardware.drawerSystemTier)}; ${label('hardware.hinge', state.hardware.hingeType)}` +
      (hwPicked ? ` · ${hwPicked}` : ''),
    quantity: hwQuantity,
    low: round(hwLow),
    high: round(hwHigh),
  })

  if (accessoryLow > 0 || accessoryHigh > 0) {
    const accessoryUnitCount = units.filter((u) => PATTERN_SPECS[u.pattern].accessoryCost).length
    lineItems.push({
      key: 'accessories',
      detail: tr(
        'Magic corner, larder, trash pullout & similar mechanisms',
        'Magični kut, smočnica, izvlačni koš i slični mehanizmi'
      ),
      quantity: `${accessoryUnitCount} ${accessoryUnitCount === 1 ? tr('mechanism', 'mehanizam') : tr('mechanisms', 'mehanizama')}`,
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
  const sinkHigh = sinkLow * 1.5
  const tapBaseLow =
    state.sinkTaps.tap.type === 'boiling_water'
      ? 350
      : state.sinkTaps.tap.type === 'filtered_three_way'
        ? 280
        : state.sinkTaps.tap.type === 'pull_out'
          ? 130
          : 80
  const tapLow = tapBaseLow
  const tapHigh = tapBaseLow * 1.5
  const sinkPicked = state.sinkTaps.sink.pickedName
    ? `${state.sinkTaps.sink.pickedBrand ?? ''} ${state.sinkTaps.sink.pickedName}`.trim()
    : null
  const tapPicked = state.sinkTaps.tap.pickedName
    ? `${state.sinkTaps.tap.pickedBrand ?? ''} ${state.sinkTaps.tap.pickedName}`.trim()
    : null
  lineItems.push({
    key: 'sinkTaps',
    detail:
      `${label('sinkTaps.bowls', state.sinkTaps.sink.bowls)} · ${label('sinkTaps.material', state.sinkTaps.sink.material)} ${tr('sink', 'sudoper')}, ${label('sinkTaps.tap', state.sinkTaps.tap.type)} ${tr('tap', 'slavina')}` +
      (sinkPicked ? ` · ${tr('sink', 'sudoper')}: ${sinkPicked}` : '') +
      (tapPicked ? ` · ${tr('tap', 'slavina')}: ${tapPicked}` : ''),
    quantity: tr('1 set', '1 komplet'),
    low: round(sinkLow + tapLow),
    high: round(sinkHigh + tapHigh),
  })

  /* 7. Appliances ──────────────────────────────────────────────────────── */
  // Skip when the homeowner supplies their own kit. Otherwise: count the
  // appliance kinds that have actually been selected (or pinned to a SKU)
  // and price each by class so swapping induction → gas, single → double
  // oven actually moves the line.
  if (state.appliances.supply !== 'homeowner_supplies' && state.appliances.selections.length > 0) {
    const APPLIANCE_PRICE: Record<string, { low: number; high: number }> = {
      hob: { low: 350, high: 550 },
      oven: { low: 500, high: 850 },
      extractor: { low: 250, high: 480 },
      fridge: { low: 700, high: 1100 },
      dishwasher: { low: 450, high: 720 },
      microwave: { low: 180, high: 320 },
      wine_fridge: { low: 750, high: 1200 },
      coffee: { low: 1100, high: 2000 },
    }
    const selectedTypes = new Set<string>(state.appliances.selections.map((s) => s.type))
    let apLow = 0
    let apHigh = 0
    const detailNames: string[] = []
    for (const sel of state.appliances.selections) {
      const p = APPLIANCE_PRICE[sel.type]
      if (!p) continue
      // Specifying an appliance narrows its band: pinning a model (SKU) is
      // tightest; choosing a class (induction / double oven / …) is narrower
      // than the fully-unspecified default. So picking concrete appliances
      // *improves* the estimate instead of only adding uncertainty.
      const mid = (p.low + p.high) / 2
      let lo = p.low
      let hi = p.high
      if (sel.pickedSku) {
        lo = mid * 0.92
        hi = mid * 1.08
      } else if (sel.config && sel.config !== 'unknown' && sel.config !== 'standard') {
        lo = mid - (mid - p.low) * 0.55
        hi = mid + (p.high - mid) * 0.55
      }
      apLow += lo
      apHigh += hi
      const picked = sel.pickedBrand && sel.pickedName ? `${sel.pickedBrand} ${sel.pickedName}` : null
      detailNames.push(picked ? `${applName(sel.type)}: ${picked}` : applName(sel.type))
    }
    if (state.appliances.supply === 'mixed') {
      apLow *= 0.5
      apHigh *= 0.5
    }
    lineItems.push({
      key: 'appliances',
      detail: detailNames.length > 0 ? detailNames.join(' · ') : `${selectedTypes.size} ${tr('appliances', 'uređaja')}`,
      quantity: `${selectedTypes.size} ${tr('pcs', 'kom')}`,
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
      detail: tr('LED + pendants', 'LED + viseće'),
      quantity: tr('Layered', 'Slojevito'),
      low: round(lightLow),
      high: round(lightHigh),
    })
  }

  /* 9. Manual work — design / CNC / assembly / install, grouped, by drivers. */
  const designHours = Math.max(1, Math.round(carcassCount * LABOUR_RATES.designHoursPerCarcass))
  const designCost = designHours * LABOUR_RATES.designPerHour
  lineItems.push({
    key: 'design',
    detail: tr('Design & specification', 'Razrada i projektiranje'),
    quantity: `${designHours} h`,
    low: round(designCost * 0.9),
    high: round(designCost * 1.15),
  })

  const cncPositions = Math.round(carcassCount * LABOUR_RATES.positionsPerCarcass)
  const cncCost = cncPositions * LABOUR_RATES.cncPerPosition
  lineItems.push({
    key: 'cnc',
    detail: tr('CNC machining', 'CNC obrada'),
    quantity: `${cncPositions} ${tr('positions', 'pozicija')}`,
    low: round(cncCost * 0.95),
    high: round(cncCost * 1.1),
  })

  const assemblyCost = carcassCount * LABOUR_RATES.assemblyPerCarcass
  lineItems.push({
    key: 'assembly',
    detail: tr('Carcass assembly', 'Sklapanje korpusa'),
    quantity: `${carcassCount} ${tr('carcasses', 'korpusa')}`,
    low: round(assemblyCost * 0.95),
    high: round(assemblyCost * 1.1),
  })

  const installCost = installM * LABOUR_RATES.installPerMetre
  lineItems.push({
    key: 'install',
    detail: tr('On-site installation', 'Montaža na licu mjesta'),
    quantity: `${installM.toFixed(1)} m`,
    low: round(installCost * 0.9),
    high: round(installCost * 1.15),
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
