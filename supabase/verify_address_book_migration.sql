-- Run this in the Supabase SQL editor to confirm the address book migration applied completely.
-- Every row should report 'ok'. Anything else means a statement was skipped.
-- Reload the PostgREST schema (Settings -> API -> Reload schema) before the client
-- can see the new table and the two new views.

with checks as (
  select 'addresses table' as check_name,
         case when to_regclass('public.addresses') is not null then 'ok' else 'MISSING' end as result
  union all
  select 'addresses address columns',
         case when (
           select count(*) from information_schema.columns
           where table_schema = 'public' and table_name = 'addresses'
             and column_name in (
               'user_id','label','recipient_name','phone','line1','line2','city','region',
               'postal_code','country','country_code','delivery_instructions','is_default'
             )
         ) = 13 then 'ok' else 'MISSING' end
  union all
  select 'addresses rls enabled',
         case when (
           select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname = 'addresses' and c.relrowsecurity
         ) = 1 then 'ok' else 'MISSING' end
  union all
  select 'addresses owner policies',
         case when (
           select count(*) from pg_policies
           where tablename = 'addresses' and policyname in (
             'Riders can read their own addresses',
             'Riders can add their own addresses',
             'Riders can update their own addresses',
             'Riders can delete their own addresses'
           )
         ) = 4 then 'ok' else 'MISSING' end
  union all
  select 'addresses payload check constraint',
         case when (
           select count(*) from pg_constraint where conname = 'addresses_payload_is_valid'
         ) = 1 then 'ok' else 'MISSING' end
  union all
  select 'one default address per user',
         case when (
           select count(*) from pg_indexes
           where schemaname = 'public' and indexname = 'addresses_one_default_per_user'
             and indexdef like '%is_default%'
         ) = 1 then 'ok' else 'MISSING' end
  union all
  select 'more than one default per user',
         case when (
           select count(*) from (
             select user_id from public.addresses where is_default group by user_id having count(*) > 1
           ) as offenders
         ) = 0 then 'ok' else 'DUPLICATES' end
  union all
  select 'address triggers present',
         case when (
           select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
           join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname = 'addresses'
             and not t.tgisinternal
             and t.tgname in ('addresses_set_updated_at','addresses_clear_other_defaults','addresses_sync_default')
         ) = 3 then 'ok' else 'MISSING' end
  union all
  select 'default address is mirrored to the profile',
         case when (
           select count(*)
           from public.addresses a
           where a.is_default
             and exists (
               select 1 from public.profiles p
               where p.id = a.user_id
                 and p.default_shipping_address ->> 'line1' = a.line1
                 and p.default_shipping_address ->> 'country_code' = a.country_code
             )
         ) = (select count(*) from public.addresses where is_default) then 'ok' else 'OUT OF SYNC' end
  union all
  select 'riders with addresses always have a default',
         case when (
           select count(*) from (
             select user_id from public.addresses group by user_id
             having count(*) filter (where is_default) <> 1
           ) as offenders
         ) = 0 then 'ok' else 'MISSING DEFAULT' end
  union all
  select 'order_tracking view',
         case when to_regclass('public.order_tracking') is not null then 'ok' else 'MISSING' end
  union all
  select 'account_order_items view',
         case when to_regclass('public.account_order_items') is not null then 'ok' else 'MISSING' end
  union all
  select 'views hide the admin note',
         case when (
           select count(*) from information_schema.columns
           where table_schema = 'public' and table_name in ('order_tracking','account_order_items')
             and column_name = 'admin_note'
         ) = 0 then 'ok' else 'LEAKED' end
  union all
  select 'views are scoped to the signed-in rider',
         case when (
           select count(*) from pg_views
           where schemaname = 'public'
             and viewname in ('order_tracking','account_order_items')
             and definition like '%auth.uid()%'
         ) = 2 then 'ok' else 'MISSING' end
  union all
  select 'views readable by riders only',
         case when (
           select count(*)
           from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public'
             and c.relname in ('order_tracking','account_order_items')
             and has_table_privilege('authenticated', c.oid, 'select')
             and not has_table_privilege('anon', c.oid, 'select')
         ) = 2 then 'ok' else 'BAD GRANTS' end
  union all
  select 'order list index',
         case when (
           select count(*) from pg_indexes
           where schemaname = 'public' and indexname = 'orders_user_created_at_idx'
         ) = 1 then 'ok' else 'MISSING' end
)
select check_name, result from checks order by check_name;
