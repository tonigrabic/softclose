-- Maker notification + media offload bookkeeping.
alter table public.softclose_briefs
  add column if not exists maker_notified_at timestamptz,
  add column if not exists media_object_count integer,
  add column if not exists media_bytes bigint;
