alter type public.order_status add value if not exists 'processing';
alter type public.order_status add value if not exists 'shipped';
alter type public.order_status add value if not exists 'delivered';

alter table public.orders
  add column if not exists currency text not null default 'PHP',
  add column if not exists display_currency text not null default 'PHP',
  add column if not exists fx_rate numeric(18, 8) not null default 1;

alter table public.orders drop constraint if exists orders_currency_is_valid;
alter table public.orders drop constraint if exists orders_display_currency_is_valid;
alter table public.orders drop constraint if exists orders_fx_rate_is_positive;
alter table public.orders add constraint orders_currency_is_valid check (currency = 'PHP');
alter table public.orders add constraint orders_display_currency_is_valid check (display_currency ~ '^[A-Z]{3}$');
alter table public.orders add constraint orders_fx_rate_is_positive check (fx_rate > 0);

create table if not exists public.order_fulfillment (
  order_id uuid primary key references public.orders(id) on delete cascade,
  tracking_number text,
  fulfillment_note text,
  admin_note text,
  paid_at timestamptz,
  processing_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  rejected_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.order_fulfillment enable row level security;

create table if not exists public.products (
  id text primary key,
  slug text not null unique,
  name text not null,
  category text not null,
  price_php_cents integer not null check (price_php_cents >= 0),
  badge text,
  descriptor text not null default '',
  description text not null default '',
  finishes jsonb not null default '[]'::jsonb check (jsonb_typeof(finishes) = 'array'),
  image_path text,
  visual text not null default 'hoods' check (visual in ('hoods', 'valve', 'saddle', 'tape', 'stem', 'stand')),
  specs jsonb not null default '[]'::jsonb check (jsonb_typeof(specs) = 'array'),
  fitment jsonb not null default '{}'::jsonb check (jsonb_typeof(fitment) = 'object'),
  featured boolean not null default false,
  archived boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.homepage_content (
  id text primary key default 'primary' check (id = 'primary'),
  hero_image_path text not null default '/brand/HeroBanner.png',
  hero_alt text not null default 'Matte-black road bike brake hoods on a dark studio set',
  hero_kicker text not null default 'Drop 03 / Contact points',
  hero_title text not null default 'Make the',
  hero_accent text not null default 'cockpit',
  hero_suffix text not null default 'yours.',
  hero_description text not null default 'Small parts change the whole build. Find the grip, color, and hardware that reads like you.',
  drop_label text not null default 'Current hardware',
  drop_title text not null default 'The',
  drop_accent text not null default 'drop.',
  drop_description text not null default 'Selected components for the current release.',
  story_image_path text not null default '/manus-storage/underrated-cockpit_6568441b.jpg',
  story_alt text not null default 'Graphite road bike cockpit with wrapped bars and stem',
  story_label text not null default 'The new cockpit / 01',
  story_title text not null default 'Made to',
  story_accent text not null default 'be noticed.',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

drop trigger if exists homepage_content_set_updated_at on public.homepage_content;
create trigger homepage_content_set_updated_at
before update on public.homepage_content
for each row execute function public.set_updated_at();

create or replace function public.is_valid_delivery_address(address jsonb)
returns boolean
language sql
immutable
as $$
  select
    address is not null
    and jsonb_typeof(address) = 'object'
    and address ?& array[
      'recipient_name',
      'phone',
      'line1',
      'city',
      'region',
      'postal_code',
      'country',
      'country_code'
    ]
    and jsonb_typeof(address -> 'recipient_name') = 'string'
    and jsonb_typeof(address -> 'phone') = 'string'
    and jsonb_typeof(address -> 'line1') = 'string'
    and jsonb_typeof(address -> 'city') = 'string'
    and jsonb_typeof(address -> 'region') = 'string'
    and jsonb_typeof(address -> 'postal_code') = 'string'
    and jsonb_typeof(address -> 'country') = 'string'
    and jsonb_typeof(address -> 'country_code') = 'string'
    and btrim(address ->> 'recipient_name') <> ''
    and btrim(address ->> 'phone') <> ''
    and btrim(address ->> 'line1') <> ''
    and btrim(address ->> 'city') <> ''
    and btrim(address ->> 'region') <> ''
    and btrim(address ->> 'postal_code') <> ''
    and btrim(address ->> 'country') <> ''
    and coalesce(address ->> 'country_code', '') in ('US', 'CA', 'PH', 'OTHER')
    and (not (address ? 'line2') or jsonb_typeof(address -> 'line2') = 'string')
    and (not (address ? 'delivery_instructions') or jsonb_typeof(address -> 'delivery_instructions') = 'string');
$$;

alter table public.profiles drop constraint if exists profiles_default_shipping_address_is_valid;
alter table public.orders drop constraint if exists orders_shipping_address_is_valid;
alter table public.profiles add constraint profiles_default_shipping_address_is_valid check (default_shipping_address is null or public.is_valid_delivery_address(default_shipping_address));
alter table public.orders add constraint orders_shipping_address_is_valid check (shipping_address is null or public.is_valid_delivery_address(shipping_address));

create or replace function public.prevent_customer_order_tampering()
returns trigger
language plpgsql
as $$
begin
  if auth.role() = 'authenticated'
    and current_user not in ('postgres', 'service_role')
    and coalesce(current_setting('app.store_admin_change', true), 'off') <> 'on' then
    if new.user_id is distinct from old.user_id
      or new.order_number is distinct from old.order_number
      or new.shipping_region is distinct from old.shipping_region
      or new.shipping_address is distinct from old.shipping_address
      or new.subtotal_cents is distinct from old.subtotal_cents
      or new.shipping_cents is distinct from old.shipping_cents
      or new.total_cents is distinct from old.total_cents
      or new.currency is distinct from old.currency
      or new.display_currency is distinct from old.display_currency
      or new.fx_rate is distinct from old.fx_rate then
      raise exception 'Order totals, ownership, and delivery address cannot be changed from the storefront.';
    end if;

    if not (old.status = 'pending_payment' and new.status in ('payment_submitted', 'cancelled')) then
      raise exception 'This order status change is not allowed from the storefront.';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.is_store_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.prevent_profile_role_self_change()
returns trigger
language plpgsql
as $$
begin
  if old.role is distinct from new.role
    and auth.role() = 'authenticated'
    and current_user not in ('postgres', 'service_role')
    and coalesce(current_setting('app.store_admin_role_change', true), 'off') <> 'on' then
    raise exception 'Only store administrators can change account roles.';
  end if;

  return new;
end;
$$;

drop policy if exists "Users can create their own orders" on public.orders;
drop policy if exists "Users can submit or cancel pending orders" on public.orders;
drop policy if exists "Users can create items for their own orders" on public.order_items;
drop policy if exists "Users can submit manual payment references" on public.manual_payment_submissions;

create policy "Users can cancel pending orders"
  on public.orders
  for update
  to authenticated
  using (auth.uid() = user_id and status = 'pending_payment')
  with check (auth.uid() = user_id and status = 'cancelled');

create policy "Admins can read all orders"
  on public.orders
  for select
  to authenticated
  using (public.is_store_admin());

create policy "Admins can read all order items"
  on public.order_items
  for select
  to authenticated
  using (public.is_store_admin());

create policy "Admins can read all payment submissions"
  on public.manual_payment_submissions
  for select
  to authenticated
  using (public.is_store_admin());

create policy "Admins can read order fulfillment"
  on public.order_fulfillment
  for select
  to authenticated
  using (public.is_store_admin());

drop policy if exists "Profiles are readable by their owner" on public.profiles;
create policy "Profiles are readable by their owner"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

create policy "Admins can read all profiles"
  on public.profiles
  for select
  to authenticated
  using (public.is_store_admin());

alter table public.products enable row level security;
alter table public.homepage_content enable row level security;

drop policy if exists "Published products are readable" on public.products;
create policy "Published products are readable"
  on public.products
  for select
  to anon, authenticated
  using (archived = false);

drop policy if exists "Admins can manage products" on public.products;
create policy "Admins can manage products"
  on public.products
  for all
  to authenticated
  using (public.is_store_admin())
  with check (public.is_store_admin());

drop policy if exists "Homepage content is readable" on public.homepage_content;
create policy "Homepage content is readable"
  on public.homepage_content
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Admins can manage homepage content" on public.homepage_content;
create policy "Admins can manage homepage content"
  on public.homepage_content
  for all
  to authenticated
  using (public.is_store_admin())
  with check (public.is_store_admin());

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
  if v_user_id is null then
    raise exception 'You must be signed in to create an order.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Your cart is empty.';
  end if;
  if not public.is_valid_delivery_address(p_shipping_address) then
    raise exception 'A valid delivery address is required.';
  end if;
  if p_shipping_region not in ('ph', 'us', 'canada', 'international') then
    raise exception 'Shipping region is invalid.';
  end if;
  if not (
    (p_shipping_address ->> 'country_code' = 'PH' and p_shipping_region = 'ph')
    or (p_shipping_address ->> 'country_code' = 'US' and p_shipping_region = 'us')
    or (p_shipping_address ->> 'country_code' = 'CA' and p_shipping_region = 'canada')
    or (p_shipping_address ->> 'country_code' = 'OTHER' and p_shipping_region = 'international')
  ) then
    raise exception 'Shipping region does not match the delivery address.';
  end if;
  if v_display_currency !~ '^[A-Z]{3}$' or v_fx_rate <= 0 then
    raise exception 'Currency display is invalid.';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    select * into v_product
    from public.products
    where id = v_item ->> 'product_id' and archived = false;

    if not found then
      raise exception 'One of the products is no longer available.';
    end if;

    if jsonb_typeof(v_item) <> 'object' or not (v_item ? 'quantity') then
      raise exception 'A cart line is invalid.';
    end if;

    v_quantity := (v_item ->> 'quantity')::integer;
    v_finish := trim(coalesce(v_item ->> 'finish', ''));
    if v_quantity is null or v_quantity < 1 or v_quantity > 99 then
      raise exception 'Product quantity is invalid.';
    end if;
    if v_finish = '' then
      v_finish := v_product.finishes ->> 0;
    end if;
    if v_finish = '' or not exists (
      select 1 from jsonb_array_elements_text(v_product.finishes) as available_finish(finish)
      where available_finish.finish = v_finish
    ) then
      raise exception 'Product finish is invalid.';
    end if;

    v_subtotal_cents := v_subtotal_cents + (v_product.price_php_cents * v_quantity);
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id', v_product.id,
      'product_name', v_product.name,
      'finish', v_finish,
      'quantity', v_quantity,
      'unit_price_cents', v_product.price_php_cents,
      'line_total_cents', v_product.price_php_cents * v_quantity
    ));
  end loop;

  v_shipping_cents := case
    when p_shipping_region = 'ph' and v_subtotal_cents >= 500000 then 0
    when p_shipping_region = 'ph' then 25000
    when p_shipping_region = 'us' and v_subtotal_cents >= 500000 then 0
    when p_shipping_region = 'us' then 80000
    when p_shipping_region = 'canada' and v_subtotal_cents >= 750000 then 0
    when p_shipping_region = 'canada' then 120000
    else 180000
  end;
  v_total_cents := v_subtotal_cents + v_shipping_cents;

  insert into public.orders (
    user_id,
    shipping_region,
    shipping_address,
    subtotal_cents,
    shipping_cents,
    total_cents,
    currency,
    display_currency,
    fx_rate
  ) values (
    v_user_id,
    p_shipping_region,
    p_shipping_address,
    v_subtotal_cents,
    v_shipping_cents,
    v_total_cents,
    'PHP',
    v_display_currency,
    v_fx_rate
  ) returning id, order_number, status, total_cents into v_order_id, v_order_number, v_status, v_total_cents;

  insert into public.order_items (order_id, product_id, product_name, finish, quantity, unit_price_cents, line_total_cents)
  select
    v_order_id,
    item ->> 'product_id',
    item ->> 'product_name',
    item ->> 'finish',
    (item ->> 'quantity')::integer,
    (item ->> 'unit_price_cents')::integer,
    (item ->> 'line_total_cents')::integer
  from jsonb_array_elements(v_lines) as item;

  return jsonb_build_object(
    'id', v_order_id,
    'order_number', v_order_number,
    'status', v_status,
    'total_cents', v_total_cents,
    'currency', 'PHP',
    'display_currency', v_display_currency,
    'fx_rate', v_fx_rate,
    'shipping_address', p_shipping_address
  );
end;
$$;

create or replace function public.submit_manual_payment(
  p_order_id uuid,
  p_payment_method public.manual_payment_method,
  p_reference_number text,
  p_payer_name text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to submit payment.';
  end if;
  if btrim(coalesce(p_reference_number, '')) = '' then
    raise exception 'A payment reference is required.';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id and user_id = auth.uid()
  for update;

  if not found or v_order.status <> 'pending_payment' then
    raise exception 'This order is not awaiting payment.';
  end if;

  insert into public.manual_payment_submissions (order_id, user_id, payment_method, reference_number, payer_name, note)
  values (p_order_id, auth.uid(), p_payment_method, btrim(p_reference_number), nullif(btrim(coalesce(p_payer_name, '')), ''), nullif(btrim(coalesce(p_note, '')), ''));

  update public.orders
  set status = 'payment_submitted'
  where id = p_order_id;

  return jsonb_build_object(
    'id', v_order.id,
    'order_number', v_order.order_number,
    'status', 'payment_submitted',
    'total_cents', v_order.total_cents,
    'currency', v_order.currency,
    'display_currency', v_order.display_currency,
    'fx_rate', v_order.fx_rate,
    'shipping_address', v_order.shipping_address
  );
end;
$$;

create or replace function public.set_profile_role_by_email(p_email text, p_role public.account_role)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
  v_email text;
  v_full_name text;
  v_avatar_url text;
  v_admin_count integer;
begin
  if not public.is_store_admin() then
    raise exception 'Only store administrators can change roles.';
  end if;
  if btrim(coalesce(p_email, '')) = '' then
    raise exception 'An email address is required.';
  end if;

  select id, email, raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'avatar_url'
  into v_user_id, v_email, v_full_name, v_avatar_url
  from auth.users
  where lower(email) = lower(trim(p_email))
  limit 1;

  if v_user_id is null then
    raise exception 'No signed-in user matches that email address.';
  end if;

  if p_role <> 'admin' and exists (select 1 from public.profiles where id = v_user_id and role = 'admin') then
    select count(*) into v_admin_count from public.profiles where role = 'admin';
    if v_admin_count <= 1 then
      raise exception 'The last store administrator cannot be demoted.';
    end if;
  end if;

  perform set_config('app.store_admin_role_change', 'on', true);
  insert into public.profiles (id, email, full_name, avatar_url, role)
  values (v_user_id, v_email, v_full_name, v_avatar_url, p_role)
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url);

  update public.profiles set role = p_role where id = v_user_id;

  return jsonb_build_object('id', v_user_id, 'email', v_email, 'role', p_role);
end;
$$;

create or replace function public.admin_update_order_status(
  p_order_id uuid,
  p_status public.order_status,
  p_fulfillment_note text default null,
  p_tracking_number text default null,
  p_admin_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  if not public.is_store_admin() then
    raise exception 'Only store administrators can update orders.';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found.';
  end if;

  if v_order.status is distinct from p_status and not (
    (v_order.status::text = 'pending_payment' and p_status::text = 'cancelled')
    or (v_order.status::text = 'payment_submitted' and p_status::text in ('paid', 'rejected'))
    or (v_order.status::text = 'paid' and p_status::text = 'processing')
    or (v_order.status::text = 'processing' and p_status::text = 'shipped')
    or (v_order.status::text = 'shipped' and p_status::text = 'delivered')
    or (v_order.status::text not in ('cancelled', 'rejected', 'delivered') and p_status::text = 'cancelled')
  ) then
    raise exception 'That order status transition is not allowed.';
  end if;

  perform set_config('app.store_admin_change', 'on', true);

  update public.orders
  set status = p_status
  where id = p_order_id
  returning * into v_order;

  insert into public.order_fulfillment (order_id, tracking_number, fulfillment_note, admin_note, paid_at, processing_at, shipped_at, delivered_at, rejected_at, updated_by)
  values (
    p_order_id,
    nullif(btrim(coalesce(p_tracking_number, '')), ''),
    nullif(btrim(coalesce(p_fulfillment_note, '')), ''),
    nullif(btrim(coalesce(p_admin_note, '')), ''),
    case when p_status::text = 'paid' then coalesce((select paid_at from public.order_fulfillment where order_id = p_order_id), now()) else (select paid_at from public.order_fulfillment where order_id = p_order_id) end,
    case when p_status::text = 'processing' then coalesce((select processing_at from public.order_fulfillment where order_id = p_order_id), now()) else (select processing_at from public.order_fulfillment where order_id = p_order_id) end,
    case when p_status::text = 'shipped' then coalesce((select shipped_at from public.order_fulfillment where order_id = p_order_id), now()) else (select shipped_at from public.order_fulfillment where order_id = p_order_id) end,
    case when p_status::text = 'delivered' then coalesce((select delivered_at from public.order_fulfillment where order_id = p_order_id), now()) else (select delivered_at from public.order_fulfillment where order_id = p_order_id) end,
    case when p_status::text = 'rejected' then coalesce((select rejected_at from public.order_fulfillment where order_id = p_order_id), now()) else (select rejected_at from public.order_fulfillment where order_id = p_order_id) end,
    auth.uid()
  )
  on conflict (order_id) do update set
    tracking_number = excluded.tracking_number,
    fulfillment_note = excluded.fulfillment_note,
    admin_note = excluded.admin_note,
    paid_at = excluded.paid_at,
    processing_at = excluded.processing_at,
    shipped_at = excluded.shipped_at,
    delivered_at = excluded.delivered_at,
    rejected_at = excluded.rejected_at,
    updated_by = excluded.updated_by,
    updated_at = now();

  return to_jsonb(v_order) || jsonb_build_object(
    'tracking_number', nullif(btrim(coalesce(p_tracking_number, '')), ''),
    'fulfillment_note', nullif(btrim(coalesce(p_fulfillment_note, '')), ''),
    'admin_note', nullif(btrim(coalesce(p_admin_note, '')), '')
  );
end;
$$;

revoke all on function public.create_manual_order(jsonb, jsonb, text, text, numeric) from public;
grant execute on function public.create_manual_order(jsonb, jsonb, text, text, numeric) to authenticated;
revoke all on function public.submit_manual_payment(uuid, public.manual_payment_method, text, text, text) from public;
grant execute on function public.submit_manual_payment(uuid, public.manual_payment_method, text, text, text) to authenticated;
revoke all on function public.set_profile_role_by_email(text, public.account_role) from public;
grant execute on function public.set_profile_role_by_email(text, public.account_role) to authenticated;
revoke all on function public.admin_update_order_status(uuid, public.order_status, text, text, text) from public;
grant execute on function public.admin_update_order_status(uuid, public.order_status, text, text, text) to authenticated;

insert into storage.buckets (id, name, public)
values ('storefront-assets', 'storefront-assets', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Public can view storefront assets" on storage.objects;
create policy "Public can view storefront assets"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'storefront-assets');

drop policy if exists "Admins can upload storefront assets" on storage.objects;
create policy "Admins can upload storefront assets"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'storefront-assets' and public.is_store_admin());

drop policy if exists "Admins can update storefront assets" on storage.objects;
create policy "Admins can update storefront assets"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'storefront-assets' and public.is_store_admin())
  with check (bucket_id = 'storefront-assets' and public.is_store_admin());

