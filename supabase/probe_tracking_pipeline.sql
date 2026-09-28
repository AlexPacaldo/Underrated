-- Proves the tracking pipeline end to end without a Bigate account.
--
-- Walks a parcel through the states a real one goes through, using the real RPCs,
-- starting from a genuinely pre-dispatch order and reporting fourteen checks in a
-- single result set:
--   paid -> picked_up (which ships the order) -> delivered, plus a retried
--   delivery and a late out-of-order scan.
--
-- The order is deliberately not marked shipped by hand. Before
-- 20260928005000 the probe had to do that first, which is exactly the manual step
-- that the migration removes, so a probe that faked it would have kept passing
-- while the real workflow stayed broken. From that migration the courier's first
-- collection scan is what ships the order, and the probe checks that it did.
--
-- It cannot prove the HTTP call to Bigate. That needs credentials.
--
-- How to read the output: the SQL editor shows only the last statement that
-- returns rows, which is the report. Every row must show pass = true. Checks 12
-- and 13 confirm the revokes did not break the account page, so one run is
-- enough and you do not need a second.
--
-- Cleanup is explicit rather than a transaction rollback, because the report has
-- to be the last statement. The order and its fulfillment row are snapshotted
-- first and put back exactly as they were, then the probe rows are deleted. If
-- any statement throws, the whole thing aborts and nothing changes.

begin;

-- Fail early and clearly rather than midway through with a confusing error.
do $$
begin
  if not exists (select 1 from public.orders where status in ('paid', 'processing')) then
    raise exception 'No paid or processing order exists to probe. Create one first, or point this at a specific order number.';
  end if;
end;
$$;

-- Leave nothing behind if a previous run was interrupted. These are session-local
-- tables, so this only affects a reused editor connection.
drop table if exists probe_report;
drop table if exists probe_step;
drop table if exists probe_snapshot;

-- Snapshot the order we are about to touch, so cleanup can restore it exactly.
-- The fulfillment fields are captured because the tracking RPC writes to that
-- row, and it may not have existed beforehand. order_fulfillment is keyed on
-- order_id, so a null order_id in the left join means the row is absent and
-- cleanup should delete whatever the probe creates.
create temporary table probe_snapshot on commit drop as
select orders.id,
       orders.order_number,
       orders.status as original_status,
       fulfillment.order_id as fulfillment_order_id,
       fulfillment.shipped_at as original_shipped_at,
       fulfillment.tracking_number as original_tracking_number,
       fulfillment.delivered_at as original_delivered_at
from public.orders
left join public.order_fulfillment as fulfillment on fulfillment.order_id = orders.id
where orders.status in ('paid', 'processing')
order by orders.created_at desc
limit 1;

-- Holds each RPC's return value. The RPCs are called through the insert rather
-- than in a separate select, so the result is captured and the state change
-- happens in the same statement.
create temporary table probe_step (n int, j jsonb) on commit drop;

-- Row level security is pointless on a temporary table: it lives in a private
-- per-session schema that anon and authenticated can never see. These are here
-- only to stop the SQL editor warning about the temp tables above.
alter table probe_snapshot enable row level security;
alter table probe_step enable row level security;

-- Stand in for a parcel booked through the admin page.
insert into public.shipments (order_id, provider, client_reference, awb, courier_code, status, weight_kg, parcel_count)
select id, 'bigate', order_number, 'PROBE-AWB-1', 'JNT', 'label_created', 1.5, 1
from probe_snapshot;

-- Nothing is marked shipped by hand here.
--
-- This used to set the order to 'shipped' and write a shipped_at before the
-- first scan, because that was the only thing the RPC expected to find. From
-- 20260928005000 the courier's first collection scan does both, so doing it here
-- would hide the behaviour this probe exists to check. The order is left in
-- whatever pre-dispatch state it was found in.
--
-- Capture that starting state before the first scan moves it.
insert into probe_step values (0, (
  select jsonb_build_object(
    'status', orders.status,
    'has_shipped_at', fulfillment.shipped_at is not null
  )
  from public.orders
  left join public.order_fulfillment as fulfillment on fulfillment.order_id = orders.id
  where orders.id = (select id from probe_snapshot)
));

