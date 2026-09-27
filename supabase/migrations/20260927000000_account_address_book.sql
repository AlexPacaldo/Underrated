-- 20260927000000_account_address_book.sql
-- Lets a rider keep more than one delivery address, and gives the order history
-- the product photo and shipment milestones the account page needs.
--
-- profiles.default_shipping_address was a single slot on the profile, so a rider
-- had exactly one place to ship to and the checkout had one button. The address
-- book moves the address into its own table and keeps the profile slot as a
-- mirror of whatever is flagged as the default, so the address already saved by
-- the old checkout is picked up here and the profile column keeps working.
--
-- order_items.product_id is plain text with no foreign key, so PostgREST cannot
-- embed the product row and an archived part loses its photo. The two views at
-- the bottom join the order to the catalog and to the fulfillment record for the
-- signed-in rider only, which gives the order history a photo and a delivery
-- timeline without ever exposing order_fulfillment.admin_note.

create table if not exists public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  label text not null default '' check (length(label) <= 60),
  recipient_name text not null check (btrim(recipient_name) <> ''),
  phone text not null check (btrim(phone) <> ''),
  line1 text not null check (btrim(line1) <> ''),
  line2 text not null default '',
  city text not null check (btrim(city) <> ''),
  region text not null check (btrim(region) <> ''),
  postal_code text not null check (btrim(postal_code) <> ''),
  country text not null check (btrim(country) <> ''),
  country_code text not null check (country_code in ('US', 'CA', 'PH', 'OTHER')),
  delivery_instructions text not null default '',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint addresses_payload_is_valid check (
    public.is_valid_delivery_address(jsonb_build_object(
      'recipient_name', recipient_name,
      'phone', phone,
      'line1', line1,
      'line2', line2,
      'city', city,
      'region', region,
      'postal_code', postal_code,
      'country', country,
      'country_code', country_code,
      'delivery_instructions', delivery_instructions
    ))
  )
);

create index if not exists addresses_user_id_idx on public.addresses (user_id);

-- The account list and the order history both read one rider's orders newest
-- first, and order_items is always read through its order.
create index if not exists orders_user_created_at_idx on public.orders (user_id, created_at desc);
create index if not exists order_items_order_id_idx on public.order_items (order_id);

-- Only one row can be the default, so the profile mirror is never ambiguous.
create unique index if not exists addresses_one_default_per_user
  on public.addresses (user_id) where is_default;

drop trigger if exists addresses_set_updated_at on public.addresses;
create trigger addresses_set_updated_at
  before update on public.addresses
  for each row execute function public.set_updated_at();

-- Flagging an address as the default clears the previous one, so the switch
-- happens in the same write instead of leaving two rows flagged while the
-- client refetches.
create or replace function public.addresses_clear_other_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_default then
    update public.addresses
    set is_default = false
    where user_id = new.user_id
      and is_default
      and id is distinct from new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists addresses_clear_other_defaults on public.addresses;
create trigger addresses_clear_other_defaults
  before insert or update on public.addresses
  for each row execute function public.addresses_clear_other_defaults();

-- Runs after the write, so it sees the settled table. It promotes an address
-- when the rider has addresses but no default (an update that cleared the flag,
-- or a book that arrived through a backfill), then mirrors the default into
-- profiles.default_shipping_address for the checkout and the older readers.
create or replace function public.sync_address_book()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_promoted uuid;
  v_default public.addresses%rowtype;
  v_payload jsonb;
begin
  -- NEW is unassigned on a delete and OLD is unassigned on an insert, so the
  -- rider is read from whichever record the current operation actually filled.
  v_user_id := case when tg_op = 'DELETE' then old.user_id else new.user_id end;

  if not exists (select 1 from public.addresses where user_id = v_user_id and is_default) then
    select id into v_promoted
    from public.addresses
    where user_id = v_user_id
    order by created_at, id
    limit 1;

    if v_promoted is not null then
      update public.addresses set is_default = true where id = v_promoted;
      return null;
    end if;
  end if;

  select * into v_default
  from public.addresses
  where user_id = v_user_id and is_default
  limit 1;

  v_payload := case
    when v_default.id is null then null
    else jsonb_build_object(
      'recipient_name', v_default.recipient_name,
      'phone', v_default.phone,
      'line1', v_default.line1,
      'line2', v_default.line2,
      'city', v_default.city,
      'region', v_default.region,
      'postal_code', v_default.postal_code,
      'country', v_default.country,
      'country_code', v_default.country_code,
      'delivery_instructions', v_default.delivery_instructions
    )
  end;

  update public.profiles
  set default_shipping_address = v_payload
  where id = v_user_id
    and default_shipping_address is distinct from v_payload;

  return null;
