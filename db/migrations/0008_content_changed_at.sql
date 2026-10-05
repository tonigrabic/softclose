-- softclose — "changed since the brief" follows the kitchen, not every save (v1, 2026-10-04)
--
-- The maker's list flags a project "izmijenjeno" (and "· v2" once quoted)
-- when `updated_at > brief.created_at`. Every checkpoint stamps updated_at,
-- and since IMP-07 a homeowner whose brief went out walks back through the
-- steps from the review — "Izmijeni kuhinju" opens at the contact step, the
-- review's Back, a section's "Nešto ispraviti?", a rail step. Those saves
-- change the step, the done flag, sign-off stamps — never the kitchen — and
-- still raised the flag, which the homeowner could not clear: their review
-- says the maker has this version and offers nothing to send. updated_at
-- cannot simply be left alone on such a save either: the touch trigger
-- (0005) stamps now() whenever a write does not set it.
--
-- So the flag gets its own column:
--  - brief_print: the content print (lib/handoff/review briefPrint) of the
--    project's current brief, written by /api/handoff with current_brief_id.
--  - content_changed_at: when the journey's kitchen last differed from that
--    brief. The checkpoint route sets it to now when the saved profile's
--    print differs, and to null when it is the brief again (a look, a walk
--    back, a change undone). The handoff sets it to null.
-- updated_at stays the "last activity" time the list shows and sorts by.
--
-- Backfill: content_changed_at = updated_at for every project with a brief,
-- so each flag reads exactly as before. Done only when the column is first
-- added (a re-run must not re-flag rows the new code cleared), with the touch
-- trigger held off as in 0006: a data fix is not the customer editing.
--
-- Apply BEFORE deploying the code that reads/writes these columns: the
-- project guard and the maker's list select content_changed_at, and the
-- checkpoint and handoff writes set both.
--
-- Apply (local stack):
--   docker exec -i supabase_db_softclose psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < db/migrations/0008_content_changed_at.sql
-- (`supabase db query --local -f` refuses multi-statement files.)

begin;

alter table public.softclose_projects
  add column if not exists brief_print text;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'softclose_projects' and column_name = 'content_changed_at'
  ) then
    alter table public.softclose_projects add column content_changed_at timestamptz;
    alter table public.softclose_projects disable trigger softclose_projects_touch_trg;
    update public.softclose_projects
      set content_changed_at = updated_at
      where current_brief_id is not null;
    alter table public.softclose_projects enable trigger softclose_projects_touch_trg;
  end if;
end $$;

comment on column public.softclose_projects.brief_print is
  'Content print (briefPrint) of the current brief''s profile, written by /api/handoff with current_brief_id. Null for briefs sent before 0008.';
comment on column public.softclose_projects.content_changed_at is
  'When the journey''s kitchen last differed from the current brief (checkpoint route); null while it is that brief. The maker''s "changed since the brief" flag is content_changed_at > brief.created_at.';

commit;
