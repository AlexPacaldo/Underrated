-- 20260928005000_shipped_at_on_first_scan.sql
-- Marks an order shipped when the courier collects the parcel, instead of waiting
-- for a member of staff to do it by hand.
--
-- Why this was manual and is no longer. Until now the only way an order reached
-- 'shipped' was an admin calling admin_update_order_status, which meant the
-- shipped_at date and the first courier scan were two independent records of the
-- same event. They drifted: an order could show a waybill and a delivered parcel
-- with no shipped_at at all, and nothing in the database noticed. It also made
-- delivery depend on a human having pressed a button first, because
-- logistics_record_tracking_event only closes an order whose status is already
-- 'shipped'. Miss that button and the parcel is delivered on paper while the
-- order sits in processing forever.
--
-- What changes. On the courier's first collection scan, the function moves the
-- order from 'paid' or 'processing' to 'shipped' and stamps shipped_at from the
-- scan's own timestamp, which is the moment the parcel actually left.
--
-- Two things this deliberately is not:
--
--   1. It is not a payment transition. Every state it can move to is a
--      fulfilment state, so it cannot rewrite whether an order was paid. The
--      principle from 20260928001000 still holds: a courier state never speaks to
--      the payment state.
--
--   2. It never moves an order backwards or sideways. The update is constrained
--      to orders in 'paid' or 'processing', so a parcel that comes back, is
--      cancelled, or is already delivered is left exactly as it is, and an
--      out-of-order scan cannot resurrect a finished order.
--
-- The transitions allowed here, paid -> shipped and processing -> shipped, are
-- already the two the admin path permits in admin_update_order_status, so this
-- grants the courier integration no authority the staff path does not have.
--
-- This is a fix-forward rather than an edit of 20260928001000, which has already
-- been applied. Editing an applied migration would make the repository disagree
-- with the database. The function is reproduced in full so this file is readable
-- on its own, which is the cost of not being able to patch a deployed definition.

