# Audit findings — 2026-10-02 (raw, per reader)

Source material for IMPROVEMENTS.md. Nine code-reading passes over main @ 8dd7a69; each finding carries the file:line it was read from. Severities are the readers' own calls before triage; IMPROVEMENTS.md is the triaged, prioritised version and wins on any disagreement. Items marked "Verified NOT present" in a reader's NOTES are closed.


######## read:auth-data-infra (16) ########
[1] CRITICAL/honesty-trust/S — Production has no email provider: magic-link sign-in is dead and the UI still says the link is on its way
   @ src/app/login/actions.ts:87
   RESEND_API_KEY is not set on Vercel (memory: infra state 2026-10-02). In production with no provider, sendEmail() returns outcome 'skipped', but requestLoginLink() returns status 'sent' regardless, so the login page shows 'link za prijavu je na putu'. Nobody can sign in by email; the only way in is a laptop running `npm run maker -- add`.
   FIX: Ops: verify a sending domain in Resend and set RESEND_API_KEY + RESEND_FROM on Vercel. Code: in requestLoginLink, when result.outcome is 'skipped' or 'failed' in production, return { status: 'error', message: 'notConfigured' } (key already exists: 'auth.login.
[2] HIGH/security/M — 5-render cap and AI spend control are per-Vercel-instance memory and reset every 30 minutes
   @ src/app/api/render-concept/route.ts:249
   Every AI route, including the one that spends real image-gen money, limits by an in-memory Map keyed by accountId with a 30-minute window. On Vercel each instance has its own Map, and the window resets, so the product rule 'renders capped at 5/session' is not enforced: a homeowner (or a maker clicking through a customer's kitchen) can get 5 renders per 30 min per instance indefinitely. The route also takes no project
   FIX: Migration 0006: add `renders_used integer not null default 0` to softclose_projects. Make /api/render-concept take `projectId`, verify `customer_id = session.accountId`, and claim a slot atomically: `update ... set renders_used = renders_used + 1 where id = $1
[3] HIGH/robustness/M — Supabase free tier pauses after inactivity; the app then reports 'signed out' and permanently halts checkpoints
   @ src/lib/auth/accounts.ts:54
   The production DB (free tier) pauses after ~7 idle days — it already happened by 2026-10-02. When it is paused, findAccountById ignores the query error and returns null, so every request looks signed-out and redirects to /login (which then says 'link is on its way', see finding 1). The checkpoint hook also treats the resulting 503 'write_failed' exactly like 'no_db' and halts server saves for the rest of the session 
   FIX: (a) Keepalive: add vercel.json `crons` hitting a new /api/health route that runs `select 1` (and returns 503 with a clear reason when the DB is unreachable) — or move Supabase to Pro. (b) In findAccountById/getSession, distinguish `error` from 'no row': throw/
[4] HIGH/bug/S — Checkpoint save state is never shown: any 4xx, a conflict, or an oversized snapshot silently stops saving for the whole session
   @ src/components/kitchen-intake/index.tsx:173
   useProjectCheckpoint returns `state` ('error' | 'conflict' | 'disabled' | ...) precisely so 'the save indicator can show quietly', but the intake only calls queue()/flush() and never reads state. A 401 (epoch bumped / cookie expired), 404, 413, or a genuine two-device conflict sets halted=true and the homeowner keeps working with no server copy and no hint.
   FIX: Render a small save indicator in the intake shell driven by checkpoint.state: saved / saving / 'not saved — sign in again' (link to /login?next=) for 401 / 'another device is editing' for conflict. Keep it calm (no modal). Also map 401 to the existing 'api.err
[5] HIGH/product-gap/S — Inviting an address that is already another maker's customer silently creates a second project and hijacks the customer's home
   @ src/app/dashboard/actions.ts:52
   ensureCustomerAccount returns the existing account for any email regardless of who invited it; inviteCustomer then always creates a new project under the inviting maker; `/` sends a customer to their newest non-archived project. So maker A inviting maker B's existing customer makes `/` land on A's empty kitchen, B's kitchen is reachable only by direct link, and the customer gets an invite from a studio they never con
   FIX: Product call for Toni, then one PR: either (a) refuse the invite when the address already has a non-archived project with a different maker (new message key 'alreadyInvited', same 'unavailable' shape to avoid leaking which maker), or (b) make `/` a list of the
[6] HIGH/robustness/S — Ops scripts target PRODUCTION by default; delete-brief.mjs has no confirmation, ignores --local, and deletes the customer's whole project
   @ scripts/delete-brief.mjs:19
   _env.mjs loads `.env.local` (production) unless `--local` is passed. delete-brief.mjs does not even use _env.mjs — it reads `.env.local` directly, so `--local` is silently ignored — asks nothing, and after deleting the brief deletes the project row too (the customer's snapshot, status, and the row their invite points at). The same `.env.local` on every laptop also means a fresh clone without `.env.development.local` 
   FIX: Route delete-brief.mjs through loadEnv()+targetLabel() and the same confirm() as maker.mjs; delete only the brief and its objects, and null `current_brief_id` on the project (add `--with-project` for the full delete). Flip the default in _env.mjs to local and 
[7] HIGH/hygiene/S — No CI: nothing runs the gate on PRs, and every merge to main is an untested production deploy
   @ package.json:12
   The repo has no .github workflows, no vercel.json, and Vercel is GitHub-linked to deploy main to production on push. `npm run gate` (vitest + tsc + eslint + build) exists but only runs when someone remembers. The owner plans stacked PRs, each of which will deploy on merge.
   FIX: Add .github/workflows/gate.yml: on pull_request and push to main, `npm ci && npx vitest run && npx tsc --noEmit && npx eslint .` (skip `next build` to avoid needing secrets, Vercel builds anyway). Make it a required check on main in GitHub branch protection.
[8] MEDIUM/robustness/S — /api/handoff returns raw internal error text to the homeowner and lets any account create ownerless briefs
   @ src/app/api/handoff/route.ts:196
   The outer catch sends `err.message` (Supabase/PostgREST/validation text) to the client as the wrap-up error, contradicting the lib/api/errors.ts policy applied to every other route. Separately, the 'legacy' path still runs for any signed-in account that posts without projectId — a maker or a customer can insert a project+brief with maker_id null that nobody can ever open, and it emails MAKER_NOTIFY_EMAIL.
   FIX: Return a generic 'wrapup' message and log the detail server-side (reuse providerFailure). Require projectId for customers and answer 404 for makers; delete the legacy insert branch (its tests can pass projectId with a fixture project).
[9] MEDIUM/product-gap/M — No audit log of AI inferences or cost-model runs — foundations lists it as table stakes
   @ src/app/api/space-vision/route.ts:284
   The only database inserts are briefs, projects, accounts and auth tokens. Vision, inspiration, hypothesis, wishlist translation, summary and render results go straight back to the browser; they survive only if the client keeps them in the snapshot/bundle. There is no record of model, prompt, inputs, output, latency or cost per call, so the ±20% claim cannot be back-tested and a maker's 'why did it say U-shape' has no
   FIX: Migration 0006: `softclose_ai_runs(id, created_at, route, model, account_id, project_id, input_digest, input_summary jsonb, output jsonb, latency_ms, ok, error)`. A fire-and-forget `recordAiRun()` in src/lib/db/ai-runs.ts called from the six AI routes (never a
[10] MEDIUM/compliance/M — No GDPR erasure or export path; customer PII is embedded in JSON blobs with restrict FKs
   @ db/migrations/0004_accounts_projects.sql:72
   Accounts cannot be deleted (projects.customer_id / maker_id are `on delete restrict`), maker.mjs only disables, and there is no script or action to erase a homeowner. Contact details live in briefs.contact_value, bundle.brief.{email,phone,name} and projects.snapshot.profile, so erasure would require JSON surgery. No data export exists either.
   FIX: scripts/erase-customer.mjs (through _env.mjs + confirm): remove storage objects under briefs/<id>/, delete briefs, projects, tokens, then the account; or anonymise (null contact columns, scrub bundle.brief contact keys) when the maker needs the brief for an ac
[11] MEDIUM/hygiene/M — Migrations are applied by hand with no tracking; Supabase config does not know they exist; no env sanity check
   @ supabase/config.toml:58
   db/migrations/*.sql are run via a psql loop locally and `supabase db query --linked -f` in production, so nothing records which files were applied; 0004 had to be written 'guarded' to be re-runnable. supabase/config.toml has `schema_paths = []` and the standard supabase/migrations/ directory is unused. Required env (AUTH_SECRET, SUPABASE_*, APP_URL, RESEND_*) is only documented in .env.example; nothing fails a produc
   FIX: Move files to supabase/migrations/<timestamp>_name.sql (keep db/migrations as a symlink or delete) so `supabase db push --linked` tracks them in supabase_migrations.schema_migrations; update README. Add scripts/check-env.mjs run from `prebuild` that fails when
[12] MEDIUM/product-gap/L — Checkpoints strip every image, so cross-device resume and the maker's live view have no photos or renders
   @ src/lib/project/checkpoint.ts:31
   By design the server snapshot replaces every data URL with 'omitted://image'; images reach the server only at submit. A homeowner who switches from phone to laptop resumes without their space photo (the render anchor) or renders, and the maker's /dashboard/project/[id] view mid-flow has no concept image. WORKLOG 09-22 lists 'Media at capture time' as still open — it is not decided against, and it blocks the promise t
   FIX: Add /api/projects/[id]/media (POST, customer-only, same ownership check as checkpoint) that offloads one image via the existing offloadMedia/storageUploader into projects/<id>/ and returns the storage:// ref; the client swaps the data URL for the ref at captur
[13] LOW/security/S — Logout only deletes the cookie; a copied session cookie stays valid for up to 14 days and sliding refresh never ends
   @ src/app/logout/route.ts:13
   POST /logout clears the browser cookie but does not change the account's session_epoch, so a cookie exfiltrated earlier (shared computer, browser sync) keeps working until its exp. The proxy re-signs any valid cookie after 7 days without touching the DB, so an active browser is never required to re-authenticate.
   FIX: On logout, bump softclose_accounts.session_epoch for the session's account (signs out all devices — acceptable for this product; say so in the button copy). Optionally carry an `orig_iat` claim and refuse refresh after 90 days.
[14] LOW/security/S — Magic-link origin falls back to the Host header when APP_URL is unset (preview deployments)
   @ src/app/login/actions.ts:84
   Login and invite links are built from `https://${host}` when APP_URL is missing. Production has APP_URL set, but every Vercel preview deployment does not, so a crafted request on a preview could email a victim a link pointing at an attacker-controlled host that then harvests the token. Also, the dev fallback 'https://localhost:3000' is wrong for local http.
   FIX: Centralise `appOrigin()` in src/lib/auth/origin.ts: APP_URL, else `https://${process.env.VERCEL_URL}` on Vercel, else `http://localhost:3000` in development; in production with none of these, refuse to issue and log. Use it in the three call sites and in hando
[15] LOW/security/S — next.config.ts is empty: no security headers and X-Powered-By is on
   @ next.config.ts:3
   No Content-Security-Policy/frame-ancestors, Referrer-Policy, X-Content-Type-Options or Permissions-Policy are set, and `poweredByHeader` defaults to true. The /auth/verify page carries the raw token in the query string; an explicit Referrer-Policy keeps it from leaking to any third-party resource added later.
   FIX: Add `poweredByHeader: false` and an `async headers()` returning X-Frame-Options: DENY (or CSP frame-ancestors 'none'), Referrer-Policy: strict-origin-when-cross-origin, X-Content-Type-Options: nosniff, Permissions-Policy: camera=(self), geolocation=(). Keep CS
[16] LOW/hygiene/S — Nothing prunes auth tokens or the in-memory rate-limit map
   @ src/lib/rate-limit.ts:17
   softclose_auth_tokens rows are kept forever (consumed, revoked and expired alike), and lib/rate-limit.ts never evicts expired buckets (app-analysis L2 is still present). Both grow without bound; the token table is also the DB-backed send limiter, so its index keeps growing with every login attempt.
   FIX: Sweep expired buckets in rateLimitKey when the map exceeds N entries. Add a cron (same vercel.json as the keepalive) or a SQL job: `delete from softclose_auth_tokens where expires_at < now() - interval '30 days'`.
   NOTES: Verified NOT issues (no finding): every API route checks apiAccount() before anything else (tests/auth-guard-coverage enforces it); IDOR checks are correct — /maker/[id] requireBriefAccess (maker_id match), /dashboard/project/[id] requireProjectAccess + maker role, /kitchen/[projectId] customer-or-maker, /api/projects/[id]/checkpoint customer_id match, /api/handoff customer_id match when projectId is given; not-yours answers 404 everywhere. Brief id is a v4 UUID but is no longer a credential (ownership is checked), so guessability is moot. Tokens: 32 random bytes, sha256 stored, single-use via conditional UPDATE, 2-min grace, consumed on POST not GET, invite 14 d / login 15 min, revoke-on-reissue, DB-backed send limits (5 logins/h, 20 invites/day) — solid. Cookie: httpOnly, secure in prod, SameSite=Lax, HS256 with algorithms pinned, AUTH_SECRET_PREVIOUS rotation, fail-closed when unset. 

######## read:tests-tooling-hygiene (17) ########
[1] HIGH/robustness/S — No CI: nothing runs the gate between a PR and the Vercel production deploy
   @ package.json:12
   The repo has no .github/ directory and no vercel.json; the only quality gate is the local `npm run gate` script. PRs #2–#10 were merged on GitHub with no automated check, and a merge to main deploys straight to Vercel production (WORKLOG 2026-09-19: "main merged + pushed → Vercel production").
   FIX: Add .github/workflows/gate.yml: on pull_request + push to main run `npm ci`, `npx vitest run`, `npx tsc --noEmit`, `npx eslint .` (vitest+tsc take ~2 s). Mark it a required status check on main. Optionally add `next build` with MOCK_AI=1 and dummy env so RSC b
[2] HIGH/robustness/S — scripts/delete-brief.mjs hard-deletes from PRODUCTION by default, no --local, no target print, no confirm
   @ scripts/delete-brief.mjs:8
   delete-brief.mjs reads `.env.local` (which, by this repo's convention, is the production project) directly instead of going through scripts/_env.mjs, then removes Storage objects, the brief row and its project row. README claims every script prints its target before writing; this one, scrape-elgrad-webshop.mjs and build-elgrad-catalog.mjs do not.
   FIX: Make all three scripts use `loadEnv()` + `targetLabel()` from scripts/_env.mjs; have delete-brief print the target and refuse to run against production without `--yes` (same pattern maker.mjs already uses); fix the README sentence or make it true.
[3] MEDIUM/robustness/S — Env layout trap: a fresh clone that follows .env.example and runs `npm run dev` talks to production
   @ .env.example:5
   The repo inverts the Next convention: `.env.local` holds PRODUCTION credentials and `.env.development.local` holds the local stack. A new contributor who copies .env.example → .env.local (the normal move) and runs `npm run dev` without a `.env.development.local` has the app read/write the production Supabase project, because Next falls back to .env.local in development.
   FIX: Rename the production file to `.env.production.local` (gitignored by `.env*` already) and make scripts/_env.mjs load that when not `--local`; let `.env.local` be the local stack as Next expects; update .env.example header and README accordingly. One PR, no cod
[4] MEDIUM/robustness/S — Database migrations are applied by hand with no tracking of what production has
   @ db/migrations/0001_softclose_core.sql:9
   db/migrations/0001–0005 are plain SQL files; README applies them with a `for f in …; docker exec psql` loop locally and the file headers say `supabase db query --linked -f` for production. There is no supabase/migrations/ directory, no schema_migrations use, and no record in the repo of which migrations production has received.
   FIX: Move the five files to supabase/migrations/ with the CLI's timestamp naming, run `supabase migration list --linked` to baseline production, and replace the README loop with `supabase db reset` (local) / `supabase db push` (prod). Add a vitest that asserts TABL
[5] MEDIUM/robustness/M — Route handlers, server actions and the auth DAL have zero behavioural tests
   @ tests/auth-guard-coverage.test.ts:42
   The 36 test files import only lib modules. The seven API routes (handoff 200 lines, checkpoint 120 lines with the revision/409 logic, builder-hypothesis 451 lines), the three server-action files (dashboard/actions.ts 154 lines: invite + resend), and the whole auth layer except session/tokens (dal.ts 210, projects.ts 157, accounts.ts 108, magic-link.ts 156) are never executed by a test. The only 'route tests' grep the
   FIX: One PR adding tests/routes/*.test.ts that import the handlers and call them with a `Request`, using `vi.mock('@/lib/db/supabase')` for an in-memory table fake and `vi.mock('@/lib/auth/dal')` for the session. Start with checkpoint (revision match / 409 / self-w
[6] MEDIUM/robustness/M — React components cannot be tested at all: vitest only includes .ts files under node environment
   @ vitest.config.ts:19
   vitest.config.ts restricts tests to `tests/**/*.test.ts` in the `node` environment, and there is no jsdom/@testing-library dependency. The 1613-line KitchenIntake (31 useState, 6 useEffect) and the 233-line useProjectCheckpoint hook that owns resume/conflict behaviour have no safety net beyond manual browser runs.
   FIX: Add happy-dom + @testing-library/react as devDependencies, add a vitest `projects` entry with `environment: 'happy-dom'` and `include: ['tests/**/*.test.tsx']`, and land two tests: useProjectCheckpoint (409 with matching fingerprint → no conflict banner; perma
[7] MEDIUM/robustness/M — In-memory rate limiter still guards paid AI routes on Vercel (app-analysis H5, verified still present)
   @ src/lib/rate-limit.ts:17
   src/lib/rate-limit.ts keeps counters in a module-level Map. On Vercel each function instance has its own Map and it is reset on every cold start, so the per-account caps on the render endpoint (≈75–90 s of gpt-image per call) and the vision routes are advisory at best. The file's own header says 'Demo-grade only — replace with Redis/Upstash before any real traffic'.
   FIX: Reuse the pattern already proven for sign-in/invite: a `softclose_rate_events(account_id, bucket, at)` table (or a counter column on softclose_projects for renders) checked in rateLimitKey when dbEnabled(); fall back to the Map only when no DB. Alternatively U
[8] MEDIUM/security/S — next.config.ts is empty: no security headers for an authenticated app serving private photos
   @ next.config.ts:4
   The app has magic-link auth, a maker dashboard and signed Supabase URLs to homeowners' photos, yet sets no X-Frame-Options/frame-ancestors, Referrer-Policy, X-Content-Type-Options or Permissions-Policy. Nothing else (proxy.ts, layout.tsx) sets headers either.
   FIX: Add `headers()` to next.config.ts with `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`, `Permissions-Policy: camera=(), geolocation=()` on `/(.*)`; add a CSP in report-only first (img-src needs dat
[9] MEDIUM/robustness/S — 'No structured result returned' 500s in vision/hypothesis routes log nothing — undebuggable in production
   @ src/app/api/space-vision/route.ts:284
   WORKLOG 2026-09-19 noted '5/6 API routes log nothing on failure' as not yet fixed. The outer catch now goes through providerFailure() which logs, but the no-tool-call branch in space-vision and builder-hypothesis still returns a silent 500 with raw English, and the inner `catch {}` blocks swallow parse errors without a line in the logs.
   FIX: Add a `logRouteFailure(route, stage, detail)` helper in src/lib/api/errors.ts and call it in every 500 branch and every bare catch (log, then continue). Include a short request id in both the log line and the JSON so a homeowner screenshot can be matched to a 
[10] MEDIUM/hygiene/S — README is create-next-app boilerplate around one real section; LOOP.md/PLAN.md give a newcomer wrong orders
   @ README.md:1
   README.md opens with the Next template text and still tells the reader to edit app/page.tsx and read the Vercel template links; the useful 'Local database' and 'Dev without AI spend' sections are sandwiched inside it. LOOP.md tells the reader to work only in a worktree that no longer exists and never touch main; PLAN.md is a June merge plan for a branch merged long ago. Neither says it is historical.
   FIX: Rewrite README.md as: what softclose is (2 lines), prerequisites, `supabase start` + migrations + `npm run maker -- add --local`, `npm run dev:mock`, `npm run gate`, env file layout, scripts table with their default target. Move LOOP.md and PLAN.md to context/
[11] LOW/hygiene/S — WORKLOG.md is the de-facto spec but is behind main; AGENTS.md documents 7 of 11 context docs; app-analysis.md is a stale audit
   @ WORKLOG.md:1052
   The decisions log stops at the 2026-09-26 'Fronts' entry; the three PRs merged after it on the same day (maker brief line-by-line, Croatian provenance, idempotent send) are not logged, so the 'decisions worth remembering' trail is incomplete exactly where the maker surface changed. AGENTS.md's context table omits contract-analysis.md, design-brief.md, layout-contract.md and app-analysis.md, and app-analysis.md (June)
   FIX: Append a short 2026-09-26 entry for PRs #8–#10; add the four missing docs to the AGENTS.md table (mark app-analysis.md and contract-analysis.md as historical audits) or move them to context/archive/; consider a 'Current state' section at the top of WORKLOG.md 
[12] LOW/dead-code/S — Dead code and unused dependencies: material-options.ts, three shadcn ui files, use-image, shadcn CLI in runtime deps
   @ src/lib/material-options.ts:8
   src/lib/material-options.ts (English option sets superseded by the material-first fronts) and src/components/ui/{card,progress,badge}.tsx are imported by nothing. `use-image` has zero imports and `shadcn` (a CLI) sits in production `dependencies`. The 18 `@next/next/no-img-element` eslint-disable comments show a rule that should be turned off in config for this data-URL-heavy app rather than silenced per line.
   FIX: Delete the four files, `npm uninstall use-image shadcn` (re-add shadcn as a devDependency only if the CLI is still used), and set `'@next/next/no-img-element': 'off'` in eslint.config.mjs while removing the 18 disables.
[13] LOW/hygiene/S — Stale committed assets: 1.6 MB handoff/ prototype, duplicate 1.2 MB Elgrad PDF, Next template SVGs
   @ eslint.config.mjs:16
   handoff/ holds a June design package (design-reference.html 1.6 MB plus four .jsx prototype files) that is eslint-ignored and referenced only from code comments. data/elgrad-cjenik-2026-03-30.pdf is referenced only by a metadata string in elgrad-services.json while the parser defaults to the 09-09 edition. public/ still ships next.svg, vercel.svg, globe.svg, file.svg, window.svg from the template.
   FIX: Move handoff/ to context/archive/handoff/ (or a git tag) and update the four comments to say 'historical blueprint'; drop the 03-30 PDF (git history keeps it) and point elgrad-services.json at the current edition; delete the five template SVGs.
[14] LOW/hygiene/S — Git hygiene: 15 merged local branches, 3.2 GB of worktrees at merged commits, one superseded unmerged commit
   @ src/components/kitchen-intake/floor-plan-editor/Editor.tsx:228
   All 15 non-main local branches are already in main. The three worktrees under .claude/worktrees (990 MB, 1.0 GB, 1.2 GB, each with its own node_modules) sit at commits that are ancestors of main. The only unmerged commit, 562a54c on claude/gifted-fermi-2c047d (floor-plan i18n via per-locale cluster maps), was superseded by 946f5a4 in main, which localised the same editor through `t('floorPlan.*')` keys and `fillSlots
   FIX: `git worktree remove` the three worktrees, `git branch -d` the 15 merged branches and `-D claude/gifted-fermi-2c047d` after noting in WORKLOG that 562a54c was superseded by 946f5a4; prune the matching remotes. Add a one-line note in README about the .claude/wo
[15] LOW/hygiene/S — package.json still says "home-designer" and has no typecheck or fast-gate script
   @ package.json:2
   The package name is the template's, there is no `typecheck` script (tsc is only reachable through `gate`), and `gate` always ends with `next build`, which is the only slow and env-dependent step (vitest 0.7 s, tsc 1.1 s measured). The lint script is `eslint` while gate uses `eslint .`.
   FIX: Rename to `softclose`; add `"typecheck": "tsc --noEmit"`, `"gate:fast": "vitest run && tsc --noEmit && eslint ."`, keep `gate` = `gate:fast && next build`; make `lint` = `eslint .`.
[16] LOW/hygiene/L — Three god files carry the product's hardest logic with no internal seams
   @ src/components/kitchen-intake/index.tsx:100
   Editor.tsx (2663 lines) defines 33 components in one file; KitchenIntake index.tsx (1613 lines) holds 31 useState hooks and the step machine; bom.ts (1083 lines) has computeBom spanning ~700 lines. None of the three is split along the boundaries the tests already use (panels / step reducers / per-line pricers).
   FIX: Mechanical splits only, one PR each: (1) move Editor.tsx panels (wall / opening / feature / island / toolbar) into floor-plan-editor/panels/*.tsx; (2) extract KitchenIntake's profile state into a useReducer in kitchen-intake/state.ts with pure action functions
[17] LOW/hygiene/M — src/lib/types.ts mixes domain, UI and handoff types in one 500-line file with a 180-line LeadProfile
   @ src/lib/types.ts:162
   types.ts exports 27 symbols: vision results, render inputs, the LeadProfile (lines 162–340), question/Step UI types, WrapUpData, StubEstimate and HandoffBundle. Builder, floor-plan and contract types already live beside their code; this file is the leftover.
   FIX: Split into src/lib/types/{profile,vision,render,handoff,ui}.ts with a barrel `src/lib/types/index.ts` so existing `@/lib/types` imports keep working; do it in one PR with no field changes.
   NOTES: Scope was tests/tooling/hygiene/DX only; other agents own product/UX. Verified non-issues: vitest suite is fast and not flaky (0.7 s, 36 files, 359 tests, one 4 KB snapshot); tsc 1.1 s; next build is the only slow gate step. All runtime deps except use-image/shadcn are actually imported (konva/react-konva in Editor.tsx, jose in session.ts, framer-motion ×13, cva in button/badge, tw-animate-css in globals.css, server-only ×6). .claude/worktrees is excluded via .git/info/exclude (not .gitignore) so `git status` stays clean but a fresh clone of the repo would not carry that exclusion. package-lock is 389 KB (fine). No console.log leftovers except the dev-only /builder harness; no TODO/FIXME; 0 ts-ignore. Minor items not reported (below cap or cosmetic): layout.tsx <title> 'Kitchen Studio — Project intake' is English under lang=hr (copy, other slice); migration headers document `supabase db 

######## read:product-gap (18) ########
[1] CRITICAL/product-gap/M — Maker's quote-ready / clarify / decline buttons are a no-op demo; the status pipeline never moves past 'viewed'
   @ src/components/kitchen-intake/MakerDashboardPreview.tsx:354
   The three actions Pattern D calls the thing that ends ghosting only flip local React state and print 'Demo radnja: {action} (bez učinka)'. The DB already has maker_status in ('new','viewed','quoted','clarify','declined') (0001 migration) but the only write anywhere is 'viewed' on page open. The homeowner never learns the outcome; a dead lead sits in 'attention' forever (nothing sets 'archived').
   FIX: Server action `setBriefStatus(briefId, status, note?, quoteEur?)` in src/app/maker/[id]/actions.ts writing maker_status (+ maker_note, quoted_eur, decided_at columns in a 0006 migration); 'declined' also archives the project. Wire the three buttons to it (keep
[2] HIGH/honesty-trust/S — Skipping the builder produces a fabricated '9.600 – 14.400 €' range from a USD constant table
   @ src/lib/stub-estimate.ts:22
   buildHandoffBundle always runs buildStubEstimate first; without builderState the estimate is SCOPE_MIDPOINTS_USD[0] = 12000 ±20%, labelled 'Privremeno' with the basis copy 'iz odabranog opsega radova' — but the scope step was cut (no code sets profile.scope) so nothing was selected. The maker gets 'Okvirno · v0' with a number derived from nothing; the maker email subject carries it too.
   FIX: Delete src/lib/stub-estimate.ts. In bundle.ts, estimate = null when builderState is absent. Wrap-up/kitchen home/maker page/email already handle null ('Procjena nije dostupna' / 'nije dostupno') — add one line 'Sastavi kuhinju da dobiješ raspon' with a CTA bac
[3] HIGH/security/S — Maker's B2B cost rides in the customer-facing handoff response, and a 'Demo: see the maker view' button shows it to the homeowner
   @ src/components/kitchen-intake/WrapUpScreen.tsx:560
   bundle.ts attaches estimate.makerCost whenever maker-pricing.json has entries; /api/handoff returns that bundle to the customer; WrapUpScreen keeps a demo button that renders MakerDashboardPreview (with the emerald 'Tvoja nabavna cijena (B2B) · samo za tebe … kupac ovo nikad ne vidi' box) for the homeowner. Dormant today only because bySku is {}.
   FIX: Compute makerCost only in the maker page (maker/[id]/page.tsx) from the stored builderState, never in the shared bundle; strip `makerCost` in the handoff route before responding. Remove the demo button and the wrap-up→MakerDashboardPreview path (keep the dev h
[4] HIGH/honesty-trust/S — The ±20% headline is enforced by capBand, not earned — and the 'capped' flag is never shown to the maker
   @ src/lib/builder/bom.ts:1029
   When the engine's own works band is wider than 40% of midpoint, capBand symmetrically shrinks it to exactly ±20% and sets bandCapped=true. Nothing outside bom.ts reads that flag, so the maker sees '±20%' on a build whose real uncertainty was ±22–30%. There is also no floor: fully confirmed states display ±9% (LOOP Q6 still unanswered).
   FIX: Store both raw and displayed band on the brief row (band_pct_raw). On maker page + email, when bandCapped, show 'Raspon je širi od ±20% (model: ±{raw}%) — nedostaje: …' listing the L-confidence groups. Decide Q6 with Toni: a floor of ±10% until a maker's own r
[5] HIGH/honesty-trust/M — VAT basis is undeclared and mixed across the range — in a 25%-PDV market that is wider than the ±20% band
   @ src/lib/builder/bom.ts:345
   Hardware/appliances/sink prices are 'retail_incl_vat' (Elgrad webshop); board prices come from Elgrad's 'Veleprodajni cjenik' (wholesale list); labour rates are 'from the maker's real cost sheet'. No surface says 's PDV-om' or 'bez PDV-a' — the string PDV/VAT does not exist in the UI.
   FIX: Add `vatBasis: 'gross'|'net'` per catalog source and a single `VAT_RATE = 0.25`; normalise every line to one basis in computeBom (recommend gross for the homeowner, net+PDV row for the maker). Show 'Cijene s PDV-om' under every range (wrap-up, kitchen home, Li
[6] HIGH/honesty-trust/S — The homeowner is promised notifications that do not exist ('javit ćemo ti kad ga otvori')
   @ src/lib/i18n/locales/hr-HR.ts:773
   The post-submit status copy promises to tell the customer when the maker opens the brief and that the maker 'javlja ti se na {contact}' — with no SLA. There is no customer-facing notification code: src/lib/notify has only the auth email and the maker email; opening /maker/[id] stamps maker_viewed_at and sends nothing; checkpoints send nothing.
   FIX: notify/customer-email.ts with two templates: 'opened' (sent once from maker/[id]/page.tsx when maker_viewed_at is first set) and 'status' (from the action in finding 1). Add `response_sla_hours` (default 48) to maker settings and render 'odgovara obično u roku
[7] HIGH/robustness/S — Email is dormant in production: sign-in links, invites and maker notifications are silently dropped
   @ src/lib/notify/send.ts:102
   sendEmail falls to provider 'none' in production without RESEND_API_KEY and drops the message. The WORKLOG ops list (Resend domain, RESEND_* on Vercel) is still open. Invites survive via the copyable link, but a returning customer or a maker who signs out cannot sign back in by email, and no maker ever gets 'Novi sažetak kuhinje'.
   FIX: Ops: verify domain in Resend, set RESEND_API_KEY + RESEND_FROM on Vercel (vercel:env). Code: on /dashboard and /login show a visible banner when `emailProvider()==='none'` ('E-pošta nije konfigurirana — linkovi se ne šalju'), and have the invite/login actions 
[8] HIGH/ux-confusing/S — Wrap-up shows the homeowner an 'Open maker view' button that 404s
   @ src/components/kitchen-intake/WrapUpScreen.tsx:553
   After a persisted submit the wrap-up renders a link to bundle.makerPath (/maker/<id>). requireBriefAccess answers notFound() for any session whose role is not 'maker', so the customer's very next click after submitting is a 404 page.
   FIX: Drop makerPath from the customer response (or only set it when session.role==='maker'); replace the button with 'Natrag na moju kuhinju' → /kitchen/[projectId], which is the real status page.
[9] HIGH/product-gap/M — One hard-coded rate card for every maker — no maker settings at all
   @ src/lib/builder/bom.ts:349
   Labour (design €/h, CNC, assembly, install €/m) are module constants; supplier B2B prices live in one repo JSON file; makers are created by CLI (`npm run maker add`) and have no profile page (name, phone, VAT mode, SLA, rates). The second paying maker gets the first maker's prices.
   FIX: 0006 migration `softclose_maker_settings` (maker_id, labour json, margin_pct, vat_mode, sla_hours, phone, studio_name) with defaults = today's constants; `computeBom(state, locale, { rates })`; bundle.ts/maker page load the owning maker's rates (live view and 
[10] HIGH/product-gap/S — Nothing records the maker's real quote, so the ±20% hit rate (DoD #6) can never be measured
   @ db/migrations/0001_softclose_core.sql:41
   Briefs store estimate_low/high and band_pct, but there is no column, action or screen where the maker enters the price they actually quoted. Open Q11 ('±20% measured against the maker's first formal quote') is still undefined in code, and the only calibration data is the fixture gate.
   FIX: Fold into finding 1: the 'Za ponudu' action takes an optional `quoted_eur` (net) + date; store on the brief; add a tiny /dashboard/calibration view (or SQL view) listing briefs with low/high/quoted and in-band yes/no. One line in WORKLOG defining ±20% = total 
[11] MEDIUM/honesty-trust/S — The range carries hidden assumptions ('montaža uključena, bez rušenja/elektro/vodo') while the label says 'Sve uključeno'
   @ src/lib/i18n/locales/hr-HR.ts:414
   Install is always priced (installPerMetre on every run); demolition/electrical/plumbing/structural/flooring allowances are keyed to profile.scope which nothing sets since the scope step was cut (Toni, 2026-09-23 — not re-proposed). Pattern H requires explicit assumptions under every range; none are rendered. The all-in label 'Sve uključeno — s uređajima i radovima' reads as 'everything incl. works'. The dead scope/tr
   FIX: Add `assumptions: string[]` to BomEstimate (built in computeBom: 'montaža izrađivača uključena', 'bez rušenja i odvoza', 'bez elektro/vodoinstalaterskih radova', 'uređaje nabavlja kupac' when so, 'cijene s PDV-om'). Render under the range on wrap-up, kitchen h
[12] MEDIUM/product-gap/M — Resuming on another device loses the photos and the render — the journey cannot continue past step 3
   @ src/lib/project/snapshot.ts:40
   Server checkpoints are image-free by design, and media is only uploaded to Storage at submit. A customer who starts on their phone (photos) and continues on a laptop lands on a snapshot without spacePhotos or conceptRenders: the render step has no anchor and the builder opens 'Bez AI prijedloga'. The home screen promises 'nastavi gdje si stao'.
   FIX: Upload space photos and each concept render to Storage at capture (reuse lib/db/media.ts offload + signer) via a small /api/projects/[id]/media route; store storage:// refs in the snapshot; resolve to signed URLs when KitchenHome loads the snapshot. Handoff th
[13] MEDIUM/bug/M — Re-submit makes a second brief with no diff, and the 'v2' flag fires after a mere view
   @ src/app/dashboard/page.tsx:65
   A re-submit inserts a new brief and repoints the project; the maker sees 'izmijenjeno · v2' but nothing says what changed (lines are stored per brief, so a diff is cheap). The `quoted` flag used for the suffix is `makerStatus !== 'new'`, which becomes true the moment the maker opens the brief, so 'v2' appears on briefs nobody quoted.
   FIX: `quoted = makerStatus === 'quoted'`. Add `supersedes_brief_id` on insert (project.current_brief_id at submit time); on the maker page compute a line diff (BomLineItem by key: added/removed/low-high moved) and estimate delta against the superseded brief, render
[14] MEDIUM/compliance/M — No AI disclosure at journey start, no privacy page, no data export/deletion for the homeowner
   @ src/app/kitchen/[projectId]/KitchenHome.tsx:97
   The only AI labelling is the render badge; the welcome screen never says that an AI reads the photos and translates the wishlist, there is no privacy/how-it-works link anywhere in AuthShell, and a customer has no way to delete their kitchen (photos of their home, email, phone) — deletion exists only as a dev script.
   FIX: One sentence on KitchenHome ('AI čita tvoje fotografije i prijedloge; sve pregledava {maker}'), a static /privatnost page linked from AuthShell's footer, and a 'Izbriši moju kuhinju' server action (port scripts/delete-brief.mjs: briefs + storage objects + snap
[15] MEDIUM/product-gap/S — No PDF/print export of the brief for the maker (DoD #4)
   @ src/app/maker/[id]/MakerBriefView.tsx:9
   The only export is the homeowner's JSON download. The maker page has no print stylesheet or PDF action, so the brief cannot be handed to the workshop, attached to a quote, or forwarded to a designer who does not log in.
   FIX: A print stylesheet for MakerBriefView (hide nav/actions, A4 page breaks per section, floor-plan SVG + render on page 1, line items table) plus an 'Ispiši / spremi PDF' button calling window.print(). Later: server-side PDF attached to the notification email.
[16] MEDIUM/robustness/S — Render cap (5/session) and vision limits live in a per-instance Map, so on Vercel they do not bind
   @ src/lib/rate-limit.ts:2
   The product rule caps renders at 5 per session for cost; the limiter is an in-memory bucket per serverless instance, so a fleet enforces roughly N× the cap and resets on every cold start. Renders cost ~75 s of gpt-image-2 each.
   FIX: Enforce the render cap from durable state the app already has: count `conceptRenders` in the project's snapshot (checkpoint) or a `render_count` column bumped in the render route; keep the in-memory limiter only as a burst guard. Same for vision calls via a pe
[17] MEDIUM/product-gap/S — Decision-maker is never asked, though it is in the spec-ready floor and costs one chip
   @ src/lib/types.ts:163
   The intake catalog's spec-ready threshold lists decision-maker (1.1) first; LeadProfile has no field for it and no step asks. The maker cannot tell whether the first call needs both partners present — the most common reason a first call fails.
   FIX: `decisionMaker?: 'sole'|'joint'|'needs_consultation'` on LeadProfile; three chips on the contact step (default none = L confidence); one FieldRow on the maker page and a line in the notification email.
[18] LOW/honesty-trust/S — The range is shown bare on the surfaces people reopen most (kitchen home, dashboard list)
   @ src/app/kitchen/[projectId]/page.tsx:12
   KitchenHome prints 'Procjena: 6.077 – 8.025 €' with no ±, no 'kitchen only', and no 'maker confirms' line; the dashboard list prints the works range with no all-in or band. Pattern H framing exists only on the wrap-up and maker page.
   FIX: One shared `RangeLine` component (low–high · ±pct · 'kuhinja, s PDV-om' · 'raspon koji {maker} potvrđuje') used by KitchenHome, DashboardList and the email; pass band_pct and est_all_in_* that the project row already denormalises.
   NOTES: Verified against code only (no browser, no files changed). Decisions by Toni I did NOT re-propose: invite-only standalone app instead of the embeddable widget (WORKLOG 2026-09-22 — a deliberate pivot; DoD #1 'embed on their site' is therefore off the table, but the maker-settings/rate-card gap in finding 9 is the part of DoD #1 that still applies); no up-front budget ask (IMPLEMENTATION.md §1 'DROPPED', flow.ts:75-77); scope step and living-during-build cut after tester round 1 (2026-09-23); no wrap-up signature (2026-09-26); EGGER images hotlinked for testing only (DECOR_IMAGES_ENABLED — still needs permission before launch). Deterministic step form instead of a conversation is a long-standing design (flow.ts header) — the 'AI assistant' promise is honoured by vision, render, wishlist translation and brief summary; I did not propose chat. Open questions still undecided that now bite: LO

######## read:builder (14) ########
[1] CRITICAL/robustness/M — Builder picks and up to 5 paid re-renders are lost on any reload before the last Continue
   @ src/components/builder/BuilderShell.tsx:83
   BuilderShell keeps the whole build in a local useReducer and only hands it out via onComplete (last group) or onEditLayout. The funnel snapshot/checkpoint carries `profile`, but `profile.builderState` is only patched in those two callbacks, so a reload, tab close or device switch anywhere in the 8 groups discards every pick and every re-render stored in `state.rerenders`.
   FIX: Add `onStateChange?: (state: BuilderState) => void` to BuilderShell, call it (debounced ~500 ms) from a useEffect on `state`, and in kitchen-intake wire it to `patchProfile({ builderState })` so the existing 800 ms snapshot + checkpoint pick it up. Persist `cu
[2] HIGH/bug/M — Worktop thickness prices nothing; compact, solid wood and stainless are priced as laminate
   @ src/lib/builder/bom.ts:489
   The worktop screen offers family x decor x thickness, but the BOM prices only `totalLengthM * wtPricePerM` where the €/m comes from the Elgrad laminate `worktop600` price whenever a decor is set (regardless of family), and otherwise a flat 38 €/m for every family except quartz/sintered. Thickness is only interpolated into the detail string. The decor grid shown for 'compact' is the same 10 laminate rows.
   FIX: One PR: (1) derive thickness from family (laminate 38, compact 12, quartz/sintered 20, wood 40, stainless n/a) and remove the chips or show it read-only; (2) per-family fallback €/m bands in bom.ts (compact ~150–200, solid wood ~120–160, stainless ~250–350) an
[3] HIGH/compliance/S — EGGER swatch hotlinking is a hardcoded `const = true` with no production guard
   @ src/lib/builder/swatches.ts:18
   All 33 curated decors render `<img src="https://cdn.egger.com/...">` because `DECOR_IMAGES_ENABLED` is a compile-time constant, not an env flag. Toni's own note in the file says testing only and permission is required before launch; nothing stops a production deploy from shipping it.
   FIX: Read `process.env.NEXT_PUBLIC_DECOR_IMAGES === '1'` (default off; set it on local/preview only), add `referrerPolicy="no-referrer"` to the img, and add a vitest that the flag is false when NODE_ENV=production. Keep the mirror-to-Supabase-Storage script as the 
[4] HIGH/product-gap/M — No 'let the maker decide' answer in 7 of 8 builder groups
   @ src/components/builder/groups/SinkTapsGroup.tsx:22
   Only hob/oven/extractor have an 'unknown' chip. Fronts material, decor/RAL, worktop family, backsplash kind, carcass, built-in fridge/dishwasher, all five sink/tap chips, LED and plinth force a pick; every pick stamps `{confidence:'H', provenance:'homeowner-edited'}`, so a guess narrows the band exactly like a decision.
   FIX: Add a `deferred?: boolean` (or provenance `'homeowner-deferred'`) to FieldMeta; render one shared 'Neka odluči izrađivač' chip inside PickerSlot that keeps the current default, sets confidence L + deferred, and is excluded from `confirmGroupMetas`; `narrowByMe
[5] MEDIUM/honesty-trust/S — Continue stamps hidden and never-asked fields as homeowner-confirmed (H)
   @ src/lib/builder/state.ts:527
   `confirmGroupMetas` flips every meta in the slice, including fields the screen did not render: sink bowls/mount/material/tap under 'Ja nabavljam', hob/oven/extractor under homeowner supply, decorCode under lacquered MDF. The BOM grades 'homeowner-confirmed' as H. Separately, a plan-placed hob is seeded with config 'induction' and meta provenance 'homeowner-confirmed' although the homeowner only confirmed its position
   FIX: Give each registry module a `confirmableMetaKeys(state)` returning only the keys its Body rendered (supply gates included) and have `confirmGroupMetas` use it; split appliance presence from config meta so the plan confirms presence only (config stays 'ai-defau
[6] MEDIUM/honesty-trust/S — A picked Schachermayer reference RRP becomes an 'exact' goods line
   @ src/lib/builder/bom.ts:374
   The picker honestly tags Schachermayer rows 'procjena · ref. cijena' (no priceBasis), but picking one stores `pickedPriceEur` and the BOM's `effPrice` returns it unconditionally, so the sink/tap or appliance line is flagged `exact` and the panel prints 'točno — tvoj odabir'.
   FIX: Carry `priceBasis` into the pick (ApplianceSelection/sink/tap) and let `effPrice` return the price only when basis is 'retail_incl_vat' (or maker price); otherwise use the existing 'pinned SKU hugs midpoint ±8%' path and keep `exact:false`. One test per line.
[7] MEDIUM/i18n/S — FactsRecap shows raw i18n keys and English AI prose on the first builder screen
   @ src/components/builder/FactsRecap.tsx:52
   The recap reads `hypothesis.doors.style` and looks up `doors.style.<value>`, a key family that exists in neither locale since the style chips were removed, and appends `colorDescription` / `floorColorHint`, which the hypothesis route returns in English with no locale. The MOCK_AI fixture emits exactly this shape.
   FIX: Map `style` through `frontFromStyle` and label with `doors.material.*` / `doors.profile.*`; drop `colorDescription` and `floorColorHint` from the homeowner chips (keep them for the maker brief) or pass `locale` to /api/builder-hypothesis as summarize-brief alr
[8] MEDIUM/bug/S — RerenderPanel: 'door front' change renders a raw key, and its counter ignores the real render budget
   @ src/components/builder/RerenderPanel.tsx:62
   Changing RAL or profile on a lacquered front yields the change id 'door front', which has no `builder.rerender.change.door_front` key in either locale, so the amber panel prints the key. The 'još {n}' counter is a local useState that resets on every remount (escape hatch, resume) and never counts the Phase-1 concept renders, although the server cap is per account across both.
   FIX: Add the `door_front` keys (hr 'izgled fronte'); derive `renderCount` from `state.rerenders.length` and have /api/render-concept return `remaining` so the button shows the true budget; persist the baseline signature per render in `rerenders[]` (store the signat
[9] MEDIUM/bug/S — Plan-placed oven and hood can be toggled off, but their housing stays priced and relock re-adds them
   @ src/components/builder/groups/AppliancesGroup.tsx:98
   AppliancesGroup locks only hob/fridge/dishwasher as 'Iz tlocrta', yet the layout contract carries every plan feature including oven and hood. Toggling a planned oven to 'Nije u ovoj kuhinji' removes it from the goods line while the oven_housing carcass stays in the works line, and `syncSelectionsWithContract` silently puts it back on the next relock.
   FIX: Lock oven when `placed.has('oven')` and extractor when `placed.has('hood')` exactly like the hob (show the 'Iz tlocrta' pill, keep the type chips). Add a test that a contract with an oven yields a locked oven selection after hydrate and relock.
[10] MEDIUM/copy/S — Tap finish offers 'Uskladi s vratima', plus duplicate/incorrect trade terms in the sink and worktop chips
   @ src/components/builder/groups/SinkTapsGroup.tsx:36
   SinkTapsGroup reuses the handle `HandleFinish` enum for the tap, so a homeowner can pick a tap 'matched to the door' (and the BOM prices it ×1.05). 'Fragranite' is Franke's brand of granite composite and duplicates 'Granit kompozit'; 'Belfast / farmhouse', 'Filtrirana voda (3-pute)', 'Sintetizirani kamen' (should be 'sinterirani') and untranslated 'Compact' are not the words a Croatian maker uses.
   FIX: Define a `TapFinish` type without matched_to_door (normalize maps it to chrome); merge fragranite into granite_composite in `normalizeBuilderState`; relabel: 'Keramički (farmhouse)', 'Trosmjerna (filtrirana voda)', 'Sinterirani kamen', 'Kompakt ploča'. Keep en
[11] MEDIUM/honesty-trust/S — PickerSlot labels plain defaults as AI suggestions ('Promijeni ako ne odgovara') and confirmed fields as 'Da'
   @ src/components/builder/PickerSlot.tsx:30
   Any field whose meta is 'ai-default' or undefined gets the amber Sparkles tag, so 'Nabava uređaja: Ja nabavljam', the RAL code, thickness and plinth all read as low-confidence AI reads that nobody made; a confirmed field shows a green pill that just says 'Da'.
   FIX: Add a fourth tone 'default' for `provenance === 'ai-default'` or missing meta ('Zadano' / 'Default', neutral, no sparkle); change the confirmed pill to 'Potvrđeno' / 'Confirmed'; seed `worktop.meta.thickness` at hydration.
[12] LOW/ux-confusing/S — 'Pogledaj' on sink/tap/appliance cards sends the homeowner to the login-walled Schachermayer webshop
   @ src/components/builder/SchachermayerBrowse.tsx:137
   All 45 Schachermayer sink/tap/appliance rows link to webshop.schachermayer.com, which the WORKLOG records as B2B login-walled; the link opens in a new tab to a sign-in page.
   FIX: Render the external link only when `product.supplier === 'elgrad'` (or `priceBasis === 'retail_incl_vat'`); for Schachermayer rows show brand + SKU text only.
[13] LOW/ux-confusing/S — Goods row prints '0 € – 0 €' and the total is titled 'Ukupno s uređajima' when the homeowner buys everything
   @ src/components/builder/LiveBOMPanel.tsx:53
   With the default supply answers (homeowner buys appliances and sink), the goods section has no lines, so the panel shows a 0–0 range under 'Uređaji, sudoper i slavina' and a total 'with appliances' that equals the works line.
   FIX: Hide the goods row and switch the total label to 'Ukupno' when `bom.sections.goods.high === 0`, or print 'nabavljaš sam' in place of the range. Same in MobileRangeDock.
[14] LOW/dead-code/S — material-options.ts is dead code carrying US vocabulary that contradicts the builder's catalog
   @ src/lib/material-options.ts:8
   DOOR_MATERIAL_OPTIONS / WORKTOP_OPTIONS / BACKSPLASH_OPTIONS / HARDWARE_OPTIONS ('Zellige', 'Soapstone', 'Butcher block', 'Warm brass') have no importers; WorktopGroup also keeps a `familyFilter` state with no setter.
   FIX: Delete src/lib/material-options.ts and the dead filter state; keep `style-options.ts` and `option-icons.ts`, which are used by Inspiration.tsx and VisualScale.tsx.
   NOTES: Verified OK (no finding): /builder dev harness is gated (`if (process.env.NODE_ENV === 'production') notFound()` in src/app/builder/page.tsx:11); supply-first logic is consistent across AppliancesGroup, SinkTapsGroup, hydration defaults (homeowner_supplies) and the BOM (goods lines only under maker_supplies; built-in fridge re-runs the assembler via registry.tsx:112-128); normalizeBuilderState covers the retired carcass/plinth/backsplash/lighting/front-style values and is applied on both hydrate and relock; escape hatch wiring (onEditLayout → patchProfile → confirm_look → remount with savedState → relockBuilderState) is sound; the hypothesis route validates every enum with zod so the `as WorktopFamily` casts in state.ts are safe. Minor items not listed: bom.ts APPLIANCE_CONFIG_FACTOR.extractor keys 'wall' while the UI value is 'chimney' (both factor 1.0, harmless but confusing); Schacher

######## read:i18n-copy-a11y-compliance (16) ########
[1] CRITICAL/compliance/M — No AI disclosure, privacy notice, impressum or data-handling line anywhere in the app
   @ src/app/kitchen/[projectId]/KitchenHome.tsx:105
   product-foundations.md calls EU AI Act Article 50 disclosure ('you are talking to an AI' at conversation start), GDPR processing-purpose/export/deletion notices and a persistent 'Privacy & how this works' footer table-stakes. A grep of src for privatnost/privacy/gdpr/impressum/kolači/cookie/consent/pristan/umjetn/razgovaraš returns zero user-facing hits. The kitchen home walkthrough, the invite email and step 1 never
   FIX: One PR: (a) add a short AI line to kitchen.home.what and buildInviteEmail intro ('Kroz korake te vodi AI asistent; {maker} osobno pregledava sve što podijeliš.'); (b) add a shared <LegalFooter> (Privatnost · Impressum · Kako ovo radi) rendered by AuthShell and
[2] HIGH/compliance/S — Space photos go to OpenAI with no notice or opt-in before upload
   @ src/components/kitchen-intake/SpaceCapture.tsx:237
   The space-photo step uploads the homeowner's photos of their home and sends them to OpenAI (gpt-5.4-mini vision, gpt-image-2 renders) and stores them in Supabase Storage. Nothing on the capture screen says where the photos go, how long they are kept, or asks for consent. Foundations explicitly require 'no third-party data sharing without explicit opt-in'.
   FIX: Add one calm line under the drop zone (key space.processingNote): 'Fotografije koristimo samo za čitanje tlocrta i AI skicu; obrađuje ih naš AI partner i vidi ih tvoj izrađivač. Više u Privatnosti.' with a link, and record `disclosure_shown` in the snapshot (f
[3] HIGH/security/S — Wrap-up 'Demo' button shows the homeowner the maker's private view, including B2B cost and action buttons
   @ src/components/kitchen-intake/WrapUpScreen.tsx:557
   The production wrap-up renders a button 'Demo: pogledaj što vidi izrađivač' that opens MakerDashboardPreview with the full bundle returned by /api/handoff. That bundle includes `estimate.makerCost` whenever maker pricing is loaded, and the preview renders it under the label 'Tvoja nabavna cijena (B2B) · samo za tebe' / 'kupac ovo nikad ne vidi'. The code comment says 'Production removes this' but there is no gate.
   FIX: Remove the demo button and `showMakerView` path from WrapUpScreen (keep it only in /builder harness if wanted), and strip `estimate.makerCost` from the handoff response before `Response.json(bundle)` (keep it in the persisted row for /maker/[id]). Add a test t
[4] HIGH/product-gap/M — Maker's 'Za ponudu / Pojasni / Odbij' buttons on the real brief page are demo no-ops
   @ src/components/kitchen-intake/MakerDashboardPreview.tsx:397
   On /maker/[id] (the maker's actual brief page) the three decision buttons only set local state and then print 'Demo radnja: {action} (bez učinka).' Nothing is persisted (maker_status stays 'viewed'), the homeowner is never told, and the dashboard's 'quoted' flag can never become true. The foundations Definition of Done #3 is exactly this decision.
   FIX: Add a server action `setBriefDecision(briefId, 'quote'|'clarify'|'decline')` that writes maker_status (+ maker_decided_at), replace the local-state handler on the real page, show the stored decision as a chip, and surface it on the homeowner's status card ('{m
[5] HIGH/honesty-trust/S — Status card promises 'javit ćemo ti kad ga otvori' but no customer notification exists
   @ src/lib/i18n/locales/hr-HR.ts:773
   After submitting, the homeowner's kitchen home says the app will let them know when the maker opens the brief, and the wrap-up says the maker 'ti se javlja'. The only emails in the codebase are login, invite and maker-notify; nothing is sent to the customer on maker_viewed_at or on any maker decision, and no response-time expectation is set.
   FIX: Either send a short customer email from maker/[id]/page.tsx on first view (reuse renderEmail; 'Tvoj izrađivač je otvorio sažetak') or change the copy to a promise the app keeps ('Ovdje ćeš vidjeti kad ga otvori') and add an expectation line ('Izrađivači obično
[6] HIGH/honesty-trust/S — Act 3 is labelled 'Vaša ponuda' / 'Your offer' — the rail calls the output a quote the app says it is not
   @ src/lib/i18n/locales/hr-HR.ts:59
   The journey rail and the mobile progress pill label the last act 'Vaša ponuda' (and 'Vaša ponuda ✓' at wrap-up) while the walkthrough, invite email and estimate copy repeat 'To nije ponuda'. The three journey.* keys are also the only Vi-form strings in an otherwise tu-form UI.
   FIX: Rename to tu-form and brief-language: 'journey.brief': 'Tvoj sažetak', 'journey.act.space': 'Tvoj prostor', 'journey.act.offer': 'Tvoj sažetak i raspon' (en: 'Brief & range'). Add a unit test that no hr/en value contains 'ponuda'/'quote' outside the explicit '
[7] MEDIUM/copy/S — Homeowner copy calls the maker 'dizajner' in 17 strings while the product calls them 'izrađivač'
   @ src/lib/i18n/locales/hr-HR.ts:515
   The kitchen home, invite email and dashboard consistently say 'izrađivač' (maker); the funnel, floor plan, wrap-up and send button say 'dizajner' ('Pošalji dizajneru', 'Gdje te dizajner može kontaktirati?', 'Dizajnerov TL;DR', 'čuvamo tvoje riječi za dizajnera', 'Mjeri dizajner'). The glossary explicitly says avoid 'designer', use maker/studio.
   FIX: Replace 'dizajner'/'Dizajnerov' with 'izrađivač' (or the {maker} slot where the component already has makerName, e.g. nav.send → 'Pošalji {maker}' handled via fillSlots) in both locales; add a test asserting no hr value contains 'dizajner' and no en value cont
[8] MEDIUM/i18n/S — Sixteen Croatian strings use masculine-only past tense ('Promijenio si', 'Iskoristio si')
   @ src/lib/i18n/locales/hr-HR.ts:27
   Past-tense verbs addressed to the homeowner are hard-coded masculine, so a female homeowner reads 'Ti si promijenio', 'Izmijenio si nešto?', 'Odlučio si ne mjeriti', 'Iskoristio si sve rendere', 'potvrdio si'. Croatian has gender-neutral alternatives for every one of these.
   FIX: Rephrase to nominal or passive forms: 'Tvoja izmjena', 'Promjene:', 'Nastavi gdje si stao/la' → 'Nastaviti od zadnjeg koraka?', 'Ima li izmjena?', 'potvrđeno', 'Mjere preskočene — izrađivač mjeri na licu mjesta', 'Svi renderi za ovu sesiju su iskorišteni', 'Dn
[9] MEDIUM/copy/S — Tab title is 'Kitchen Studio — Project intake' while the app calls itself 'softclose'
   @ src/app/layout.tsx:17
   The only metadata in the app is an English title and description for a brand ('Kitchen Studio') that appears nowhere else; the shell header and all emails say 'softclose'. There are no per-page titles, so the maker's dashboard, the brief page and the login page all share the same English tab title in a Croatian app.
   FIX: Set root metadata to `title: { default: 'softclose', template: '%s · softclose' }` with a Croatian description, and add generateMetadata on /login (Prijava), /dashboard (Kupci), /maker/[id] (Sažetak · {name}), /kitchen/[projectId] (Tvoja kuhinja). Decide the o
[10] MEDIUM/i18n/S — Maker notification email mixes English 'Homeowner' and raw enum ids into Croatian copy
   @ src/lib/notify/maker-email.ts:49
   The new-brief email the Croatian maker receives has a row labelled 'Homeowner' and prints `layoutShape` and `timeline` as raw ids ('Raspored: l_shape · 380 × 260 cm', 'Rok: 3_6_months').
   FIX: Import `tDynamic` from '@/lib/i18n/core' (server-safe) and render `tDynamic(`layout.shape.${shape}`, 'hr-HR')`, `tDynamic(`option.timeline.${b.timeline}`, 'hr-HR')`, and change 'Homeowner' to 'Kupac'; extend tests/maker-email to assert no underscore ids in the
[11] MEDIUM/i18n/S — Wishlist 'translation to trade language' is prompted in English — the Croatian maker gets English trade terms
   @ src/app/api/translate-wishlist/route.ts:35
   The homeowner is told 'Mi prevodimo u stručni jezik', but /api/translate-wishlist takes no locale and its system prompt instructs the model to produce English trade phrases ('deep pan drawers near hob'). The maker's wishlist section ('Stručni zapis · izvorne riječi kupca') therefore shows English next to the Croatian verbatim.
   FIX: Accept `locale` in the request body (the client already sends it to summarize-brief), and add the same hr-HR instruction block used in summarize-brief ('write trade in Croatian trade vocabulary: fronte, korpus, ladice s punim izvlačenjem, soft-close okovi…'). 
[12] MEDIUM/bug/M — Server pages render in the account's stored locale, the client in localStorage — they can disagree
   @ src/app/dashboard/actions.ts:56
   KitchenHome, dashboard and maker pages format step labels, dates and numbers on the server using `session.locale`, which is copied from the inviting maker's locale at invite time and never updated; the homeowner's switcher writes only localStorage. A homeowner invited by an EN-locale maker who flips to HR (or vice versa) sees 'korak 3/8' in one language and the rest in another, and `<html lang>` stays 'hr' on reload 
   FIX: Persist the switcher choice: on setLocale, call a small server action that updates `softclose_accounts.locale` for the signed-in account (and let the checkpoint route carry locale); on the client, set `document.documentElement.lang` in a layout effect from the
[13] MEDIUM/a11y/S — No focus management or announcement when the step changes — keyboard and screen-reader users lose their place
   @ src/components/kitchen-intake/index.tsx:856
   The 8-step journey swaps content via AnimatePresence keyed on currentStepId; focus is never moved to the new step's heading, there is no live region announcing the step, and the h1 is not focusable. The same applies to builder group changes in BuilderShell.
   FIX: Give the step <h1> `tabIndex={-1}` and a ref, and in a layout effect on `[state.currentStepId, builderGroupId]` call `ref.current?.focus({ preventScroll: false })`; add one `aria-live="polite"` region in AppShell that announces `${eyebrow} — ${title}` on chang
[14] MEDIUM/a11y/M — Floor-plan editor: selecting a wall, room or element is pointer-only on the Konva canvas
   @ src/components/kitchen-intake/floor-plan-editor/Editor.tsx:864
   Sides, the room and features are selected exclusively via onMouseDown/onTouchStart handlers on Konva shapes; the only copy telling the user how to open a side panel says to tap the wall on the plan. There is no keyboard path (no focusable list of sides/elements, no role on the stage) and the overlay is aria-hidden.
   FIX: Render a small visually-light list under the canvas: four side buttons (Gornji/Donji/Lijevi/Desni zid — 'otvoren'/'s radnom pločom'), the room, the island and each element, each a <button> calling the same onSelectSide/onSelectFeature; give the canvas wrapper 
[15] MEDIUM/copy/S — Several Croatian labels are wrong terms or wrong plural forms
   @ src/lib/i18n/locales/hr-HR.ts:276
   A handful of hr-HR values are mistranslations or non-Croatian: 'Šolja ručke' (Serbian 'šolja', wrong case; cup pulls are 'školjkaste ručke'), 'Paralelne klupe' for a galley kitchen ('klupe' = benches; trade says 'dvoredna'), 'Filtrirana voda (3-pute)' (should be 'trokraka slavina s filtrom'), '{n} kupaca' is wrong for 1–4 (1 kupac, 2–4 kupca), '+{n} više' is a calque ('još {n}'), 'Ti si promijenio' as a badge.
   FIX: One copy PR: 'Školjkaste ručke', 'Dvoredna (paralelna)', 'Trokraka slavina (filtrirana voda)', plural helper for kupac/kupca/kupaca (and reuse for 'uređaj/uređaja', 'foto'), 'još {n}', 'Tvoja izmjena', 'Radionica · Novi sažetak'. Have one Croatian maker read t
[16] LOW/i18n/S — Hardcoded English leftovers in the shell and dashboard, plus an English sentence persisted into every brief
   @ src/lib/handoff/bundle.ts:80
   A few strings bypass i18n: the language toggle's group label, the dashboard's ' · v2' suffix, and `estimate.basis` — an English sentence ('Estimated from your build — ±X%. An estimate your maker confirms, never a final quote.') written into every persisted brief and into the homeowner's JSON download, used as a fallback on the maker page.
   FIX: Make `basis` a key + params (store `basisKey: 'bom'|'stub'` and render via tDynamic on both surfaces), add 'common.language' and 'dashboard.status.revision' keys, and extend the existing hardcoded-string test to assert no `[a-z]{4,} [a-z]{4,}` English runs in 
   NOTES: Verified NOT present any more (do not re-report): the 'Sarah, Sarah Chen Kitchens' placeholder (removed 2026-09-26); MakerDashboardPreview 'English throughout' (now 111 t() calls, commit 8209764); summarize-brief ignoring locale (route.ts:76-81 now forces Croatian + 'ti'); hardcoded English in RerenderPanel/FactsRecap/floor-plan editor (swept 09-24); raw provider errors reaching the UI (lib/api/errors.ts + apiErrorKey maps 401/429/413, other errors fall to the step's own localized line); maker USD vs EUR (app-analysis H2) — fmtMoney now EUR. Key sets of hr-HR and en-US match exactly (977/977); no en values contain Croatian; the only identical values are brand/loan words (Blum, Push-to-open, Fragranite, Compact, Belfast). Dropped for the cap / lower priority: (a) maker-facing dashboard addresses the maker as 'ti' ('Danas si poslao…', 'Tvoja nabavna cijena') — Croatian B2B often expects 'V

######## read:ai-seams (15) ########
[1] HIGH/bug/S — builder-hypothesis is sent the whole profile as base64: prompt context is noise and the body re-creates the 4.5 MB 413
   @ src/components/kitchen-intake/index.tsx:636
   loadHypothesis posts `profile` verbatim. The first key patched into the profile is `spacePhotos` (data URLs), and `chooseRender` patches `conceptRenders` (each with an `inputs` manifest of anchor/previous-render/style-ref data URLs) before the hypothesis fires. Server-side the 'Phase-1 profile' is `JSON.stringify(profile).slice(0, 2000)`, i.e. 2000 chars of base64; and the request carries render + anchor + every phot
   FIX: Client: send a slim profile (pick the ~10 scalar/enum fields the prompt needs; never spacePhotos/conceptRenders/floorPlan). Server: run the same `stripDataUrls` deep walk before `JSON.stringify`, and reject bodies whose non-image JSON exceeds a few KB. Add a v
[2] HIGH/bug/S — render-concept silently drops `materialHints`/`styleHints`, so builder re-renders ignore the chosen decor/RAL
   @ src/app/api/render-concept/route.ts:50
   RenderRequest declares `styleHints` and `materialHints` but `buildPrompt` never reads them. RerenderPanel is the only place that encodes the actual pick (Elgrad decor name/family/tone, RAL code + hex, worktop decor) and it does so only through `materialHints`; the route forwards `doorMaterial: 'slab'` and the worktop family and throws the rest away.
   FIX: In buildPrompt add `Specific materials: ${materialHints.join('; ')}` (sanitize each hint like freeTextNudge, cap 6 × 120 chars) and `Style cues: ${styleHints…}`. Add a unit test on buildPrompt (export it) that a RAL hint appears in the prompt.
[3] HIGH/product-gap/M — The 5-renders-per-session cap is a leaky 30-minute bucket plus two independent client counters
   @ src/app/api/render-concept/route.ts:249
   Server cap = in-memory `rateLimitKey(accountId, 'render-concept', 5, 30 min)`: it refills every 30 minutes and resets on every cold start/instance (documented as demo-grade). The intake counts persisted `renders.length`, but RerenderPanel keeps its own `useState(0)` that resets on every remount and does not know about the intake's renders. Nothing counts per project.
   FIX: Make the cap per project: client sends `projectId` + the persisted render ids; server counts `conceptRenders.length` from the project snapshot (or a tiny `render_count` column bumped on success) and refuses at 5 regardless of window; keep the in-memory bucket 
[4] MEDIUM/bug/S — Hypothesis and builder re-render always use photo 0, not the photo the chosen render was anchored to
   @ src/components/kitchen-intake/index.tsx:634
   ConceptRender lets the homeowner pick which space photo anchors the render and stores `anchorPhotoIndex` on the record, but loadHypothesis sends `spacePhotos[0]` as the 'ANCHOR PHOTO … use for true scale + window/door positions' and BuilderShell gets `anchorPhotoDataUrl={spacePhotos[0]}` for re-renders.
   FIX: Use `spacePhotos[chosenRender.anchorPhotoIndex] ?? spacePhotos[0]` in loadHypothesis and pass the same to BuilderShell/RerenderPanel.
[5] MEDIUM/robustness/S — Routes never check `toolCall.invalid`: schema-failing tool calls are cast and returned as valid
   @ src/app/api/space-vision/route.ts:286
   AI SDK 6 does not throw when a tool input fails the zod `inputSchema`; it returns the call in `result.toolCalls` with `invalid: true, dynamic: true` and the raw parsed JSON as `input`. Every route takes `toolCalls[0].input as <Type>` and ships it to the client without checking the flag or logging. OpenAI strict mode (provider default) catches structure/enum errors but not every zod constraint, and the route code assu
   FIX: Shared helper `structuredResult(result, route)`: if `toolCall.invalid` → `console.error` with `toolCall.error` + finishReason and return the calm 500; else `schema.parse(input)` once. Or migrate the five calls to `generateText({ output: Output.object({ schema 
[6] MEDIUM/compliance/M — No audit log of AI inferences (model, inputs, output, confidence) — a foundations table-stake
   @ src/app/api/builder-hypothesis/route.ts:446
   Foundations require every AI inference and cost-model run to be logged with model version, inputs, output, assumptions and confidence (compliance + back-testing the ±20% claim). There is no table, no structured log line, and `result.usage` is discarded; the only server-side trace is `console.error` on failure.
   FIX: Add `softclose_ai_calls` (id, account_id, project_id, route, model, started_at, latency_ms, usage json, input_digest/sizes, output json without images, invalid bool, error) and a `recordAiCall()` helper called from the five text routes + render-concept (store 
[7] MEDIUM/compliance/S — No AI disclosure at conversation start (Pattern G / EU AI Act Art. 50)
   @ src/lib/i18n/locales/hr-HR.ts:563
   The locale has 'AI koncept' badges, 'AI čita', 'AI prijedlog' labels, but no line at the first step or on the KitchenHome walkthrough saying the homeowner is working with an AI assistant and that the maker personally reviews everything.
   FIX: One localized line (hr/en) on the space-photos step header and in KitchenHome's walkthrough: 'Vodi te AI asistent. Tvoj izrađivač osobno pregledava sve što ovdje nastane.' Optionally stamp `disclosureShownAt` on the project checkpoint.
[8] MEDIUM/i18n/S — translate-wishlist writes English 'trade' lines for a Croatian maker; two request buckets are dead
   @ src/app/api/translate-wishlist/route.ts:35
   The route has no locale handling and its examples are English ('deep pan drawers near hob'); the client never sends a locale. The maker page shows `item.trade` as the headline with the Croatian verbatim as a quote underneath. The route also accepts/mocks `applianceNotes` and `additionalNotes` that the client never sends.
   FIX: Pass `locale` from the client; add the hr trade glossary note used by summarize-brief; set `trade` max to 120 chars in Croatian. Remove the dead buckets or wire them to the fields that exist. Alternative if the call still adds nothing after that: split client-
[9] MEDIUM/product-gap/M — inspiration-vision: a paid 20-s call whose output is almost entirely unused
   @ src/app/api/inspiration-vision/route.ts:191
   Its enum guesses (marble/soapstone/zellige/beaded_inset/warm_brass …) go into profile.doorMaterial/worktopPreference/backsplashPreference/hardwareTier via derivePrefills, but the builder hydrates from the render hypothesis and never reads them, summarize-brief deletes them once builderState exists, pick-labels calls them 'guesses', and the ReadbackPanel no longer shows summary/hints. The only live effect is a few pro
   FIX: Either drop the call (tagged styles + reference images already reach the renderer) or shrink it to `styleGuess` + a one-line `materialPhrase` in builder vocabulary and stop writing the four photo-guess fields to the profile. Decide with Toni; the 2026-09-23 no
[10] MEDIUM/ux-confusing/S — Render is forced to 1024×1024 — the anchor photo's framing is not preserved
   @ src/app/api/render-concept/route.ts:359
   The prompt instructs the model to keep the room footprint, wall positions and camera angle of the anchor photo, but `size: '1024x1024'` is hard-coded; a portrait or 4:3 phone photo is re-composed into a square. The provider supports 'auto' and 1024×1536 / 1536×1024.
   FIX: Pass `size: 'auto'` (model matches the input image) or choose 1024×1536 / 1536×1024 from the anchor's aspect client-side; keep the client compressor at maxDim 1024 on the long edge.
[11] MEDIUM/robustness/S — No maxDuration, no timeouts, default retries, no abort: slow failures burn renders and end in a non-JSON 504
   @ src/app/api/render-concept/route.ts:353
   No route exports `maxDuration`; `generateImage`/`generateText` run with the SDK default `maxRetries: 2` and no `timeout`/`abortSignal`, so a slow-failing 75–90 s image call can retry three times toward Vercel's 300 s ceiling; the client fetch has no AbortController, so a homeowner who leaves still pays for the render.
   FIX: `export const maxDuration = 300` on the AI routes; `maxRetries: 0` and `timeout: { totalMs: 150_000 }` + `abortSignal: req.signal` on generateImage (1 retry, 60 s on the text calls); client-side AbortController cancelled on unmount; refund the rate-limit slot 
[12] LOW/dead-code/S — builder-hypothesis schema/prompt still request fields retired on 2026-09-23 and the model-choice comment is stale
   @ src/app/api/builder-hypothesis/route.ts:28
   After makers asked for fewer questions, cornice, open shelving, worktop edge and the Okovi screen left the builder, but the gpt-5.4 call still asks for `features.openShelving`, `features.corniceVisible`, `doors.overlay`, `doors.edgeProfile`, legacy `doors.style`, `layout.runs[].lengthCm`, `cabinetBoxes.unitCounts`, and the SYSTEM prompt still instructs on them. The header justifies the full model because it 'drives c
   FIX: Prune the zod schema + SYSTEM to consumed fields; rewrite the model-choice comment to what the call actually contributes; try gpt-5.4-mini on the fixture renders and compare decorCode/shape agreement before deciding.
[13] LOW/robustness/S — 'No structured result' branches still log nothing in 4 of 5 text routes; providerFailure drops status and response body
   @ src/lib/api/errors.ts:10
   Only summarize-brief logs finishReason/text when the model returns no tool call; the other four return a bare 500. `providerFailure` logs `name: message` and loses `APICallError.statusCode`/`responseBody`, which is where OpenAI explains refusals, image-policy blocks and quota errors.
   FIX: One helper `noStructuredResult(route, result)` that logs finishReason, warnings, first 300 chars of text and the invalid flag; in providerFailure include `statusCode`, `responseBody?.slice(0, 500)` and `isRetryable` when `APICallError.isInstance(err)`.
[14] LOW/robustness/S — Mock short-circuit runs before body validation and returns a render with an empty manifest
   @ src/app/api/render-concept/route.ts:226
   Every route answers the mock before validating the body, so `npm run dev:mock` accepts a missing anchorPhoto, an oversize image or a bad renderImage that 400/413s live. The mock render returns `inputs: []`, so the maker page's 'real references' section is never exercised; the mock summary ignores `locale` (always Croatian). The fixtures test pins hypothesis/space-vision/translate but not MOCK_SUMMARY or MOCK_INSPIRAT
   FIX: Move each mock return after the body validation (keep it before rate limiting); make the mock render echo a manifest built from the request; export the zod schemas and add `schema.safeParse(fixture).success` tests for all six fixtures.
[15] LOW/i18n/S — space-vision style/material hints reach the maker page in English
   @ src/app/api/space-vision/route.ts:252
   Only `summary` follows the locale; `styleHints`/`materialHints` are generated in English trade fragments and the maker page prints them raw under 'AI čitanje fotografija'.
   FIX: Extend the langNote to styleHints/materialHints (they are free text, not enums) and keep the render prompt reading `visionSummary` only.
   NOTES: Verified OK (no finding): model ids are current and typed in @ai-sdk/openai 3.0.58 ('gpt-5.4', 'gpt-5.4-mini', 'gpt-image-2'); no deprecated AI SDK 6.0.174 calls (non-experimental generateImage, tool()+inputSchema, toolChoice 'required'); raw provider text no longer reaches the UI (errors.ts) — app-analysis M9 fixed; H4 (unvalidated layoutContract) fixed by sanitizeContract; conceptOnly flag + prompt + nudges persist on the chosen render (lib/handoff/bundle.ts:61-64); summarize-brief locale is fixed (WORKLOG follow-up closed); hallucination guards exist and are consistent (wall-discipline + island-omit + dimension-anchor rules in the space-vision prompt, server-side per-shape bands, reconcileCounterWalls, render-silent-⇒-no-island in derive-layout). app-analysis H5 (in-memory limiter) is still present and is folded into finding 3. Dropped for the cap or as unverified: inspiration-vision/

######## read:maker-side (20) ########
[1] CRITICAL/product-gap/M — Quote-ready / Clarify / Decline are client-side no-ops on the production maker page
   @ src/components/kitchen-intake/MakerDashboardPreview.tsx:354
   The three decision buttons on /maker/[id] only flip local React state and print 'Demo radnja: {action} (bez učinka)'. Nothing writes maker_status beyond 'viewed', maker_note is never used, and the homeowner's status page can therefore never show a decision. The maker can 'do nothing' — exactly what rule 8 forbids.
   FIX: Add a server action `decideBrief(briefId, status: 'quoted'|'clarify'|'declined', note?)` in src/app/maker/[id]/actions.ts that checks requireBriefAccess, writes maker_status + maker_note + decided_at, and emails the customer a canned Croatian message (clarify 
[2] HIGH/bug/S — Dashboard rows for 'invited' and 'opened, stalled' customers open a 404
   @ src/app/dashboard/project/[id]/page.tsx:46
   Rows without a brief link to /dashboard/project/[id], which calls notFound() when the project has no snapshot. A snapshot is only written on the first checkpoint, so the two states the triage tells the maker to chase ('pozvan', 'otvorio, stao') dead-end on a 404. The resendInvite action that would belong on that page exists but is wired to nothing.
   FIX: In LiveProjectPage, when there is no snapshot render a small project card instead of notFound(): customer name/email, status, invite issued/opened dates, and a 'Pošalji novi link' form bound to the existing resendInvite action (reuse LinkBox from InviteForm). 
[3] HIGH/ux-confusing/S — Homeowner wrap-up links to a maker-only page (404 for them) and still carries the 'Demo' maker view
   @ src/components/kitchen-intake/WrapUpScreen.tsx:557
   After submit the wrap-up offers 'Otvori pogled izrađivača' → /maker/<id>, but requireBriefAccess answers notFound() for any customer session. Below it, the 'Demo: pogledaj što vidi izrađivač' button (comment: 'Production removes this') shows the homeowner the maker surface including the fake decision buttons and, once maker pricing exists, the B2B cost box.
   FIX: When `projectId` is set, drop both controls; replace with a single 'Natrag na moju kuhinju' link to /kitchen/[projectId] (the real status page). Keep the demo toggle only for the anonymous /builder harness.
[4] HIGH/honesty-trust/M — Builder-skipped stub range (USD scope-count table) is surfaced as a real ±20% range in email subject, dashboard and homeowner status
   @ src/lib/stub-estimate.ts:20
   The builder entry has a 'skip' CTA. Without builderState the estimate falls back to buildStubEstimate, whose midpoints come from SCOPE_MIDPOINTS_USD (no budget question exists any more, so the budget branch never fires). The `placeholder` flag is only rendered on the two detailed views ('Okvirno · v0'); the maker email subject, the dashboard row and the homeowner's /kitchen status page print the same numbers as an ho
   FIX: Persist the flag: add `estimate_placeholder boolean` (or set band_pct null) on the brief row in /api/handoff; maker-email, dashboard money() and KitchenHome show 'okvirno, bez gradnje' instead of a ±pct range when set. Rename the constants to EUR or drop the s
[5] HIGH/product-gap/S — The maker never sees the homeowner's space photos
   @ src/components/kitchen-intake/MakerDashboardPreview.tsx:665
   profile.spacePhotos is in the bundle (and offloaded to Storage), but MakerDashboardPreview never renders it. The maker gets the AI concept render and, only if a render exists, an 80px 'anchor' thumbnail inside the render inputs. The real photos of the room — the first thing any maker asks for — are stored and hidden.
   FIX: Add a 'Fotografije prostora' section (right column, above the render) rendering `profile.spacePhotos` as a grid with lightbox-size links; resolveMedia already signs storage:// refs for any string in the bundle.
[6] HIGH/bug/M — Re-submit from a second device sends 'omitted://image' as the brief's photos and render
   @ src/lib/project/checkpoint.ts:28
   Server checkpoints are image-free: stripImages replaces every data URL with 'omitted://image'. On another device the journey resumes from that snapshot, nothing rehydrates images (the comment in checkpoint.ts claims a post-submit edit does), and 'Pošalji izmjene' then inserts a new brief whose spacePhotos/moodBoard/chosenRender are the marker strings, repoints current_brief_id to it and emails the maker. The live vie
   FIX: In /api/handoff, when the project already has a current brief, walk the new bundle and replace any 'omitted://image' with the matching storage:// ref from the previous brief (same path, same index) before insert; refuse the send if a chosen render cannot be re
[7] HIGH/product-gap/M — No versioning on re-submit: a second brief, a second 'Novi sažetak' email, no diff
   @ src/app/api/handoff/route.ts:134
   Every re-submit inserts a fresh brief row with maker_status 'new', repoints the project and emails 'Novi sažetak kuhinje' again. Nothing links the two briefs, the maker's viewed/decision stamps on the old one are orphaned, and neither the email nor /maker/[id] says what moved. The dashboard's 'izmijenjeno' flag is the only signal and it clears on the re-submit.
   FIX: Migration 0006: `supersedes_brief_id uuid` + `version int` on softclose_briefs. In /api/handoff set them from project.current_brief_id. Add a pure `diffBriefs(prev, next)` (estimate, dims, BOM lines by key, wishlist, appliances) in src/lib/handoff/diff.ts; ema
[8] MEDIUM/honesty-trust/S — Homeowner is promised notifications that do not exist
   @ src/app/kitchen/[projectId]/KitchenHome.tsx:95
   The status page says '{maker} ga još nije otvorio — javit ćemo ti kad ga otvori' and 'Ako nešto izmijeniš, {maker} dobiva obavijest o izmjeni'. There is no customer-facing email anywhere, and a silent edit only flips a dashboard flag — the maker is emailed only when the homeowner presses 'Pošalji izmjene' on the wrap-up.
   FIX: Either (a) send a short 'otvoren je tvoj sažetak' email from the maker page's first-view branch and have checkpoints after submit trigger a debounced 'kupac je nešto izmijenio' mail (once per day), or (b) reword both strings to what is true ('status vidiš ovdj
[9] MEDIUM/ux-confusing/S — '· v2' badge is derived from 'viewed', so any edit after a glance reads as a quoted brief changed
   @ src/app/dashboard/page.tsx:65
   The dashboard marks a changed row '· v2' when `quoted` is true, but `quoted` is `makerStatus !== 'new'` and opening the brief sets 'viewed'. Since no real decision status is ever written, the suffix fires on every post-view edit and never on anything else; there is also no actual v2 to open.
   FIX: Compute `quoted` from `makerStatus === 'quoted'` once finding 1 lands; until then remove the suffix. With finding 7, make 'v{n}' the brief's real version number.
[10] MEDIUM/i18n/S — Maker email: English label, raw enums, onboarding from-address, dead enable check
   @ src/lib/notify/maker-email.ts:49
   The Croatian notification prints 'Homeowner' as a row label and raw enum values for layout and timeline ('l_shape', '3_6_months'). The default sender is Resend's onboarding address, which only delivers to the Resend account owner, so a production deploy without RESEND_FROM silently mails nobody but Toni. makerNotifyEnabled() requires MAKER_NOTIFY_EMAIL while the send path does not, and is unused.
   FIX: Label rows with tDynamic(locale) and map enums through 'layout.shape.*' / 'option.timeline.*'; in production throw/log loudly at boot when RESEND_FROM is unset; delete makerNotifyEnabled. Add the project link (/dashboard/project/[id]) next to the brief link.
[11] MEDIUM/security/S — Maker B2B cost basis is returned to the homeowner in the handoff response and JSON download
   @ src/lib/handoff/bundle.ts:88
   buildHandoffBundle attaches estimate.makerCost whenever maker-pricing.json has entries, and /api/handoff returns that same bundle object to the customer session; the wrap-up stores it and the 'Preuzmi sažetak (JSON)' button writes it to disk. Dormant today (bySku is {}), but it is the designed path for the day a maker adds prices — the 2026-06-21 decision 'never shown to the homeowner' is not enforced anywhere.
   FIX: Compute makerCost only on the maker side: move the pricing:'maker' pass out of buildHandoffBundle into /maker/[id]/page.tsx (or strip `estimate.makerCost` from the response when session.role === 'customer' and before the JSON download). Add a test that the cus
[12] MEDIUM/ux-confusing/S — /maker/[id] is a dead-end page: no back link, no sign-out, no shell
   @ src/app/maker/[id]/MakerBriefView.tsx:11
   MakerBriefView renders a bare <main> with the 900-line preview; unlike the live view it does not use AuthShell, so there is no way back to /dashboard, no language switch and no sign-out. A maker who arrives from the email has only the browser back button.
   FIX: Wrap MakerBriefView in `<AuthShell wide signedIn>` with the same 'Natrag na popis' link and the customer's project link (/dashboard/project/[projectId] — pass brief.projectId from the page).
[13] MEDIUM/product-gap/M — No export on the maker surface: no PDF/print, no JSON (foundations must-have, DoD #4)
   @ src/app/maker/[id]/MakerBriefView.tsx:17
   The only download in the app is the homeowner's JSON on the wrap-up. The maker page has no print stylesheet, no PDF and no structured export, so the brief cannot leave softclose into the maker's quoting workflow (2020, Excel, email to a lacquer shop).
   FIX: Add `/api/briefs/[id]/export` (requireBriefAccess) returning the bundle with signed image URLs as JSON, a 'Preuzmi JSON' button, and a print stylesheet (@media print hides the actions/transcript, expands details) with an 'Ispiši / PDF' button; maker branding c
[14] MEDIUM/ux-confusing/S — Returning to the wrap-up after submit shows 'Procjena još nije dostupna' until the homeowner re-sends
   @ src/components/kitchen-intake/WrapUpScreen.tsx:258
   On a revisit (hasExistingBrief) the bundle state starts null and nothing loads it, so the estimate card says the estimate is not available, 'Što slijedi' is hidden and the download is disabled. The only control that brings the range back is 'Pošalji izmjene', which inserts a new brief and emails the maker.
   FIX: Pass the project's saved range + briefId (KitchenHome already has them) into KitchenIntake → WrapUpScreen as `initialResult`; render the estimate card and 'Što slijedi' from it when bundle is null, and enable the JSON download via a GET of the saved brief.
[15] MEDIUM/dead-code/S — Budget row and 'cost vs stated budget' comparison are dead: budgetRange is never asked or set
   @ src/components/kitchen-intake/MakerDashboardPreview.tsx:451
   MakerDashboardPreview renders a 'Budžet' row and buildStubEstimate has a budget branch, but no step in the flow writes budgetRange/budgetShared. The foundations' must-have 'cost-model output side-by-side with the homeowner-stated budget' is unmet. The wrap-up comment states the flow has no up-front budget any more; if that is Toni's decision (tester feedback: fewer questions), the dead code should go and the decision
   FIX: Decide and record in WORKLOG. If 'no budget question' stands: delete the row, the stub's budget branch and the i18n keys. If not: add a single optional 'Okvirni budžet' chip row (bands in EUR) to the contact step, store budgetRange/budgetShared, and show 'Proc
[16] MEDIUM/product-gap/S — BOM lines never print the article numbers the maker quotes from
   @ src/lib/builder/bom.ts:832
   builderState carries pickedSku / drawerSystemSku / sink.sku / tap.sku, and the BOM uses them for pricing and 'exact' flags, but the line detail only prints the picked product name. Fronts show decor name + EGGER code (good); appliances, hardware and sink/tap do not show SKUs anywhere on the maker surface.
   FIX: Append ` · ${sku}` to each picked product in the three detail builders (or add a `skus: string[]` field on BomLineItem and render it as a mono sub-line in BuildLines). One test on computeBom asserting the SKU appears.
[17] MEDIUM/product-gap/M — Dashboard list has no pagination, search or archive; 'archived' is unreachable and hidden rows are still counted
   @ src/lib/auth/projects.ts:53
   listProjectsForMaker caps at 100 by updated_at with no paging; at 20 invites/day the oldest projects silently disappear within a week of real use. The 'archived' status exists in the constraint and the status map, but nothing ever sets it, and archived rows fall into none of the three groups while the subtitle still counts them.
   FIX: Add an 'Arhiviraj' server action (status='archived') on the brief page, a 'Prikaži arhivirane' toggle, and either a search box on name/email or simple 'učitaj starije' paging via a `before` cursor on updated_at.
[18] LOW/honesty-trust/S — Confidence pills on the spec are hardcoded per row, not derived from provenance
   @ src/components/kitchen-intake/MakerDashboardPreview.tsx:442
   The spec section claims H/M/L + source per field, but the values are literals chosen per row ('H'/'homeowner' for project type, 'M' for plumbing, 'L' for permits) regardless of how the answer was obtained; only the floor-plan rows carry real per-element confidence/source. Pattern E (hover for provenance) is a static label.
   FIX: Drop the pills from rows that have no tracked provenance (or show only the source pill), and keep H/M/L where it is computed (plan elements, BOM meta via narrowByMeta). Longer term carry `meta` on LeadProfile fields the way builderState does.
[19] LOW/i18n/S — Hardcoded English and raw enums still reach maker and homeowner surfaces
   @ src/components/kitchen-intake/WrapUpScreen.tsx:384
   bundle.ts stores an English PLAN_DISCLAIMER and estimate.basis in every brief (used as a fallback); the maker placeholder badge reads 'Okvirno · v0' (dev-speak); the wrap-up's trades, phasing and permits rows print humanize()d enum values ('under_sink', 'all_at_once') in hr-HR; the JSON download is named kitchen-brief-*.json.
   FIX: Route the four wrap-up rows through optionLabel('sinkPosition'|'cookerType'|'gas'|'ventPath'|'phasing'|'permits') as MakerDashboardPreview already does; stop storing English basis/disclaimer in the bundle (render from i18n on both sides); rename the badge to '
[20] LOW/robustness/S — /api/handoff legacy path still creates ownerless projects and briefs from any signed-in account
   @ src/app/api/handoff/route.ts:106
   A POST without projectId (from any session, including a maker) inserts a project with no maker_id/customer_id and a brief with maker_id null, which the DAL refuses to everyone, then emails MAKER_NOTIFY_EMAIL. Now that every customer has exactly one project, this path only produces unreadable rows. The body is also unvalidated (no schema) before being stored as the brief.
   FIX: Require `projectId` when session.role === 'customer' and answer 404 for makers; keep `persist: false` for the harness/tests. Add a zod schema for the handoff body (brief shape, max sizes) and 400 on failure.
   NOTES: Read: WORKLOG from 2026-09-19 to end, product-foundations (patterns D–F, MVP must-haves, DoD), app-analysis.md (H2 $-currency and M7 'what happens next' are fixed; H3 is partly fixed — line items exist but SKUs still missing, reported as finding 16; M4 estimate framing drift persists in a new form, finding 4). No files modified, no server, no browser.

Owner decisions respected: invite-only (no self-serve maker signup, DoD #1 out of scope), no wrap-up signature, homeowner sees retail only (finding 11 enforces it rather than changing it), builder step skippable (finding 4 keeps the skip, fixes the honesty of what it produces). Finding 15 (budget) is framed as 'decide and record' because the WORKLOG has no explicit entry, only a code comment.

Dropped for the 20 cap (all low): (a) maker_notified_at / MAKER_NOTIFY_EMAIL comment says 'BCC for monitoring' but no BCC is implemented (maker-emai

######## read:cost-model (18) ########
[1] CRITICAL/honesty-trust/M — The kitchen range is the maker's cost sheet, not a price: no margin, no overhead, wholesale boards + raw labour hours
   @ src/lib/builder/bom.ts:349
   Works lines price boards at Elgrad's wholesale cjenik (Veleprodajni cjenik) and labour at rates the code itself calls "the maker's real cost sheet" (30 €/h design, 1 €/CNC position, 15 €/carcass, 75 €/m install). There is no margin, overhead, or contingency term anywhere in bom.ts. The result (18-unit L-kitchen: 4,266–5,899 €, of which "make" is 782–881 €) is what a kitchen costs the shop to produce, shown to the hom
   FIX: Add an explicit margin/overhead band to the works total (e.g. rate card `marginPct: {low: 0.30, high: 0.45}` applied to material+make, surfaced as its own line "Rad radionice i marža") so the headline is a selling price; keep the raw cost sheet as the maker-on
[2] CRITICAL/honesty-trust/S — VAT (PDV 25%) is mixed and never stated: works are net wholesale/cost, goods are gross retail, summed as one total
   @ src/lib/builder/bom.ts:1043
   Appliance, sink/tap and picked-hardware prices are "retail incl. VAT" (Elgrad webshop) or "curated reference RRP incl. VAT" (Schachermayer), while boards come from the wholesale cjenik and labour from a cost sheet (net). computeBom adds them into `total` / "Ukupno s uređajima" and no surface says whether PDV is included. The string "PDV" does not exist in src/.
   FIX: Pick one basis (gross, incl. 25% PDV, for the homeowner) in computeBom: multiply net lines by a `VAT_RATE` constant from the rate card, leave `retail_incl_vat` picks as-is, and add a one-line footer under every headline (builder panel, dock, wrap-up, maker vie
[3] HIGH/honesty-trust/S — Skipping the builder sends a fabricated constant 9,600–14,400 € "±20%" range to the homeowner and the maker
   @ src/lib/stub-estimate.ts:61
   BuilderEntry has a "Preskoči — pošalji samo osnovni brief" action. With no builderState, buildHandoffBundle falls back to buildStubEstimate, which keys off `budgetRange` (never set by any step) and `scope` (the scope step was cut 2026-09-23 and nothing writes profile.scope), so it always returns SCOPE_MIDPOINTS_USD[0] = 12,000 → 9,600–14,400. That number is stored as estimate_low/high, shown on the wrap-up, the custo
   FIX: When `brief.builderState` is absent, set `estimate = null` and show "Raspon stiže nakon što prođeš gradnju" on the wrap-up / status page, `—` in the dashboard list and email. Delete stub-estimate.ts and the `placeholder` branch copy.
[4] HIGH/product-gap/M — Scope gating and trade allowances are dead code since the scope step was cut; exclusions (delivery, demolition, electrical/plumbing, templating) are neither priced nor stated
   @ src/lib/builder/bom.ts:980
   LINE_SCOPE_KEY/lineInScope and the ALLOWANCE lines only act when `opts.scope` has keys, but no step writes `profile.scope` any more, so for every new journey scope is undefined: nothing is ever dropped, no allowance is ever emitted, and the homeowner is never told what the range leaves out. Delivery, worktop templating/cut-outs (only +25 € per mitre join on the high end), removal of the old kitchen, appliance hook-up
   FIX: Either (a) re-ask three yes/no scope items inside the logistics step (old kitchen removal, electrical/plumbing moves, delivery floor/lift) so the allowance lines fire again, or (b) remove the scope plumbing and emit a static "Nije uključeno: dostava, rušenje s
[5] HIGH/product-gap/M — Wrap-up shows a bare headline: no breakdown, no assumptions, no opt-out — Pattern H unmet on the one surface it governs
   @ src/components/kitchen-intake/WrapUpScreen.tsx:229
   The wrap-up renders only estimate.low/high, optional withAppliances and one sentence of basis. `estimate.lines` (stored for the maker) is never rendered to the homeowner, there is no "based on: …" list derived from the build (supply choices, carcass, hardware tier, installation included), and there is no way to request the brief without seeing the range.
   FIX: Render `estimate.lines` grouped (Kuhinja / Uređaji / Radovi) under the headline with the same i18n keys the maker view uses; add an `assumptions` array to BomEstimate built from state (supply, carcass, tier, LED, plinth, installation in/out, PDV basis) and lis
[6] HIGH/honesty-trust/S — Pressing Continue stamps every untouched AI default as 'homeowner-confirmed', which the band model treats as H
   @ src/lib/builder/state.ts:527
   confirmGroupMetas flips provenance of all fields in a screen to 'homeowner-confirmed' when the homeowner moves on, and effectiveConfidence maps that provenance to H (half-width ×0.6) regardless of the stored confidence. An AI guess at L that was merely scrolled past narrows the line as if verified, and the brief stores a provenance that is literally untrue.
   FIX: Add provenance 'homeowner-seen' for the walk-past case; map it to at most M in effectiveConfidence (keep the field's own confidence if better). Reserve 'homeowner-confirmed' for an explicit accept chip and 'homeowner-edited' for edits. Update band-invariant's 
[7] HIGH/bug/S — Worktop families compact / solid wood / stainless are priced at the laminate 38 €/m fallback; thickness never moves the price; quartz/sintered are low guesses
   @ src/lib/builder/bom.ts:496
   When no catalog decor is set, the €/m falls to quartz 90, sintered 130, else 38 — so compact (Fenix-type), solid wood and stainless all get the laminate rate. `thicknessMm` (38/20/12) appears only in the detail string. The probe shows a 10 m compact top at 267–685 € and 38 mm vs 20 mm quartz identical.
   FIX: Replace the ternary with a `WORKTOP_RATE_M: Record<WorktopFamily,{low,high}>` table (laminate 32–74 from catalog, compact ~150–250, quartz ~180–320, sintered ~250–400, solid wood ~120–200, stainless ~250–400 €/m — maker to confirm) plus a thickness factor; mar
[8] HIGH/honesty-trust/S — "Exact" / "točno" is claimed for picks whose price is a curated guess, and goods collapse to a single number
   @ src/lib/builder/bom.ts:874
   `pickedPriceEur` carries no price basis, so a Schachermayer pick (hand-stamped reference RRP from a May scrape, `priceBasis: 'reference_estimate'`) is treated identically to a dated Elgrad shelf price: the line gets `exact: true`, the maker view shows a green "točno" badge, and LiveBOMPanel prints one number instead of a range.
   FIX: Carry `pickedPriceBasis` + `pickedObservedAt` into ApplianceSelection / sink / tap / hardware state; in computeBom set `exact` only for `retail_incl_vat` picks and give `reference_estimate` picks a ±10% band; show "ref. cijena · {date}" instead of "točno" for 
[9] MEDIUM/honesty-trust/S — capBand silently narrows the band, bandCapped is shown nowhere, and the per-line / breakdown sums then disagree with the headline
   @ src/lib/builder/bom.ts:1029
   When raw works spread exceeds ±20%, capBand pulls low up and high down and sets `bandCapped`, but no component reads that flag. The lines and the material/make/install breakdown are not capped, so they no longer sum to the headline (the comment on the type claims they do). The displayed width is otherwise a product of hand-set spreads and fixed multipliers — a constant, not a measurement.
   FIX: Keep the cap, but (1) when `bandCapped` show a small note on the maker view and wrap-up ("raspon sužen na ±20%; sirovi raspon X–Y"), (2) scale works lines proportionally so lines/breakdown reconcile, or expose `worksRaw` on the estimate and show it to the make
[10] MEDIUM/ux-confusing/S — Builder panel shows "Uređaji, sudoper i slavina 0 € – 0 €" and "Ukupno s uređajima" when the homeowner is buying them
   @ src/components/builder/LiveBOMPanel.tsx:53
   The default supply is homeowner_supplies, so no goods lines exist; LiveBOMPanel still renders the goods row as a 0 € – 0 € range and a total labelled "incl. appliances" equal to the works figure. Nothing says the appliances are simply not in the number.
   FIX: When there are no goods lines, replace the row with "Uređaji, sudoper i slavina — kupac nabavlja, nije uključeno" and relabel the total "Ukupno (bez uređaja)"; same in MobileRangeDock.
[11] MEDIUM/bug/S — A curated decor with a null worktop price silently prices at the 38 €/m laminate fallback with no widening (prior-audit M5 still present)
   @ src/lib/builder/bom.ts:500
   The worktop line widens only when the decor is missing (`!wtDecor`); a decor that exists but has `worktop600: null` (H1180 ST37 Halifax hrast natur, offered in the worktop picker) falls to 38 €/m with no missing-source widening, although its 920 mm price is 117.41 €/m.
   FIX: Treat `wtPricePerM == null` after a found decor as missingSource (pass `!wtPricePerMFromCatalog` to widenByConfidence), derive 600 from 920 × 0.6 when only 920 exists, and have refresh-elgrad-curated.mjs drop 'worktop' from `uses` when both worktop prices are 
[12] MEDIUM/product-gap/M — No rate card: labour, carcass €/m², sink/tap/appliance class bands and allowances are code constants a maker cannot tune
   @ src/lib/catalog/maker-pricing.ts:30
   maker-pricing.json only overrides picked SKUs. Every model parameter that actually drives the works range — labour rates, carcass board price, fronts €/m² for MDF/alu, sink/tap class prices, appliance bands, trade allowances, confidence multipliers — is hard-coded in bom.ts, so a second maker, a regional rate, or a price refresh needs a code change and deploy. The copy calls these "Croatian-market" figures while they
   FIX: Extract all tunables into `src/lib/catalog/rate-card.json` (typed, with `basis`/`asOf`/`vat` per block) loaded by computeBom with today's values as defaults; later key by maker account. Expose it read-only on the maker dashboard so they can see what they are b
[13] MEDIUM/honesty-trust/M — Brief lines carry no price provenance, date or confidence — maker cannot tell a dated Elgrad price from a hand-set band
   @ src/lib/builder/bom.ts:60
   BomLineItem has detail/quantity/low/high/exact only. The sources behind a line (Elgrad VPC 2026-09-09, webshop 2026-09-19, Schachermayer curated 2026-05/06, hand-set bands, cost-sheet labour) and the worst driving confidence are computed inside computeBom and thrown away, so the maker's "Kupčeva gradnja" list and the homeowner panel show undifferentiated ranges.
   FIX: Add `confidence: 'H'|'M'|'L'`, `basis: 'catalog'|'reference'|'rate-card'|'allowance'` and `asOf?: string` to BomLineItem, set them where each line is pushed, and render a pill + date in BuildLines and LiveBOMPanel.
[14] MEDIUM/ux-confusing/S — Range rounding disagrees across surfaces: maker headline rounds to whole thousands, everything else prints to the euro
   @ src/components/kitchen-intake/MakerDashboardPreview.tsx:33
   MakerDashboardPreview.fmtMoney prints `Math.round(n/1000)k €`, so 4,266–5,899 € (±16%) reads "4k € – 6k €" (±20%) and a 1,490 € line would read "1k €"; the email, dashboard list, status page and wrap-up print exact euros ("4.266 € – 5.899 €"), which is false precision for an estimate.
   FIX: One `formatRange(low, high, locale)` in bom.ts that rounds endpoints to the nearest 50 € (<2k) / 100 € (≥2k) and is used by every surface; delete the three local helpers.
[15] LOW/bug/S — Worktop always priced at 600 mm width, including islands and peninsulas
   @ src/lib/builder/bom.ts:489
   worktopPricePerM is called with a fixed 600, although the catalog carries 920 mm prices (~1.7× 600) and the layout knows about islands/peninsulas.
   FIX: Split worktop metres by run (`isIsland`/peninsula → 920 price, else 600) in computeBom; fall back to 600 × 1.6 when the 920 price is null.
[16] LOW/bug/S — Hardware counts under-count handles and picked hinges per unit
   @ src/lib/builder/bom.ts:653
   Handles are counted one per non-tall unit (a 4-drawer bank needs 4, an 800 mm doors unit 2); when a hinge model is picked, hinges are priced only for zero-drawer patterns, so drawer_door_combo, oven_housing and pullouts_inside_doors (which have doors) get no hinges.
   FIX: Add `doorCount`/`handleCount` to PatternSpec (by width band) and use them for handles and picked hinges.
[17] LOW/hygiene/S — class-band-grounding test mirrors APPLIANCE_PRICE by hand copy; drift passes silently
   @ tests/class-band-grounding.test.ts:19
   The test that keeps appliance bands grounded in the catalog declares its own copy of the bands "kept in sync by review". If bom.ts changes and the test copy does not, the test still passes.
   FIX: Hoist APPLIANCE_PRICE (and APPLIANCE_CONFIG_FACTOR) to module scope, `export` them, import in the test; do the same for the fridge/wine/coffee bands once Elgrad rows exist.
[18] LOW/hygiene/S — Catalog data hygiene: mis-parsed worktop920 prices, a duplicate oven, and a wine cooler classified as a fridge
   @ src/lib/catalog/elgrad-decors.json:525
   elgrad-decors.json has worktop920 = 10.34 for H3303 and H3702 (siblings are 57–66; a column snap error), Schachermayer's appliance list contains the Electrolux EOF3H50BK twice under two SKU spellings, and build-elgrad-catalog's rule order types 'AMICA Hladnjak za vino' as `fridge` because 'hladnjak' matches before 'vinsk'.
   FIX: Add a sanity check to parse-elgrad-cjenik.mjs (worktop920 must be ≥ worktop600), reorder the classifier rules (wine_fridge before fridge), dedupe Schachermayer by normalised SKU; add a catalog-integrity test.
   NOTES: Method: read bom.ts in full plus unit-assembly/cabinet-patterns/cabinet-suggest/inventory/stub-estimate, catalog loaders + JSON (1,164 Elgrad webshop rows all priced, dated 2026-09-19; 33 curated decors all with iverica18, 23 with null worktop600; Schachermayer 29/22/23 rows all hand-priced, scraped 2026-05-03), the 7 listed tests + snapshot, display components, bundle.ts, handoff route, email, dashboard/status pages, WORKLOG from the Revival heading, app-analysis.md, Pattern H. Ran one throwaway probe script from the scratchpad with tsx (no repo files changed; a temp test file was created and deleted in the same command before the tsx approach — git status clean). Fixture totals today: single 2,377–3,134; island 3,696–4,678; l-shape 4,266–5,899; galley 4,519–5,966; peninsula 5,173–6,665; u-shape 6,929–9,622 € — all displayed ±12–17%, ±9–14% when every meta is confirmed.

Toni decisions 

######## read:intake-flow (19) ########
[1] CRITICAL/honesty-trust/S — Skipping the builder yields a fabricated 9,600–14,400 € range from a USD stub with zero inputs
   @ src/lib/stub-estimate.ts:22
   When the homeowner takes 'Preskoči — pošalji samo osnovni brief', `buildHandoffBundle` falls back to `buildStubEstimate`, which with no budget band and no scope (both no longer asked) returns SCOPE_MIDPOINTS_USD[0] = 12000 ±20%. That number is rendered as euros on the wrap-up, stored as estimate_low/high on the brief, put in the maker email subject and shown on the customer's /kitchen home as 'Procjena: …'. The wrap-
   FIX: Delete `src/lib/stub-estimate.ts`. In `buildHandoffBundle`, `estimate = null` unless `brief.builderState` exists; wrap-up shows 'wrapup.estimate.unavailable' with one line 'Raspon dobivaš kad sastaviš kuhinju'; email range 'nije dostupno'; kitchen home hides t
[2] HIGH/product-gap/M — Wrap-up says 'review and fix anything wrong' but the brief is already sent and nothing is fixable
   @ src/components/kitchen-intake/WrapUpScreen.tsx:147
   The wrap-up header reads 'Pregledaj što šaljemo — ispravi sve što ne valja', yet `loadBundle()` fires on mount (the brief is inserted and the maker emailed before the homeowner has read a line) and every section passes `onFix={null}`, so the 'Nešto ispraviti?' button never renders. Pattern C of the foundations ('Here's what I'll send to your maker. Anything I got wrong?') is inverted.
   FIX: Split the wrap-up into review → send: on finalise render the summary with a primary 'Pošalji izrađivaču' button and do not call /api/handoff on mount. Wire `onFix` per section to `goTo(stepId)` (set `isDone=false`, keep `wrapUpData`), so the rail step is re-en
[3] HIGH/ux-confusing/M — 'Izmijeni kuhinju' after submit is a dead end: lands on the done screen with only a re-submit button
   @ src/components/kitchen-intake/index.tsx:697
   KitchenHome promises 'Izmijeni kuhinju' and 'Ako nešto izmijeniš, {maker} dobiva obavijest o izmjeni'. Entering the intake restores the snapshot with `isDone=true`, which renders the wrap-up branch; the funnel rail steps have no `onSelect`, 'Počni ispočetka' is `hidden` in project mode, and WrapUpScreen has no back. The only action is 'Pošalji ponovno', which creates a new identical brief.
   FIX: In project mode, when `hasExistingBrief` and the customer clicks 'Izmijeni', open the intake at `contact` (or the last visited step) with `isDone=false` so Back/Continue work; make done funnel steps in the rail navigable (`onSelect: () => goTo(id)`) for comple
[4] HIGH/bug/S — Stale local IndexedDB copy silently overwrites newer work done on another device
   @ src/components/kitchen-intake/index.tsx:196
   On mount in project mode the local snapshot wins whenever it is 'worth resuming', with no comparison to the server copy. `useProjectCheckpoint` starts at `initialRevision = project.revision` (the server's current revision), so the first debounced checkpoint carries a matching baseRevision and the server's conditional update accepts the stale snapshot, replacing everything done on the other device.
   FIX: Persist `revision` in the IndexedDB record (`saveSnapshot(snapshot, projectId, revision)`); on load prefer local only if `rec.revision >= initialRevision`, otherwise apply `initialSnapshot` and merge in the local images (spacePhotos/renders/inspirationRefs by 
[5] HIGH/robustness/M — Second-device resume restores 'omitted://image' placeholders and feeds them to the AI endpoints
   @ src/components/kitchen-intake/index.tsx:209
   Checkpoints strip images to the `OMITTED_IMAGE` marker, but nothing on the client recognises it on the way back. A customer who continues on another device gets `spacePhotos = ['omitted://image']` and renders whose `imageDataUrl` is the marker: ConceptRender autostarts and POSTs it as `anchorPhoto` (400 'Missing or invalid anchorPhoto' → 'Nije moguće generirati render'), `loadHypothesis` sends it as `renderImage`, Re
   FIX: Short term: in `applySnapshot` drop `OMITTED_IMAGE` from `spacePhotos`, `inspirationRefs`, `productReferences`; keep renders but flag `imageMissing`, skip autoStart/hypothesis when the chosen render has no image, and show a calm note 'Fotografije ostaju na ure
[6] HIGH/bug/S — Typing a wall length on the confirm card does not stamp homeowner confidence, so the band and provenance stay 'AI estimate'
   @ src/components/builder/LayoutConfirm.tsx:119
   `withWallLength` on the contract card only re-validates the room; `room.confidence`/`source`/`measurementMethod` stay 'M'/'ai_vision'/'photo_only' (or 'L'/'preset'). The canvas DimInput, by contrast, stamps H/homeowner. Contract runs inherit `plan.room.confidence`, the builder's `meta.runs` is the worst run confidence, and labour lines narrow by it, so a measured number keeps the AI-width band and the maker's brief s
   FIX: In `withWallLength` set `room: { …room, confidence: 'H', source: 'homeowner' }` and `measurementMethod: 'homeowner_only'` when it was 'photo_only' (or add a 'photo_plus_homeowner' value). Add a test: card edit → contract run confidence H → bom labour band narr
[7] HIGH/honesty-trust/S — Step 4 claims 'what we measured' though nothing was measured, and never asks the homeowner for a tape-measure number
   @ src/lib/i18n/locales/hr-HR.ts:64
   The confirm card is titled 'Provjeri što smo izmjerili' and step 1 says 'Snimili smo tvoj prostor', while dimensions are an AI photo estimate (confidence M) or a shape preset (L); WORKLOG notes they vary run to run (320×240 / 360×260 / 420×260). The card prints lengths as plain numbers with no provenance (only the canvas dashes L elements inside a panel). The intake catalog's dimensions mini-form ('Do you have rough 
   FIX: Retitle to 'Provjeri dimenzije — AI ih je procijenio s fotografije'; show a pill per wall length ('procjena' / 'izmjereno', from `plan.room.confidence`) on the card; add one sentence above the card: 'Imaš metar? Upiši dužine zidova — to najviše sužava raspon' 
[8] HIGH/ux-confusing/M — Confirm step is two overlapping editors with trade vocabulary — closer to a CAD tool than a confirmation
   @ src/components/kitchen-intake/floor-plan-editor/Editor.tsx:223
   One plan is edited on two surfaces: the Konva canvas (drag walls/openings/appliances, undo/redo, keyboard shortcuts, cm/ft+in toggle, per-wall counter depth 50–70 cm, counter start/length anchors, open sides, passages) and the LayoutConfirm card (wall lengths again, per-unit chips where the homeowner chooses 'Magični kut' vs 'Lazy Susan kut', 'Vinska izvlaka', 'Visoka spremišna izvlaka'). The floor-plan model's own h
   FIX: Progressive disclosure, no feature removal: default view = static plan picture + per-wall sentence rows ('Gornji zid · 380 cm · 5 dolje / 4 gore · sudoper, ploča') with length input and upper/tall toggles; put the canvas and the unit-chip editor behind 'Prilag
[9] MEDIUM/honesty-trust/S — '{maker} vidi tvoj napredak' is unconditional; checkpoint conflict/error states are never shown
   @ src/components/kitchen-intake/index.tsx:849
   `useProjectCheckpoint` exposes `state` ('conflict' halts all writes for the session, 'error' on any 4xx, 'pending' on retries) but no component reads it (`checkpoint.state` is unused). The rail footer still says the maker sees progress, and the maker dashboard shows a stale step.
   FIX: Add a tiny save line under the rail driven by `checkpoint.state`: 'Spremljeno' / 'Spremam…' / 'Nije spremljeno — otvoreno na drugom uređaju. Osvježi' (reload CTA for conflict); render `kitchen.makerSees` only when state is 'saved' or 'idle'.
[10] MEDIUM/bug/S — Choosing a different render after the layout was derived keeps the old render's layout and decor hypothesis
   @ src/components/kitchen-intake/index.tsx:675
   The confirm_look effects run once: `loadHypothesis` is skipped when `builderHypothesis` exists and the floor plan is never reseeded when `floorPlan` exists. `chooseRender` only sets ids. Back → regenerate → 'Odaberi ovo' → Continue shows render #1's walls/island and the builder prefills decor from render #1 while displaying render #2 as the anchor.
   FIX: In `chooseRender`, when the id changes: `setBuilderHypothesis(null); setHypothesisError(null)`; if `!hasHomeownerEdits(floorPlan)` also `setFloorPlan(null)` so it reseeds, else keep the edits and show one line 'Zadržali smo tvoje izmjene tlocrta'. Test: choose
[11] MEDIUM/robustness/S — Wishlist is a hard dead end when the translate-wishlist call fails
   @ src/components/kitchen-intake/index.tsx:489
   `commitWishlist` requires a successful AI translation to advance; on failure it shows an error with Retry and the footer Continue just retries. The only way past an outage is to delete what you wrote.
   FIX: On failure store the raw text as `TranslatedField { verbatim, trade: verbatim, confidence: 'L', provenance: 'untranslated' }` and advance; show 'Spremili smo tvoje riječi doslovno — izrađivač ih čita kakve jesu'. Let /api/handoff or the maker view translate la
[12] MEDIUM/ux-confusing/S — Continue on the photo step skips the only cm-scale read without saying so
   @ src/components/kitchen-intake/index.tsx:1395
   After uploading photos the footer button reads 'Nastavi' and is always enabled; pressing it before 'Pročitaj moj prostor' commits photos with `spaceVision = null`. The layout then seeds from the render hypothesis with preset dimensions (confidence L), and the only source of real scale in the whole flow was never consulted.
   FIX: When photos exist and `spaceVision` is null, make the footer primary action run `analyze()` ('Pročitaj i nastavi') and offer a secondary text link 'Nastavi bez čitanja'. Lift `analyze` via a ref/callback from SpaceCapture.
[13] MEDIUM/robustness/S — Render-vision failure on the confirm step is silent; the plan quietly falls back to photo-only
   @ src/components/kitchen-intake/index.tsx:689
   `hypothesisError` is only rendered inside `BuilderEntryBody` (next step). At confirm_look the loader says 'Iščitavam raspored iz tvoje vizualizacije…', then on error `layoutPending` flips false and the plan seeds from the photo read with no message, so the homeowner confirms a layout that ignores the render they just chose.
   FIX: Pass `hypothesisError` to the confirm_look StepBody and show an amber one-liner with Retry ('Nismo uspjeli pročitati raspored iz rendera — tlocrt je iz fotografije. Pokušaj ponovno'); on retry success reseed if `!hasHomeownerEdits(floorPlan)`.
[14] MEDIUM/ux-confusing/S — Footer Continue stays enabled while a paid render is generating, and 'Odaberi ovo' is cosmetic
   @ src/components/kitchen-intake/index.tsx:951
   `isBusy` for the footer only covers translating/finalising, so the homeowner can leave the render step mid-generation (the server has already counted one of the 5 renders). Separately, `chosenRender` falls back to the latest render, so continuing without 'Izgleda dobro — odaberi ovo' uses the newest render anyway; the choice only changes the rail read-back.
   FIX: Lift `isGenerating` (callback prop) and include it in `isBusy`; make the footer label on this step 'Koristi ovaj render' and have it call `chooseRender(latest.id)` before `goNext`, or hide the in-card choose button. Keep 'Preskoči render' as the explicit no-re
[15] MEDIUM/security/S — Maker in readOnly mode can drive the whole intake, spend renders and store the customer's journey locally
   @ src/components/kitchen-intake/index.tsx:174
   `readOnly` only unsets the checkpoint projectId. Every step, AI call (space-vision, render-concept under the maker's own rate-limit key, builder-hypothesis) and the wrap-up still run; IndexedDB saves the customer's journey under `project:<id>` in the maker's browser; only `/api/handoff` finally refuses with 404.
   FIX: Thread `readOnly` into StepBody/BuilderShell: disable footer Continue and all AI buttons, skip `saveSnapshot` and autoStart, show a banner 'Pregledavaš kupčev napredak'. Or route the maker to the brief view/snapshot summary instead of mounting KitchenIntake.
[16] MEDIUM/product-gap/S — Two site-visit facts a Croatian maker needs are never asked: who removes the old kitchen, and whether sink/hob stay put
   @ src/components/kitchen-intake/index.tsx:1107
   Not a re-proposal of the cut scope step (Toni 2026-09-23: 'ask only what moves the first quote'). These two are first-visit facts, not scope: the render-derived plan places sink/hob where the *design* puts them, the photo read saw where they *are*, and nothing compares or asks. Demolition/disposal and plumbing moves are what makers get surprised by on day one (catalog 2.2, 4.1).
   FIX: Two chip rows on the logistics step with 'Ne znam' as a first-class option: 'Staru kuhinju uklanja: ja / izrađivač / prostor je prazan' → `scope.demolitionDisposal` + note; 'Sudoper i ploča ostaju gdje jesu? da / ne / ne znam' → `trades.plumbing.sinkPosition`.
[17] LOW/honesty-trust/S — Ceiling height has no provenance: caption says 'AI procjena' after the homeowner typed it, and a silent 280 cm default is shown as fact
   @ src/components/kitchen-intake/LayoutReview.tsx:83
   LayoutReview captions the ceiling input 'AI procjena — ispravi ako treba' whenever any value exists, including one the homeowner just entered. When neither the photo read nor the render supplied one, the contract substitutes `DEFAULT_CEILING_CM = 280` and the confirm card prints 'Strop: 280 cm' as if known.
   FIX: Add `ceilingSource?: 'ai_vision' | 'render' | 'homeowner' | 'default'` on FloorPlan (set in fromVision/derive-layout/LayoutReview onChange); caption from it; on the card show 'Strop: ~280 cm (pretpostavljeno)' when defaulted and carry the source into the contr
[18] LOW/hygiene/S — Homeowner wrap-up still shows the 'Demo: pogledaj što vidi izrađivač' button to the English preview
   @ src/components/kitchen-intake/WrapUpScreen.tsx:560
   The wrap-up renders a demo button that opens `MakerDashboardPreview` (English throughout per WORKLOG 09-24) even in project mode, right next to the real `bundle.makerPath` link. The code comment says production removes it.
   FIX: Render the demo button only when `!projectId` (anonymous funnel) or behind `process.env.NEXT_PUBLIC_SHOW_MAKER_DEMO`; keep `bundle.makerPath`.
[19] LOW/copy/S — 'No anchor photo' copy promises catalog references in the brief that do not exist
   @ src/lib/i18n/locales/hr-HR.ts:629
   When photos were skipped, the render step says the brief will use 'reference iz kataloga' instead; the wrap-up is always given `explorationRefs={[]}` and no code path produces catalog references.
   FIX: Change the copy to 'Preskačemo render — izrađivač radi iz tvoje inspiracije i tlocrta.' and drop the `explorationRefs` prop/field if nothing else uses it.
   NOTES: Ordering: the stub estimate (1) is the only critical; findings 2–3 share a fix (review-before-send + navigable rail) and could ship as one stacked pair; 4–5 are the cross-device pair (5's proper fix is 'media at capture time', already in WORKLOG as open). Decisions I did NOT re-propose: no up-front budget band (flow.ts comment: 'the live range is the budget conversation'), the cut scope step and 'where will you live during works' (2026-09-23), priorities invest/flex (LOOP Q2 open), the per-unit editor itself (built on request), render-before-floor-plan ordering (split off 'discuss first'). One decision that now looks blocking: 'the estimate is the kitchen' plus no scope question means the homeowner-facing range never states what it excludes (demolition, plumbing/electrical, flooring); a single exclusions line under the range ('Ne uključuje: uklanjanje stare kuhinje, vodu/struju, podove')