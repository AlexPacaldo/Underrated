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
    and coalesce(address ->> 'country_code', '') in ('US', 'CA', 'OTHER')
    and (not (address ? 'line2') or jsonb_typeof(address -> 'line2') = 'string')
    and (not (address ? 'delivery_instructions') or jsonb_typeof(address -> 'delivery_instructions') = 'string');
$$;

alter table public.profiles
  add column default_shipping_address jsonb;

alter table public.orders
  add column shipping_address jsonb;

alter table public.profiles
  add constraint profiles_default_shipping_address_is_valid
  check (default_shipping_address is null or public.is_valid_delivery_address(default_shipping_address));

alter table public.orders
  add constraint orders_shipping_address_is_valid
  check (shipping_address is null or public.is_valid_delivery_address(shipping_address));

drop policy if exists "Users can create their own orders" on public.orders;

create policy "Users can create their own orders"
  on public.orders
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and status = 'pending_payment'
    and public.is_valid_delivery_address(shipping_address)
    and (
      (shipping_address ->> 'country_code' = 'US' and shipping_region = 'us')
      or (shipping_address ->> 'country_code' = 'CA' and shipping_region = 'canada')
      or (shipping_address ->> 'country_code' = 'OTHER' and shipping_region = 'international')
    )
  );

create or replace function public.prevent_customer_order_tampering()
returns trigger
language plpgsql
as $$
begin
  if auth.role() = 'authenticated' then
    if new.user_id is distinct from old.user_id
      or new.order_number is distinct from old.order_number
      or new.shipping_region is distinct from old.shipping_region
      or new.shipping_address is distinct from old.shipping_address
      or new.subtotal_cents is distinct from old.subtotal_cents
      or new.shipping_cents is distinct from old.shipping_cents
      or new.total_cents is distinct from old.total_cents then
      raise exception 'Order totals, ownership, and delivery address cannot be changed from the storefront.';
    end if;

    if not (old.status = 'pending_payment' and new.status in ('payment_submitted', 'cancelled')) then
      raise exception 'This order status change is not allowed from the storefront.';
    end if;
  end if;

  return new;
end;
$$;
