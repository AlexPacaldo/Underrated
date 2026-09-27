-- 20260928001000_bigate_tracking_rpc.sql
-- Applies one Bigate tracking callback, atomically and idempotently.
--
-- This is a separate file from 20260928000000 because it uses the 'returned'
-- enum value that file added. Postgres refuses to use a value added by ALTER TYPE
-- within the same transaction, and each migration file runs in its own
-- transaction, so the split is what makes this work on a fresh apply.
--
-- Why a function and not a sequence of PostgREST calls: an event is "insert the
-- event, move the shipment, maybe close the order". In SQL that is one atomic
-- step, guarded by the unique provider event id, so two simultaneous retries
-- cannot both apply. PostgREST cannot express that.
--
-- Access: service_role only. The webhook endpoint has no user session, and
-- admin_update_order_status deliberately requires a signed-in store
-- administrator, so this function grants the courier integration exactly the
-- narrow capability it needs without borrowing anyone's authority and without
-- opening the admin path to a machine caller.

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
  -- us, and a replay can re-send an older event; neither may walk the parcel
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

  -- Only the two genuinely terminal states move the order. Picked up and in
  -- transit change nothing: orders.status is already 'shipped' by then, and the
  -- admin transition rules would reject a rewrite anyway.
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

-- service_role is the only role that may call this. PUBLIC and anon must not,
-- because the endpoint behind it is unauthenticated apart from its signature.
revoke all on function public.logistics_record_tracking_event(text, text, text, text, text, timestamptz, text, text, jsonb) from public;
revoke all on function public.logistics_record_tracking_event(text, text, text, text, text, timestamptz, text, text, jsonb) from anon;
revoke all on function public.logistics_record_tracking_event(text, text, text, text, text, timestamptz, text, text, jsonb) from authenticated;
grant execute on function public.logistics_record_tracking_event(text, text, text, text, text, timestamptz, text, text, jsonb) to service_role;
