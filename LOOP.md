# LOOP.md — autonomous loop charter

Working root: `.claude/worktrees/relaxed-shannon-a70089` (branch
`claude/relaxed-shannon-a70089`). This worktree is the base going forward —
never touch the main checkout, never merge or push without Toni's explicit ok.

Companion files: `WORKLOG.md` (append-only iteration log),
`context/contract-analysis.md`, `context/app-analysis.md`, `AGENTS.md`
(product rules + red lines — re-read before any product-facing change).

## Operating rules (every iteration, no exceptions)

1. **One item per iteration.** Read this file + the tail of WORKLOG.md, take
   the TOP unchecked backlog item, make the smallest change that completes it.
2. **The gate** — all of this must pass before any commit:
   - `npx tsc --noEmit` · `npx eslint .` · `npm run build`
   - Once B0 lands: the band-invariant test. For EVERY fixture in
     `src/lib/builder/fixtures.ts`, hydrated with `hypothesis = null`, the
     displayed band (`Math.round(bandWidthPct / 2)`) must be **≤ 20**, and
     per-fixture total low/high snapshots must not drift without a logged
     explanation.
   - If the gate gets worse → **revert, log the finding in WORKLOG, move on.**
     Never commit a regression. (This rule exists because W3b shipped a
     ±20%→±30% regression behind green tsc/eslint/build.)
3. **Verify against the real route/flow, not a private fixture.** W3b was
   "verified" on a fixture with M/H confidence hints; the real `/builder`
   route hydrates everything L. If a claim can only be proven in a browser,
   write it in WORKLOG as "needs browser check by Toni" — do NOT mark it
   verified. Never start a dev server; Toni manages it.
4. **Escalate, don't decide.** Anything touching the LayoutContract schema,
   the ±20% promise, AGENTS.md red lines, pricing semantics, or visible
   copy/UX direction → append to QUESTIONS below and skip to the next item.
5. **Log every iteration** in WORKLOG.md: what changed, gate numbers
   before/after, what's next. Match the existing commit-message style.
   Commit each green step without asking.

## Backlog (strict order)

- [x] **B0 — Executable gate.** ✓ 2026-06-12 Add a minimal test runner (vitest, or a plain
  `node --experimental-strip-types` script if deps are unwelcome) with one
  test that matters: every contract fixture × `hydrateFromHypothesis(null)` ×
  `computeBom` → assert displayed band ≤ 20 and snapshot total low/high per
  fixture. It SHOULD fail red at ~±30% on day one — that proves it works.
  Wire a `npm run gate` script chaining test + tsc + eslint + build.

- [x] **B1 — Band recalibration (fix the ±30% regression).** ✓ 2026-06-12 —
  `narrowByMeta` replaces `widenByMeta`: legacy spread = L worst case,
  confidence narrows half-width toward the midpoint (H ×0.6, M ×0.85, L ×1).
  Untouched ±12–14%, fully confirmed ±9–10% on all fixtures. See Q6. Diagnosis, so it
  needn't be rediscovered:
  - `widenByMeta` (`src/lib/builder/bom.ts`) double-counts uncertainty: the
    base spreads already encode unspecified-ness (boards ×1.18 waste,
    sink/tap high ×1.5 when no model picked, lighting 25–60 €/m, appliance
    narrowing when picked). Meta widening layers the same signal again —
    sink+tap alone reaches ~±51% displayed.
  - On the real route `hypothesis = null`, so `metaFromHint(undefined)`
    (`src/lib/builder/state.ts`) stamps every material field L → max
    widening everywhere. Labour + contract-known appliances stay H.
  - Display formula `±(high−low)/low ÷ 2` measures against the LOW end, not
    the midpoint, inflating the headline (ratio 1.6 → "±30%" vs ±23% mid).
  - Fix direction: treat the legacy static spread as the L-grade worst case —
    confirmation NARROWS within it; the unconfirmed band must never exceed
    a displayed ±20%. Keep W3a (footprints), the meta plumbing, and the
    `homeowner-edited` wiring — they're sound. Do not revert; recalibrate.
  - Acceptance: gate green (all fixtures ≤ 20), and confirming fields still
    visibly tightens the band (keep that reward loop).

