-- This storefront only accepts international destinations. Keep existing order
-- history intact while rejecting new domestic Philippines orders at the database.
update public.shipping_rates
set enabled = true
where country_code in ('SG', 'TW', 'TH', 'AE', 'GB', 'US', 'VN');

create or replace function public.reject_philippines_shipping_order()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.shipping_region = 'ph' or new.shipping_address ->> 'country_code' = 'PH' then
    raise exception 'Shipping to the Philippines is not available from this store.';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_reject_philippines_shipping on public.orders;
create trigger orders_reject_philippines_shipping
  before insert on public.orders
  for each row execute function public.reject_philippines_shipping_order();
