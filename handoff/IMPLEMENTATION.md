# softclose — IA & Navigation Refactor: Implementation Handoff

> **For an implementation agent (Claude Code) working in `tonigrabic/softclose`.**
> Branch read for this design: `claude/relaxed-shannon-a70089`.
> This package describes *what to build and in what order* to merge the funnel
> and the builder into one continuous, three-act journey under a single
> persistent navigation shell. It is structural, not a visual reskin — the
> existing visual language (tokens, fonts, motion) stays.

---

## 0. TL;DR for the agent

1. The app today is **two chromes**: a funnel (`kitchen-intake/index.tsx`) with a
   top progress bar + a desktop-only "Your brief" sidebar (`StepsOverview.tsx`),
   and a builder (`BuilderShell.tsx`) that **early-returns a full-screen takeover**
   with its own three-column layout. The journey loses its spine at step 5 of 10.
2. The fix is **one shell** wrapping all three acts (Capture → Build → Close),
   with the builder's component groups treated as **steps of the same grain** as
   capture steps, living in the same nav.
3. Ship it in **5 PRs, least-risk first** (§7). PR1 alone (unify the shell)
   removes the "different app" jolt without touching state or data.
4. A working hi-fi reference prototype is in this package
   (`design-reference.html`) — open it, switch the **Rail / Top / Spine** nav
   models, the **HR/EN** toggle, and **Desktop/Mobile**. Pick **Rail** unless
   product disagrees (rationale in §4).

Do **not** introduce: a single committed AI price quote, urgency/scarcity UX, a
30-field form, or fake social proof. Prices are always a **range**.

---

## 1. The information architecture (target state)

Three acts. One rule decides where every previously-ambiguous step lands:

> **If a step shapes the kitchen (moves the price) → it lives in Build, where the
> live range is visible. If it is purely administrative → it lives in Close.**

### Act 1 — Your space *(Capture)*
`type → photos/floorplan → inspiration → render → confirm`
- **`type`** ("what we're doing": full remodel / cabinets only / refresh / …) moves
  here from the old `project-basics` step. It frames the whole flow.
- Output: a **frozen layout contract** (see `context/layout-contract.md`).

### Act 2 — Build it *(Build)*
`counted (SEAM) → cabinets → doors → worktop → backsplash → hardware → appliances → sink → lighting → finishing → scope → wishlist`
- **`counted`** is the new **seam screen** — "What we counted" — the designed
  handoff from Act 1's contract into the builder. **This is the emotional core.**
- The 9 component groups (from `BUILDER_GROUPS`) become **first-class steps**.
- **`scope`** (demo/plumbing/electrical/flooring/install) and **`wishlist`**
  (free-form wants) move to the **end of Build** — both move or color the price.

### Act 3 — Your offer *(Close)*
`logistics+timeline → contact → offer`
- **`logistics`** absorbs the **timeline** half of old `project-basics`.
- **`offer`** is the terminal screen: the ±range, framed "an estimate your maker
  confirms," never a committed quote.

### Disposition of every ambiguous step
| Old step | New home | Why |
|---|---|---|
| project-basics → **type** | Act 1 (opener) | frames the project |
| project-basics → **timeline** | Act 3 (logistics) | administrative |
| **scope** | end of Act 2 | moves the range |
| **wishlist** | end of Act 2 | shapes the kitchen; human exhale before close |
| **logistics** | Act 3 | administrative |
| **budget (up-front ask)** | **DROPPED** | the live range *is* the budget conversation |

> **Budget:** do **not** ask for a budget number up front. The product pitch is
> "render your dream kitchen and *we* tell you the price." The live range that
> appears at the seam and tightens through Build *is* the budget conversation.

---

## 2. The navigation model

Two grains of "step" must coexist in **one always-present nav**:
- **Macro** = the 3 acts (Capture / Build / Close).
- **Micro** = steps within the current act, **including** the builder's component
  groups (no longer a hidden sub-app).

### Recommended: "Two-level rail" (Rail treatment)
A persistent left rail titled **"Your brief" / "Vaš sažetak"**:
- All three acts listed with a number chip + a `done / total` count.
- The **active act expands** to show its steps; collapsed acts show only the
  header (but are **clickable** to jump to their first step).
- Each **completed step shows a read-back** of what was captured
  (e.g. "Quartz · 20 mm", "Handleless oak"). This is the "where am I + what's
  captured" anchor and the antidote to ghosting (status visibility is **P0**).
- Step markers: ✓ done · pulsing dot current · hollow dot todo.
- The **seam step** carries a small "handoff" tag.

Two alternatives are implemented in the reference for comparison:
- **Top** — acts on a top bar, steps on the side. Cleanest grain separation, but
  splits the eye between two regions.
- **Spine** — one continuous vertical timeline from photo to offer. Most
  literally "the chrome never changes," but gets tall.

