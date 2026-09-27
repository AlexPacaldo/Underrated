-- 20260928003000_fix_shipped_at_on_unrelated_status_change.sql
-- Repairs a regression introduced by 20260928002000.
--
-- The bug: 20260928002000 replaced this line
--
--   case when p_status::text = 'shipped'
--     then coalesce(v_fulfillment.shipped_at, now())
--     else v_fulfillment.shipped_at
--   end,
--
-- with a version whose clearing branch for a reship became the *only* branch, and
-- whose fallback was left as coalesce(..., now()). The result stamped shipped_at
-- on every status save, not only on the save that moved the order to 'shipped'.
--
-- The damage: an order whose shipped_at was still null got one written the first
-- time anyone saved it for any other reason, including saving a note without
-- changing the status. A pending_payment order would show the rider "Order shipped
-- out" on the timeline.
--
-- This file is a fix-forward rather than an edit of 20260928002000, because that
-- migration has already been applied. Editing an applied migration makes the
-- repository disagree with the database.

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
  v_previous_status text;
begin
  if not public.is_store_admin() then
    raise exception 'Only store administrators can update orders.';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found.';
  end if;

  v_previous_status := v_order.status::text;

  if v_order.status is distinct from p_status and not (
    (v_order.status::text = 'pending_payment' and p_status::text = 'cancelled')
    or (v_order.status::text = 'payment_submitted' and p_status::text in ('paid', 'rejected'))
    or (v_order.status::text = 'paid' and p_status::text = 'processing')
    or (v_order.status::text = 'processing' and p_status::text = 'shipped')
    or (v_order.status::text = 'shipped' and p_status::text = 'delivered')
    or (v_order.status::text = 'returned' and p_status::text = 'processing')
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
    -- The corrected line. Three cases, in order:
    --   moving to shipped  -> stamp it, once
    --   reshipping a return -> clear the stale dispatch date, because the
    --                          replacement parcel has not left yet
    --   anything else       -> leave it exactly as it was
    case
      when p_status::text = 'shipped' then coalesce(v_fulfillment.shipped_at, now())
      when p_status::text = 'processing' and v_previous_status = 'returned' then null
      else v_fulfillment.shipped_at
    end,
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

-- ------------------------------------------------------------------
-- Data repair.
--
-- Only rows that the state machine proves are wrong are touched. An order can
-- reach 'pending_payment', 'payment_submitted', 'paid' or 'processing' only from
-- an earlier pre-dispatch state, and the allowed transitions never run backwards
-- into them from 'shipped' or 'delivered'. So a non-null shipped_at on an order in
-- one of those four states cannot be legitimate and must be from this bug.
--
-- Rows on cancelled, rejected, shipped, delivered or returned orders are NOT
-- touched: an order that really did ship and was then cancelled or returned keeps
-- a correct shipped_at, and there is no way to tell those apart from the bad ones
-- by status alone. supabase/verify_bigate_logistics_migration.sql lists them for a
-- human to look at.
-- ------------------------------------------------------------------

update public.order_fulfillment
set shipped_at = null
where shipped_at is not null
  and exists (
    select 1
    from public.orders as target
    where target.id = order_fulfillment.order_id
      and target.status in ('pending_payment', 'payment_submitted', 'paid', 'processing')
  );
