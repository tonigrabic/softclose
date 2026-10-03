-- softclose — the maker's decision on a brief (v1, 2026-10-03)
--
-- Until IMP-03 the three buttons on /maker/<id> flipped local state only:
-- maker_status never moved past 'viewed' and nothing recorded what the maker
-- actually quoted, so the ±20% hit rate (DoD #6) could not be measured.
-- maker_note exists since 0001; re-declared here as a no-op to document it.
-- maker_status's check (0001) already allows quoted/clarify/declined.
--
-- Pre-check before production (read-only), expect only new/viewed:
--   select maker_status, count(*) from public.softclose_briefs group by 1;
--
-- Apply (local stack):
--   docker exec -i supabase_db_softclose psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < db/migrations/0007_maker_decision.sql
-- (`supabase db query --local -f` refuses multi-statement files.)
--
-- Apply before deploying the code that reads these columns: the brief guard
-- (requireBriefAccess) selects them, and a missing column would 404 every
-- /maker/<id> page.

begin;

alter table public.softclose_briefs
  add column if not exists maker_note text,
  add column if not exists decided_at timestamptz,
  add column if not exists quoted_eur numeric(12,2);

alter table public.softclose_briefs drop constraint if exists softclose_briefs_maker_note_len;
alter table public.softclose_briefs add constraint softclose_briefs_maker_note_len
  check (maker_note is null or char_length(maker_note) <= 1000);

-- > 0, not >= 0: a 0 € quote would poison the hit-rate ratio.
alter table public.softclose_briefs drop constraint if exists softclose_briefs_quoted_eur_range;
alter table public.softclose_briefs add constraint softclose_briefs_quoted_eur_range
  check (quoted_eur is null or (quoted_eur > 0 and quoted_eur <= 1000000));

-- A quoted brief always carries its amount, and nothing else carries one
-- (quoted is terminal per brief, so the amount is never orphaned).
alter table public.softclose_briefs drop constraint if exists softclose_briefs_quote_has_amount;
alter table public.softclose_briefs add constraint softclose_briefs_quote_has_amount
  check ((maker_status = 'quoted') = (quoted_eur is not null));

-- A decision carries its time; new/viewed never do.
alter table public.softclose_briefs drop constraint if exists softclose_briefs_decision_has_time;
alter table public.softclose_briefs add constraint softclose_briefs_decision_has_time
  check ((maker_status in ('quoted', 'clarify', 'declined')) = (decided_at is not null));

comment on column public.softclose_briefs.quoted_eur is
  'The maker''s first formal quote for this brief: the works (make + install, incl. PDV, no appliances). Written once — quoted is terminal per brief. Compared with estimate_low..estimate_high for the ±20% hit rate (WORKLOG, IMP-03).';
comment on column public.softclose_briefs.decided_at is
  'When maker_status last moved to quoted/clarify/declined.';

commit;
