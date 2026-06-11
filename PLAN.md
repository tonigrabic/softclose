# Merge plan — finishing the funnel ⇄ builder unification

> Living worklog. Tasks move from **Planned** → **Done** (with commit hashes) as I go.
> Blueprint: `handoff/IMPLEMENTATION.md` (3 acts, one shell, one nav, range-not-quote).
> Branch: `claude/relaxed-shannon-a70089`.

## Where things stand (audit, 2026-06-11)

Already landed on this branch (verified in code, not just commit messages):

- **PR1 (one shell)** — `AppShell` hosts both the funnel steps and `BuilderShell`; shared right rail (render anchor + `LiveBOMPanel`) from confirm-look onward.
- **PR2 (one nav)** — `JourneyNavRail` renders the whole journey (capture steps + 9 builder groups + close steps) with read-backs; builder groups are jump-navigable while building.
- **PR3 (reorder, partial)** — scope + wishlist live in Act 2; up-front budget ask dropped. **But** `project_basics` (type + timeline) still sits in Act 3, while the blueprint wants `type` as the Act-1 opener and timeline folded into logistics.
- **PR4 (seam)** — contract lock at "Confirm the look" (`LayoutConfirm` inline); builder seeds everything from the frozen `LayoutContract`; `/api/handoff` prices from the real builder BOM when present.
- **i18n** — hr/en locale layer + switcher across the funnel and builder groups.
- `tsc` and `eslint` are clean at audit time.

## Remaining gaps (the actual work)

The merge is incomplete wherever the journey still swaps chrome or language:

| # | Gap | Where |
|---|-----|-------|
| 1 | **Builder entry screen is a full-screen takeover** with hard-coded Croatian (even in EN mode) and "Phase 2" vocabulary | `BuilderStepView` in `kitchen-intake/index.tsx` |
| 2 | **Room summary line is hard-coded Croatian** | `summariseLayoutFromProfile` in `kitchen-intake/index.tsx` |
| 3 | **Offer/wrap-up screen drops the shell** (no nav, no progress) and is hard-coded English; real-BOM estimate still wears a "Placeholder" badge | `WrapUpScreen.tsx` |
| 4 | **PR3 unfinished**: `type` should open Act 1; timeline should live with logistics in Act 3 | `flow.ts`, `index.tsx`, readbacks, locales |
| 5 | **Mobile has no navigation at all** (nav is `hidden` below `lg`); blueprint wants progress pill → bottom-sheet rail + pinned range bar | `AppShell.tsx` + new mobile pieces |
| 6 | Dead code from the refactor (`StepsOverview` component shell, possibly others) | `kitchen-intake/` |
| 7 | Final §8 principle-checklist sweep + verification | — |

## Task list

- [x] **T0 — Audit + this plan**
- [x] **T1 — Builder entry screen into the shell + localized** ✓ `54a634f`
- [x] **T2 — Localize the room summary line** ✓ `54a634f`
- [x] **T3 — Offer screen into the shell + localized + honest badge** ✓ `98e74db`
- [x] **T4 — Finish PR3: `type` opens Act 1, timeline joins logistics** ✓ `71c8544`
- [x] **T5 — Mobile navigation model** ✓ `8d5204e`
- [ ] **T6 — Dead-code sweep**
      Verify and remove orphaned components left behind by the refactor
      (`StepsOverview` shell at minimum — confirm each by grepping importers first).
- [ ] **T7 — Verification sweep**
      `tsc` + `eslint` + production build; §8 principle checklist pass; hr/en
      spot-check of every journey surface. Browser smoke test stays with you
      (I don't run your dev server).
- [ ] **T8 (stretch, explicitly deferred)** — PR5 route promotion (`/space` `/build` `/offer`)
      + state lift. The blueprint itself marks this "later refactor"; not part of
      functional merge completion. Won't start without explicit go-ahead.

## Done log

- **2026-06-11 · T0** — Audited branch vs. blueprint; wrote this plan. Found PR1/PR2/PR4
  genuinely landed; PR3 partial; three chrome swaps left (builder entry, offer screen,
  mobile-no-nav); two hard-coded-language surfaces. `tsc`/`eslint` clean before any changes.
- **2026-06-11 · T1+T2 · `54a634f`** — Builder entry screen now renders inside `AppShell`
  as a normal step body: same `JourneyNavRail`, same progress bar, and the right rail
  (render anchor) now includes the builder step. All entry copy moved to
  `funnel.builderEntry.*` (hr + en); the "Phase 2 — Ana" eyebrow became the localized
  Act-2 label. Bonus fix found while in there: re-entering the builder used to re-hydrate
  from the AI hypothesis and silently discard every pick — `BuilderShell` now takes a
  `savedState` prop and resumes `profile.builderState`, so "pick up where you left off"
  is actually true. Room summary line (`summariseLayoutFromProfile`) localized through
  `layout.shape.*` + new `layout.suffix.island` key. The footer Continue is hidden on
  the entry step (its own CTAs own forward motion; footer Back still works). `tsc` +
  `eslint` clean.
- **2026-06-11 · T3 · `98e74db`** — Offer/wrap-up screen merged into the shell: renders
  inside `AppShell` with the journey rail fully done (`journeyDone` flag) and progress
  100%. All copy localized (`wrapup.*`, hr + en); option values go through `option.*`
  keys with humanized fallback. Honest estimate badge: amber "Placeholder" only for the
  budget stub; builder-BOM ranges show a neutral "From your build" tag, with the basis
  line composed client-side from a new `bandPct` field (so it localizes). Found + fixed
  in passing: the funnel's nav rail never received the active locale, so it stayed
  Croatian in EN mode. `tsc` + `eslint` clean.
- **2026-06-11 · T4 · `71c8544`** — PR3 finished. `type` (project-type chips) is now the
  first step of Act 1; the timeline picker lives inside logistics (Act 3), which now
  gates Continue on a chosen band; `project_basics` is gone from `FlowStepId`, `FLOW`,
  bodies, gating and locales. Step eyebrows renumbered in both languages. Also localized
  the rail read-backs while touching `readbackFor` — they were hard-coded English on
  every screen (project type / timeline / access / living now use `option.*` keys;
  counts use new `readback.*` keys; the locale flows through from `JourneyNavRail`).
  `tsc` + `eslint` clean.
- **2026-06-11 · T5 · `8d5204e`** — Mobile finally has navigation. Sticky header with a
  progress pill ("Gradnja · Korpusi · 2/12") that opens a bottom sheet rendering the
  same nav node as the desktop aside (new `journeyPillLabel()` shares the rail's
  position model, so the two can't disagree). Pinned `MobileRangeDock` shows the live
  range from the seam onward; expands to line items + maker-confirms note. Sheet
  closes on backdrop/Escape/step-pick; body scroll locks. Simplification vs. the
  blueprint: no render thumbnail in the mobile header (pill + dock carry the status;
  thumbnail felt like clutter at 380px — revisit if design disagrees). `tsc` +
  `eslint` clean.

## Open questions / decisions taken without asking

- **`budgetRange` fields**: the up-front ask was dropped (PR3) but the type + fallback
  summary still reference it — leaving the schema fields in place (a brief from an older
  session may still carry them); will only touch UI references where misleading.
- **`ConfirmScreen` inside `BuilderShell`**: unreachable from the real funnel
  (`layoutPreconfirmed` is always true there); it only serves the dev harness. Leaving as-is.
- **Branch → main merge**: not doing it unilaterally; when T1–T7 are green I'll say so
  and you decide when to merge.
