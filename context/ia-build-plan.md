# IA refactor — corrected build plan

**Status:** authoritative build target for the IA/navigation refactor. This
**amends** the design handoff (`handoff/IMPLEMENTATION.md`, `handoff/prototype/`,
`handoff/copy-deck.md`). Where this doc and the handoff disagree, **this wins**.

Read together with `context/layout-contract.md` (the data contract) and
`context/design-brief.md` (the original problem framing).

---

## What we keep from the design handoff (don't re-litigate)

- **3 acts, one persistent shell.** Capture → Build → Close, no chrome swap.
- **The "Rail" two-level nav** (acts + steps in one left rail) with per-step
  read-backs; builder component groups are first-class steps, not a sub-app.
- **The shared right rail**: a sticky render anchor + a live price-range card.
- **Mobile model**: progress pill → bottom-sheet nav → pinned range bar.
- **Visual language unchanged** (tokens/fonts/motion in `handoff/IMPLEMENTATION.md` §6).
- **Bilingual copy deck** (`handoff/copy-deck.md`) as the starting strings.
- **5-PR least-risk sequence**, with the amendments below.
- **No budget asked up front.** The live range is the budget conversation.

---

## Amendment 1 — Move "What we counted" to the END of Act 1 (Capture)

The handoff placed `counted` as the **first step of Act 2**, bundling three jobs
into one screen: (a) confirm the layout we read, (b) reveal the first price,
(c) "begin building." That conflates capture and build.

**Corrected:** confirming what we read about the space is a **capture** concern —
it confirms the contract, which freezes at the end of Act 1. So:

### Corrected act/step lists

**Act 1 — Your space (Capture)**
`type → photos → inspiration → render → confirm → counted`
- `counted` is now the **closing step of Capture**: "Here's your space and what
  we'll build on — correct?" Confirming it **freezes the layout contract**
  (`floorPlanToLayout`). This is our existing `LayoutConfirm`, repositioned.

**Act 2 — Build it (Build)**
`cabinets → doors → worktop → backsplash → hardware → appliances → sink → lighting → finishing → scope → wishlist`
- Opens straight into the parts. No separate seam step.

**Act 3 — Your offer (Close)** — unchanged
`logistics+timeline → contact → offer`

### Sub-decision (recommended, override if you disagree)
**The first, widest price range appears ON the `counted` screen** (end of Act 1),
not on the first build step. Rationale: "here's your space — and here's roughly
what it'll cost" is the product's "we tell you the price" moment, and it's still
framed as an estimate. The range then **tightens through Build**. The right rail
(render + range) becomes visible from `counted` onward.
> Note this is *showing an estimate*, not *asking a budget* — the no-budget rule
> still holds.
> Alternative if you prefer zero price during capture: keep `counted` price-free
> and reveal the first range on the `cabinets` step. Pick one.

---

## Amendment 2 — Contract-driven, not mocked (hard acceptance criterion)

The prototype is a **mock**: `FloorPlanSvg` has literal coordinates, "380 + 320
cm" / "14 units" are hardcoded, and `RANGE_BY_STEP` is a scripted ±22%→±14%
table. **None of these values may be transcribed into the app.** Every number,
diagram, and step list is **derived from the real contract + engines.**

This is non-negotiable and applies to **every** screen. The app is *ahead* of the
prototype here — we already built the data layer. The job is to wire the design's
*visuals* onto our *real* data, never to copy the mock's data.

### Source-of-truth map (what feeds each surface)

| Surface | MUST come from | NOT from |
|---|---|---|
| `counted` floor-plan diagram | `renderFloorPlanSvg(plan)` (`src/lib/floor-plan/svg.ts`) | the prototype's hand-drawn SVG |
| runs, lengths, corner, appliances, ceiling | `floorPlanToLayout(plan)` (`src/lib/contract/layout-contract.ts`) | hardcoded "380 + 320 cm" |
| cabinet counts / "≈ N units" | `suggestCabinetsForRun()` over the contract runs | "14 units" literal |
| corner unit + corner step | `contract.corners` (none for galley/island) | always-on corner |
| sink cabinet position | `contract.appliances` sink (we force `sink_unit` at its position) | fixed slot |
| worktop metres / mitre joins | real run lengths / corner count | scripted |
| appliance list/steps | seeded from `contract.appliances` | mock 5-appliance list |
| price range (everywhere) | `bom.ts` (`BomEstimate.low/high/bandWidthPct`) | `RANGE_BY_STEP` table |
| per-step read-backs in the nav | real `BuilderState` / profile values | mock read-back strings |

