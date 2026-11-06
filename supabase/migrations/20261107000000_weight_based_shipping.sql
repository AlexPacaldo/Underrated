-- Editable destination rates for the photographed International Express Mail
-- merchandise schedule. Orders retain their quoted amount in orders.shipping_cents.
alter table public.products
  add column if not exists shipping_weight_kg numeric(10, 3)
  check (shipping_weight_kg is null or shipping_weight_kg > 0);

create table if not exists public.shipping_rates (
  country_code text primary key check (country_code ~ '^[A-Z]{2}$'),
  country_name text not null check (length(trim(country_name)) between 2 and 100),
  first_kg_cents integer not null check (first_kg_cents >= 0),
  per_500g_cents integer not null check (per_500g_cents >= 0),
  max_weight_kg numeric(6, 2) not null check (max_weight_kg > 0),
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Seed the destinations legible in the supplied reference sheet.
insert into public.shipping_rates (country_code, country_name, first_kg_cents, per_500g_cents, max_weight_kg, enabled)
values
  ('SG', 'Singapore', 116700, 24000, 30, true),
  ('TW', 'Taiwan', 141800, 33500, 30, true),
  ('TH', 'Thailand', 131800, 27550, 30, true),
  ('AE', 'United Arab Emirates', 195400, 35350, 30, true),
  ('GB', 'United Kingdom', 309800, 51350, 30, true),
  ('US', 'United States', 304300, 51200, 31.5, true),
  ('VN', 'Viet Nam', 141800, 33500, 31.5, true)
on conflict (country_code) do nothing;

create or replace function public.set_shipping_rate_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists shipping_rates_set_updated_at on public.shipping_rates;
create trigger shipping_rates_set_updated_at before update on public.shipping_rates
for each row execute function public.set_shipping_rate_updated_at();

alter table public.shipping_rates enable row level security;
drop policy if exists "Anyone can read enabled shipping rates" on public.shipping_rates;
create policy "Anyone can read enabled shipping rates" on public.shipping_rates
  for select to anon, authenticated using (enabled or public.is_store_admin());
drop policy if exists "Admins can manage shipping rates" on public.shipping_rates;
create policy "Admins can manage shipping rates" on public.shipping_rates
  for all to authenticated using (public.is_store_admin()) with check (public.is_store_admin());
grant select on public.shipping_rates to anon, authenticated;
grant insert, update, delete on public.shipping_rates to authenticated;

create or replace function public.calculate_shipping_cents(
  p_items jsonb,
  p_shipping_address jsonb,
  p_shipping_region text,
  p_subtotal_cents integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_weight_kg numeric := 0;
  v_rate public.shipping_rates%rowtype;
  v_item jsonb;
  v_product public.products%rowtype;
  v_quantity integer;
  v_steps integer;
  v_country_code text := upper(trim(coalesce(p_shipping_address ->> 'country_code', '')));
  v_country_name text := case regexp_replace(lower(trim(coalesce(p_shipping_address ->> 'country', ''))), '[^a-z0-9]', '', 'g')
    when 'uae' then 'unitedarabemirates'
    when 'unitedstatesofamerica' then 'unitedstates'
    when 'unitedkingdomofgreatbritainandnorthernireland' then 'unitedkingdom'
    else regexp_replace(lower(trim(coalesce(p_shipping_address ->> 'country', ''))), '[^a-z0-9]', '', 'g')
  end;
begin
  -- Preserve the existing domestic offer; the photographed schedule covers
  -- international merchandise only.
  if p_shipping_region = 'ph' then
    return case when p_subtotal_cents >= 500000 then 0 else 25000 end;
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    select * into v_product from public.products
    where id = v_item ->> 'product_id' and archived = false;
    if not found then raise exception 'One of the products is no longer available.'; end if;
    if v_product.shipping_weight_kg is null then
      raise exception 'Shipping weight is missing for %.', v_product.name;
    end if;
    v_quantity := (v_item ->> 'quantity')::integer;
    if v_quantity is null or v_quantity < 1 or v_quantity > 99 then
      raise exception 'Product quantity is invalid.';
    end if;
    v_weight_kg := v_weight_kg + v_product.shipping_weight_kg * v_quantity;
  end loop;

  select * into v_rate from public.shipping_rates
  where enabled and (
    country_code = v_country_code
    or (v_country_code = 'OTHER' and
      case regexp_replace(lower(trim(country_name)), '[^a-z0-9]', '', 'g')
        when 'uae' then 'unitedarabemirates'
        when 'unitedstatesofamerica' then 'unitedstates'
        when 'unitedkingdomofgreatbritainandnorthernireland' then 'unitedkingdom'
        else regexp_replace(lower(trim(country_name)), '[^a-z0-9]', '', 'g')
      end = v_country_name)
  )
  order by case when country_code = v_country_code then 0 else 1 end
  limit 1;
  if not found then
    raise exception 'Shipping rates for % are not configured. Please contact the store.', coalesce(p_shipping_address ->> 'country', 'this destination');
  end if;
  if v_weight_kg > v_rate.max_weight_kg then
    raise exception 'This parcel exceeds the % kg limit for %.', v_rate.max_weight_kg, v_rate.country_name;
  end if;

  v_steps := case when v_weight_kg <= 1 then 0 else ceil((v_weight_kg - 1) / 0.5)::integer end;
  return v_rate.first_kg_cents + v_steps * v_rate.per_500g_cents;
end;
$$;

create or replace function public.create_manual_order(
  p_items jsonb,
  p_shipping_address jsonb,
  p_shipping_region text,
  p_display_currency text default 'PHP',
  p_fx_rate numeric default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_order_id uuid;
  v_order_number text;
  v_status public.order_status;
  v_total_cents integer;
  v_subtotal_cents integer := 0;
  v_shipping_cents integer;
  v_display_currency text := upper(trim(coalesce(p_display_currency, 'PHP')));
  v_fx_rate numeric := coalesce(p_fx_rate, 1);
  v_lines jsonb := '[]'::jsonb;
  v_item jsonb;
  v_product public.products%rowtype;
  v_quantity integer;
  v_finish text;
begin
  if v_user_id is null then raise exception 'You must be signed in to create an order.'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Your cart is empty.'; end if;
  if not public.is_valid_delivery_address(p_shipping_address) then raise exception 'A valid delivery address is required.'; end if;
  if p_shipping_region not in ('ph', 'us', 'canada', 'international') then raise exception 'Shipping region is invalid.'; end if;
  if not (
    (p_shipping_address ->> 'country_code' = 'PH' and p_shipping_region = 'ph')
    or (p_shipping_address ->> 'country_code' = 'US' and p_shipping_region = 'us')
    or (p_shipping_address ->> 'country_code' = 'CA' and p_shipping_region = 'canada')
    or (p_shipping_address ->> 'country_code' = 'OTHER' and p_shipping_region = 'international')
  ) then raise exception 'Shipping region does not match the delivery address.'; end if;
  if v_display_currency !~ '^[A-Z]{3}$' or v_fx_rate <= 0 then raise exception 'Currency display is invalid.'; end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    select * into v_product from public.products where id = v_item ->> 'product_id' and archived = false;
    if not found then raise exception 'One of the products is no longer available.'; end if;
    if jsonb_typeof(v_item) <> 'object' or not (v_item ? 'quantity') then raise exception 'A cart line is invalid.'; end if;
    v_quantity := (v_item ->> 'quantity')::integer;
    v_finish := trim(coalesce(v_item ->> 'finish', ''));
    if v_quantity is null or v_quantity < 1 or v_quantity > 99 then raise exception 'Product quantity is invalid.'; end if;
    if v_finish = '' then v_finish := v_product.finishes ->> 0; end if;
    if v_finish = '' or not exists (
      select 1 from jsonb_array_elements_text(v_product.finishes) as available_finish(finish)
      where available_finish.finish = v_finish
    ) then raise exception 'Product finish is invalid.'; end if;
    v_subtotal_cents := v_subtotal_cents + (v_product.price_php_cents * v_quantity);
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id', v_product.id, 'product_name', v_product.name, 'finish', v_finish,
      'quantity', v_quantity, 'unit_price_cents', v_product.price_php_cents,
      'line_total_cents', v_product.price_php_cents * v_quantity
    ));
  end loop;

  v_shipping_cents := public.calculate_shipping_cents(p_items, p_shipping_address, p_shipping_region, v_subtotal_cents);
  v_total_cents := v_subtotal_cents + v_shipping_cents;
  insert into public.orders (user_id, shipping_region, shipping_address, subtotal_cents, shipping_cents, total_cents, currency, display_currency, fx_rate)
  values (v_user_id, p_shipping_region, p_shipping_address, v_subtotal_cents, v_shipping_cents, v_total_cents, 'PHP', v_display_currency, v_fx_rate)
  returning id, order_number, status, total_cents into v_order_id, v_order_number, v_status, v_total_cents;

  insert into public.order_items (order_id, product_id, product_name, finish, quantity, unit_price_cents, line_total_cents)
  select v_order_id, item ->> 'product_id', item ->> 'product_name', item ->> 'finish',
    (item ->> 'quantity')::integer, (item ->> 'unit_price_cents')::integer, (item ->> 'line_total_cents')::integer
  from jsonb_array_elements(v_lines) as item;

  return jsonb_build_object('id', v_order_id, 'order_number', v_order_number, 'status', v_status,
    'total_cents', v_total_cents, 'currency', 'PHP', 'display_currency', v_display_currency,
    'fx_rate', v_fx_rate, 'shipping_address', p_shipping_address);
end;
$$;

revoke all on function public.calculate_shipping_cents(jsonb, jsonb, text, integer) from public;
grant execute on function public.calculate_shipping_cents(jsonb, jsonb, text, integer) to authenticated;
revoke all on function public.create_manual_order(jsonb, jsonb, text, text, numeric) from public;
grant execute on function public.create_manual_order(jsonb, jsonb, text, text, numeric) to authenticated;