- [x] **B2 — Connect funnel → builder for real.** ✓ 2026-06-12 — full-path
  code audit: connected end to end with calm degradation at every AI seam;
  handoff seam now pinned by tests (`tests/handoff-connection.test.ts`).
  Browser walk = Toni's check, click-path in WORKLOG iteration 3. `/builder` is a dev harness
  with `hypothesis={null}`; the live `/` journey must hand off: frozen Part-1
  FloorPlan → `floorPlanToLayout` contract → BuilderShell mounted with a
  non-null hypothesis from `/api/builder-hypothesis`, the profile, and saved
  state on re-entry. Acceptance: the handoff path exists in code with no
  dead ends, hypothesis fetch failure degrades calmly (not a 500 wall), and
  a WORKLOG entry lists exact click-path for Toni's browser check.

- [ ] **B3 — Finish the verify/confirm screen.** The end-of-capture
  "confirm what we counted" gate (ConfirmScreen in BuilderShell + the
  Part-1 confirm-look step) is incomplete per Toni. First iteration: audit
  it against `context/product-foundations.md` + `context/intake-catalog.md`,
  list concrete gaps in WORKLOG; then fix them in subsequent iterations
  (includes app-analysis M3: banner/gate asymmetry).

- [ ] **B4 — Contract-driven audit of every builder screen.** Per screen in
  `src/components/builder/groups/`: does it read what the contract knows
  (runs, corners, island, hasWall/hasTall, appliance positions/widths) or
  re-ask/ignore? Log the matrix in WORKLOG, then close the gaps.

- [ ] **B5 — Session persistence (app-analysis W5a/H1).** Autosave profile +
  step + builder state to localStorage, restore on load with a calm "pick up
  where you left off". Reload mid-journey currently loses everything — worst
  anxiety-reduction violation in the app.

- [ ] **B6 — Output parity pack (W5c).** EUR everywhere via `formatEUR` (H2 —
  maker preview shows `$51k`), appliance SKUs + cabinet composition on the
  maker dashboard (H3), homeowner wrap-up echoes their notes (M6), "what
  happens next" block after submit (M7 — the ghosting P0), unified estimate
  badge/basis copy via i18n (M4).

- [ ] **B7 — API robustness pack (W5b).** zod-validate `layoutContract`
  server-side (H4), graceful no-toolCall fallbacks instead of 500s (M1),
  guarded handoff floor-plan validate (M2), base64 sanity check (M8),
  sanitized provider errors (M9), rate-limit bucket eviction + unified 429
  copy (L2/L3).

- [ ] **B8 — Price-gap honesty (W5d).** Missing catalog price → use the
  `missingSource` widening + a fallback note in the line detail (M5), kept
  consistent with B1's recalibrated model.

- [ ] **B9 — Small cleanups (W5e).** Drop dead `visitedSteps` (L1), explicit
  `HandoffBundle.builderState` (L4), document/fix the ConceptRender
  autoStart effect contract (L5).

- [ ] **B10 — Re-run the whole-app pass.** Architecture + UX sweep of the
  full journey with fresh eyes (including the loop's own prior work — W5
  missed the W3b regression because it never re-examined it). Propose the
  next queue here; don't build unqueued items.

## QUESTIONS for Toni (append; never decide unilaterally)

1. Scope step is mandatory (`scopeCount > 0` gates Continue) — keep forced,
   or add a "let the maker advise" escape? (briefs vs. abandonment)
2. `priorities` (invest/flex categories) exists in the schema but is never
   asked or shown — add the question, or drop the field?
3. Confidence pills (H/M/L) — maker-only, or show the homeowner on wrap-up?
4. Auth + rate-limit infra (Redis/Upstash + signed sessions) — in-memory is
   demo-fine, not launch-fine. When to invest?
5. Band display convention: ± measured against the low end (current,
   inflates the number) or against the midpoint (industry-typical)? B1 caps
   at ≤20 either way, but the convention changes the headline number.
6. B1 calibration knobs (shipped, tunable in one line —
   `CONFIDENCE_HALF_WIDTH` in `bom.ts`): untouched now displays ±12–14%
   (below the old ±20%, because Part-1 layout confirmation + contract-known
   appliances already count as confirmed), fully confirmed ±9–10%. Is a
   fully-confirmed ±9% an acceptable claim for an AI estimate the maker
   hasn't confirmed, or should there be a floor (e.g. ±10–12% market
   spread)? And is starting at ±13% fine, or would you rather the untouched
   state sit closer to the ±20% headline (H ×0.75 instead of ×0.6)?
