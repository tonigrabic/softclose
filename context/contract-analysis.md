# LayoutContract analysis — field-by-field audit (2026-06-11)

Audit of the seam object (`src/lib/contract/layout-contract.ts`) against its
spec (`context/layout-contract.md`) and every real consumer. Goal: verify the
contract is THE driver for the builder and the cost estimate, and find where
the estimate loses information the contract already carries.

## Verdict in one paragraph

The contract **is** the single source of layout truth for the builder — layout
hydration (`hydrateFromHypothesis`) takes it as a required input with no
fallback, exactly as the spec demands. But the contract is **not yet the
driver of the estimate**: `computeBom(state)` never sees the contract, and two
kinds of information the contract carries are lost on the way to the price —
**appliance footprints** (causing a systematic overestimate on fridge walls)
and **confidence grades** (the band never tightens, despite the product
principle and the BOM's own header comment claiming it does).

## Field map: producer → consumers → status

| Contract field | Produced from | Consumed by | Status |
|---|---|---|---|
| `schemaVersion`, `source` | constants | nobody | Inert version stamps — fine. |
| `shape` | `plan.layoutShape` | `state.layout.shape`; hypothesis prompt | ✅ |
| `hasIsland` | `plan.hasIsland` | `state.layout.hasIsland`; lighting group | ✅ |
| `ceilingHeightCm` | `plan.ceilingHeightCm ?? 280` | `state.layout`; tall-unit height in `CabinetBoxesGroup` (`ceiling − 120mm plinth`) | ✅ good chain (vision → confirm → tall units → board m²) |
| `units` | `plan.units` | `LayoutConfirm` display | ✅ display-only, correct |
| `runs[].lengthCm` | `counterSegmentsForWall` (doors/passages cut out, corner exclusions applied) | cabinet seeding fill; `worktop.totalLengthM`; BOM board-area fallback | ⚠️ **Includes appliance footprints** — see Finding 1 |
| `runs[].hasWall`, `hasTall` | geometry defaults (spec'd) | seeding, BOM | ✅ homeowner refines, as designed |
| `runs[].hasCorner` | corner-ownership assignment | seeding (`corner_magic` reservation), corner section | ✅ |
| `runs[].confidence` | `plan.room.confidence` / island | only `runs[0].confidence` survives → `layout.meta.runs`; **never read again** | ⚠️ see Finding 2 |
| `appliances[].kind/runId` | `plan.features` | sink → forced `sink_unit` at measured position; presence guarantee in `seedApplianceSelections`; `AppliancesGroup` placed-set; hypothesis prompt | ✅ sink; ⚠️ hob/fridge/dishwasher positions unused (Finding 3) |
| `appliances[].positionPctAlongRun` | `feature.centerCm / wallLength` | sink placement only | ⚠️ Finding 3 |
| `appliances[].widthCm` | `feature.widthCm` | `widthMm` backfill on appliance selections | ⚠️ **not used to reduce cabinet/worktop fill** — Finding 1 |
| `appliances[].confidence` | `feature.confidence` | nobody | ⚠️ dropped — Finding 2 |
| `corners[]` (run pairs) | adjacent counter-bearing walls | hypothesis prompt text, `LayoutConfirm` count, harness | ✅ informational; ownership already folded into `runs[].hasCorner` |

## Finding 1 — appliance footprints are double-counted (estimate accuracy, HIGH)

`counterSegmentsForWall` cuts **doors and passages** out of a run, but
**appliance features are not openings** — a fridge standing on the bottom wall
leaves `lengthCm` intact. Downstream:

- `suggestCabinetsForRun` greedily fills the **whole** run with base + wall
  cabinets → the fridge's ~70 cm of floor gets a base cabinet AND a wall
  cabinet **and** `seedApplianceSelections` adds the fridge itself.
- An integrated dishwasher occupies a 600 mm under-counter slot that needs no
  carcass (just a front panel) — but a full base cabinet is seeded there too.
- `worktop.totalLengthM = Σ hasBase run lengths` — includes the fridge span,
  where no worktop exists.

Net effect: kitchens with a fridge + dishwasher on counter walls are
overestimated by roughly **one tall fridge housing's worth of boards, one base
carcass, ~0.7 m of worktop, plus the hardware per-unit cost** — consistently,
not randomly, so it can't wash out in the band.

(Sink and hob are fine — they genuinely sit on/in base cabinets and worktop.)

**Proposed fix (keeps the contract as driver):** the contract should deliver
what each consumer needs rather than make every consumer re-derive it:

1. Extend `ContractRun` with `applianceSpans: Array<{ kind, startPct, widthCm }>`
   (derived in `floorPlanToLayout` from the same features it already projects).
2. `suggestCabinetsForRun` accepts those spans and (a) skips seeding cabinets
   across a **fridge** span (reserve a `fridge_housing` tall unit instead),
   (b) converts the base unit at a **dishwasher** span into a front-only slot.
3. Worktop length: subtract fridge spans from `totalLengthM` at hydration.
4. `mitreJoinCount`: island shouldn't count toward mitre joins (a freestanding
   island worktop isn't joined to wall runs) — minor, fix in passing.

## Finding 2 — confidence never reaches the band (product principle, HIGH)

`bom.ts`'s header says *"±10 % when most fields are H confidence, ±25 %
otherwise"* — **no code does this**. `bandWidthPct` is purely emergent from
per-line low/high constants; `widenByConfidence` only reacts to a missing
catalog price. Meanwhile:

- The contract carries per-run and per-appliance `ConfidenceLevel` (H/M/L,
  straight from Part 1 provenance) — dropped at hydration except
  `runs[0].confidence`.
- `BuilderState` meta tracks H/M/L + provenance per field
  (`ai-default` / `ai-vision` / `homeowner-confirmed`) — never read by the BOM.

So the band cannot tighten as the homeowner confirms things, which is both the
product's stated confidence model (foundations principle 6) and the seam's
emotional promise (the range narrowing as you decide is the reward loop).

**Proposed fix:** `computeBom` computes a confidence factor from state meta —
e.g. share of priced groups whose driving fields are `homeowner-confirmed`/H —
and applies a per-line widening for L/M-confidence groups (low × (1−w),
high × (1+w)). Contract appliance/run confidence flows into the corresponding
state meta at hydration so Part-1 provenance participates. Estimate gets
honest: untouched AI-seeded kitchen ≈ ±25 %, fully confirmed build → ±10–12 %.

## Finding 3 — measured positions are underused (opportunity, MEDIUM)

Only the **sink** position is honored in seeding. The contract also knows
where the **hob**, **fridge**, and **dishwasher** sit:

- hob → force the nearest base unit to `drawer_bank` (pots under hob) or at
  least never `trash_pullout`; place `oven_housing` adjacency sensibly.
- fridge → place the tall `fridge_housing` at the measured end (with Finding 1).
- dishwasher → the front-only slot from Finding 1 goes at its measured spot,
  beside the sink in practice.

Better seeded patterns → better accessory pricing → fewer user edits.

## Finding 4 — `hasWall` default ignores windows (opportunity, LOW)

The spec itself flags this: *"AI may later enrich the contract upstream (e.g.
detect a window wall has no uppers → hasWall: false)"*. The floor plan knows
`openings` of kind `window` — no AI needed: a window spanning most of a
counter run usually means no uppers there. Could set `hasWall: false` when
window coverage of the run exceeds ~50 %, still homeowner-refinable. Cheap,
deterministic, makes the default smarter.

## What is NOT broken (verified)

- Hydration takes the contract as **required**; no layout fallback paths
  remain (`state.ts` builds `layout` exclusively from it).
- Corner modelling is single-sourced (ownership assigned once, in the
  contract; `CabinetBoxesGroup` never overrides Part-1 corners).
- Ceiling height: vision capture → homeowner confirm → contract → tall-unit
  height → board area. Full chain works.
- Sink placement honors measured geometry.
- The hypothesis API receives the contract read-only (run ids reused, layout
  not re-guessed) — exactly the spec's "AI enriches, never drives" posture.

## Build order (feeds WORKLOG backlog W3)

1. Finding 1 (appliance footprints) — biggest systematic error, pure logic, testable.
2. Finding 2 (confidence → band) — product principle, makes the range honest.
3. Finding 3 (positions → patterns) — rides on Finding 1's plumbing.
4. Finding 4 (window → hasWall) — small deterministic win.