### The persistent right rail (the other half of the fix)
A right column that is present from the render onward and **never swaps**:
- **Render anchor** — the concept image as a small sticky card ("Your kitchen ·
  L-shape · 380 × 320 cm"). This is where the builder's big sticky preview goes.
- **Live price range card** — appears at the seam, **wide on purpose (±22%)**, and
  **tightens as the user chooses** (down to ~±14% by the offer). The band width
  *is* the confidence signal. Always subtitled "An estimate your maker confirms —
  never a final quote." This is where `LiveBOMPanel` content goes.

### Mobile (one model, collapses all three)
- **Top:** a render thumbnail + a **progress pill** ("Build · Build it — Cabinet
  boxes · 2/12 ▾") that opens a **bottom-sheet** version of the two-level rail.
- **Bottom:** a **pinned live-range bar** (tap to expand the "maker confirms"
  note) above the Back / Continue buttons.
- The sheet's act headers are tappable to jump; picking a step closes the sheet.

---

## 3. Screen-by-screen flow & the seam

```
ACT 1 · YOUR SPACE
  type        →  what are we doing (chips). No budget ask.
  photos      →  upload; we read "L-shape ≈ 380×320". Konva floorplan confirm.
  inspiration →  direction chips + reference tiles.
  render      →  AI concept (render appears; moves into the RIGHT RAIL from here on).
  confirm     →  best-guess door/worktop/hardware pulled from render; adjust.
        ↓ freezes the LAYOUT CONTRACT (floorPlanToLayout)
ACT 2 · BUILD IT
  counted  ←── THE SEAM. Full layout read-back from the contract:
               floor-plan diagram (runs, lengths, corner, appliances) +
               a facts list (layout, runs, corner, appliances, ≈units, ceiling).
               The FIRST price range appears here, wide (±22%).
               CTA: "Begin building / Započni gradnju".
  cabinets … finishing  →  the 9 component groups; range tightens each step.
  scope    →  what else is touched; each item visibly adds to the range.
  wishlist →  must-haves / nice-to-haves / deal-breakers, free-form.
ACT 3 · YOUR OFFER
  logistics →  access, living arrangement, rough timing.
  contact   →  name + email/phone.
  offer     →  the ±range (large, tabular-nums), "maker confirms, nothing locked,
               no rush", + a summary of what goes to the maker. CTA: "Send to
               your maker".
```

**The seam (`counted`) is the single most important screen to get right.** It is
where Part 1's output visibly becomes Part 2's input. Today this is the builder's
"layout-counts confirmation" buried behind a chrome swap; promote it to a calm,
designed handoff inside the unified shell. Source for its data:
`floorPlanToLayout()` → the layout contract (runs, lengths, corners, appliance
positions). See `context/layout-contract.md`.

---

## 4. Why this structure (decisions to preserve)

- **3 acts beat 4 or 2.** 4 acts (Space/Look/Build/Offer) splits Capture into two
  very short acts — macro-nav weight for little gain. 2 acts (Describe/Decide)
  hides the seam, which is the product's best moment. 3 acts match the technical
  contract (capture → builder consumes → close) and the emotional arc (dream →
  build → resolve).
- **One shell, builder groups as steps.** The core bug is the chrome swap at
  step 5. Everything else follows from refusing that swap.
- **Range, not quote; band width = confidence.** Honors "ranges not single
  numbers" and makes status legible (the band literally narrows).
- **No budget up front** — the live range is the budget conversation.

---

## 5. Current code map (what to touch)

| File | Today | Target |
|---|---|---|
| `src/lib/flow.ts` | flat 10-step `FLOW` | reorder into 3 acts; group metadata; drop up-front budget; move type/scope/wishlist/logistics per §1 |
| `src/components/kitchen-intake/index.tsx` | one big component; **early-returns** the builder full-screen | render everything inside one shared shell; no early return |
| `src/components/kitchen-intake/StepsOverview.tsx` | desktop-only "Your brief" sidebar, flat steps | becomes the **two-level act/step rail**; learns about acts + builder groups; read-backs |
| `src/components/builder/BuilderShell.tsx` | own 3-column takeover (sticky render + own stepper + BOM) | stops being a shell; its **stepper dissolves into the global nav**, its render + BOM move into the **shared right rail** |
| `src/components/builder/LiveBOMPanel.tsx` | builder-only right panel | mount in the shared right rail for the whole journey from the seam onward |
| `src/lib/builder/inventory.ts` (`BUILDER_GROUPS`) | the 9 groups | unchanged data; surfaced as Act-2 steps |
| route `/` | hosts the funnel | hosts the unified shell (later: `/space`,`/build`,`/offer`) |
| route `/builder` (orphan demo) | hardcoded standalone | retire / fold into `/build` |

---

## 6. Visual language (keep — do not redesign)

Lifted from `src/app/globals.css`. Use the existing tokens; these are the values
the reference prototype was built against:

- **Light palette:** warm near-white bg `oklch(0.992 0.004 85)`; text/`fg`
  `oklch(0.195 0.02 265)`; primary indigo `oklch(0.28 0.06 264)`; borders
  `oklch(0.91 0.006 85)`; muted-fg `oklch(0.48 0.02 265)`; ring
  `oklch(0.52 0.12 264)`. A dark theme exists — keep it working.
- **Type:** Plus Jakarta Sans everywhere; **Geist Mono** for numbers/prices/codes
  (use `tabular-nums` on prices). 11px uppercase tracked eyebrows
  (`letter-spacing ~.18em`). Generous body line-height.
- **Shape:** `--radius: 0.875rem` (14px); rounded cards 16–24px; hairline borders;
  soft shadows; pills/chips for choices.
- **Motion:** gentle fade + ~14px slide on step change (~0.28s ease). Nothing
  abrupt. Respect `prefers-reduced-motion`.
- **i18n:** **hr-HR is default**, EN fallback. Keep label counts modest; the
  reference ships every in-product string bilingually (`{en, hr}`) — reuse those
  strings as a starting copy deck (see `copy-deck.md`).

---

## 7. Build sequence (5 PRs, least-risk first)

### PR1 — Unify the shell around the builder · *low risk*
Stop the full-screen early-return in `kitchen-intake/index.tsx`. Render
`BuilderShell`'s body **inside the same layout** that hosts the funnel: keep the
progress + "Your brief" sidebar mounted; move the builder's render preview and
`LiveBOMPanel` into a shared **right rail**. **No state or data changes.** This
alone kills the "different app" jolt.

### PR2 — Merge the two grains into one nav model · *low risk*
Teach `StepsOverview` about **acts**, and let `BUILDER_GROUPS` render as
**sub-steps under Act 2**. The "Your brief" spine now covers the whole journey.
Implement the **Rail** treatment (or product's pick). Add per-step **read-backs**.

### PR3 — Re-home the ambiguous steps + drop budget · *medium*
Reorder `flow.ts`: `type` → Act 1; `scope` + `wishlist` → end of Act 2;
`logistics` + `timeline` → Act 3; **remove the up-front budget ask**. Mostly data;
the nav reflows for free.

### PR4 — Design the seam as a real screen · *medium*
Promote the builder's layout-confirm into the **"What we counted"** handoff:
floor-plan read-back from `floorPlanToLayout()`, the render moving into the rail,
the first (wide) range. Calm copy. This is the emotional core.

### PR5 — Promote acts to routes + lift state · *later refactor*
Real routes `/space` · `/build` · `/offer` under a shared layout for
deep-linking & refresh-safety; lift state out of the one big component into a
store/URL; retire the orphan `/builder` demo into `/build`.

---

## 8. Principle checklist (verify before merge)

- [ ] **Anxiety reduction:** no chrome swap anywhere; the seam opens calmly;
      motion stays a 14px fade; reduced-motion respected.
- [ ] **Status visibility (P0):** the act/step nav is present on **every** screen
      incl. the builder; act + step + "n of m" always visible; done steps show
      read-backs.
- [ ] **Ranges, never quotes:** price is always a range; band width tightens as a
      confidence signal; every range carries "an estimate your maker confirms."
- [ ] **No urgency / dark patterns:** no countdowns, scarcity, or fake social
      proof; offer says "nothing is locked, no rush"; no up-front budget extraction.
- [ ] **hr-HR default** works; labels don't overflow in either language.
- [ ] **Mobile** coherent: progress pill → bottom-sheet nav → pinned range bar.

---

## 9. What's in this package

- `IMPLEMENTATION.md` — this file.
- `design-reference.html` — the **interactive hi-fi prototype** (open it; switch
  Rail/Top/Spine, HR/EN, Desktop/Mobile). The source of truth for layout, copy,
  the seam, and the range behavior.
- `prototype/` — the prototype's JSX source (`data.jsx` = the IA model + bilingual
  copy + range progression; `bodies.jsx` = step screens incl. the seam &
  floor-plan SVG; `shell.jsx` = the shell + 3 nav treatments + right rail + mobile;
  `app.jsx` = the demo controller). Reference only — not meant to drop into Next.js
  verbatim, but the data shapes and copy port directly.
- `copy-deck.md` — every in-product string, HR + EN, keyed by step.

> The reference is React + inline styles for portability. In the real app, build
> with the existing shadcn/Base UI primitives, Tailwind v4 tokens, framer-motion,
> and Konva. Match the data shapes in `prototype/data.jsx` (acts, steps,
> read-backs, range-by-step) — they are designed to map onto `flow.ts` +
> `BUILDER_GROUPS`.
