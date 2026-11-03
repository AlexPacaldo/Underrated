-- Keep the enum's legacy values so historical payment submissions remain
-- readable, but accept PayPal only for new submissions.
create or replace function public.submit_manual_payment(
  p_order_id uuid,
  p_payment_method public.manual_payment_method,
  p_reference_number text,
  p_payer_name text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to submit payment.';
  end if;
  if p_payment_method <> 'paypal'::public.manual_payment_method then
    raise exception 'PayPal is the only accepted payment method.';
  end if;
  if btrim(coalesce(p_reference_number, '')) = '' then
    raise exception 'A payment reference is required.';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id and user_id = auth.uid()
  for update;

  if not found or v_order.status <> 'pending_payment' then
    raise exception 'This order is not awaiting payment.';
  end if;

  insert into public.manual_payment_submissions (
    order_id,
    user_id,
    payment_method,
    reference_number,
    payer_name,
    note
  )
  values (
    p_order_id,
    auth.uid(),
    p_payment_method,
    btrim(p_reference_number),
    nullif(btrim(coalesce(p_payer_name, '')), ''),
    nullif(btrim(coalesce(p_note, '')), '')
  );

  update public.orders
  set status = 'payment_submitted'
  where id = p_order_id;

  return jsonb_build_object(
    'id', v_order.id,
    'order_number', v_order.order_number,
    'status', 'payment_submitted',
    'total_cents', v_order.total_cents,
    'currency', v_order.currency,
    'display_currency', v_order.display_currency,
    'fx_rate', v_order.fx_rate,
    'shipping_address', v_order.shipping_address
  );
end;
$$;