drop policy if exists "Admins can delete storefront assets" on storage.objects;
create policy "Admins can delete storefront assets"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'storefront-assets' and public.is_store_admin());

insert into public.products (
  id, slug, name, category, price_php_cents, badge, descriptor, description, finishes, image_path, visual, specs, fitment, featured, sort_order
) values
  ('stealth-hoods', 'stealth-hoods', 'Stealth Hoods', 'Hoods', 380000, 'New drop', 'Variation without compromise.', 'A sculpted grip profile for the riders who tune every touchpoint. Built to feel planted in the sprint and quiet on the long way home.', jsonb_build_array('Graphite', 'Iced White', 'Deep Blue'), null, 'hoods', jsonb_build_array(jsonb_build_object('label', 'Fit', 'value', 'Road STI'), jsonb_build_object('label', 'Material', 'value', 'High-grip elastomer'), jsonb_build_object('label', 'Weight', 'value', '118 g / pair')), jsonb_build_object('headline', 'Built around road STI profiles.', 'compatibility', jsonb_build_array('Road STI lever bodies', 'Pairs with standard bar tape wraps', 'Use as a matched left/right pair'), 'checkBeforeRide', 'Confirm your lever-body shape and current hood dimensions before removing the original pair.'), true, 1),
  ('rocket-valve-cap', 'rocket-valve-cap', 'Rocket Valve Cap', 'Valve Caps', 95000, 'Limited run', 'Small part. Loud signal.', 'A pocket-sized detail with a machined finish and enough color to change the whole build. Sold as a pair.', jsonb_build_array('Signal Tangerine', 'Iced White', 'Deep Blue'), '/manus-storage/underrated-valvecap_f8df5399.jpg', 'valve', jsonb_build_array(jsonb_build_object('label', 'Fit', 'value', 'Presta valves'), jsonb_build_object('label', 'Material', 'value', 'Anodized alloy'), jsonb_build_object('label', 'Included', 'value', '2 caps')), jsonb_build_object('headline', 'Made for Presta valve stems.', 'compatibility', jsonb_build_array('Road and track tubes with Presta valves', 'Tubeless valves with standard Presta threads', 'Sold as a matching pair'), 'checkBeforeRide', 'Check that your valve core and extender leave enough exposed thread for a secure hand-tight fit.'), true, 2),
  ('iced-saddle', 'iced-saddle', 'Iced Saddle', 'Saddles', 650000, null, 'A clean break from the expected.', 'A narrow-profile saddle shaped for quick position changes, finished in an ice-white composite surface that turns a build into a statement.', jsonb_build_array('Iced White', 'Graphite'), '/manus-storage/underrated-saddle_50233c3e.jpg', 'saddle', jsonb_build_array(jsonb_build_object('label', 'Width', 'value', '143 mm'), jsonb_build_object('label', 'Rails', 'value', 'Chromoly'), jsonb_build_object('label', 'Weight', 'value', '244 g')), jsonb_build_object('headline', 'A 143 mm profile with standard round rails.', 'compatibility', jsonb_build_array('Seatposts designed for round rails', 'Road, track, and gravel build positions', 'Works with conventional two-bolt clamps'), 'checkBeforeRide', 'Confirm rail-clamp compatibility and observe your seatpost’s recommended torque before final adjustment.'), true, 3),
  ('deep-blue-tape', 'deep-blue-tape', 'Deep Blue Tape', 'Cockpit', 180000, null, 'Hold the line.', 'Cushioned tape with a tightly controlled wrap texture, made to pull a cockpit together without swallowing the detail.', jsonb_build_array('Deep Blue', 'Graphite', 'Iced White'), null, 'tape', jsonb_build_array(jsonb_build_object('label', 'Length', 'value', '2 × 220 cm'), jsonb_build_object('label', 'Thickness', 'value', '2.5 mm'), jsonb_build_object('label', 'Finish', 'value', 'Microtexture')), jsonb_build_object('headline', 'Cut and wrap for any drop-bar cockpit.', 'compatibility', jsonb_build_array('Standard road and gravel drop bars', 'Pairs with most road STI hoods', 'Enough length for a full two-side wrap'), 'checkBeforeRide', 'Measure your current wrap and leave a little excess before trimming the final bar-end finish.'), true, 4),
  ('covert-stem', 'covert-stem', 'Covert Stem', 'Cockpit', 450000, null, 'No wasted surface.', 'A compact forged alloy stem with a low visual profile and an unapologetically dark finish.', jsonb_build_array('Graphite'), null, 'stem', jsonb_build_array(jsonb_build_object('label', 'Clamp', 'value', '31.8 mm'), jsonb_build_object('label', 'Rise', 'value', '−7°'), jsonb_build_object('label', 'Lengths', 'value', '90 / 100 / 110 mm')), jsonb_build_object('headline', 'Made for a 31.8 mm bar and 1⅛ in steerer.', 'compatibility', jsonb_build_array('31.8 mm road or gravel handlebars', '1⅛ in threadless steerers', 'Available in three reach lengths'), 'checkBeforeRide', 'Confirm handlebar clamp size, steerer diameter, and cable clearance before you commit to a length.'), false, 5),
  ('display-stand', 'display-stand', 'Trophy Display Stand', 'Accessories', 250000, 'Workshop pick', 'Park it with intention.', 'A compact display piece for the build that refuses to hide in a corner between rides.', jsonb_build_array('Graphite', 'Signal Tangerine'), null, 'stand', jsonb_build_array(jsonb_build_object('label', 'Fit', 'value', 'Road + track'), jsonb_build_object('label', 'Base', 'value', 'Non-marking rubber'), jsonb_build_object('label', 'Use', 'value', 'Display / storage')), jsonb_build_object('headline', 'A display rest for road and track builds.', 'compatibility', jsonb_build_array('Road and track wheel profiles', 'Clean indoor floors and studio setups', 'Non-marking rubber contact point'), 'checkBeforeRide', 'Use the stand only on a level surface and confirm the wheel sits fully in the support channel.'), false, 6)
on conflict (id) do nothing;

insert into public.homepage_content (id)
values ('primary')
on conflict (id) do nothing;