create or replace function public.logistics_record_tracking_event(
  p_awb text,
  p_client_reference text,
  p_event_id text,
  p_status text,
  p_provider_status text,
  p_occurred_at timestamptz,
  p_location text default null,
  p_description text default null,
  p_payload jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shipment public.shipments%rowtype := null;
  v_previous_status text;
  v_applied_status text;
  v_ignored boolean := false;
  v_order_status_changed_to text := null;
  v_occurred timestamptz;
  v_ranks constant jsonb := '{"label_created":0,"info_received":0,"picked_up":1,"in_transit":2,"out_for_delivery":3,"failed_attempt":3,"delivered":4,"rts":4,"cancelled":4}'::jsonb;
  v_previous_rank integer;
  v_next_rank integer;
  v_terminal constant text[] := array['delivered', 'rts', 'cancelled'];
begin
  -- Defence in depth. The grants below are the real gate; this catches a call
  -- that arrives through some other path.
  if current_user not in ('postgres', 'service_role') then
    raise exception 'This function may only be called by the logistics service.';
  end if;

  if coalesce(btrim(p_event_id), '') = '' then
    raise exception 'A provider event id is required so retries can be recognised.';
  end if;

  v_occurred := coalesce(p_occurred_at, now());

  -- Lock the shipment for the rest of the transaction. Without the lock, two
  -- callbacks arriving together can both read the old status and both write.
  -- FOUND is not trusted across statements here; the row is checked explicitly,
  -- because FOUND is only assigned by the statements that actually run.
  if p_awb is not null and btrim(p_awb) <> '' then
    select * into v_shipment
    from public.shipments
    where provider = 'bigate' and awb = btrim(p_awb)
    for update;
  end if;

  if v_shipment.id is null and p_client_reference is not null and btrim(p_client_reference) <> '' then
    select * into v_shipment
    from public.shipments
    where provider = 'bigate' and client_reference = btrim(p_client_reference)
    order by created_at desc
    limit 1
    for update;
  end if;

  if v_shipment.id is null then
    -- An event for a shipment we never recorded. Raising an error makes Bigate
    -- retry, which is the behaviour we want only if the shipment might appear
    -- later; a rejected callback for an unknown AWB would otherwise be lost
    -- silently. The message names the waybill so it can be booked by hand.
    raise exception 'No shipment is recorded for waybill % or reference %. The event was not applied.', p_awb, p_client_reference;
  end if;

  v_previous_status := v_shipment.status;

  -- Idempotency. A retry of an event we already stored is a success with no
  -- writes, which is why the route answers 200 for it.
  if exists (
    select 1 from public.logistics_events
    where provider = 'bigate' and provider_event_id = btrim(p_event_id)
  ) then
    return jsonb_build_object(
      'duplicate', true,
      'shipment_id', v_shipment.id,
      'order_id', v_shipment.order_id,
      'status', v_shipment.status,
      'previous_status', v_shipment.status,
      'ignored_out_of_order', false,
      'order_status_changed_to', null
    );
  end if;

  -- Monotonic guard. A courier can deliver a scan before the transit scan reaches
  -- us, and a retry can re-send an older event; neither may walk the parcel
  -- backwards. 'unknown' never moves the state but is still recorded.
  v_next_rank := coalesce((v_ranks ->> p_status)::integer, -1);
  v_previous_rank := coalesce((v_ranks ->> v_previous_status)::integer, 0);

  if p_status <> 'unknown'
    and not (p_status = v_previous_status)
    and not (v_previous_status = any(v_terminal))
    and v_next_rank >= v_previous_rank then
    v_applied_status := p_status;
  else
    v_applied_status := v_previous_status;
    v_ignored := p_status <> 'unknown';
  end if;

  insert into public.logistics_events (
    provider,
    provider_event_id,
    shipment_id,
    awb,
    client_reference,
    status,
    provider_status,
    occurred_at,
    description,
    location,
    payload
  )
  values (
    'bigate',
    btrim(p_event_id),
    v_shipment.id,
    v_shipment.awb,
    v_shipment.client_reference,
    p_status,
    coalesce(p_provider_status, p_status),
    v_occurred,
    nullif(btrim(coalesce(p_description, '')), ''),
    nullif(btrim(coalesce(p_location, '')), ''),
    coalesce(p_payload, '{}'::jsonb)
  );

  update public.shipments
  set status = v_applied_status,
      provider_status = coalesce(p_provider_status, provider_status),
      last_event_at = greatest(coalesce(last_event_at, v_occurred), v_occurred)
  where id = v_shipment.id;

  -- New in this migration. The courier has the parcel, so the order is shipped.
  --
  -- Guarded on the applied status rather than the requested one, so a stale
  -- replay of a collection scan arriving after delivery cannot reopen the order,
  -- and constrained to the two states a pre-dispatch order can be in. Both
  -- conditions are required: without the first, an out-of-order scan would undo
  -- a delivery; without the second, it would overwrite a cancelled order.
  if p_status = 'picked_up' and v_applied_status = 'picked_up' then
    update public.orders
    set status = 'shipped'
    where id = v_shipment.order_id
      and status in ('paid', 'processing');

    if found then
      v_order_status_changed_to := 'shipped';

      -- coalesce on shipped_at: an admin may have set it already when they marked
      -- the order shipped by hand, and their date should not be overwritten by a
      -- scan that arrived later.
      insert into public.order_fulfillment (order_id, tracking_number, shipped_at)
      values (v_shipment.order_id, v_shipment.awb, v_occurred)
      on conflict (order_id) do update
        set tracking_number = coalesce(public.order_fulfillment.tracking_number, excluded.tracking_number),
            shipped_at = coalesce(public.order_fulfillment.shipped_at, excluded.shipped_at),
            updated_at = now();
    end if;
  end if;

  -- Only the two genuinely terminal states move the order beyond shipped. Picked
  -- up and in transit change nothing beyond the block above: orders.status is
  -- already 'shipped' by then, and the admin transition rules would reject a
  -- rewrite anyway.
  if p_status = 'delivered' and v_applied_status = 'delivered' then
    update public.orders
    set status = 'delivered'
    where id = v_shipment.order_id
      and status = 'shipped';

    if found then
      v_order_status_changed_to := 'delivered';

      insert into public.order_fulfillment (order_id, tracking_number, delivered_at)
      values (v_shipment.order_id, v_shipment.awb, v_occurred)
      on conflict (order_id) do update
        set tracking_number = coalesce(public.order_fulfillment.tracking_number, excluded.tracking_number),
            delivered_at = coalesce(public.order_fulfillment.delivered_at, excluded.delivered_at),
            updated_at = now();
    end if;
  end if;

  if p_status = 'rts' and v_applied_status = 'rts' then
    -- The parcel is coming back. Cancelling is the store's call, not the
    -- courier's, so the order is not cancelled here; it is only marked returned
    -- so staff can decide between reshipping and refunding.
    update public.orders
    set status = 'returned'
    where id = v_shipment.order_id
      and status = 'shipped';

    if found then
      v_order_status_changed_to := 'returned';
    end if;
  end if;

  return jsonb_build_object(
    -- False on the path that reaches here: a duplicate returned above.
    'duplicate', false,
    'shipment_id', v_shipment.id,
    'order_id', v_shipment.order_id,
    'status', v_applied_status,
    'previous_status', v_previous_status,
    'ignored_out_of_order', v_ignored,
    'order_status_changed_to', v_order_status_changed_to
  );
end;
$$;

-- Re-asserted as a matter of hygiene rather than necessity: CREATE OR REPLACE
-- preserves an existing function's ACL, so these would already hold. They are
-- repeated anyway because this file is what a reader will check, and because the
-- cost of the mistake is that every signed-in rider can forge a delivery. If you
-- ever drop and recreate this function by hand instead of replacing it, these
-- lines are the ones that keep the endpoint locked down.
revoke all on function public.logistics_record_tracking_event(text, text, text, text, text, timestamptz, text, text, jsonb) from public;
revoke all on function public.logistics_record_tracking_event(text, text, text, text, text, timestamptz, text, text, jsonb) from anon;
revoke all on function public.logistics_record_tracking_event(text, text, text, text, text, timestamptz, text, text, jsonb) from authenticated;
grant execute on function public.logistics_record_tracking_event(text, text, text, text, text, timestamptz, text, text, jsonb) to service_role;
