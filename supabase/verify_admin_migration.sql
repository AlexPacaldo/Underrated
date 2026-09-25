-- Run this in the Supabase SQL editor to confirm the admin migration applied completely.
-- Every row should report 'ok'. Anything else means a statement was skipped.

with checks as (
  select 'order_status enum values' as check_name,
         case when (
           select array_agg(e.enumlabel::text order by e.enumsortorder)
           from pg_enum e
           join pg_type t on t.oid = e.enumtypid
           where t.typname = 'order_status'
         ) @> array['processing','shipped','delivered']::text[] then 'ok' else 'MISSING' end as result
  union all
  select 'orders fx columns',
         case when (
           select count(*) from information_schema.columns
           where table_schema = 'public' and table_name = 'orders'
             and column_name in ('currency','display_currency','fx_rate')
         ) = 3 then 'ok' else 'MISSING' end
  union all
  select 'orders internal columns removed',
         case when (
           select count(*) from information_schema.columns
           where table_schema = 'public' and table_name = 'orders'
             and column_name in ('tracking_number','fulfillment_note','admin_note','updated_by','paid_at')
         ) = 0 then 'ok' else 'STILL PRESENT' end
  union all
  select 'order_fulfillment table',
         case when to_regclass('public.order_fulfillment') is not null then 'ok' else 'MISSING' end
  union all
  select 'products table',
         case when to_regclass('public.products') is not null then 'ok' else 'MISSING' end
  union all
  select 'homepage_content table',
         case when to_regclass('public.homepage_content') is not null then 'ok' else 'MISSING' end
  union all
  select 'seeded products (expect 6)',
         case when (select count(*) from public.products) = 6 then 'ok' else 'unexpected count' end
  union all
  select 'homepage seed row',
         case when (select count(*) from public.homepage_content) = 1 then 'ok' else 'MISSING' end
  union all
  select 'address check constraints',
         case when (
           select count(*) from pg_constraint
           where conname in ('profiles_default_shipping_address_is_valid','orders_shipping_address_is_valid')
         ) = 2 then 'ok' else 'MISSING' end
  union all
  select 'order fx check constraints',
         case when (
           select count(*) from pg_constraint
           where conname in ('orders_currency_is_valid','orders_display_currency_is_valid','orders_fx_rate_is_positive')
         ) = 3 then 'ok' else 'MISSING' end
  union all
  select 'rpc functions',
         case when (
           select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in (
             'create_manual_order','submit_manual_payment','set_profile_role_by_email',
             'admin_update_order_status','is_store_admin','is_valid_delivery_address'
           )
         ) = 6 then 'ok' else 'MISSING' end
  union all
  select 'order status rpc preserves notes',
         case when (
           select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'admin_update_order_status'
             and pg_get_functiondef(p.oid) like '%then order_fulfillment.tracking_number%'
             and pg_get_functiondef(p.oid) like '%then order_fulfillment.fulfillment_note%'
             and pg_get_functiondef(p.oid) like '%then order_fulfillment.admin_note%'
         ) = 1 then 'ok' else 'REGRESSED' end
  union all
  select 'storefront-assets bucket',
         case when (select count(*) from storage.buckets where id = 'storefront-assets') = 1 then 'ok' else 'MISSING' end
  union all
  select 'order_fulfillment admin read policy',
         case when (
           select count(*) from pg_policies
           where tablename = 'order_fulfillment' and policyname = 'Admins can read order fulfillment'
         ) = 1 then 'ok' else 'MISSING' end
  union all
  select 'products + homepage rls enabled',
         case when (
           select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname in ('products','homepage_content','order_fulfillment')
             and c.relrowsecurity
         ) = 3 then 'ok' else 'MISSING' end
  union all
  select 'tamper triggers present',
         case when (
           select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
           join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and not t.tgisinternal
             and t.tgname in ('orders_prevent_customer_tampering','profiles_prevent_role_self_change')
         ) = 2 then 'ok' else 'MISSING' end
)
select check_name, result from checks order by check_name;
