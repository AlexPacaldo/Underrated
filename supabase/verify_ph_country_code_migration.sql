-- Verifies the two shipping-address migrations after they have been applied.
-- Run it in the Supabase SQL editor. Everything reports through a single result
-- set so a failure is readable without scrolling: every check is listed, and only
-- 'FAIL' rows mean something is wrong.

with checks as (
  select
    '1. is_valid_delivery_address accepts a PH address'::text as check_name,
    public.is_valid_delivery_address(
      jsonb_build_object(
        'recipient_name', 'Rider',
        'phone', '0917 000 0000',
        'line1', '123 Katipunan Ave',
        'line2', '',
        'city', 'Quezon City',
        'region', 'NCR',
        'postal_code', '1108',
        'country', 'Philippines',
        'country_code', 'PH',
        'delivery_instructions', ''
      )
    ) as passed
  union all
  select
    '2. is_valid_delivery_address still rejects an unknown country code',
    not public.is_valid_delivery_address(
      jsonb_build_object(
        'recipient_name', 'Rider',
        'phone', '0917 000 0000',
        'line1', '1 Some Road',
        'city', 'Somewhere',
        'region', 'Somewhere',
        'postal_code', '0000',
        'country', 'Nowhere',
        'country_code', 'ZZ'
      )
    )
  union all
  select
    '3. is_valid_delivery_address still rejects a blank recipient',
    not public.is_valid_delivery_address(
      jsonb_build_object(
        'recipient_name', '   ',
        'phone', '0917 000 0000',
        'line1', '123 Katipunan Ave',
        'city', 'Quezon City',
        'region', 'NCR',
        'postal_code', '1108',
        'country', 'Philippines',
        'country_code', 'PH'
      )
    )
  union all
  select
    '4. the orders insert policy describes the PH region',
    (
      select coalesce(bool_or(
        definition like '%country_code'' = ''PH''%'
        and definition like '%shipping_region = ''ph''%'
      ), false)
      from pg_policies
      where schemaname = 'public'
        and tablename = 'orders'
        and policyname = 'Users can create their own orders'
    )
  union all
  select
    '5. every stored address still validates',
    not exists (
      select 1
      from public.orders
      where shipping_address is not null
        and not public.is_valid_delivery_address(shipping_address)
    )
  union all
  select
    '6. every stored profile address still validates',
    not exists (
      select 1
      from public.profiles
      where default_shipping_address is not null
        and not public.is_valid_delivery_address(default_shipping_address)
    )
  union all
  select
    '7. no profile holds more than one address in the book',
    not exists (
      select 1
      from public.addresses
      group by user_id
      having count(*) filter (where is_default) > 1
    )
)
select check_name, passed, case when passed then 'PASS' else 'FAIL' end as result from checks order by check_name;
