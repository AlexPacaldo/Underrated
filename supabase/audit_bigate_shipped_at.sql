-- Two things worth looking at by eye after applying the Bigate migrations.
-- Each block is a separate statement: run them one at a time, because the SQL
-- editor shows only the last statement of a paste.
--
-- These are not pass/fail checks. They are for reading, and both answer a
-- question the automated report cannot.

-- ------------------------------------------------------------------
-- 1. The raw ACL on the tracking function.
--
-- Only needed if check 4 in verify_bigate_logistics_migration.sql fails. It says
-- exactly which roles hold EXECUTE, with none of the interpretation problems of
-- information_schema.routine_privileges, which builds from an exploded ACL and can
-- report one row per (grantee, grantor) pair. A correct result is
-- {postgres=X/postgres,service_role=X/postgres} with anon and authenticated both
-- false. There must be no bare '=X/postgres' entry, because that is PUBLIC.
-- ------------------------------------------------------------------
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
-- 2. Every order carrying a shipped_at date.
--
-- Check 15 in the report catches the provable cases automatically, because
-- 20260928003000 clears shipped_at on orders still sitting in pending_payment,
-- payment_submitted, paid or processing. This is here for the ambiguous ones: an
-- order that was genuinely shipped and has since been cancelled, rejected,
-- returned or delivered keeps a correct shipped_at, and only a person can tell
-- those from a date stamped by the bug.
--
-- No rows at all is a good result. It means nothing in the store has ever been
-- marked shipped, so there was no data for the repair to fix.
--
-- A shipped_at within a few minutes of when you applied 03000, on an order that
-- never reached 'shipped', is the bug.
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