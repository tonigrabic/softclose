# softclose — improvement spec

_Audit of `main` @ 8dd7a69 on 2026-10-02. Nine code-reading passes (intake, builder, cost model, maker side, auth/infra, AI seams, i18n/compliance, tooling, product gap) plus a mock-mode browser run of the whole homeowner journey. Every item below cites the code that produces it. Status column is the tracker; implement as stacked PRs from #1. The raw findings behind every item, with file:line evidence and each reader's notes, are in `context/audit-2026-10-02-findings.md`; read the relevant slice before starting an item, but treat this file as the list and that one as the evidence._

**Verdict.** The journey runs end to end and the engineering underneath (contract-driven layout, single unit assembler, auth, checkpoints) is sound. What fails is the product promise at its two ends: the **range is not honest** (a fabricated number when the builder is skipped, VAT and margin never stated, "confirmed" stamped on things nobody confirmed) and the **maker cannot act** (quote / clarify / decline are demo no-ops, the homeowner is promised notifications that do not exist, re-submits make blind copies). Fix those two, then stop the money and data leaks (render cap, B2B cost in the homeowner response, builder state lost on reload), then compliance, then polish.

## Priority order

| # | ID | Improvement | Sev | Effort | Stack on | Status |
|---|----|-------------|-----|--------|----------|--------|
| 1 | IMP-01 | Remove the fabricated stub estimate | critical | S | main | pr: https://github.com/tonigrabic/softclose/pull/11 |
| 2 | IMP-31 | Room first: vision reconciles all photos, homeowner confirms shape and measures | high | M | main (IMP-11 first is recommended, not required) | pr: https://github.com/tonigrabic/softclose/pull/12 |
| 3 | IMP-32 | Render constrained by the measured room; light post-render confirm | high | M | IMP-31 | todo |
| 4 | IMP-03 | Maker decision persists and reaches the homeowner | critical | M | main | todo |
| 5 | IMP-04 | Range is what the homeowner will pay: gross, margin in, exclusions stated; one range line everywhere | critical | M | IMP-01 | todo |
| 6 | IMP-05 | Strip maker-only controls and B2B cost from the homeowner wrap-up | high | S | main | todo |
| 7 | IMP-06 | Builder state autosaves | critical | M | main | todo |
| 8 | IMP-07 | Review before send; edits after submit are possible | high | M | IMP-06 | todo |
| 9 | IMP-08 | Maker email in Croatian; login reports a failed send honestly | medium | S | main | todo |
| 10 | IMP-09 | AI disclosure, photo notice, privacy page, delete-my-kitchen, EGGER flag | high | M | main | todo |
| 11 | IMP-10 | Render cap and AI spend enforced per project | high | M | main | todo |
| 12 | IMP-11 | Confidence and provenance tell the truth | high | M | main | todo |
| 13 | IMP-12 | "Neka odluči izrađivač" in every builder group | high | M | IMP-11 | todo |
| 14 | IMP-29 | Confirm screen: one surface, tap to select, no drag, no per-unit picks | medium | M | IMP-32, after a homeowner test | todo |
| 15 | IMP-33 | Public product page with a guided live demo of the journey | high | M | IMP-32 | todo |
| 16 | IMP-13 | Re-renders use the chosen decor, RAL and anchor photo | high | S | main | todo |
| 17 | IMP-14 | Maker brief: photos, SKUs, line provenance, capped-band note, shell | high | M | IMP-04 | todo |
| 18 | IMP-15 | Brief export: print/PDF and JSON | medium | S | IMP-14 | todo |
| 19 | IMP-16 | Customer notifications that exist, plus a response-time line | high | M | IMP-03 | todo |
| 20 | IMP-17 | Resume on another device without broken images; honest save state | high | M | main | todo |
| 21 | IMP-18 | Dashboard: no 404 rows, resend invite, archive, paging, multi-project customers | high | M | main | todo |
| 22 | IMP-19 | Re-submit versioning with a diff | medium | M | IMP-03 | todo |
| 23 | IMP-20 | Worktop and hardware pricing bugs | high | M | IMP-04 | todo |
| 24 | IMP-21 | Rate card per maker in the database | high | M | IMP-04 | todo |
| 25 | IMP-22 | Intake dead ends and silent fallbacks | medium | M | IMP-32 | todo |
| 26 | IMP-23 | AI routes: slim bodies, timeouts, invalid tool calls, logging, audit log | medium | M | main | todo |
| 27 | IMP-24 | Croatian copy pack | medium | S | main | todo |
| 28 | IMP-25 | Everything the maker reads is in their language | medium | S | main | todo |
| 29 | IMP-26 | Two site-visit facts and the decision-maker chip | medium | S | main | todo |
| 30 | IMP-02 | CI gate on every PR and on main | high | S | main | todo |
| 31 | IMP-27 | Production config and script safety | medium | M | IMP-02 | todo |
| 32 | IMP-28 | Tests for routes, actions and the checkpoint hook | medium | M | IMP-02 | todo |
| 33 | IMP-30 | Repo hygiene | low | S | main | todo |

---

### 1. IMP-01 — Remove the fabricated stub estimate
**Problem.** "Preskoči — pošalji samo osnovni brief" falls back to `buildStubEstimate`, which keys off `budgetRange` and `scope`, neither of which any step sets any more. It returns `SCOPE_MIDPOINTS_USD[0]` = 12,000 ±20% as 9,600–14,400 €. That number lands on the wrap-up, the kitchen home, the dashboard row, the brief row and the maker email subject as if it were a real ±20% range. Four readers found it independently.
**Fix.** Delete `src/lib/stub-estimate.ts`. In `buildHandoffBundle` set `estimate = null` when `brief.builderState` is absent. Wrap-up, kitchen home, dashboard and email already render the null case; add one line "Raspon dobivaš kad sastaviš kuhinju" with a link back to the builder.
**Files.** src/lib/stub-estimate.ts, src/lib/handoff/bundle.ts, src/components/kitchen-intake/WrapUpScreen.tsx, src/lib/notify/maker-email.ts, src/app/kitchen/[projectId]/KitchenHome.tsx, tests/scope-estimate.test.ts.
**Done when.** No `USD` constant in src/; a skipped-builder handoff stores null estimate columns; the email subject says "raspon nije dostupan"; a test asserts `buildHandoffBundle` without builderState yields `estimate === null`.
**Stack on.** main.