-- 1. The courier collects the parcel. This one scan is expected to move the order
--    to 'shipped' and stamp shipped_at from the scan's own timestamp, which is a
--    fixed instant below so the recorded value can be asserted exactly.
insert into probe_step values (1, public.logistics_record_tracking_event(
  p_awb => 'PROBE-AWB-1', p_client_reference => null, p_event_id => 'probe-evt-1',
  p_status => 'picked_up', p_provider_status => 'PICKED_UP',
  p_occurred_at => '2026-09-28T10:00:00Z'::timestamptz
));

-- The order state immediately after collection, before delivery touches it.
insert into probe_step values (2, (
  select jsonb_build_object(
    'status', orders.status,
    'has_shipped_at', fulfillment.shipped_at is not null,
    'shipped_at_is_the_scan_time', fulfillment.shipped_at = '2026-09-28T10:00:00Z'::timestamptz,
    'tracking_number', fulfillment.tracking_number
  )
  from public.orders
  left join public.order_fulfillment as fulfillment on fulfillment.order_id = orders.id
  where orders.id = (select id from probe_snapshot)
));

-- 3. Delivery. Expect duplicate=false, status=delivered, order moved to delivered.
insert into probe_step values (3, public.logistics_record_tracking_event(
  p_awb => 'PROBE-AWB-1', p_client_reference => null, p_event_id => 'probe-evt-2',
  p_status => 'delivered', p_provider_status => 'DELIVERED', p_occurred_at => now()
));

-- 4. Bigate retries the same delivery. Expect duplicate=true, nothing moves.
insert into probe_step values (4, public.logistics_record_tracking_event(
  p_awb => 'PROBE-AWB-1', p_client_reference => null, p_event_id => 'probe-evt-2',
  p_status => 'delivered', p_provider_status => 'DELIVERED', p_occurred_at => now()
));

-- 5. A late replay of the transit scan, after delivery already landed.
--    Expect duplicate=false, status still delivered, ignored_out_of_order=true.
insert into probe_step values (5, public.logistics_record_tracking_event(
  p_awb => 'PROBE-AWB-1', p_client_reference => null, p_event_id => 'probe-evt-3',
  p_status => 'in_transit', p_provider_status => 'IN_TRANSIT', p_occurred_at => now()
));

-- The report, built while the data is still live.
--
-- Deliberately not `on commit drop`: the cleanup commits below, and the report is
-- selected after that commit so it can be the last statement. The drop-if-exists
-- guards above let the script be run twice in one session.
create temporary table probe_report as
select
  n,
  check_name,
  expected,
  actual,
  (expected = actual) as pass
