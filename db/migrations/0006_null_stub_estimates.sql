-- softclose — clear the fabricated stub range from briefs already sent (v1, 2026-10-03)
--
-- Until IMP-01, a homeowner who skipped the builder got a range anyway: a table
-- of USD midpoints keyed on a budget band and a scope count that no step sets
-- any more, so it always came out 12,000 ±20% and was shown as 9,600–14,400 €
-- on the wrap-up, the kitchen home, the maker's list and the email subject.
-- New briefs now carry no range when there is no build. This takes the number
-- off the ones already stored, so every surface reads them the same way.
--
-- The stub is recognisable in the stored bundle by `estimate.placeholder`,
-- which only it ever set to true. Idempotent: a second run matches nothing.
--
-- Apply (local stack):
--   docker exec -i supabase_db_softclose psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < db/migrations/0006_null_stub_estimates.sql
-- (`supabase db query --local -f` refuses multi-statement files.)

begin;

update public.softclose_briefs
set estimate_low = null,
    estimate_high = null,
    estimate_all_in_low = null,
    estimate_all_in_high = null,
    band_pct = null,
    bundle = jsonb_set(bundle, '{estimate}', 'null'::jsonb)
where bundle->'estimate'->>'placeholder' = 'true';

-- The maker's list reads the range denormalised onto the project. Clear it for
-- every project whose current brief has no range left. The touch trigger is
-- held off for this one statement: a data fix is not the customer editing, and
-- a bumped updated_at would flag every one of these projects as "changed after
-- you got the brief" on the maker's list.
alter table public.softclose_projects disable trigger softclose_projects_touch_trg;

update public.softclose_projects p
set est_low = null,
    est_high = null,
    est_band_pct = null
from public.softclose_briefs b
where b.id = p.current_brief_id
  and b.estimate_low is null
  and (p.est_low is not null or p.est_high is not null);

alter table public.softclose_projects enable trigger softclose_projects_touch_trg;

commit;