end;
$$;

drop trigger if exists addresses_sync_default on public.addresses;
create trigger addresses_sync_default
  after insert or update or delete on public.addresses
  for each row execute function public.sync_address_book();

alter table public.addresses enable row level security;

drop policy if exists "Riders can read their own addresses" on public.addresses;
create policy "Riders can read their own addresses"
  on public.addresses
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Riders can add their own addresses" on public.addresses;
create policy "Riders can add their own addresses"
  on public.addresses
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Riders can update their own addresses" on public.addresses;
create policy "Riders can update their own addresses"
  on public.addresses
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Riders can delete their own addresses" on public.addresses;
create policy "Riders can delete their own addresses"
  on public.addresses
  for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Admins can read every address" on public.addresses;
create policy "Admins can read every address"
  on public.addresses
  for select
  to authenticated
  using (public.is_store_admin());

-- The address the old checkout already saved becomes the first entry in the book.
insert into public.addresses (
  user_id,
  label,
  recipient_name,
  phone,
  line1,
  line2,
  city,
  region,
  postal_code,
  country,
  country_code,
  delivery_instructions,
  is_default
)
select
  profile.id,
  'Saved address',
  btrim(profile.default_shipping_address ->> 'recipient_name'),
  btrim(profile.default_shipping_address ->> 'phone'),
  btrim(profile.default_shipping_address ->> 'line1'),
  coalesce(btrim(profile.default_shipping_address ->> 'line2'), ''),
  btrim(profile.default_shipping_address ->> 'city'),
  btrim(profile.default_shipping_address ->> 'region'),
  btrim(profile.default_shipping_address ->> 'postal_code'),
  btrim(profile.default_shipping_address ->> 'country'),
  profile.default_shipping_address ->> 'country_code',
  coalesce(profile.default_shipping_address ->> 'delivery_instructions', ''),
  true
from public.profiles as profile
where public.is_valid_delivery_address(profile.default_shipping_address)
on conflict do nothing;

-- Customer-visible shipment milestones. A view is used instead of a policy on
-- order_fulfillment because RLS is row level only: the admin-only columns would
-- still be readable on the table itself. The view runs with the owner's rights
-- and carries its own auth.uid() filter, so a rider only ever sees the tracking
-- row that belongs to their own order.
create or replace view public.order_tracking
with (security_invoker = off)
as
select
  fulfillment.order_id,
  fulfillment.tracking_number,
  fulfillment.fulfillment_note,
  fulfillment.paid_at,
  fulfillment.processing_at,
  fulfillment.shipped_at,
  fulfillment.delivered_at,
  fulfillment.rejected_at,
  fulfillment.updated_at
from public.order_fulfillment as fulfillment
where exists (
  select 1
  from public.orders as customer_order
  where customer_order.id = fulfillment.order_id
    and customer_order.user_id = auth.uid()
);

-- The order lines plus the catalog photo, joined here because order_items has no
-- foreign key to products. Archived parts keep their photo and slug, so an old
-- order still renders and still links to the item view.
create or replace view public.account_order_items
with (security_invoker = off)
as
select
  item.id,
  item.order_id,
  item.product_id,
  item.product_name,
  item.finish,
  item.quantity,
  item.unit_price_cents,
  item.line_total_cents,
  product.slug as product_slug,
  product.image_path as product_image_path,
  product.images as product_images,
  product.image_positions as product_image_positions,
  product.visual as product_visual,
  product.archived as product_archived,
  product.finishes as product_finishes
from public.order_items as item
left join public.products as product on product.id = item.product_id
where exists (
  select 1
  from public.orders as customer_order
  where customer_order.id = item.order_id
    and customer_order.user_id = auth.uid()
);

revoke all on public.order_tracking from public, anon;
revoke all on public.account_order_items from public, anon;
grant select on public.order_tracking to authenticated;
grant select on public.account_order_items to authenticated;
