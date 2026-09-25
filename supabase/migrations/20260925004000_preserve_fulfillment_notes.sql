-- Preserve fulfillment notes and tracking when a status update omits them.
--
-- admin_update_order_status() overwrote tracking_number, fulfillment_note, and
-- admin_note with excluded.* on every call. Because those columns are built with
-- nullif(btrim(coalesce(p_x, '')), ''), any caller that advanced the status
-- without resubmitting the fields replaced real data with NULL. Marking an order
-- shipped with a tracking number and later moving it to delivered erased the
-- tracking number.
--
-- The three values below now distinguish "not supplied" (NULL parameter) from
-- "explicitly cleared" (empty or whitespace string):
--   NULL            -> keep whatever is already stored
--   '' or '   '     -> clear the field
--   'TRK-123'       -> store the new value

create or replace function public.admin_update_order_status(
  p_order_id uuid,
  p_status public.order_status,
  p_fulfillment_note text default null,
  p_tracking_number text default null,
  p_admin_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_fulfillment public.order_fulfillment%rowtype;
begin
  if not public.is_store_admin() then
    raise exception 'Only store administrators can update orders.';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found.';
  end if;

  if v_order.status is distinct from p_status and not (
    (v_order.status::text = 'pending_payment' and p_status::text = 'cancelled')
    or (v_order.status::text = 'payment_submitted' and p_status::text in ('paid', 'rejected'))
    or (v_order.status::text = 'paid' and p_status::text = 'processing')
    or (v_order.status::text = 'processing' and p_status::text = 'shipped')
    or (v_order.status::text = 'shipped' and p_status::text = 'delivered')
    or (v_order.status::text not in ('cancelled', 'rejected', 'delivered') and p_status::text = 'cancelled')
  ) then
    raise exception 'That order status transition is not allowed.';
  end if;

  select * into v_fulfillment
  from public.order_fulfillment
  where order_id = p_order_id
  for update;

  perform set_config('app.store_admin_change', 'on', true);

  update public.orders
  set status = p_status
  where id = p_order_id
  returning * into v_order;

  insert into public.order_fulfillment (order_id, tracking_number, fulfillment_note, admin_note, paid_at, processing_at, shipped_at, delivered_at, rejected_at, updated_by)
  values (
    p_order_id,
    nullif(btrim(coalesce(p_tracking_number, '')), ''),
    nullif(btrim(coalesce(p_fulfillment_note, '')), ''),
    nullif(btrim(coalesce(p_admin_note, '')), ''),
    case when p_status::text = 'paid' then coalesce(v_fulfillment.paid_at, now()) else v_fulfillment.paid_at end,
    case when p_status::text = 'processing' then coalesce(v_fulfillment.processing_at, now()) else v_fulfillment.processing_at end,
    case when p_status::text = 'shipped' then coalesce(v_fulfillment.shipped_at, now()) else v_fulfillment.shipped_at end,
    case when p_status::text = 'delivered' then coalesce(v_fulfillment.delivered_at, now()) else v_fulfillment.delivered_at end,
    case when p_status::text = 'rejected' then coalesce(v_fulfillment.rejected_at, now()) else v_fulfillment.rejected_at end,
    auth.uid()
  )
  on conflict (order_id) do update set
    tracking_number = case when p_tracking_number is null then order_fulfillment.tracking_number else nullif(btrim(p_tracking_number), '') end,
    fulfillment_note = case when p_fulfillment_note is null then order_fulfillment.fulfillment_note else nullif(btrim(p_fulfillment_note), '') end,
    admin_note = case when p_admin_note is null then order_fulfillment.admin_note else nullif(btrim(p_admin_note), '') end,
    paid_at = excluded.paid_at,
    processing_at = excluded.processing_at,
    shipped_at = excluded.shipped_at,
    delivered_at = excluded.delivered_at,
    rejected_at = excluded.rejected_at,
    updated_by = excluded.updated_by,
    updated_at = now();

  select * into v_fulfillment
  from public.order_fulfillment
  where order_id = p_order_id;

  return to_jsonb(v_order) || jsonb_build_object(
    'tracking_number', v_fulfillment.tracking_number,
    'fulfillment_note', v_fulfillment.fulfillment_note,
    'admin_note', v_fulfillment.admin_note
  );
end;
$$;

revoke all on function public.admin_update_order_status(uuid, public.order_status, text, text, text) from public;
grant execute on function public.admin_update_order_status(uuid, public.order_status, text, text, text) to authenticated;
