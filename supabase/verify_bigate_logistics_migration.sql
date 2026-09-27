-- Verifies the two Bigate logistics migrations after they have been applied.
-- Run it in the Supabase SQL editor. Everything reports through a single result
-- set so a failure is readable without scrolling: every check is listed, and only
-- 'FAIL' rows mean something is wrong.
--
-- Checks 4 to 8 are the ones that matter most. The grants are what stop a
-- stranger from writing tracking events, and the enum and constraint are what
-- stop a second parcel being booked for an order that is already on its way.

with checks as (
  select
    '1. order_status accepts returned'::text as check_name,
    'returned'::text = any (
      select e.enumlabel
      from pg_type t
      join pg_enum e on e.enumtypid = t.oid
      where t.typname = 'order_status'
    ) as passed
  union all
  select
    '2. the shipments table exists with rls enabled',
    (
      select c.relrowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'shipments'
    ) is true
  union all
  select
    '3. the logistics_events table exists with rls enabled',
    (
      select c.relrowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'logistics_events'
    ) is true
  union all
  select
    -- The whole security model of the webhook rests on this one row.
    '4. the tracking rpc is executable by service_role only',
    (
      select array_agg(g.grantee::text order by g.grantee::text) = array['service_role']
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      join information_schema.routine_privileges g
        on g.specific_name = p.proname
        and g.grantee in ('service_role', 'authenticated', 'anon', 'public')
      where n.nspname = 'public'
        and p.proname = 'logistics_record_tracking_event'
    ) is true
  union all
  select
    '5. neither shipments nor logistics_events is readable by anon',
    not exists (
      select 1
      from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name in ('shipments', 'logistics_events')
        and grantee in ('anon', 'authenticated')
        and privilege_type = 'SELECT'
    )
  union all
  select
    '6. an awb is unique per provider',
    (
      select count(*)
      from pg_constraint
      where conrelid = 'public.shipments'::regclass
        and contype = 'u'
        and pg_get_constraintdef(oid) like '%provider%awb%'
    ) = 1
  union all
  select
    '7. a provider event id is unique, so retries are recognised',
    (
      select count(*)
      from pg_constraint
      where conrelid = 'public.logistics_events'::regclass
        and contype = 'u'
        and pg_get_constraintdef(oid) like '%provider%provider_event_id%'
    ) = 1
  union all
  select
    '8. an order cannot have two live shipments',
    (
      select count(*)
      from pg_indexes
      where schemaname = 'public'
        and indexname = 'shipments_one_active_per_order'
    ) = 1
  union all
  select
    '9. the customer tracking view filters on auth.uid()',
    (
      select count(*)
      from pg_views
      where schemaname = 'public'
        and viewname = 'order_tracking_updates'
        and definition like '%auth.uid()%'
    ) = 1
  union all
  select
    -- The view must not leak the waybill link or admin notes to a customer.
    '10. the customer tracking view excludes the waybill link',
    not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'order_tracking_updates'
        and column_name = 'waybill_url'
    )
  union all
  select
    '11. every stored shipment status is a value the integration can write',
    not exists (
      select 1
      from public.shipments
      where status not in (
        'label_created', 'picked_up', 'in_transit', 'out_for_delivery',
        'delivered', 'rts', 'failed_attempt', 'cancelled', 'info_received', 'unknown'
      )
    )
  union all
  select
    -- Without this a returned parcel could only be cancelled, so a recoverable
    -- delivery failure would force a refund.
    '12. the admin rpc allows a returned order to be reshipped',
    (
      select p.prosrc like '%returned%and p_status::text = ''processing''%'
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'admin_update_order_status'
    ) is true
  union all
  select
    -- The parcel is at the depot, not with the rider.
    '13. the admin rpc does not allow a returned order to be marked delivered',
    (
      select p.prosrc not like '%returned%and p_status::text = ''delivered''%'
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'admin_update_order_status'
    ) is true
)
select check_name, passed, case when passed then 'PASS' else 'FAIL' end as result from checks order by check_name;