### Conditional rendering (the contract decides which steps exist)
The step list and affordances **reflow per contract** — this is where
contract-driven rendering earns its keep:
- **galley** → two parallel runs, **no corner step / no corner unit**.
- **island** → an island run; island has no wall cabinets.
- **U-shape** → **two** corner units, on the correct runs.
- Appliance steps reflect the appliances actually placed.

**Acceptance test:** run the whole flow against a galley, an island, and a
U-shape (not just the L). The nav, the `counted` screen, the cabinet sections,
and the range must all be correct for each — no L-shape assumptions leak in.

---

## Amendment 3 — The price range must be *emergent*, not scripted

The handoff narrates the band narrowing ±22% → ±14% as a confidence signal. We
keep the *story* but it must be **real**: `bom.ts` already computes band width
from field confidence (≈±10% when mostly H, ±25% otherwise, widened for missing
prices). As the user confirms choices, fields flip to H and the band should
shrink on its own.

**Acceptance criterion:** the band width is **non-increasing** as build steps are
completed (monotonic tighten). If `bom.ts` doesn't currently guarantee that,
adjust the confidence model — do **not** fake it with a scripted table. The
midpoint may drift (scope/appliances add cost); the *width* only tightens.

Every range, on every screen, carries "an estimate your maker confirms — never a
final quote."

---

## Revised PR sequence

Same spine as the handoff §7, with the amendments folded in.

- **PR1 — Unify the shell · low risk.** Stop the full-screen early-return in
  `kitchen-intake/index.tsx`; render the builder body inside the same shell as
  the funnel; move the render preview + `LiveBOMPanel` into a shared right rail.
  No data changes. Kills the "different app" jolt.
- **PR2 — One nav model (Rail) · low risk.** Teach `StepsOverview` about acts;
  builder groups render as Act-2 steps; per-step read-backs **from real state**.
- **PR3 — Re-home steps + reposition the seam + drop budget · medium.** Reorder
  `flow.ts`: `type`→Act 1; **`counted`→ end of Act 1** (Amendment 1);
  `scope`+`wishlist`→ end of Act 2; `timeline`→Act 3; remove the up-front budget.
- **PR4 — The `counted` screen, contract-driven · medium.** Promote
  `LayoutConfirm` into the designed end-of-capture confirmation: diagram via
  `renderFloorPlanSvg`, facts via `floorPlanToLayout`, first (widest) range via
  `bom.ts`. Calm copy. **Verify galley/island/U reflow (Amendment 2 test).**
- **PR5 — Routes + state lift · later.** `/space` · `/build` · `/offer` under a
  shared layout; lift state out of the one big component; retire `/builder`.

**Cross-cutting (every PR):** Amendment 2 holds — nothing rendered from the mock.

---

## What we already have (reuse, don't rebuild)

We are ahead of the prototype on data correctness. Wire the design onto these:
- `floorPlanToLayout()` + `LayoutContract` — the complete layout contract.
- `renderFloorPlanSvg(plan)` — the real deterministic floor-plan diagram.
- `LayoutConfirm` — the existing "what we counted" gate (reposition + restyle).
- `suggestCabinetsForRun()` — real per-run cabinet seeding (corner-aware,
  sink at its measured position).
- `bom.ts` / `LiveBOMPanel` — the real EUR range with confidence-based width.
- The Elgrad/Schachermayer catalogs — real prices behind the range.

---

## Principle checklist (verify before each merge)
- [ ] No chrome swap anywhere; nav present on every screen incl. the builder.
- [ ] Status visibility: act + step + "n of m" + read-backs always visible.
- [ ] Price is always a **range from `bom.ts`**; width tightens monotonically;
      every range says "an estimate your maker confirms."
- [ ] **Nothing rendered from the prototype mock** — diagram, counts, runs,
      appliances, range all trace to the contract/engines.
- [ ] Flow correct for **galley, island, U-shape**, not just L.
- [ ] No urgency / no up-front budget; offer says "nothing locked, no rush."
- [ ] hr-HR default; labels don't overflow in either language.
