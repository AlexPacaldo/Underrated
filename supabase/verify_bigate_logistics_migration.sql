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
    --
    -- Written with has_function_privilege rather than information_schema.
    -- routine_privileges: that view is built from an exploded ACL and can emit one
    -- row per (grantee, grantor) pair, it renders the PUBLIC grantee in upper
    -- case, and after a REVOKE the owner holds an explicit ACL entry too. Any of
    -- those turns an equality test on a grantee list into a false FAIL. Asking the
    -- engine the direct question cannot be misread.
    '4. the tracking rpc is executable by service_role only',
    has_function_privilege(
      'service_role',
      'public.logistics_record_tracking_event(text,text,text,text,text,timestamptz,text,text,jsonb)',
      'EXECUTE'
    )
    and not has_function_privilege(
      'anon',
      'public.logistics_record_tracking_event(text,text,text,text,text,timestamptz,text,text,jsonb)',
      'EXECUTE'
    )
    and not has_function_privilege(
      'authenticated',
      'public.logistics_record_tracking_event(text,text,text,text,text,timestamptz,text,text,jsonb)',
      'EXECUTE'
    )
  union all
  select
    -- This failed the first time it was run, and it was the check that was right.
    -- Supabase's default privileges grant all on every new table in public to anon
    -- and authenticated, so creating the two logistics tables handed the browser
    -- roles full grants. RLS with no policies made them inert, but the privilege
    -- was there. 20260928004000 removes them.
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
  union all
  select
    -- Regression guard. 20260928002000 left a coalesce(..., now()) on the
    -- shipped_at fallback, which stamped shipped_at on every status save. The
    -- fallback must be a bare column reference, or the bug is back.
    '14. saving an order status does not stamp shipped_at on its own',
    (
      select p.prosrc like '%when p_status::text = ''shipped'' then coalesce(v_fulfillment.shipped_at, now())%'
        and p.prosrc like '%else v_fulfillment.shipped_at%'
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'admin_update_order_status'
    ) is true
  union all
  select
    '15. no pre-dispatch order carries a shipped_at date',
    not exists (
      select 1
      from public.order_fulfillment
      join public.orders on orders.id = order_fulfillment.order_id
      where order_fulfillment.shipped_at is not null
        and orders.status in ('pending_payment', 'payment_submitted', 'paid', 'processing')
    )
  union all
  select
    -- The view is what customers read instead, so it must still be reachable after
    -- 20260928004000 took the table grants away. It is declared
    -- security_invoker = off, so it runs as its owner and does not need them.
    '16. a signed-in rider can still read their tracking view',
    has_table_privilege('authenticated', 'public.order_tracking_updates', 'SELECT')
)
select check_name, passed, case when passed then 'PASS' else 'FAIL' end as result from checks order by check_name;

-- If check 4 fails, this prints the raw ACL, which says exactly which roles hold
-- EXECUTE without the interpretation problems of information_schema.
select
  p.proname as function,
  p.proacl as acl,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_may_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_may_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_may_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'logistics_record_tracking_event';

-- ------------------------------------------------------------------
-- Rows 14 and 15 cannot be checked automatically, because a shipped order that
-- was later cancelled keeps a correct shipped_at. Run this by eye after applying
-- the migrations. Anything listed here was either saved while pre-dispatch (the
-- bug) or genuinely shipped and was then closed. A shipped_at within a few
-- minutes of the migration timestamp, on an order that never reached 'shipped',
-- is the bug.
-- ------------------------------------------------------------------
select
  orders.order_number,
  orders.status::text as status,
  order_fulfillment.shipped_at,
  order_fulfillment.delivered_at,
  order_fulfillment.updated_at as row_last_touched
from public.order_fulfillment
join public.orders on orders.id = order_fulfillment.order_id
where order_fulfillment.shipped_at is not null
order by order_fulfillment.shipped_at desc nulls last;