from (
  -- Step 0: the starting point. The probe refuses to pre-mark the order shipped,
  -- so this has to genuinely be a pre-dispatch state for the rest to mean
  -- anything.
  select 0 as n,
    'order starts pre-dispatch and undated' as check_name,
    'pre-dispatch' as expected,
    (select case when (j->>'status') in ('paid', 'processing') then 'pre-dispatch' else j->>'status' end
       from probe_step where n = 0) as actual

  -- Step 1: the collection scan moves the parcel on and reports that it took the
  -- order with it. Without the third field this would still pass on a build where
  -- the parcel advanced but the order never did.
  union all select 1,
    'collection scan moves the parcel and ships the order',
    'false / picked_up / shipped',
    (select (j->>'duplicate') || ' / ' || (j->>'status') || ' / ' || (j->>'order_status_changed_to')
       from probe_step where n = 1)

  -- The behaviour added in 20260928005000, checked against the order row rather
  -- than the RPC's own return value, because the row is what the storefront reads.
  union all select 2,
    'collection scan stamped the order shipped with a timestamp',
    'shipped / true',
    (select (j->>'status') || ' / ' || (j->>'has_shipped_at') from probe_step where n = 2)

  -- The date has to be when the parcel actually left, not when the callback
  -- happened to arrive, so this asserts the exact instant the scan carried.
  union all select 3,
    'shipped_at is the scan timestamp, not the insert time',
    'true / PROBE-AWB-1',
    (select (j->>'shipped_at_is_the_scan_time') || ' / ' || coalesce(j->>'tracking_number', 'null')
       from probe_step where n = 2)

  -- Step 3: delivery applies and closes the order. This only reaches 'delivered'
  -- because the collection scan above shipped the order first, so it also proves
  -- the new state machine reaches delivery without a human pressing a button.
  union all select 4,
    'delivery closes the order',
    'false / delivered / delivered',
    (select (j->>'duplicate') || ' / ' || (j->>'status') || ' / ' || (j->>'order_status_changed_to')
       from probe_step where n = 3)

  -- Step 4: the idempotency key. Bigate retries, we must not double-apply.
  union all select 5,
    'retried delivery is a no-op',
    'true / delivered',
    (select (j->>'duplicate') || ' / ' || (j->>'status') from probe_step where n = 4)

  -- Step 5: the monotonic guard. The stale event is stored but does not rewind.
  union all select 6,
    'stale scan is ignored, parcel stays delivered',
    'false / delivered / true',
    (select (j->>'duplicate') || ' / ' || (j->>'status') || ' / ' || (j->>'ignored_out_of_order')
       from probe_step where n = 5)

  union all select 7,
    'order ended delivered with delivered_at',
    'delivered / true',
    (select orders.status || ' / ' || (fulfillment.delivered_at is not null)::text
       from public.orders
       join public.shipments on shipments.order_id = orders.id
       left join public.order_fulfillment as fulfillment on fulfillment.order_id = orders.id
      where shipments.awb = 'PROBE-AWB-1')

  union all select 8,
    'parcel ended delivered, single parcel',
    'delivered / 1',
    (select status || ' / ' || parcel_count::text
       from public.shipments where awb = 'PROBE-AWB-1')

  -- Four events were sent but only three are stored: the retried delivery in
  -- step 4 returns early and writes nothing. Three rows with three distinct ids
  -- is the proof that the idempotency key works.
  union all select 9,
    'four events sent, retry stored only once',
    '3 / 3',
    (select count(*)::text || ' / ' || count(distinct provider_event_id)::text
       from public.logistics_events where awb = 'PROBE-AWB-1')

  -- Exactly one parcel was created for the order, despite five separate
  -- statements touching shipments.
  union all select 10,
    'exactly one parcel created for the order',
    '1',
    (select count(*)::text from public.shipments
      where order_id = (select order_id from public.shipments where awb = 'PROBE-AWB-1'))

  -- The customer view is scoped to auth.uid(), and the SQL editor is not a
  -- signed-in rider, so zero rows is the correct answer, not a failure.
  union all select 11,
    'view is rider-scoped (0 rows is correct here)',
    '0',
    (select count(*)::text from public.order_tracking_updates where awb = 'PROBE-AWB-1')

  -- The revokes in 20260928004000. This is the check that would catch the revoke
  -- breaking the account page.
  union all select 12,
    'tables closed to public, view readable',
    'false / false / true',
    (select has_table_privilege('anon', 'public.shipments', 'select') || ' / ' ||
            has_table_privilege('authenticated', 'public.shipments', 'select') || ' / ' ||
            has_table_privilege('authenticated', 'public.order_tracking_updates', 'select'))

  union all select 13,
    'webhook function not callable by the public',
    'false / false / true',
    (select has_function_privilege('anon', 'public.logistics_record_tracking_event(text,text,text,text,text,timestamptz,text,text,jsonb)', 'execute') || ' / ' ||
            has_function_privilege('authenticated', 'public.logistics_record_tracking_event(text,text,text,text,text,timestamptz,text,text,jsonb)', 'execute') || ' / ' ||
            has_function_privilege('service_role', 'public.logistics_record_tracking_event(text,text,text,text,text,timestamptz,text,text,jsonb)', 'execute'))
) as checks;

alter table probe_report enable row level security;

-- Put the order back exactly as it was found.
delete from public.logistics_events where awb = 'PROBE-AWB-1';
delete from public.shipments where awb = 'PROBE-AWB-1';

update public.orders
set status = (select original_status::public.order_status from probe_snapshot
               where orders.id = probe_snapshot.id)
where id = (select id from probe_snapshot);

-- If a fulfillment row existed beforehand, restore its fields. If the probe
-- created it, remove it.
delete from public.order_fulfillment
where order_id in (select id from probe_snapshot where fulfillment_order_id is null);

update public.order_fulfillment as fulfillment
set shipped_at = snapshot.original_shipped_at,
    tracking_number = snapshot.original_tracking_number,
    delivered_at = snapshot.original_delivered_at
from probe_snapshot as snapshot
where fulfillment.order_id = snapshot.id
  and snapshot.fulfillment_order_id is not null;

commit;

-- The report. This is the last statement that returns rows, so it is the grid the
-- SQL editor shows. Every row must read pass = true.
select n, check_name, expected, actual, pass
from probe_report
order by n;
