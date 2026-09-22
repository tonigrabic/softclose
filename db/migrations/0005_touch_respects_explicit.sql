-- softclose — let a caller set updated_at explicitly (v1, 2026-09-22)
--
-- The touch trigger unconditionally stamped now(), which makes one thing
-- impossible: writing a row whose updated_at equals another row's created_at.
--
-- That matters because the maker's list derives "the customer changed something
-- after you got the brief" from `project.updated_at > brief.created_at`. On
-- submit the brief is inserted and the project is then pointed at it, so the
-- project's updated_at always landed a few milliseconds later and EVERY fresh
-- brief arrived already flagged as an edit — which makes the flag meaningless
-- exactly when it matters.
--
-- The idiom: only stamp now() when the caller did not set updated_at itself.
-- Ordinary writes are unaffected; a caller that means a specific timestamp gets
-- to say so.
--
-- Apply:
--   supabase db query --linked -f db/migrations/0005_touch_respects_explicit.sql

create or replace function public.softclose_touch_updated_at()
returns trigger language plpgsql as $$
begin
  if new.updated_at is not distinct from old.updated_at then
    new.updated_at := now();
  end if;
  return new;
end $$;
