# Whole-app analysis (W5) — 2026-06-12

Three parallel read passes (funnel/state, API routes, output surfaces + catalog),
findings triaged and spot-verified before recording. Companion to
`contract-analysis.md` (the estimate/contract audit, whose findings W3a–W3d
already fixed). Build queue lives in WORKLOG.md (W5a–W5e + decisions).

## Verdict in one paragraph

The journey is structurally sound after the merge (one shell, one nav, contract-
driven builder + estimate), but it is **brittle at the edges and asymmetric at
the ends**: a page reload destroys the homeowner's entire session (the single
worst violation of "anxiety reduction" left in the app), AI endpoints fail hard
instead of calmly, and the two ends of the product disagree — the maker preview
prices in **dollars** while the homeowner sees euros, and rich captured data
(appliance SKUs, cabinet composition) never reaches the maker at all. Nothing
found contradicts the contract-is-driver invariant on the client; one server
gap (unvalidated contract payload) needs closing.

## HIGH findings (verified)

| # | Finding | Where |
|---|---|---|
| H1 | **No session persistence.** Entire funnel state (profile, photos, renders, builder picks) is React state only — reload mid-journey loses everything. Only the locale survives (`i18n` uses localStorage). | `kitchen-intake/index.tsx:97` |
| H2 | **Maker sees `$`, homeowner sees `€`.** `MakerDashboardPreview.fmtMoney()` hardcodes USD + "k" notation; every other surface uses EUR via `formatEUR`. Same brief, two currencies. | `MakerDashboardPreview.tsx:17` |
| H3 | **Appliance SKUs + cabinet composition never reach the maker.** Builder captures `pickedSku/Brand/Name` per appliance and per-unit patterns; the dashboard shows only a coarse integrated/freestanding enum. The estimate's drivers are invisible to the person who must confirm it. | `MakerDashboardPreview.tsx` |
| H4 | **`layoutContract` accepted unvalidated server-side** in `/api/builder-hypothesis` — straight into prompt text. Client-side the builder ignores AI layout (contract wins — verified), so the blast radius is prompt injection / crashes, not layout corruption. | `api/builder-hypothesis/route.ts:317` |
| H5 | **AI endpoints are open + rate limit is in-memory** (resets on restart, unbounded Map). MVP-acceptable, but the render endpoint spends real money per call. | `lib/rate-limit.ts` |

## MED findings (verified or high-confidence)

- M1 **Hard 500s on AI parse failure** — every vision route returns
  `{error}` 500 when the model returns no tool call; homeowner sees a crash
  instead of a calm "couldn't read that, try again / skip". (`builder-hypothesis:373` et al.)
- M2 **`/api/handoff` throws on a corrupt floor plan** (`validate(plan)`
  un-guarded) → whole bundle fails instead of omitting the plan SVG.
- M3 **Confirm-look gating asymmetry** — the "AI prefilled this" banner can
  show while Continue stays locked (banner checks `inspirationVision`, gate
  checks 5 material fields). (`kitchen-intake/index.tsx:928,1209`)
- M4 **Estimate framing drifts between surfaces** — badge/basis copy differs
  (homeowner: localized keys; maker: hardcoded "Placeholder · v0", title says
  "estimate" without the maker-confirms line).
- M5 **Catalog price gaps widen nothing** — decor exists but its
  `worktop600`/`iverica18` price is null → silent flat fallback (€35/m,
  €22/m²) with no band widening; inconsistent with the W3b confidence model.
- M6 **Homeowner wrap-up omits their own notes** — `applianceNotes` /
  `additionalNotes` go to the maker but aren't echoed on the homeowner's
  summary; perceived-sent ≠ actually-sent.
- M7 **No "what happens next" after submit** — wrap-up ends at a download
  button; no contact-confirmation, no expected-response framing. This is the
  "end the ghosting" P0 at its most literal.
- M8 **`previousRenderImage` base64 never validated** before forwarding to the
  image API → opaque downstream failures.
- M9 **render-concept returns raw provider error text** to the client on
  failure (potential key/infra detail leakage).

## LOW findings

- L1 `visitedSteps` is written on every navigation, never read (dead).
- L2 Rate-limit bucket Map never evicts expired entries.
- L3 Rate-limit error copy inconsistent across routes.
- L4 `HandoffBundle` carries `builderState` only implicitly via `brief` —
  worth an explicit, documented field.
- L5 `ConceptRender` autoStart effect hides deps behind an eslint-disable
  (stale-closure hazard on refactor; document or fix).

## Explicitly verified non-issues

- The AI cannot override contract layout client-side: `hydrateFromHypothesis`
  ignores hypothesis layout entirely; vision `unitPatterns` with unknown run
  ids simply never match. (Agent flagged it; code disproves it.)
- `buildStubEstimate` cannot return null in practice (midpoint fallback chain).
- No single-number quote path found on any surface — every estimate render is
  a low–high pair.

## Decisions for Toni (product calls, not building unilaterally)

1. **Scope step is mandatory** (`scopeCount > 0` gates Continue) — add a
   "let the maker advise" escape or keep forced? Forced scope = better briefs,
   more abandonment risk.
2. **Priorities (invest vs flex categories)** exist in the schema but are
   never asked or shown. Adding a question = better maker conversations vs.
   one more field (foundations warns about form fatigue). Ask, or drop the
   schema field?
3. **Confidence pills for the homeowner** — maker sees H/M/L per field;
   should the homeowner see them on the wrap-up too (transparency) or is that
   anxiety-inducing noise?
4. **Auth/rate-limit infrastructure** — Redis/Upstash + signed sessions for
   the AI endpoints is an infra/cost decision; current in-memory limiter is
   fine for demo, not for launch.

## Build queue (→ WORKLOG)

- **W5a** — Session persistence: autosave profile + step to localStorage,
  restore on load with a calm "pick up where you left off" affordance. (H1)
- **W5b** — API robustness pack: zod-validate `layoutContract` (H4), graceful
  no-toolCall fallbacks (M1), guarded handoff floor-plan (M2), base64 sanity
  check (M8), sanitized provider errors (M9), bucket eviction + unified 429
  copy (L2/L3).
- **W5c** — Output parity pack: EUR everywhere via `formatEUR` (H2), appliance
  SKU + cabinet-composition sections on the maker dashboard (H3), homeowner
  wrap-up echoes notes (M6), "what happens next" block with contact confirm
  (M7), unified estimate badge/basis copy via i18n (M4).
- **W5d** — Price-gap honesty: missing catalog price → `missingSource`
  widening + fallback note in line detail (M5).
- **W5e** — Small cleanups: drop `visitedSteps` (L1), align confirm-look
  banner/gate (M3), explicit `HandoffBundle.builderState` (L4), document the
  ConceptRender effect contract (L5).
