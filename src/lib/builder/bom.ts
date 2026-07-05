/**
 * BOM (Bill of Materials) calculator.
 *
 * Translates BuilderState into priced line items using the Elgrad catalog
 * (boards, worktops, services) plus reference RRP for hardware/appliances/
 * sink-taps until the Schachermayer scrape lands.
 *
 * Output is always a *range* (low/high), never a single number — see
 * Principle 6 of product-foundations.md. The legacy line spreads are the
 * worst-case (L) band; every line NARROWS toward its midpoint by the worst
 * confidence among its driving fields (`narrowByMeta` — H/homeowner = ×0.6
 * half-width, M = ×0.85, L = unchanged), so confirming choices tightens the
 * band and the unconfirmed total stays inside the ±20% promise. A line whose
 * catalog source is missing still widens hard (`widenByConfidence`).
 */

import { decors as catalogDecors, services, doorPricePerM2, worktopPricePerM, findDecor } from '@/lib/catalog'
import { makerPriceForSku } from '@/lib/catalog/maker-pricing'
import { PATTERN_SPECS, unitDrawerCount } from './cabinet-patterns'
import type { BuilderState, CabinetUnit, DrawerSystemTier, FieldMeta } from './inventory'
import type { LeadProfile } from '@/lib/types'
import { tDynamic, DEFAULT_LOCALE, type Locale } from '@/lib/i18n'

/**
 * Which scope toggle (from the scope step) controls each BOM line. A line is
 * dropped from the estimate ONLY when scope explicitly marks its controller
 * `false` — an absent scope object (before the homeowner reaches the scope
 * step) or an absent key keeps everything, so the builder's live range is the
 * full kitchen until the homeowner narrows it. The cabinetry package (boards,
 * edge banding, hardware, finishing, CNC, assembly, design) all follow
 * `cabinets`; the backsplash rides with `worktops` (the surfaces decision).
 */
const LINE_SCOPE_KEY: Partial<Record<BomLineItem['key'], keyof NonNullable<LeadProfile['scope']>>> = {
  boards: 'cabinets',
  edgeBanding: 'cabinets',
  hardware: 'cabinets',
  finishing: 'cabinets',
  cnc: 'cabinets',
  assembly: 'cabinets',
  design: 'cabinets',
  worktop: 'worktops',
  backsplash: 'worktops',
  sinkTaps: 'sinkTaps',
  appliances: 'appliancesSupply',
  lighting: 'lighting',
  install: 'installation',
}

function lineInScope(key: BomLineItem['key'], scope: LeadProfile['scope'] | undefined): boolean {
  if (!scope) return true
  const ctrl = LINE_SCOPE_KEY[key]
  if (!ctrl) return true
  return scope[ctrl] !== false
}

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
    | 'finishing'
    | 'design'
    | 'assembly'
    | 'install'
    // Project-scope allowances (trades / structural / flooring) — rough
    // domain bands, only present when the homeowner scopes them IN.
    | 'flooring'
    | 'demolition'
    | 'electrical'
    | 'plumbing'
    | 'structural'
  /**
   * `works` = the kitchen itself (materials + labour) — always an estimate,
   * the ±20% promise lives here. `goods` = catalog products (appliances,
   * sink + tap) whose price becomes EXACT once the homeowner picks models.
   * `project` = rough allowances for trades/structural/flooring the homeowner
   * scoped in — wide by nature, kept OUT of the kitchen band promise.
   */
  section: 'works' | 'goods' | 'project'
  /**
   * The kitchen estimate reads as its three real components: `material`
   * (boards, worktop, hardware, …), `make` (design + CNC + assembly — the
   * shop) and `install` (on site). Only set on `works` lines.
   */
  worksKind?: 'material' | 'make' | 'install'
  /** True when every component of this line is a picked catalog price. */
  exact?: boolean
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
  /** Full band width as % of the range midpoint; display as ±(bandWidthPct/2). */
  bandWidthPct: number
  /**
   * The homeowner-facing split (per product direction 2026-06-12): the
   * kitchen itself is a range; the goods (appliances, sink + tap) are listed
   * next to it and turn EXACT when every model is picked.
   */
  sections: {
    works: {
      low: number
      high: number
      bandWidthPct: number
      /** Material + make + install — sums to the works range. */
      breakdown: Record<'material' | 'make' | 'install', { low: number; high: number }>
    }
    goods: { low: number; high: number; allPicked: boolean }
    /** Rough trade/structural/flooring allowances the homeowner scoped in.
     * Wide by nature — shown alongside, never folded into the kitchen band. */
    project: { low: number; high: number }
  }
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

/** Cabinet-bearing metres of a run per row — appliance footprints cut out.
 * Fridge blocks both rows; the dishwasher takes a base slot (front only). */