### 2. IMP-31 — Room first: the vision read reconciles all photos, the homeowner confirms the shape and measures
**Problem.** Today the order is photos → inspiration → render → confirm layout. The layout is read back from a render anchored to one photo, so the testers' second wall was lost, and the dimensions are AI guesses that vary run to run (320×240, 360×260, 420×260 from one photo) and never have to be confirmed. Decision 2026-10-03: the homeowner measures; the AI number is only a hint.
**Fix.** (1) Vision: all photos are one room from different positions; add a per-photo `view` (which wall or corner it shows) and reconcile into one plan; show the labels on the next screen with tap-to-correct. (2) New step "Tvoj prostor danas" right after photos: the shape card pre-selected (L, U, galley, single wall, island, empty room), one chip row "keep this layout / add an island / move the sink / change it", then the measure screen: plan picture with the walls lettered, one numeric field per counter-bearing wall, empty, the AI estimate greyed as a hint, Continue disabled until every wall has a typed value. No "use the estimate" button. Ceiling height optional and flagged "nije izmjereno". "Nemaš metar pri ruci? Spremi i nastavi kasnije" relies on the existing checkpoint resume. Typed values stamp H/homeowner (IMP-11). (3) Inspiration moves after it; `resolveStepId` forwards saved journeys.
**Files.** src/lib/flow.ts, kitchen-intake/index.tsx, src/app/api/space-vision/route.ts, SpaceCapture.tsx, LayoutReview.tsx, src/lib/derive-layout.ts, src/lib/floor-plan/model.ts, readbacks.ts, locales, tests/flow-steps, derive-layout, vision-wall-reconcile.
**Done when.** The testers' two-angle L photos produce two counter walls with view labels; the render button is unreachable without typed wall lengths; a journey saved on the old step order resumes at the room step.
**Stack on.** main. IMP-11 first is recommended so that "measured" narrows the band more than a scrolled-past default, but it is not required to build this.

### 3. IMP-32 — Render constrained by the measured room; light post-render confirm
**Problem.** The render prompt knows nothing of the room: it invents walls, and the post-render step then re-derives the whole layout from the picture. The other space photos never reach the render, and the maker never learns whether the sink moves.
**Fix.** render-concept receives the confirmed contract (shape, counter walls, window wall, sink and hob walls, island, dimensions) as hard constraints; the other space photos go in as "same room, other side" references; the anchor is the widest shot (vision ranks, homeowner can override); an optional "Prikaži drugi zid" button renders from the other photo and spends one of the five. The post-render confirm shrinks to the plan picture, three toggles (island, sink stays, uppers per wall) and the tally. builder-hypothesis is demoted to decor and material hints. The difference between the as-is and to-be sink and hob walls is written to the brief as "voda/plin se sele".
**Files.** src/app/api/render-concept/route.ts, ConceptRender.tsx, LayoutConfirm.tsx, src/app/api/builder-hypothesis/route.ts, src/lib/derive-layout.ts, src/lib/handoff/bundle.ts, MakerDashboardPreview.tsx, locales.
**Done when.** A prompt test contains the constraints; with "keep this layout" the tally after the render equals the tally before it; the brief shows whether the sink moves.
**Stack on.** IMP-31.

### 4. IMP-03 — Maker decision persists and reaches the homeowner
**Problem.** On the real brief page the three buttons Za ponudu / Pojasni / Odbij only flip local state and print "Demo radnja (bez učinka)". `maker_status` never moves past `viewed`, the homeowner never learns the outcome, the dashboard's "quoted" flag is derived from `!== 'new'` so a glance counts as a quote, and nothing records the price the maker actually quoted, so the ±20% hit rate can never be measured. This is rule 8 and Definition of Done #3.
**Fix.** Migration 0006: `maker_note`, `decided_at`, `quoted_eur` on briefs. Server action `decideBrief(briefId, status, note?, quotedEur?)` behind `requireBriefAccess`, wired to the three buttons; `declined` archives the project. Show the decision as a chip on the brief, the dashboard row and the homeowner's kitchen home. `quoted = makerStatus === 'quoted'`. Record ±20% definition in WORKLOG: total works range vs the maker's first formal quote.
**Files.** db/migrations/0006_*.sql, src/app/maker/[id]/actions.ts, MakerDashboardPreview.tsx, src/app/dashboard/page.tsx, src/lib/project/status.ts, KitchenHome.tsx, locales.
**Done when.** Clicking Za ponudu with 6,200 € writes status + amount; the kitchen home shows "{maker} je poslao ponudu"; a test covers the action's ownership check and the status transitions.
**Stack on.** main.

### 5. IMP-04 — Range is what the homeowner will pay: gross, margin in, exclusions stated; one range line everywhere
**Problem.** Boards are priced from Elgrad's wholesale list and labour from the maker's cost sheet (net, no margin or overhead); appliances and hardware are retail incl. 25% PDV. They are summed into one "Ukupno" and the string "PDV" does not exist in src/. The homeowner sees what the kitchen costs the shop to make, labelled "Sve uključeno". Nothing states what is excluded (removal of the old kitchen, electrical/plumbing, delivery, templating); the scope allowances are dead code since the scope step was cut. Kitchen home and the dashboard print the range bare, with no ± or "maker confirms" line. Rounding differs per surface.
**Fix.** Decision 2026-10-03: the headline is the amount the homeowner will actually pay, so every line is gross (VAT included) and the workshop margin is inside the number. No VAT line and no margin line on any homeowner surface. All Elgrad sources are gross: the webshop (MPC) and the veleprodajni cjenik both include PDV (Toni, 2026-10-03), so no gross-up anywhere; record `vatBasis: "gross"` in the catalog metadata and apply the maker's margin from the rate card (IMP-21) to material + make, and keep the net cost and margin as maker-only fields for the brief page. Add `assumptions: string[]` to `BomEstimate` built from state (montaža uključena, bez rušenja i odvoza, bez elektro/vodo radova, uređaje nabavlja kupac). One `RangeLine` component (low–high · ±pct · "raspon koji {maker} potvrđuje") and one `formatRange` rounding helper used by wrap-up, kitchen home, dashboard, panel, dock, email and brief. Render `estimate.lines` grouped on the wrap-up. Hide the "0 € – 0 €" goods row when the homeowner supplies.
**Files.** src/lib/builder/bom.ts, src/lib/types.ts, LiveBOMPanel.tsx, MobileRangeDock.tsx, WrapUpScreen.tsx, KitchenHome.tsx, DashboardList.tsx, maker-email.ts, MakerDashboardPreview.tsx, locales, tests/band-invariant + snapshots.
**Done when.** Every range on every surface carries the assumptions list and no VAT or margin line; the catalog metadata states every Elgrad source is gross; the maker page shows net cost and margin; fixture snapshots regenerated once with the reason logged; band-invariant still ≤ 20.
**Stack on.** IMP-01.

