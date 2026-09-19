-- 0001 recorded price history in a BEFORE trigger: the FK to softclose_products
-- fails because the product row does not exist yet at BEFORE time. Split into
-- a BEFORE trigger (touch last_seen_at) and an AFTER trigger (history).
drop trigger if exists softclose_products_price_trg on public.softclose_products;
drop function if exists public.softclose_record_price();

create or replace function public.softclose_products_touch()
returns trigger language plpgsql as $$
begin new.last_seen_at := now(); return new; end $$;

create or replace function public.softclose_record_price()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.price_eur is distinct from old.price_eur then
    insert into public.softclose_price_history (product_id, price_eur, observed_at)
    values (new.id, new.price_eur, now());
  end if;
  return null;
end $$;

create trigger softclose_products_touch_trg
  before insert or update on public.softclose_products
  for each row execute function public.softclose_products_touch();

create trigger softclose_products_price_trg
  after insert or update on public.softclose_products
  for each row execute function public.softclose_record_price();
