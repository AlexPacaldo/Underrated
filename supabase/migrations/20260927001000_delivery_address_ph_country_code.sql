-- 20260927001000_delivery_address_ph_country_code.sql
-- A Philippine delivery address was rejected on every write.
--
-- The storefront is a Philippine shop. client/src/lib/deliveryAddress.ts types
-- country_code as 'PH' | 'US' | 'CA' | 'OTHER' and emptyDeliveryAddress defaults
-- to PH, create_manual_order accepts the ('PH', 'ph') pair, and the shipping table
-- in admin_storefront has 'ph' rates. Only public.is_valid_delivery_address was
-- left behind: it listed US, CA, and OTHER, and it backs
--   - the check constraint on profiles.default_shipping_address,
--   - the check constraint on orders.shipping_address,
--   - the storefront address guard inside create_manual_order,
-- so the home market could not check out. The country list is the same four codes
-- the RPC already used.
--
-- The function is replaced in place rather than dropped and recreated, so the two
-- check constraints that call it keep working and start accepting PH without
-- having to be dropped, which would have taken a full table scan to re-validate.
-- Existing rows are untouched: a constraint expression is re-read by later writes,
-- and no stored address changes meaning.

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
    and coalesce(address ->> 'country_code', '') in ('PH', 'US', 'CA', 'OTHER')
    and (not (address ? 'line2') or jsonb_typeof(address -> 'line2') = 'string')
    and (not (address ? 'delivery_instructions') or jsonb_typeof(address -> 'delivery_instructions') = 'string');
$$;

-- The customer insert policy carries its own copy of the same list and was missing
-- the PH branch as well. The storefront writes through create_manual_order instead
-- of inserting directly, so this policy is belt and braces, but it is recreated
-- so the four regions are described in exactly one order and cannot drift.
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
      (shipping_address ->> 'country_code' = 'PH' and shipping_region = 'ph')
      or (shipping_address ->> 'country_code' = 'US' and shipping_region = 'us')
      or (shipping_address ->> 'country_code' = 'CA' and shipping_region = 'canada')
      or (shipping_address ->> 'country_code' = 'OTHER' and shipping_region = 'international')
    )
  );
