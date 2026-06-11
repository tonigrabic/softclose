# WORKLOG — autonomous loop record

> Running record of everything the loop works on, in order, with commits.
> Branch: `claude/relaxed-shannon-a70089` (shannon worktree).
> Companion docs: `PLAN.md` (merge plan, T0–T8), `handoff/IMPLEMENTATION.md` (blueprint).

## Standing instructions (from Toni, 2026-06-11)

1. Finish merging the two sides of the app (funnel ⇄ builder).
2. Go through the LayoutContract and analyze it.
3. Figure out how to get a better estimate.
4. Every screen in the builder should be easily plug-in / plug-out.
5. The contract must be THE driver for the builder and the cost estimate.
6. Run an analysis of the whole app; propose improvements and build them.
7. Keep a record of all actions in this file.

## Backlog (loop's own queue, reordered as priorities emerge)

- [x] **W1 — Finish the merge** (= PLAN.md T6 bookkeeping + T7 verification sweep) ✓ iter 1
- [x] **W2 — Contract analysis** ✓ iter 2 — full audit in `context/contract-analysis.md`
- [ ] **W3 — Better estimate** (scoped by W2's findings, in build order):
      - [ ] W3a — appliance footprints: contract gains `applianceSpans` per run;
            seeding skips fridge span / converts dishwasher slot; worktop length
            subtracts fridge; island out of mitre count (Finding 1)
      - [ ] W3b — confidence → band: BOM reads state meta + contract confidence
            flows into meta at hydration; band tightens H→L (Finding 2)
      - [ ] W3c — hob/fridge/dishwasher measured positions drive seeded patterns
            (Finding 3)
      - [ ] W3d — window-aware `hasWall` default (Finding 4)
- [ ] **W4 — Plug-in/plug-out builder screens**: define one step-module interface
      (id, nav node, body, gating, readback, BOM contribution) so adding/removing
      a builder group is a registry entry, not an `index.tsx` surgery.
- [ ] **W5 — Whole-app analysis**: architecture + UX pass over the full journey;
      propose improvements, get them on this list, build them.

## Log

### 2026-06-11 — Iteration 1

- Loop started. Created this file.
- **W1 in progress:** ticked T6 in PLAN.md (the dead-code sweep landed as `4a6a224`
  but never ticked its own box). Added `handoff/**` to eslint ignores — the 7
  outstanding lint errors were all in `handoff/prototype/*.jsx`, a hand-authored
  static design-reference mockup, not app code.
- **W1 done — the merge plan (T0–T7) is complete.** Verification results:
  - `tsc` clean · `eslint` clean · production build green (12/12 pages).
  - §8 principle checklist verified in code: all surfaces render through
    `AppShell` (no full-screen takeovers remain); hr-HR is the default locale;
    "your maker confirms" range framing present in both locales; zero
    urgency/scarcity/fixed-price copy; mobile pill → bottom-sheet → range dock.
  - Gap found + fixed: `prefers-reduced-motion` wasn't respected anywhere →
    added the global reduce guard in `globals.css`.
  - hr/en spot-check (code level): only Croatian outside `i18n/locales` is
    comments, locale-keyed maps, and Croatian catalog search keywords — fine.
  - **Left for Toni:** browser smoke test (I don't run the dev server) and the
    merge-to-main decision. T8 (route promotion `/space` `/build` `/offer`)
    stays deferred per plan.
- Next iteration: **W2 — contract analysis** (layout-contract.ts field-by-field:
  producer → consumers → confidence; find dead/ambiguous/missing fields), feeding
  directly into W3 (better estimate) and W5's architecture pass.

### 2026-06-11 — Iteration 2

- **W2 done — contract audited field-by-field.** Full writeup:
  `context/contract-analysis.md`. Headline: the contract IS the single source
  of layout truth for the builder (hydration requires it, no fallbacks — spec
  honored), but it is NOT yet the driver of the estimate. Four findings:
  1. **Appliance footprints double-counted** (HIGH): counter segments cut out
     doors but not appliances → fridge/dishwasher spans get seeded cabinets AND
     the appliance; worktop length includes the fridge span. Systematic
     overestimate on appliance walls.
  2. **Confidence never reaches the band** (HIGH): bom.ts claims ±10%/±25% by
     confidence in its header but reads no meta at all; contract per-run/per-
     appliance confidence is dropped at hydration. The range can't tighten as
     the homeowner confirms — breaking foundations principle 6.
  3. Measured hob/fridge/dishwasher positions unused in seeding (only sink is).
  4. `hasWall` default could be window-aware, deterministically (no AI needed).
- Backlog updated: W3 now split into W3a–W3d in build order.
- Next iteration: **build W3a** (appliance footprints) — biggest systematic
  estimate error, pure logic, easiest to verify.