### 6. IMP-05 — Strip maker-only controls and B2B cost from the homeowner wrap-up
**Problem.** After submit the wrap-up offers "Otvori pogled izrađivača" (404 for a customer) and a "Demo: pogledaj što vidi izrađivač" button that renders the maker view, including the "Tvoja nabavna cijena (B2B) · kupac ovo nikad ne vidi" box. `/api/handoff` returns `estimate.makerCost` to the customer and the JSON download writes it to disk. Dormant only because maker-pricing.json is empty.
**Fix.** In project mode drop both controls and show "Natrag na moju kuhinju" → /kitchen/[projectId]. Compute `makerCost` only in `maker/[id]/page.tsx`; strip it from the handoff response. Keep the demo toggle only in the /builder harness.
**Files.** WrapUpScreen.tsx, src/lib/handoff/bundle.ts, src/app/api/handoff/route.ts, src/app/maker/[id]/page.tsx.
**Done when.** A test asserts the customer response has no `makerCost`; no `/maker/` link renders for a customer session.
**Stack on.** main.

### 7. IMP-06 — Builder state autosaves
**Problem.** `BuilderShell` keeps the whole build in a local reducer and hands it out only on the last Continue or the escape hatch. A reload, tab close or device switch anywhere in the eight groups loses every pick and every paid re-render.
**Fix.** `onStateChange` prop on `BuilderShell`, debounced ~500 ms, wired in the intake to `patchProfile({ builderState })` so the existing snapshot + checkpoint carry it. Persist the current group id too.
**Files.** src/components/builder/BuilderShell.tsx, src/components/kitchen-intake/index.tsx, src/lib/project/snapshot.ts.
**Done when.** Reload at group 4 restores picks, re-renders and the group; a hook test covers the debounce.
**Stack on.** main.

### 8. IMP-07 — Review before send; edits after submit are possible
**Problem.** The wrap-up header says "Pregledaj što šaljemo — ispravi sve što ne valja", but `loadBundle()` fires on mount, so the brief is inserted and the maker emailed before the homeowner reads a line, and every section passes `onFix={null}`. "Izmijeni kuhinju" from the kitchen home lands on the done screen whose only control is "Pošalji ponovno", which inserts an identical brief. Revisiting the wrap-up shows "Procjena još nije dostupna" until they re-send.
**Fix.** Split into review → explicit "Pošalji izrađivaču". Wire `onFix` per section to `goTo(step)` and make done rail steps navigable. On revisit pass the saved range + briefId as `initialResult`. In the builder, "Izmijeni" opens at the last step with `isDone=false`.
**Files.** WrapUpScreen.tsx, kitchen-intake/index.tsx, JourneyNavRail.tsx, KitchenHome.tsx.
**Done when.** No `/api/handoff` call happens before the send button; Back works from the wrap-up; a revisit shows the saved range.
**Stack on.** IMP-06.

### 9. IMP-08 — Maker email in Croatian; login reports a failed send honestly
**Problem.** The maker's "Novi sažetak kuhinje" email prints a row labelled "Homeowner" and raw ids for layout and timeline (`l_shape`, `3_6_months`). Separately, `requestLoginLink` returns `sent` whatever `sendEmail` returned, so if the provider ever rejects a message (bad from-address, quota, outage) the login page still says the link is on its way. Correction: the audit's claim that Resend was not configured was wrong. RESEND_API_KEY and RESEND_FROM were set on Vercel on 2026-10-02 and email login works.
**Fix.** Label rows through `tDynamic`, map the two enums through `layout.shape.*` and `option.timeline.*`, add the project link next to the brief link. In the login and invite actions return an honest error when the outcome is `failed` or `skipped` ("Slanje nije uspjelo, zatraži link od izrađivača") and log the provider status.
**Files.** src/lib/notify/maker-email.ts, src/app/login/actions.ts, src/app/dashboard/actions.ts, locales, tests/maker-email.test.ts.
**Done when.** The maker email test asserts no `_` ids and no "Homeowner"; a mocked failed send shows the error state on the login form.
**Stack on.** main.

### 10. IMP-09 — AI disclosure, photo notice, privacy page, delete-my-kitchen, EGGER flag
**Problem.** A grep of src for privatnost/privacy/gdpr/impressum/kolači/consent returns nothing user-facing. The kitchen home never says an AI reads the photos; the photo step sends home photos to OpenAI with no notice; there is no privacy page, no impressum, and no way for a homeowner to delete their kitchen (deletion is a dev script). EU AI Act Article 50 is in force since August 2026. EGGER swatches are hotlinked behind a compile-time `const = true` that the owner marked "testing only, permission required".
**Fix.** One sentence on the kitchen home and in the invite email ("Kroz korake te vodi AI asistent; {maker} osobno pregledava sve što podijeliš"); one calm line under the photo drop zone with a link; a static /privatnost page (processing purpose, retention, OpenAI as processor, contact) linked from a `LegalFooter` in `AuthShell`; a "Izbriši moju kuhinju" server action that ports delete-brief (storage objects, briefs, snapshot, tokens, account). `DECOR_IMAGES_ENABLED` from `NEXT_PUBLIC_DECOR_IMAGES === '1'`, default off, `referrerPolicy="no-referrer"`.
**Files.** KitchenHome.tsx, SpaceCapture.tsx, src/components/AuthShell.tsx, src/app/privatnost/page.tsx, src/app/kitchen/[projectId]/actions.ts, src/lib/notify/auth-email.ts, src/lib/builder/swatches.ts, locales.
**Done when.** The disclosure line renders on first load; delete removes every row and object for a test project; a test asserts the decor flag is false under `NODE_ENV=production`.
**Stack on.** main.