function effectiveRowM(r: {
  lengthCm: number
  applianceFootprintCm?: { fridgeCm: number; dishwasherCm: number }
}): { baseM: number; wallM: number } {
  const fridge = r.applianceFootprintCm?.fridgeCm ?? 0
  const dishwasher = r.applianceFootprintCm?.dishwasherCm ?? 0
  return {
    baseM: Math.max(0, r.lengthCm - fridge - dishwasher) / 100,
    wallM: Math.max(0, r.lengthCm - fridge) / 100,
  }
}

/** Layout-only fallback used when no cabinet units have been seeded yet. */
function boardAreaForRun(r: {
  lengthCm: number
  hasBase: boolean
  hasWall: boolean
  hasTall: boolean
  applianceFootprintCm?: { fridgeCm: number; dishwasherCm: number }
}): number {
  const { baseM, wallM } = effectiveRowM(r)
  let m2 = 0
  if (r.hasBase) m2 += baseM * BOARD_AREA_M2_PER_LINEAR_M.base
  if (r.hasWall) m2 += wallM * BOARD_AREA_M2_PER_LINEAR_M.wall
  if (r.hasTall) m2 += BOARD_AREA_M2_PER_LINEAR_M.tall // one tall unit per run that has tall = true
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
  // Appliance front (dishwasher slot): the decor panel mounts on the
  // appliance's own door — there is no carcass to build.
  if (u.pattern === 'appliance_slot') return 0
  const wM = u.widthMm / 1000
  const hM = u.heightMm / 1000
  const dM = u.depthMm / 1000
  // Two side panels + bottom + top + back ≈ 2·(h·d) + 2·(w·d) + (w·h)
  return 2 * hM * dM + 2 * wM * dM + wM * hM
}

/**
 * Drawer-box board area — the real wood *inside* a drawer cabinet that the
 * carcass + front areas miss. Each drawer is a box (2 sides + back + bottom);
 * its box height is derived from the cabinet height ÷ drawer count (the drawer
 * "height"). Derived, not user input — it reacts as drawer counts change, and
 * is the gap that made drawer-heavy kitchens under-estimate material.
 */
function unitDrawerBoxAreaM2(u: CabinetUnit): number {
  const drawers = unitDrawerCount(u)
  if (drawers <= 0) return 0
  const wM = u.widthMm / 1000
  const dM = (u.depthMm / 1000) * 0.85 // box ~15% shallower than the carcass
  const boxH = ((u.heightMm / 1000) / drawers) * 0.8 // front height minus reveals
  const perBox = 2 * dM * boxH + wM * boxH + wM * dM // 2 sides + back + bottom
  return perBox * drawers
}

function widenByConfidence(low: number, high: number, missingSource: boolean): { low: number; high: number } {
  if (missingSource) {
    return { low: low * 0.7, high: high * 1.4 }
  }
  return { low, high }
}

/* Confidence-graded band (foundations principle 6 + the ±20% promise).
 * The legacy line spreads ARE the worst-case band: they were calibrated with
 * nothing confirmed (waste factors, no-SKU multipliers, market spread), so
 * grading must NARROW from there, never widen past it — the displayed total
 * stays inside ±20% (AGENTS.md; enforced by tests/band-invariant.test.ts,
 * deliberately not a runtime clamp). A homeowner who confirmed or edited a
 * field has answered the question — that's H regardless of what the AI
 * originally guessed. AI-seeded fields narrow by their stored confidence.
 * A line is as uncertain as its WORST driving field. */
const CONFIDENCE_RANK: Record<'H' | 'M' | 'L', number> = { H: 0, M: 1, L: 2 }
/** Half-width multiplier by worst confidence: H tightens hard, M a little,
 * L keeps the full legacy spread. Midpoint-preserving. */
const CONFIDENCE_HALF_WIDTH = [0.6, 0.85, 1] as const

function effectiveConfidence(m: FieldMeta | undefined): 'H' | 'M' | 'L' {
  if (!m) return 'L'
  if (m.provenance === 'homeowner-confirmed' || m.provenance === 'homeowner-edited') return 'H'
  return m.confidence
}

