-- softclose — core tables (v1, 2026-09-19)
--
-- Supabase project "softclose" (ref elowaiqwadmazwchzaft, eu-west-1). Objects
-- keep the softclose_ prefix; RLS is ON with NO policies: only the service role
-- (server-side API routes) can read or write. Nothing here is reachable from
-- the browser with the anon/publishable key.
--
-- Apply (repo is linked via `supabase link --project-ref elowaiqwadmazwchzaft`):
--   supabase db query --linked -f db/migrations/0001_softclose_core.sql

create extension if not exists pgcrypto;

-- One homeowner journey. `profile` is the LeadProfile JSON (photos + renders
-- are base64 data URLs today — large; Storage bucket is the follow-up).
create table if not exists public.softclose_sessions (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  locale        text,
  step          text,
  status        text not null default 'draft' check (status in ('draft', 'submitted')),
  profile       jsonb not null default '{}'::jsonb,
  submitted_at  timestamptz
);

-- The artifact: a submitted brief (the full HandoffBundle) the maker opens by id.
create table if not exists public.softclose_briefs (
  id                    uuid primary key default gen_random_uuid(),
  session_id            uuid references public.softclose_sessions(id) on delete set null,
  created_at            timestamptz not null default now(),
  locale                text,
  contact_name          text,
  contact_type          text,
  contact_value         text,
  estimate_low          numeric(12,2),
  estimate_high         numeric(12,2),
  estimate_all_in_low   numeric(12,2),
  estimate_all_in_high  numeric(12,2),
  band_pct              integer,
  bundle                jsonb not null,
  maker_status          text not null default 'new'
                        check (maker_status in ('new', 'viewed', 'quoted', 'clarify', 'declined')),
  maker_viewed_at       timestamptz,
  maker_note            text
);
create index if not exists softclose_briefs_created_idx on public.softclose_briefs (created_at desc);

-- Supplier catalog with prices. One row per (supplier, sku); price changes go
-- to softclose_price_history via trigger so the estimate can cite "as of".
create table if not exists public.softclose_products (
  id             bigserial primary key,
  supplier       text not null,            -- 'elgrad' | 'schachermayer' | ...
  sku            text not null,
  name           text not null,
  brand          text,
  category       text,                     -- supplier's top-level category slug
  subcategory    text,                     -- supplier's group slug
  unit           text,                     -- 'kom' | 'Par' | 'm' | 'm2' | ...
  price_eur      numeric(10,2),
  price_basis    text not null default 'retail_incl_vat',
  url            text,
  image_url      text,
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  raw            jsonb,
  unique (supplier, sku)
);
create index if not exists softclose_products_cat_idx on public.softclose_products (supplier, category, subcategory);
create index if not exists softclose_products_name_idx on public.softclose_products using gin (to_tsvector('simple', name));

create table if not exists public.softclose_price_history (
  id           bigserial primary key,
  product_id   bigint not null references public.softclose_products(id) on delete cascade,
  price_eur    numeric(10,2),
  observed_at  timestamptz not null default now()
);
create index if not exists softclose_price_history_pid_idx on public.softclose_price_history (product_id, observed_at desc);

create or replace function public.softclose_record_price()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.price_eur is distinct from old.price_eur then
    insert into public.softclose_price_history (product_id, price_eur, observed_at)
    values (new.id, new.price_eur, now());
  end if;
  new.last_seen_at := now();
  return new;
end $$;

drop trigger if exists softclose_products_price_trg on public.softclose_products;
create trigger softclose_products_price_trg
  before insert or update on public.softclose_products
  for each row execute function public.softclose_record_price();

create or replace function public.softclose_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists softclose_sessions_touch_trg on public.softclose_sessions;
create trigger softclose_sessions_touch_trg
  before update on public.softclose_sessions
  for each row execute function public.softclose_touch_updated_at();

-- Lock down: RLS on, zero policies => anon/authenticated see nothing.
alter table public.softclose_sessions      enable row level security;
alter table public.softclose_briefs        enable row level security;
alter table public.softclose_products      enable row level security;
alter table public.softclose_price_history enable row level security;