### 11. IMP-10 — Render cap and AI spend enforced per project
**Problem.** The 5-renders cap is an in-memory 30-minute bucket per Vercel instance: it refills, resets on cold start and multiplies across instances. `RerenderPanel` keeps a separate `useState(0)` counter that resets on remount. A maker opening a customer's kitchen in read-only mode can still drive every AI call under their own key and store the customer's journey in their browser.
**Fix.** Migration: `renders_used` on projects. `/api/render-concept` takes `projectId`, checks ownership and claims a slot atomically (`update ... where renders_used < 5`), returns `remaining`; the panel shows the true budget. Thread `readOnly` into StepBody/BuilderShell: disable Continue and AI buttons, skip IndexedDB, show "Pregledavaš kupčev napredak". Keep the in-memory bucket as a burst guard only.
**Files.** db/migrations/0006_*.sql, src/app/api/render-concept/route.ts, RerenderPanel.tsx, ConceptRender.tsx, kitchen-intake/index.tsx, BuilderShell.tsx.
**Done when.** The sixth render for a project is refused regardless of time or instance; a route test covers the atomic claim; a read-only maker cannot trigger a render.
**Stack on.** main.

### 12. IMP-11 — Confidence and provenance tell the truth
**Problem.** Pressing Continue runs `confirmGroupMetas`, which stamps every field in the group as `homeowner-confirmed` (graded H, band ×0.6), including AI defaults merely scrolled past and fields the screen never rendered (sink chips under "Ja nabavljam", hob config under homeowner supply). A picked Schachermayer reference RRP becomes an "exact · točno" line. Typing a wall length on the confirm card leaves `room.confidence` at the AI value while the canvas input stamps H. The confirm step is titled "Provjeri što smo izmjerili" though nothing was measured; a silent 280 cm ceiling default prints as fact; `PickerSlot` labels plain defaults as AI suggestions.
**Fix.** New provenance `homeowner-seen` mapped to at most M; each group module exposes `confirmableMetaKeys(state)` for what it actually rendered; card edits stamp H/homeowner; carry `priceBasis` into picks so `exact` only for `retail_incl_vat`; `ceilingSource` on the plan; retitle the card "Provjeri dimenzije — AI ih je procijenio s fotografije" with a per-wall pill (procjena / izmjereno) and one sentence inviting a tape measure; a neutral "Zadano" tone in `PickerSlot`.
**Files.** src/lib/builder/state.ts, bom.ts, groups/registry.tsx + groups/*, PickerSlot.tsx, LayoutConfirm.tsx, LayoutReview.tsx, src/lib/floor-plan/model.ts, locales, tests/band-invariant.
**Done when.** Walking past a group without touching it leaves its band unchanged; a card wall edit narrows the labour band in a test; no "točno" badge on a reference-priced pick.
**Stack on.** main.

### 13. IMP-12 — "Neka odluči izrađivač" in every builder group
**Problem.** Only hob/oven/extractor have an "unknown" chip. Fronts, decor, worktop family, backsplash, carcass, built-in fridge/dishwasher, all sink/tap chips, LED and plinth force a pick, and every pick is stamped H, so a guess narrows the band like a decision. Foundations and the intake catalog make the "I don't know" path a rule.
**Fix.** `deferred` on `FieldMeta`; one shared "Neka odluči izrađivač" chip in `PickerSlot` that keeps the default, sets confidence L + deferred, is excluded from confirmation, and shows on the maker brief as "kupac prepušta izrađivaču".
**Files.** PickerSlot.tsx, groups/*, src/lib/builder/state.ts, bom.ts, MakerDashboardPreview.tsx, locales.
**Done when.** Every group has the chip; a deferred field widens its line to L in a test; the brief lists deferred fields.
**Stack on.** IMP-11.

### 14. IMP-29 — Confirm screen: one surface, tap to select, no drag, no per-unit picks
**Problem.** Two surfaces edit one plan: the canvas and the card below it both set wall lengths, and the card also edits units. The canvas carries designer chrome (undo/redo, shortcuts, cm/ft, counter depth, anchors, passages) that moves no first quote, and the card asks for corner mechanisms and pull-outs, which are maker decisions stamped as confirmed homeowner choices that narrow the band.
**Fix.** Gate first: land IMP-31 and IMP-32, then watch three to five homeowners use the confirm screen on their phones and size this from what they stall on. Then one surface: the plan picture stays live and is the selector (tap a wall, its row opens: length, window or door, sink or hob, uppers, tall unit). Remove drag, the duplicate card and the chrome; keep the per-wall toggles; drop per-unit mechanism picks from the homeowner side, the maker brief keeps the derived tally. A keyboard list of walls and heading focus on step change for accessibility.
**Files.** LayoutConfirm.tsx, floor-plan-editor/Editor.tsx, src/lib/floor-plan/svg.ts, AppShell.tsx.
**Done when.** No value has two inputs; no drag handlers remain on the homeowner path; keyboard-only wall selection works; the parity test still locks the same contract.
**Stack on.** IMP-32, after the homeowner test.

### 15. IMP-33 — Public product page with a guided live demo of the journey
**Problem.** The app has no public face: `/` is a sign-in signpost and a maker who gets a link sees a login box. There is nothing to send a workshop owner that shows what the product does in sixty seconds, and nothing that explains it to the homeowner they are about to invite. Reference: enjoy.dev, whose hero is the product itself auto-playing a five-step story with one-line captions and a stepper, not a screenshot.
**Fix.** A public `/` for signed-out visitors (signed-in users keep the role redirect) and a standalone `/demo`, hr-first with en. Hero: "Prestani naplaćivati ponude." with the one-line explainer from positioning-statement.md (AI proposal builder for kitchen makers; plain words in, quote-ready brief and a ±20% range out). Audience pills: stolarije, kuhinjski studiji, dizajneri. Two CTAs with a trust line each: "Zatraži pristup" (invite-only, "odgovaramo u 24 h") and "Dogovori 15 min s Tonijem" ("besplatno"). Below it the guided demo: the real intake components in a read-only demo mode fed by the mock fixtures and a saved snapshot (no AI calls, no persistence), auto-stepping with a 0/5 stepper and "preskoči": 1 Fotografije i mjere, 2 Stil, 3 Render u tvojoj kuhinji (AI koncept badge), 4 Gradnja uz živi raspon (a pick moves the number), 5 Sažetak za izrađivača (the brief page). Then a founder letter in Toni's words (ghosting both ways, the design-fee filter, the marketplace tax), four cards (Dvije strane, jedan sažetak · Raspon, nikad ponuda · Render u tvom prostoru · Status s obje strane), a blunt FAQ (Je li ovo ponuda? Što AI radi, a što ne? Tko vidi fotografije? Radi li s mojim cjenikom? Što ako kupac ne zna mjere? Mogu li ovo staviti na svoju stranicu?), the CTAs again. No pricing during invite-only, no testimonials until real ones, no urgency copy, AI disclosure line under the demo.
**Files.** src/app/page.tsx, src/app/demo/page.tsx, src/components/marketing/*, src/lib/auth/redirect.ts (public paths), src/lib/api/mock-fixtures/*, locales.
**Done when.** A signed-out visit to `/` shows the page and the demo plays through all five steps without a network call to an AI route; `/demo` works as a shareable link; Lighthouse accessibility ≥ 90; the copy test finds no glossary words to avoid (AI chatbot, AI-generated kitchen, streamline).
**Stack on.** IMP-32, so the demo shows the room-first flow. Can be built earlier on the current flow if a maker-facing link is needed sooner.

### 16. IMP-13 — Re-renders use the chosen decor, RAL and anchor photo
**Problem.** `buildPrompt` in render-concept never reads `materialHints`/`styleHints`, which is the only channel through which `RerenderPanel` sends the chosen Elgrad decor, RAL code or worktop; the builder's paid re-renders ignore the picks. The hypothesis and re-renders always anchor to `spacePhotos[0]`, not the photo the homeowner chose. Changing RAL or profile yields the change id `door front` with no locale key, so the panel prints the key.
**Fix.** Append sanitised material and style hints to the prompt (cap 6 × 120 chars); use `spacePhotos[chosenRender.anchorPhotoIndex]`; add the `door_front` keys. Export `buildPrompt` and test that a RAL hint appears.
**Files.** src/app/api/render-concept/route.ts, kitchen-intake/index.tsx, RerenderPanel.tsx, locales.
**Done when.** Prompt test passes; a re-render after picking a RAL shows the colour in mock output and on the live model.
**Stack on.** main.

### 17. IMP-14 — Maker brief: photos, SKUs, line provenance, capped-band note, shell
**Problem.** The maker never sees the homeowner's space photos (stored, never rendered). BOM lines print product names but not the SKUs the maker quotes from. Lines carry no price basis, date or confidence, so a dated Elgrad price and a hand-set band look the same. `capBand` silently shrinks a ±22–30% band to ±20% and sets `bandCapped`, which no surface reads, and the capped lines no longer sum to the headline. Spec rows show H/M/L pills that are hard-coded per row. `/maker/[id]` has no shell: no back link, no sign-out.
**Fix.** "Fotografije prostora" grid; `skus` on `BomLineItem`; `confidence`, `basis`, `asOf` set where each line is pushed, rendered as a pill + date; when `bandCapped` show "model: ±{raw}% — nedostaje: …" and store `band_pct_raw`; drop hard-coded pills; wrap the page in `AuthShell` with "Natrag na popis" and the project link.
**Files.** MakerDashboardPreview.tsx, MakerBriefView.tsx, src/lib/builder/bom.ts, src/lib/types.ts, src/app/api/handoff/route.ts, migration for `band_pct_raw`.
**Done when.** A brief with a reference-priced sink shows "ref. cijena · 2026-05"; the photos render; the capped note appears on the u-shape fixture.
**Stack on.** IMP-04.

### 18. IMP-15 — Brief export: print/PDF and JSON
**Problem.** The only download in the app is the homeowner's JSON. The maker cannot hand the brief to the workshop, a lacquer shop or a designer who does not log in (Definition of Done #4).
**Fix.** `@media print` stylesheet for the brief (hide actions and transcript, plan + render on page 1, line table) with an "Ispiši / spremi PDF" button; `/api/briefs/[id]/export` behind `requireBriefAccess` returning the bundle with signed image URLs.
**Files.** MakerBriefView.tsx, globals.css, src/app/api/briefs/[id]/export/route.ts.
**Done when.** Print preview fits A4 with sections intact; the export route answers 404 for another maker.
**Stack on.** IMP-14.

### 19. IMP-16 — Customer notifications that exist, plus a response-time line
**Problem.** The kitchen home promises "javit ćemo ti kad ga otvori" and "{maker} dobiva obavijest o izmjeni"; the only emails in the codebase are login, invite and maker-notify. Nothing is sent when the maker opens the brief or decides, and no response-time expectation is set.
**Fix.** `notify/customer-email.ts` with "opened" (sent once when `maker_viewed_at` is first set) and "decision" (from IMP-03's action, canned Croatian per status). `sla_hours` on the maker account (default 48) rendered as "obično odgovara u roku {n} h". Reword any promise the app cannot keep.
**Files.** src/lib/notify/customer-email.ts, src/app/maker/[id]/page.tsx, src/app/maker/[id]/actions.ts, KitchenHome.tsx, locales, tests.
**Done when.** Opening a brief sends exactly one email to the customer; the status page shows the SLA line; a test covers both templates.
**Stack on.** IMP-03.

### 20. IMP-17 — Resume on another device without broken images; honest save state
**Problem.** Checkpoints replace images with `omitted://image` and nothing on the client recognises the marker: a second device resumes with that string as the space photo, the render step POSTs it as the anchor (400), the hypothesis sends it, and "Pošalji izmjene" inserts a brief whose photos are marker strings and emails the maker. The local IndexedDB copy wins over a newer server snapshot because the first checkpoint carries a matching revision. `useProjectCheckpoint` exposes `state` (error / conflict / disabled) that no component reads: a 401, 404, 413 or real conflict silently stops saving while the rail says "{maker} vidi tvoj napredak". When the free-tier Supabase pauses, `findAccountById` swallows the error and the app says signed out.
**Fix.** Drop markers in `applySnapshot`, flag `imageMissing` on renders, skip autoStart/hypothesis without an image, show "Fotografije ostaju na uređaju gdje si ih snimio"; persist `revision` in IndexedDB and prefer local only if newer; in handoff restore `storage://` refs from the previous brief for marker strings; a small save line driven by `checkpoint.state` with a sign-in link on 401; distinguish DB error from "no row" and show a maintenance panel. Media at capture time stays a follow-on (L).
**Files.** kitchen-intake/index.tsx, useProjectCheckpoint.ts, src/lib/project/snapshot.ts, src/app/api/handoff/route.ts, src/lib/auth/accounts.ts, src/lib/auth/dal.ts.
**Done when.** A snapshot with markers never reaches an AI route (test); a stale local copy does not overwrite a newer revision (test); the save line shows "Nije spremljeno — prijavi se" on 401.
**Stack on.** main.

### 21. IMP-18 — Dashboard: no 404 rows, resend invite, archive, paging, multi-project customers
**Problem.** Rows for "pozvan" and "otvorio, stao" link to `/dashboard/project/[id]`, which calls `notFound()` when there is no snapshot, so the two states the maker is told to chase dead-end on a 404; `resendInvite` exists but is wired to nothing. `archived` is never set and hidden rows are still counted; the list caps at 100 with no paging or search. Inviting an address that already has a kitchen with another maker creates a second project by design (they sign in and land on the new one), but their older kitchen is then reachable only by direct link.
**Fix.** Render a project card (customer, status, invite dates, "Pošalji novi link") instead of 404; "Arhiviraj" action and "Prikaži arhivirane" toggle; "učitaj starije" cursor paging; `/` for a customer becomes a home page: the walkthrough instructions (what this is, what you need, what you get, who sees it) and the list of their kitchens with status, newest first, each opening /kitchen/[id]; invites are never refused.
**Files.** src/app/dashboard/project/[id]/page.tsx, LiveProjectView.tsx, DashboardList.tsx, src/app/dashboard/actions.ts, src/lib/auth/projects.ts, locales.
**Done when.** No row on the dashboard 404s; the resend form issues a new token and revokes the old; archived rows are excluded from counts.
**Stack on.** main.

### 22. IMP-19 — Re-submit versioning with a diff
**Problem.** Every re-submit inserts a new brief with `maker_status = 'new'`, repoints the project and sends "Novi sažetak kuhinje" again. Nothing links the two, the maker's stamps on the old one are orphaned, and neither the email nor the page says what moved.
**Fix.** `supersedes_brief_id` + `version` on briefs (set from `project.current_brief_id`); pure `diffBriefs(prev, next)` over estimate, dimensions, BOM lines by key, wishlist and appliances; render the diff on the brief page and put the three biggest changes in the email; keep the previous decision visible.
**Files.** db/migrations, src/app/api/handoff/route.ts, src/lib/handoff/diff.ts, MakerDashboardPreview.tsx, maker-email.ts, DashboardList.tsx.
**Done when.** A second submit shows "v2 · promjene: radna ploča, +1 ladičar, raspon +340 €"; `diffBriefs` has unit tests.
**Stack on.** IMP-03.

### 23. IMP-20 — Worktop and hardware pricing bugs
**Problem.** Maker-tester round 1 (2026-09-23) asked for the trade list Iveral, Laminat, Compact, Kvarc, Kerrock, Inox, Mramor with thickness per material (Iveral 38 or 20, Compact 10/12/13, stone and marble decors from their own suppliers); the builder still offers laminate/compact/quartz/sintered/solid wood/stainless with one 38/20/12 chip row for all. **Problem.** Compact, solid wood and stainless worktops price at the 38 €/m laminate fallback; thickness only changes the detail string; a curated decor with `worktop600: null` silently takes the fallback with no widening; islands are priced at 600 mm width though 920 mm prices exist. Handles count one per unit (a four-drawer bank needs four); picked hinges skip patterns with doors. A plan-placed oven or hood can be toggled off while its housing stays priced and relock re-adds it. The tap finish offers "Uskladi s vratima". Catalog data: two mis-parsed `worktop920` prices, a duplicate oven, a wine cooler typed as fridge.
**Fix.** Families renamed to the trade list with thickness options per family (and `normalizeBuilderState` mapping the old values); per-family €/m table with a thickness factor; treat a null catalog price as a missing source; 920 mm for island runs; `doorCount`/`handleCount` per pattern; lock oven and hood like the hob; `TapFinish` without matched_to_door; parser sanity checks and a catalog-integrity test; export `APPLIANCE_PRICE` so the grounding test imports it instead of copying.
**Files.** src/lib/builder/bom.ts, cabinet-patterns.ts, groups/AppliancesGroup.tsx, SinkTapsGroup.tsx, normalize.ts, scripts/parse-elgrad-cjenik.mjs, build-elgrad-catalog.mjs, tests.
**Done when.** 38 mm vs 20 mm quartz differ in price; a 10 m compact top is no longer 267–685 €; snapshots regenerated with the reason logged.
**Stack on.** IMP-04.

### 24. IMP-21 — Rate card per maker in the database
**Problem.** Labour rates, carcass €/m², MDF and alu fronts €/m², sink/tap/appliance class bands, allowances and confidence multipliers are constants in `bom.ts`. A second maker, a regional rate or a price refresh needs a deploy. Makers are created by CLI and have no settings at all.
**Fix.** Decision 2026-10-03: stored per maker from the start. Migration: `softclose_maker_settings` (maker_id, labour rates, carcass and fronts €/m², margin band, allowances, sla_hours, phone, studio name) with a default row seeded from today's constants. `computeBom(state, locale, { rates })` takes the owning maker's row; the live view, wrap-up and brief page load it through the project's maker. A settings page on the dashboard to edit it, in trade words, with the fixture estimate shown live so a maker sees what a rate change does.
**Files.** db/migrations, src/lib/builder/bom.ts, src/lib/catalog/rate-card.ts (types + defaults), src/lib/handoff/bundle.ts, src/app/dashboard/settings/*, src/app/api/*/route.ts where the estimate is computed.
**Done when.** Fixture totals are byte-identical with the default row; changing a rate on the settings page moves a customer's range without a deploy; another maker's rates never leak into a brief (test).
**Stack on.** IMP-04.