function narrowByMeta(
  low: number,
  high: number,
  metas: Array<FieldMeta | undefined>
): { low: number; high: number } {
  if (metas.length === 0) return { low, high }
  const worst = Math.max(...metas.map((m) => CONFIDENCE_RANK[effectiveConfidence(m)]))
  const f = CONFIDENCE_HALF_WIDTH[worst]
  if (f === 1) return { low, high }
  const mid = (low + high) / 2
  const half = ((high - low) / 2) * f
  return { low: mid - half, high: mid + half }
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

export function computeBom(
  state: BuilderState,
  locale: Locale = DEFAULT_LOCALE,
  opts: { scope?: LeadProfile['scope']; pricing?: 'retail' | 'maker' } = {}
): BomEstimate {
  const lineItems: BomLineItem[] = []

  // Retail (homeowner-facing) vs maker B2B cost. In 'maker' mode a picked SKU's
  // price is replaced by the maker's account price when supplied; otherwise it
  // stays retail. Empty maker pricelist → identical to retail (see
  // maker-pricing.ts). Homeowner path always passes 'retail' (the default).
  const priceMode = opts.pricing ?? 'retail'
  const effPrice = (retail: number | undefined, sku?: string): number | undefined => {
    if (priceMode === 'maker') {
      const m = makerPriceForSku(sku)
      if (m != null) return m
    }
    return retail
  }

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
      carcassAreaM2 += unitCarcassAreaM2(u) + unitDrawerBoxAreaM2(u)
    }
  } else {
    // Layout-only fallback (Builder just opened, no units seeded yet).
    const totalBoardM2 = state.layout.runs.reduce((s, r) => s + boardAreaForRun(r), 0)
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
  // Door style premium — shaker/glass/beaded need more machining + material.
  const styleFactor =
    state.doors.style === 'glass_front'
      ? 1.5
      : state.doors.style === 'beaded'
        ? 1.4
        : state.doors.style === 'shaker'
          ? 1.35
          : state.doors.style === 'handleless_jpull' || state.doors.style === 'handleless_groove'
            ? 1.05
            : 1
  const boardLow = doorAreaM2 * doorPriceM2 * styleFactor + carcassAreaM2 * carcassPriceM2
  const boardHigh = boardLow * 1.18 // waste factor
  const boardMetas = [
    state.doors.meta.style,
    state.doors.meta.decorCode,
    state.cabinetBoxes.meta.carcassMaterial,
  ]
  const boardsSource = widenByConfidence(boardLow, boardHigh, !doorDecor)
  const boardsRange = narrowByMeta(boardsSource.low, boardsSource.high, boardMetas)
  const unitCountSuffix = usingUnitModel ? ` · ${units.length} ${tr('cabinets', 'ormarića')}` : ''
  lineItems.push({
    key: 'boards',
    section: 'works',
    worksKind: 'material',
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
  // Fall back by family when the catalog row has no worktop price. The laminate
  // fallback (38 €/m) is the mean of the REAL Elgrad worktop prices in the
  // catalog (oak/concrete/marble laminate decors, 32–74 €/m); quartz and
  // sintered stone have no catalog prices yet, so those stay domain estimates
  // pending the maker's pricelist (LOOP.md Q7).
  if (!wtPricePerM) {
    wtPricePerM = state.worktop.family === 'quartz' ? 90 : state.worktop.family === 'sintered_stone' ? 130 : 38
  }
  // Edge profile premium — a mitred waterfall is a major add; radius a small one.
  const edgeFactor =
    state.worktop.edge === 'mitred_waterfall' ? 1.25 : state.worktop.edge === 'radius' ? 1.06 : 1
  const wtLow = state.worktop.totalLengthM * wtPricePerM * edgeFactor
  const wtHigh = wtLow * 1.15 + state.worktop.mitreJoinCount * 25
  const wtSource = widenByConfidence(wtLow, wtHigh, !wtDecor)
  const wtRange = narrowByMeta(wtSource.low, wtSource.high, [
    state.worktop.meta.family,
    state.worktop.meta.decorCode,
  ])
  lineItems.push({
    key: 'worktop',
    section: 'works',
    worksKind: 'material',
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
    const bsRange = narrowByMeta(bsLow, bsHigh, [
      state.backsplash.meta.kind,
      state.backsplash.meta.heightCm,
    ])
    lineItems.push({
      key: 'backsplash',
      section: 'works',
      worksKind: 'material',
      detail: `${label('backsplash.kind', state.backsplash.kind)}, ${state.backsplash.heightCm} cm`,
      quantity: `${state.worktop.totalLengthM.toFixed(2)} m`,
      low: round(bsRange.low),
      high: round(bsRange.high),
    })
  }

  /* 4. Edge banding + cutting services ─────────────────────────────────── */
  // Rough proxy: edge banding length scales with board area — ~3 m of edge per m² of board.
  const edgeM = totalBoardM2 * 3
  const edgePerM = services.edgeBanding.abs_08mm_under20mmThick_pricePerM ?? 1.02
  const edgeLow = edgeM * edgePerM
  const edgeHigh = edgeLow * 1.15
  // Derived from board area, so it inherits the boards' driving fields.
  const edgeRange = narrowByMeta(edgeLow, edgeHigh, boardMetas)
  lineItems.push({
    key: 'edgeBanding',
    section: 'works',
    worksKind: 'material',
    detail: tr('ABS edge banding 0.8 mm × 23 mm', 'ABS kantiranje 0,8 mm × 23 mm'),
    quantity: `${edgeM.toFixed(0)} m`,
    low: round(edgeRange.low),
    high: round(edgeRange.high),
  })

  /* Labour drivers — kitchen length + element counts (the maker's real rates). */
  const carcassCount = usingUnitModel
    ? units.filter((u) => u.pattern !== 'appliance_slot').length
    : Math.max(
        1,
        Math.round(
          state.layout.runs.reduce((s, r) => {
            const { baseM, wallM } = effectiveRowM(r)
            return s + ((r.hasBase ? baseM : 0) + (r.hasWall ? wallM : 0)) / 0.6
          }, 0)
        )
      )
  const installM = state.layout.runs.reduce((s, r) => {
    const { baseM, wallM } = effectiveRowM(r)
    return s + (r.hasBase ? baseM : 0) + (r.hasWall ? wallM : 0)
  }, 0)

  /* 5. Hardware (RRP reference) ────────────────────────────────────────── */
  // Linear-metre proxies — used both as a hardware fallback (no units yet)
  // and as the input to the lighting calc below. Derived from cabinet units
  // when available so under-cabinet/plinth LED reacts to user edits too.
  const baseM = usingUnitModel
    ? units.filter((u) => u.type === 'base').reduce((s, u) => s + u.widthMm / 1000, 0)
    : state.layout.runs.filter((r) => r.hasBase).reduce((s, r) => s + effectiveRowM(r).baseM, 0)
  const wallM = usingUnitModel
    ? units.filter((u) => u.type === 'wall').reduce((s, u) => s + u.widthMm / 1000, 0)
    : state.layout.runs.filter((r) => r.hasWall).reduce((s, r) => s + effectiveRowM(r).wallM, 0)
  const tallM = usingUnitModel
    ? units.filter((u) => u.type === 'tall').reduce((s, u) => s + u.widthMm / 1000, 0)
    : state.layout.runs.filter((r) => r.hasTall).reduce((s, r) => s + r.lengthCm / 100, 0)

  const tierRRP = HARDWARE_TIER_RRP[state.hardware.drawerSystemTier]
  const hingeMultiplier =
    state.hardware.hingeType === 'soft_close' ? 1.0 : state.hardware.hingeType === 'push_to_open' ? 1.15 : 0.85
  // Picked catalog prices pin the two dominant hardware components:
  // a runner set per drawer, a hinge model per door front (≈2 hinges each).
  // The generic perBaseUnit bundle covers hinges + small fittings; when the
  // hinge is picked we price hinges explicitly and keep only the fittings
  // share (~70%) of the bundle, so the two don't double-count.
  const drawerPriceEur = effPrice(state.hardware.drawerSystemPriceEur, state.hardware.drawerSystemSku)
  const hingePriceEur = effPrice(state.hardware.hingePriceEur, state.hardware.hingeSku)
  const HINGE_BUNDLE_SHARE = 0.3

  let hwLow = 0
  let hwHigh = 0
  let drawerCount = 0
  let unitEquivalents = 0
  let accessoryLow = 0
  let accessoryHigh = 0
  if (usingUnitModel) {
    let doorFronts = 0
    let bundleLow = 0
    let bundleHigh = 0
    let drawersLow = 0
    let drawersHigh = 0
    for (const u of units) {
      const spec = PATTERN_SPECS[u.pattern]
      const typeFactor = u.type === 'tall' ? 1.4 : u.type === 'wall' ? 0.6 : 1.0
      const unitEq = typeFactor * spec.hardwareMultiplier
      unitEquivalents += unitEq
      drawerCount += spec.defaultDrawers
      if (spec.defaultDrawers === 0 && u.pattern !== 'appliance_slot') doorFronts++
      const bundleShare = hingePriceEur != null ? 1 - HINGE_BUNDLE_SHARE : 1
      bundleLow += unitEq * tierRRP.perBaseUnit.low * bundleShare
      bundleHigh += unitEq * tierRRP.perBaseUnit.high * bundleShare
      if (drawerPriceEur != null) {
        drawersLow += spec.defaultDrawers * drawerPriceEur
        drawersHigh += spec.defaultDrawers * drawerPriceEur
      } else {
        drawersLow += spec.defaultDrawers * tierRRP.perDrawer.low
        drawersHigh += spec.defaultDrawers * tierRRP.perDrawer.high
      }
      if (spec.accessoryCost) {
        accessoryLow += spec.accessoryCost.low
        accessoryHigh += spec.accessoryCost.high
      }
    }
    // Hinge type lives in the bundle; a picked hinge model prices explicitly
    // (≈2 per door front) and the bundle keeps only its fittings share.
    const bundleFactor = hingePriceEur != null ? 1 : hingeMultiplier
    const hingeCost = hingePriceEur != null ? doorFronts * 2 * hingePriceEur : 0
    hwLow = bundleLow * bundleFactor + drawersLow + hingeCost
    hwHigh = bundleHigh * bundleFactor + drawersHigh + hingeCost
  } else {
    unitEquivalents =
      Math.ceil(baseM / 0.6) + Math.ceil(wallM / 0.6) * 0.6 + Math.ceil(tallM / 0.6) * 1.4
    hwLow = unitEquivalents * tierRRP.perBaseUnit.low * hingeMultiplier
    hwHigh = unitEquivalents * tierRRP.perBaseUnit.high * hingeMultiplier
  }
  // Handles — only when not handleless; per-front cost varies by finish.
  const handleless =
    state.hardware.handleStyle === 'integrated_jpull' || state.hardware.handleStyle === 'integrated_groove'
  if (!handleless) {
    const fronts = usingUnitModel ? units.filter((u) => u.type !== 'tall').length : Math.round(unitEquivalents)
    const handleRate =
      state.hardware.handleFinish === 'brass'
        ? 14
        : state.hardware.handleFinish === 'chrome' || state.hardware.handleFinish === 'brushed_steel'
          ? 9
          : 7
    hwLow += fronts * handleRate * 0.8
    hwHigh += fronts * handleRate * 1.3
  }
  const hwQuantity = drawerCount > 0
    ? `${unitEquivalents.toFixed(1)} ${tr('unit eq.', 'jed. ekv.')} · ${drawerCount} ${tr('drawers', 'ladica')}`
    : `${unitEquivalents.toFixed(1)} ${tr('unit eq.', 'jed. ekv.')}`
  const hwPicked = state.hardware.drawerSystemSku ? state.hardware.drawerSystemPickedName : null
  const hwRange = narrowByMeta(hwLow, hwHigh, [
    state.hardware.meta.drawerSystemTier,
    state.hardware.meta.hingeType,
    ...(handleless ? [] : [state.hardware.meta.handleStyle, state.hardware.meta.handleFinish]),
  ])
  lineItems.push({
    key: 'hardware',
    section: 'works',
    worksKind: 'material',
    detail:
      `${tr('Drawers + hinges', 'Ladice + šarke')}, ${tr('tier', 'klasa')}: ${label('hardware.tier', state.hardware.drawerSystemTier)}; ${label('hardware.hinge', state.hardware.hingeType)}` +
      (hwPicked ? ` · ${hwPicked}` : ''),
    quantity: hwQuantity,
    low: round(hwRange.low),
    high: round(hwRange.high),
  })

  if (accessoryLow > 0 || accessoryHigh > 0) {
    const accessoryUnitCount = units.filter((u) => PATTERN_SPECS[u.pattern].accessoryCost).length
    lineItems.push({
      key: 'accessories',
      section: 'works',
      worksKind: 'material',
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
  const sinkHigh = sinkLow * (state.sinkTaps.sink.pickedName ? 1.15 : 1.5)
  const tapBaseLow =
    state.sinkTaps.tap.type === 'boiling_water'
      ? 350
      : state.sinkTaps.tap.type === 'filtered_three_way'
        ? 280
        : state.sinkTaps.tap.type === 'pull_out'
          ? 130
          : 80
  const tapLow = tapBaseLow
  const tapHigh = tapBaseLow * (state.sinkTaps.tap.pickedName ? 1.15 : 1.5)
  const sinkPicked = state.sinkTaps.sink.pickedName
    ? `${state.sinkTaps.sink.pickedBrand ?? ''} ${state.sinkTaps.sink.pickedName}`.trim()
    : null
  const tapPicked = state.sinkTaps.tap.pickedName
    ? `${state.sinkTaps.tap.pickedBrand ?? ''} ${state.sinkTaps.tap.pickedName}`.trim()
    : null
  // A picked model with a catalog price is EXACT — no class estimate, no
  // narrowing. Each piece prices independently so a single pick already
  // tightens the line; both picked → the whole line is exact.
  const sinkPriceEur = effPrice(state.sinkTaps.sink.pickedPriceEur, state.sinkTaps.sink.sku)
  const tapPriceEur = effPrice(state.sinkTaps.tap.pickedPriceEur, state.sinkTaps.tap.sku)
  const sinkPart =
    sinkPriceEur != null
      ? { low: sinkPriceEur, high: sinkPriceEur }
      : narrowByMeta(sinkLow, sinkHigh, [
          state.sinkTaps.meta.sinkBowls,
          state.sinkTaps.meta.sinkMount,
          state.sinkTaps.meta.sinkMaterial,
        ])
  const tapPart =
    tapPriceEur != null
      ? { low: tapPriceEur, high: tapPriceEur }
      : narrowByMeta(tapLow, tapHigh, [state.sinkTaps.meta.tapType, state.sinkTaps.meta.tapFinish])
  const sinkTapsRange = { low: sinkPart.low + tapPart.low, high: sinkPart.high + tapPart.high }
  lineItems.push({
    key: 'sinkTaps',
    section: 'goods',
    exact: sinkPriceEur != null && tapPriceEur != null,
    detail:
      `${label('sinkTaps.bowls', state.sinkTaps.sink.bowls)} · ${label('sinkTaps.material', state.sinkTaps.sink.material)} ${tr('sink', 'sudoper')}, ${label('sinkTaps.tap', state.sinkTaps.tap.type)} ${tr('tap', 'slavina')}` +
      (sinkPicked ? ` · ${tr('sink', 'sudoper')}: ${sinkPicked}` : '') +
      (tapPicked ? ` · ${tr('tap', 'slavina')}: ${tapPicked}` : ''),
    quantity: tr('1 set', '1 komplet'),
    low: round(sinkTapsRange.low),
    high: round(sinkTapsRange.high),
  })

  /* 7. Appliances ──────────────────────────────────────────────────────── */
  // Skip when the homeowner supplies their own kit. Otherwise: count the
  // appliance kinds that have actually been selected (or pinned to a SKU)
  // and price each by class so swapping induction → gas, single → double
  // oven actually moves the line.
  if (state.appliances.supply !== 'homeowner_supplies' && state.appliances.selections.length > 0) {
    // Per-type estimate bands for an UNPICKED appliance. Grounded against the
    // Schachermayer hr-HR reference-RRP scrape (src/lib/catalog, see
    // appliancesForType): each band is calibrated to CONTAIN the real catalog
    // products of that type, so the estimate covers what we'd actually sell
    // (tests/class-band-grounding.test.ts enforces this). Observed prices at
    // the scrape: hob 289–449, oven 339–469 (+Miele 849), extractor 149–459,
    // dishwasher 429–519 (+Miele 1390), microwave 339. Types the scrape doesn't
    // cover (fridge has only an undercounter unit; wine/coffee none) stay
    // domain estimates pending the maker's B2B pricelist (LOOP.md Q7).
    // These remain REFERENCE RRPs, not the maker's account price — a picked
    // model still overrides with its exact price at quote time.
    const APPLIANCE_PRICE: Record<string, { low: number; high: number }> = {
      hob: { low: 280, high: 470 },
      oven: { low: 340, high: 780 },
      extractor: { low: 150, high: 470 },
      fridge: { low: 600, high: 1150 },
      dishwasher: { low: 420, high: 760 },
      microwave: { low: 200, high: 380 },
      wine_fridge: { low: 750, high: 1200 },
      coffee: { low: 1100, high: 2000 },
    }
    const selectedTypes = new Set<string>(state.appliances.selections.map((s) => s.type))
    // Picked models (catalog price) sum EXACTLY; the rest stay class
    // estimates. Pick everything → the whole line is one exact number.
    let exactSum = 0
    let pickedCount = 0
    let apLow = 0
    let apHigh = 0
    const estimatedMetas: FieldMeta[] = []
    const applianceMetaMap = state.appliances.meta as Partial<Record<string, FieldMeta>>
    const detailNames: string[] = []
    for (const sel of state.appliances.selections) {
      const picked = sel.pickedBrand && sel.pickedName ? `${sel.pickedBrand} ${sel.pickedName}` : null
      detailNames.push(picked ? `${applName(sel.type)}: ${picked}` : applName(sel.type))
      const pickedPrice = effPrice(sel.pickedPriceEur, sel.pickedSku)
      if (pickedPrice != null) {
        exactSum += pickedPrice
        pickedCount++
        continue
      }
      const p = APPLIANCE_PRICE[sel.type]
      if (!p) continue
      // Specifying narrows: a pinned SKU without a catalog price hugs the
      // class midpoint; a chosen class (induction / double oven / …) is
      // narrower than the fully-unspecified default.
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
      const m = applianceMetaMap[sel.type]
      if (m) estimatedMetas.push(m)
    }
    if (state.appliances.supply === 'mixed') {
      // Halving models "homeowner supplies some of these" — it only applies
      // to the unpicked estimate; an explicitly picked model is in the build.
      apLow *= 0.5
      apHigh *= 0.5
    }
    // Line confidence = worst meta among the ESTIMATED types only (picked
    // models are facts; types without tracked meta — microwave, wine fridge,
    // coffee — already narrowed per selection above).
    const apRange = narrowByMeta(apLow, apHigh, estimatedMetas)
    const allPicked = pickedCount === state.appliances.selections.length
    lineItems.push({
      key: 'appliances',
      section: 'goods',
      exact: allPicked,
      detail: detailNames.length > 0 ? detailNames.join(' · ') : `${selectedTypes.size} ${tr('appliances', 'uređaja')}`,
      quantity: `${selectedTypes.size} ${tr('pcs', 'kom')}`,
      low: round(exactSum + apRange.low),
      high: round(exactSum + apRange.high),
    })
  }

  /* 8. Lighting ─────────────────────────────────────────────────────────
     Mid-market component bands (profile + strip + driver per metre; one
     fixture per pendant). The fixture choice itself stays the homeowner's —
     a designer pendant blows any band, so the range covers the standard
     trade catalog, not the long tail. */
  let lightLow = 0
  let lightHigh = 0
  if (state.lighting.underCabinetLed) {
    lightLow += wallM * 30
    lightHigh += wallM * 55
  }
  if (state.lighting.plinthLed) {
    lightLow += baseM * 18
    lightHigh += baseM * 38
  }
  if (state.lighting.pendantOverIsland && state.lighting.pendantCount > 0) {
    lightLow += state.lighting.pendantCount * 110
    lightHigh += state.lighting.pendantCount * 250
  }
  if (state.lighting.smartControls) {
    lightLow += 150
    lightHigh += 300
  }
  if (lightLow > 0) {
    const lightRange = narrowByMeta(lightLow, lightHigh, [
      state.lighting.meta.underCabinetLed,
      state.lighting.meta.plinthLed,
      state.lighting.meta.pendantOverIsland,
    ])
    lineItems.push({
      key: 'lighting',
      section: 'works',
      worksKind: 'material',
      detail: tr('LED + pendants', 'LED + viseće'),
      quantity: tr('Layered', 'Slojevito'),
      low: round(lightRange.low),
      high: round(lightRange.high),
    })
  }

  /* 8b. Finishing — plinth / cornice / end panels / open shelving. */
  const plinthRate =
    state.finishing.plinthMaterial === 'metal_strip'
      ? 16
      : state.finishing.plinthMaterial === 'matched_door'
        ? 14
        : state.finishing.plinthMaterial === 'black_recessed'
          ? 12
          : 9
  let finLow = baseM * plinthRate * 0.9
  let finHigh = baseM * plinthRate * 1.15
  if (state.finishing.corniceStyle !== 'none') {
    const corniceRate =
      state.finishing.corniceStyle === 'crown' ? 22 : state.finishing.corniceStyle === 'custom_match_door' ? 18 : 12
    finLow += wallM * corniceRate * 0.9
    finHigh += wallM * corniceRate * 1.2
  }
  if (state.finishing.endPanelsCount > 0) {
    finLow += state.finishing.endPanelsCount * 35
    finHigh += state.finishing.endPanelsCount * 70
  }
  if (state.finishing.openShelvingMeters > 0) {
    finLow += state.finishing.openShelvingMeters * 45
    finHigh += state.finishing.openShelvingMeters * 90
  }
  if (finHigh > 0) {
    const finRange = narrowByMeta(finLow, finHigh, [
      state.finishing.meta.plinthHeightMm,
      state.finishing.meta.plinthMaterial,
      state.finishing.meta.corniceStyle,
    ])
    lineItems.push({
      key: 'finishing',
      section: 'works',
      worksKind: 'material',
      detail: tr('Plinth, cornice & panels', 'Sokl, vijenac i bočni panel'),
      quantity: `${baseM.toFixed(1)} m`,
      low: round(finRange.low),
      high: round(finRange.high),
    })
  }

  /* 9. Manual work — design / CNC / assembly / install, grouped, by drivers.
     All four scale with the measured layout, so they widen by its confidence
     (homeowner-confirmed runs from the contract → no widening). */
  const labourMetas = [state.layout.meta.runs]
  const designHours = Math.max(1, Math.round(carcassCount * LABOUR_RATES.designHoursPerCarcass))
  const designCost = designHours * LABOUR_RATES.designPerHour
  const designRange = narrowByMeta(designCost * 0.9, designCost * 1.15, labourMetas)
  lineItems.push({
    key: 'design',
    section: 'works',
    worksKind: 'make',
    detail: tr('Design & specification', 'Razrada i projektiranje'),
    quantity: `${designHours} h`,
    low: round(designRange.low),
    high: round(designRange.high),
  })

  const cncPositions = Math.round(carcassCount * LABOUR_RATES.positionsPerCarcass)
  const cncCost = cncPositions * LABOUR_RATES.cncPerPosition
  const cncRange = narrowByMeta(cncCost * 0.95, cncCost * 1.1, labourMetas)
  lineItems.push({
    key: 'cnc',
    section: 'works',
    worksKind: 'make',
    detail: tr('CNC machining', 'CNC obrada'),
    quantity: `${cncPositions} ${tr('positions', 'pozicija')}`,
    low: round(cncRange.low),
    high: round(cncRange.high),
  })

  const assemblyCost = carcassCount * LABOUR_RATES.assemblyPerCarcass
  const assemblyRange = narrowByMeta(assemblyCost * 0.95, assemblyCost * 1.1, labourMetas)
  lineItems.push({
    key: 'assembly',
    section: 'works',
    worksKind: 'make',
    detail: tr('Carcass assembly', 'Sklapanje korpusa'),
    quantity: `${carcassCount} ${tr('carcasses', 'korpusa')}`,
    low: round(assemblyRange.low),
    high: round(assemblyRange.high),
  })

  const installCost = installM * LABOUR_RATES.installPerMetre
  const installRange = narrowByMeta(installCost * 0.9, installCost * 1.15, labourMetas)
  lineItems.push({
    key: 'install',
    section: 'works',
    worksKind: 'install',
    detail: tr('On-site installation', 'Montaža na licu mjesta'),
    quantity: `${installM.toFixed(1)} m`,
    low: round(installRange.low),
    high: round(installRange.high),
  })

  /* 9. Project-scope allowances — trades / structural / flooring the homeowner
     scoped IN. Rough domain bands (no catalog, no contract geometry), wide on
     purpose and labelled "allowance"; kept in their own `project` section so
     they never tighten or widen the kitchen-band promise. Only emitted when
     explicitly scoped in (scope[key] === true) — absent scope adds nothing. */
  const ALLOWANCE: Array<{
    key: BomLineItem['key']
    scopeKey: keyof NonNullable<LeadProfile['scope']>
    low: number
    high: number
    en: string
    hr: string
  }> = [
    { key: 'flooring', scopeKey: 'flooring', low: 900, high: 2800, en: 'New flooring', hr: 'Novi pod' },
    { key: 'demolition', scopeKey: 'demolitionDisposal', low: 400, high: 1500, en: 'Demolition + disposal', hr: 'Rušenje i odvoz' },
    { key: 'electrical', scopeKey: 'electricalWork', low: 600, high: 2200, en: 'Electrical work', hr: 'Elektroinstalacije' },
    { key: 'plumbing', scopeKey: 'plumbingRelocation', low: 500, high: 1800, en: 'Plumbing relocation', hr: 'Premještanje vodovoda' },
    { key: 'structural', scopeKey: 'structural', low: 1500, high: 6000, en: 'Structural work', hr: 'Građevinski radovi' },
  ]
  for (const a of ALLOWANCE) {
    if (opts.scope?.[a.scopeKey] !== true) continue
    lineItems.push({
      key: a.key,
      section: 'project',
      detail: `${tr(a.en, a.hr)} — ${tr('rough allowance', 'okvirna procjena')}`,
      quantity: tr('allowance', 'procjena'),
      low: a.low,
      high: a.high,
    })
  }

  // Drop line items the homeowner has put OUT of scope (e.g. no installation,
  // homeowner supplies appliances). Default (no scope yet) keeps everything.
  const visibleLines = lineItems.filter((l) => lineInScope(l.key, opts.scope))

  const total = visibleLines.reduce(
    (acc, l) => ({ low: acc.low + l.low, high: acc.high + l.high }),
    { low: 0, high: 0 }
  )
  // Band width relative to the MIDPOINT, so displayed ±(bandWidthPct/2) reads
  // symmetrically; dividing by `low` overstated the band by ~3 points.
  const bandPct = (r: { low: number; high: number }) =>
    r.low + r.high > 0 ? Math.round(((r.high - r.low) / ((r.low + r.high) / 2)) * 100) : 0
  const bandWidthPct = bandPct(total)

  // Homeowner-facing split: the kitchen (works) stays a range — the ±20%
  // promise applies to it; the goods (appliances, sink + tap) ride alongside
  // and collapse to an exact sum once every model is picked.
  const sumWhere = (pred: (l: BomLineItem) => boolean) =>
    visibleLines
      .filter(pred)
      .reduce((acc, l) => ({ low: acc.low + l.low, high: acc.high + l.high }), { low: 0, high: 0 })
  const works = sumWhere((l) => l.section === 'works')
  const goods = sumWhere((l) => l.section === 'goods')
  const project = sumWhere((l) => l.section === 'project')
  const goodsLines = visibleLines.filter((l) => l.section === 'goods')
  const kind = (k: 'material' | 'make' | 'install') => {
    const s = sumWhere((l) => l.worksKind === k)
    return { low: round(s.low), high: round(s.high) }
  }

  return {
    lineItems: visibleLines,
    total: { low: round(total.low), high: round(total.high) },
    bandWidthPct,
    sections: {
      works: {
        low: round(works.low),
        high: round(works.high),
        bandWidthPct: bandPct(works),
        breakdown: { material: kind('material'), make: kind('make'), install: kind('install') },
      },
      goods: {
        low: round(goods.low),
        high: round(goods.high),
        allPicked: goodsLines.length > 0 && goodsLines.every((l) => l.exact === true),
      },
      project: { low: round(project.low), high: round(project.high) },
    },
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
