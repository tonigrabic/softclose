-- softclose — accounts, projects, magic-link tokens (v1, 2026-09-22)
--
-- One passwordless system, two roles. Makers sign in with an emailed link. A
-- customer's INVITE *is* their magic link: the maker issues it for an email,
-- which creates a pending customer account plus the one project it opens into.
-- Objects keep the softclose_ prefix; RLS is ON with NO policies, so only the
-- service role (server-side code) can read or write. There is no anon key in
-- this app — nothing here is reachable from a browser.
--
-- Apply (repo is linked via `supabase link --project-ref elowaiqwadmazwchzaft`):
--   supabase db query --linked -f db/migrations/0004_accounts_projects.sql
--
-- Re-runnable: every statement is guarded. The renames in section 1 must come
-- before section 3, which references softclose_projects.

-- ── 1. softclose_sessions IS the project row ────────────────────────────────
-- It already carries status / step / updated_at + touch trigger / profile, and
-- is written exactly once (at submit), so `draft` and `step` have always been
-- dead columns waiting for this. Renaming also ends a real ambiguity: "session"
-- already meant three things here (rate-limit bucket, IndexedDB snapshot, DB
-- row) and auth sessions would have made it four.
do $$
begin
  if to_regclass('public.softclose_projects') is null then
    alter table public.softclose_sessions rename to softclose_projects;
    alter trigger softclose_sessions_touch_trg on public.softclose_projects
      rename to softclose_projects_touch_trg;
    alter table public.softclose_projects rename constraint softclose_sessions_pkey
      to softclose_projects_pkey;
    alter table public.softclose_briefs rename column session_id to project_id;
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_constraint
             where conname = 'softclose_briefs_session_id_fkey'
               and conrelid = 'public.softclose_briefs'::regclass) then
    alter table public.softclose_briefs rename constraint softclose_briefs_session_id_fkey
      to softclose_briefs_project_id_fkey;
  end if;
end $$;

-- ── 2. Accounts ────────────────────────────────────────────────────────────
-- `email` keeps whatever casing the person typed (it goes in the greeting);
-- `email_norm` is the identity and the lookup key, so Ana@X.hr and ana@x.hr can
-- never become two accounts. No gmail dot/plus normalisation — that is a
-- support-ticket generator, not a security feature.
create table if not exists public.softclose_accounts (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  email         text not null,
  email_norm    text generated always as (lower(btrim(email))) stored,
  role          text not null check (role in ('maker', 'customer')),
  status        text not null default 'pending' check (status in ('pending', 'active', 'disabled')),
  name          text,
  locale        text,
  invited_by    uuid references public.softclose_accounts(id) on delete set null,
  -- Bumped to invalidate every cookie already issued to this account ("sign out
  -- everywhere"): the session JWT carries it and the DAL compares on each read.
  session_epoch integer not null default 1,
  last_login_at timestamptz
);
create unique index if not exists softclose_accounts_email_norm_key
  on public.softclose_accounts (email_norm);
create index if not exists softclose_accounts_role_idx
  on public.softclose_accounts (role, created_at desc);

-- ── 3. Projects: ownership, the live snapshot, and the denormalised range ───
alter table public.softclose_projects
  add column if not exists customer_id      uuid references public.softclose_accounts(id) on delete restrict,
  add column if not exists maker_id         uuid references public.softclose_accounts(id) on delete restrict,
  add column if not exists title            text,
  -- The whole in-progress journey (ProjectSnapshot), images as storage:// refs.
  add column if not exists snapshot         jsonb,
  add column if not exists snapshot_version integer not null default 1,
  -- Monotonic concurrency token. `updated_at` stays the human "last activity"
  -- field only: clock skew makes a timestamp a bad token for compare-and-set.
  add column if not exists revision         integer not null default 0,
  add column if not exists opened_at        timestamptz,
  add column if not exists current_brief_id uuid,
  -- Denormalised so the maker's list can show a range without loading snapshots.
  add column if not exists est_low          numeric(12,2),
  add column if not exists est_high         numeric(12,2),
  add column if not exists est_band_pct     integer;

comment on column public.softclose_projects.profile is
  'DEPRECATED — superseded by snapshot->''profile''. Kept for pre-0004 rows; no longer written. Drop once nothing reads it.';

-- Status vocabulary: draft/submitted → invited/in_progress/submitted/archived.
-- The check constraint kept its pre-rename name (verified against the live DB).
alter table public.softclose_projects drop constraint if exists softclose_sessions_status_check;
alter table public.softclose_projects drop constraint if exists softclose_projects_status_check;
update public.softclose_projects set status = 'in_progress' where status = 'draft';
alter table public.softclose_projects alter column status set default 'invited';
alter table public.softclose_projects add constraint softclose_projects_status_check
  check (status in ('invited', 'in_progress', 'submitted', 'archived'));

create index if not exists softclose_projects_maker_idx
  on public.softclose_projects (maker_id, updated_at desc);
create index if not exists softclose_projects_customer_idx
  on public.softclose_projects (customer_id, created_at desc);

-- Briefs carry the owner too, so /maker/<id> stays one indexed lookup instead
-- of a join through the project on every open.
alter table public.softclose_briefs
  add column if not exists maker_id uuid references public.softclose_accounts(id) on delete restrict;
create index if not exists softclose_briefs_maker_idx
  on public.softclose_briefs (maker_id, created_at desc);
create index if not exists softclose_briefs_project_idx
  on public.softclose_briefs (project_id, created_at desc);

-- ── 4. Magic-link tokens ───────────────────────────────────────────────────
-- Only the sha256 is stored; the raw token exists exactly once, in the email.
-- 32 random bytes is not brute-forceable, so a plain digest is enough — this is
-- not a password. `redirect_to` is validated server-side AT ISSUE TIME, so the
-- emailed URL carries no redirect parameter for anyone to tamper with.
create table if not exists public.softclose_auth_tokens (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  token_hash  text not null unique,
  purpose     text not null check (purpose in ('login', 'invite')),
  account_id  uuid not null references public.softclose_accounts(id) on delete cascade,
  project_id  uuid references public.softclose_projects(id) on delete cascade,
  issued_by   uuid references public.softclose_accounts(id) on delete set null,
  redirect_to text,
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  revoked_at  timestamptz,
  constraint softclose_auth_tokens_invite_has_project
    check (purpose <> 'invite' or project_id is not null)
);
-- Supports the DB-backed send limits (N tokens per account per hour), which are
-- the only rate limit that survives Vercel's per-instance memory.
create index if not exists softclose_auth_tokens_account_idx
  on public.softclose_auth_tokens (account_id, purpose, created_at desc);
create index if not exists softclose_auth_tokens_live_idx
  on public.softclose_auth_tokens (expires_at)
  where consumed_at is null and revoked_at is null;

-- ── 5. Triggers + RLS ──────────────────────────────────────────────────────
drop trigger if exists softclose_accounts_touch_trg on public.softclose_accounts;
create trigger softclose_accounts_touch_trg
  before update on public.softclose_accounts
  for each row execute function public.softclose_touch_updated_at();

alter table public.softclose_accounts    enable row level security;
alter table public.softclose_auth_tokens enable row level security;