### 25. IMP-22 — Intake dead ends and silent fallbacks
**Problem.** The wishlist cannot be passed when translate-wishlist fails (the only way out is deleting the text). Render-vision failure on the confirm step is silent: the plan seeds from the photo and the homeowner confirms a layout that ignores the render they chose. Continue stays enabled while a paid render generates, and "Odaberi ovo" is cosmetic because the newest render wins anyway. Choosing a different render keeps the first render's layout and hypothesis. Continue on the photo step skips the only cm-scale read without saying so. The "no anchor photo" copy promises catalog references that nothing produces.
**Fix.** Store the verbatim wishlist as untranslated L and advance; amber one-liner with retry on the confirm step; include `isGenerating` in `isBusy` and make the footer "Koristi ovaj render"; reset hypothesis and reseed the plan on render change when there are no homeowner edits; "Pročitaj i nastavi" as the primary action with "Nastavi bez čitanja" secondary; fix the copy.
**Files.** kitchen-intake/index.tsx, ConceptRender.tsx, SpaceCapture.tsx, locales.
**Done when.** Each of the six paths has a test or a documented browser check in WORKLOG.
**Stack on.** IMP-32, since the render and confirm paths change under it.

### 26. IMP-23 — AI routes: slim bodies, timeouts, invalid tool calls, logging, audit log
**Problem.** `loadHypothesis` posts the whole profile including every data URL, and the server slices 2,000 chars of base64 into the prompt; the body recreates the 4.5 MB 413. No route sets `maxDuration`, a timeout or an abort signal, so a slow image call retries toward 300 s while the homeowner has left. Routes never check `toolCall.invalid`. Four of five text routes log nothing on "no structured result"; `providerFailure` drops the status and body where OpenAI explains refusals. Mocks run before validation. The hypothesis schema still asks for fields retired on 2026-09-23. Renders are forced to 1024×1024, which re-composes a portrait phone photo. There is no audit log of any inference (foundations: table stakes; also the only way to back-test ±20%).
**Fix.** Slim client payload + `stripDataUrls` server-side; `maxDuration = 300`, `maxRetries` 0–1, `timeout`, `abortSignal: req.signal`, client AbortController; `structuredResult()` helper that checks `invalid` and parses once; `noStructuredResult()` logger and richer `providerFailure`; move mocks after validation and schema-test all six fixtures; prune the schema; `size: 'auto'`; `softclose_ai_calls` table + `recordAiCall()` from the six routes (no images).
**Files.** src/app/api/*/route.ts, src/lib/api/errors.ts, src/lib/api/mock.ts, src/lib/db/ai-calls.ts, db/migrations, tests/mock-fixtures.test.ts.
**Done when.** Hypothesis request body is under 1 MB for the sample journey; every 500 branch logs; each AI call writes one row.
**Stack on.** main.

### 27. IMP-24 — Croatian copy pack
**Problem.** The rail labels act 3 "Vaša ponuda" while the app insists it is not a quote; those are also the only Vi-form strings. Seventeen strings call the maker "dizajner"; the glossary says izrađivač. Sixteen past-tense verbs are masculine-only ("Promijenio si"). Wrong terms: "Šolja ručke", "Paralelne klupe", "Filtrirana voda (3-pute)", "Sintetizirani kamen", "Fragranite" as a material; "{n} kupaca" for 1–4; "+{n} više". The tab title is "Kitchen Studio — Project intake" on every page.
**Fix.** One locale PR: "Tvoj sažetak i raspon", izrađivač everywhere, gender-neutral phrasing, corrected trade terms, a plural helper, root metadata `softclose` with per-page titles. Add a test that no hr value contains "ponuda" or "dizajner" outside the explicit disclaimer keys. Have one Croatian maker read the diff.
**Files.** src/lib/i18n/locales/hr-HR.ts, en-US.ts, src/app/layout.tsx, page metadata, tests/i18n-homeowner-strings.test.ts.
**Done when.** The string test passes; every page has a Croatian title.
**Stack on.** main.

### 28. IMP-25 — Everything the maker reads is in their language
**Problem.** `/api/translate-wishlist` takes no locale and is prompted in English, so the Croatian maker gets English trade phrases next to the Croatian verbatim. Vision `styleHints`/`materialHints` and hypothesis `colorDescription` arrive in English and print raw; `FactsRecap` looks up `doors.style.*`, a key family that no longer exists, and shows keys. The server renders pages in the account's stored locale while the switcher only writes localStorage, so a homeowner who switches sees two languages on one page. `estimate.basis` is an English sentence persisted into every brief; four wrap-up rows print raw enums.
**Fix.** Pass `locale` to translate-wishlist and extend the hr instruction block; localise the hint fields; map `style` through `frontFromStyle`; persist the switcher choice to `softclose_accounts.locale` and set `<html lang>`; store `basisKey` instead of a sentence; route the enum rows through `optionLabel`.
**Files.** src/app/api/translate-wishlist/route.ts, space-vision/route.ts, builder-hypothesis/route.ts, FactsRecap.tsx, LanguageSwitcher.tsx, src/lib/i18n/index.tsx, bundle.ts, WrapUpScreen.tsx.
**Done when.** A Croatian brief has no English trade line; the hardcoded-string test extends to the maker surface.
**Stack on.** main.

### 29. IMP-26 — Two site-visit facts and the decision-maker chip
**Problem.** Not a re-proposal of the cut scope step. Three first-visit facts cost one chip row each and are what makers get surprised by on day one: who removes the old kitchen, whether the sink and hob stay where they are (the render puts them where the design wants, the photo read saw where they are, nothing compares), and whether the decision is sole or joint (the intake catalog's spec-ready floor, item 1.1).
**Fix.** Two chip rows on logistics with "Ne znam" first-class (`scope.demolitionDisposal`, `trades.plumbing.sinkPosition`), three chips on contact (`decisionMaker`); one row each on the brief and in the email; feed the demolition answer into IMP-04's exclusions line.
**Files.** kitchen-intake/index.tsx, src/lib/types.ts, MakerDashboardPreview.tsx, maker-email.ts, locales.
**Done when.** The three fields reach the brief with L confidence when skipped and H when answered.
**Stack on.** main.

### 30. IMP-02 — CI gate on every PR and on main
**Problem.** There is no `.github/` and no vercel config; a merge to main deploys production untested. Thirty stacked PRs are about to be merged.
**Fix.** `.github/workflows/gate.yml` on pull_request and push to main: `npm ci`, `vitest run`, `tsc --noEmit`, `eslint .` (about 3 s; skip `next build`, Vercel builds anyway). Make it a required check on main. Add `typecheck` and `gate:fast` scripts; rename the package to `softclose`.
**Files.** .github/workflows/gate.yml, package.json.
**Done when.** A PR with a failing test shows a red check; `npm run gate:fast` exists.
**Stack on.** main.

### 31. IMP-27 — Production config and script safety
**Problem.** `delete-brief.mjs` reads `.env.local` (production) directly, ignores `--local`, asks nothing and deletes the customer's whole project; two scrapers also skip the target print. A fresh clone that copies `.env.example` to `.env.local` and runs `npm run dev` talks to production. Migrations are applied by hand with no tracking. `next.config.ts` sets no security headers and leaves `X-Powered-By` on. Logout only deletes the cookie (the session epoch is untouched); magic-link origins fall back to the Host header on previews; auth tokens and rate-limit buckets are never pruned.
**Fix.** Route every script through `loadEnv()` + `targetLabel()` + `confirm()`; rename production env to `.env.production.local` and make `.env.local` the local stack; move migrations to `supabase/migrations/` and baseline production; `headers()` with frame-ancestors, referrer-policy, nosniff, permissions-policy and `poweredByHeader: false`; bump `session_epoch` on logout; `appOrigin()` that refuses to issue without a known origin in production; a prune cron or SQL job; `scripts/check-env.mjs` in `prebuild`.
**Files.** scripts/*.mjs, scripts/_env.mjs, .env.example, README.md, supabase/migrations/, next.config.ts, src/app/logout/route.ts, src/lib/auth/origin.ts, src/lib/rate-limit.ts.
**Done when.** `node scripts/delete-brief.mjs` without `--yes` prints the target and asks; `supabase migration list --linked` shows 0001–0006; curl shows the headers.
**Stack on.** IMP-02.

### 32. IMP-28 — Tests for routes, actions and the checkpoint hook
**Problem.** The 36 test files import only lib modules. The seven route handlers, the three server-action files and the auth DAL are never executed by a test, and vitest cannot run React at all (node environment, `.ts` only). The 1,613-line intake and the checkpoint hook that owns resume and conflicts have no safety net beyond manual browser runs.
**Fix.** `tests/routes/*.test.ts` calling handlers with a `Request` and an in-memory fake of the Supabase client; happy-dom + Testing Library as a second vitest project for `.test.tsx`; first tests: checkpoint 409 fingerprint, handoff ownership, decideBrief transitions, useProjectCheckpoint halting rules.
**Files.** vitest.config.ts, tests/routes/, tests/hooks/, package.json.
**Done when.** Each route has at least one ownership test; CI runs both projects.
**Stack on.** IMP-02.

### 33. IMP-30 — Repo hygiene
**Problem.** README is create-next-app boilerplate around one real section; LOOP.md tells a newcomer to work in a worktree that no longer exists; PLAN.md is a merged June plan. `handoff/` (1.6 MB prototype), a duplicate Elgrad PDF and five template SVGs are committed. `material-options.ts`, three shadcn ui files and `use-image` are dead; `shadcn` sits in runtime deps. Fifteen merged branches and 3.2 GB of worktrees linger; the only unmerged commit (562a54c) was superseded by 946f5a4.
**Fix.** Rewrite README (what it is, local stack, mock mode, gate, env layout, scripts table); move LOOP.md, PLAN.md, handoff/ and app-analysis.md to `context/archive/`; delete dead files and deps; prune branches and worktrees; add the four missing docs to the AGENTS.md table; append the missing WORKLOG entries for PRs #8–#10.
**Files.** README.md, LOOP.md, PLAN.md, handoff/, public/*.svg, data/, package.json, src/lib/material-options.ts, src/components/ui/{card,progress,badge}.tsx, AGENTS.md, WORKLOG.md.
**Done when.** `npm run gate` green after deletions; a fresh clone can follow the README to a working local stack.
**Stack on.** main.

---

## Not doing (and why)

- **Embeddable widget on the maker's site.** The 2026-09-22 invite-only pivot was deliberate; the maker-settings part of DoD #1 is covered by IMP-21.
- **Up-front budget band.** Dropped on purpose ("the live range is the budget conversation"); the dead budget row and stub branch go with IMP-01. See the open decision.
- **Scope step and "where will you live during works".** Cut after maker testing on 2026-09-23; IMP-04's exclusions line and IMP-26's two facts replace them.
- **Conversational chat engine.** The fixed step flow is a long-standing design; the AI promise is honoured by vision, render, wishlist translation and summary.
- **Houzz Pro / Builder Prime / 2020 integrations.** Roadmap items; nothing to integrate until IMP-15's export exists.
- **Media at capture time (photos uploaded as taken).** Right fix for cross-device resume, L effort; IMP-17 ships the short-term guard first.
- **Splitting the three god files.** Mechanical, low value until the items above settle; IMP-29 touches the editor anyway.

## Decisions (Toni, 2026-10-03)

1. **Price basis (IMP-04): decided.** The homeowner sees what they will pay: VAT included, workshop margin included, no VAT or margin line anywhere on their side. All Elgrad prices, webshop and veleprodajni cjenik alike, include PDV; nothing is grossed up. The maker sees net cost and margin on the brief page.
2. **Rate card (IMP-21): decided, per maker in the database from the start**, with a default row seeded from today's constants and a settings page. Band floor (LOOP Q6): ±10% until a maker's own rates are in.
3. **Budget question: decided, keep it dropped.** Delete the dead budget row, the stub branch and the keys in IMP-01.
4. **Invites and the customer home (IMP-18): decided.** Never refuse an invite. `/` for a customer is a home page with the instructions and the list of their kitchens, one or many.
5. **inspiration-vision (IMP-23): decided, drop the call.** Keep the tagged styles and the reference images for the render.
6. **Confidence pills: decided, none for the homeowner.** Provenance words only ("procjena", "izmjereno", "prepušteno izrađivaču").
