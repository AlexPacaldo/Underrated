-- Store an independent PHP price on each product variation while preserving
-- the existing product price for older or unpriced combinations.
update public.products as product
set variations = coalesce(
  (
    select jsonb_agg(
      case
        when variation.value ? 'price_php_cents' then variation.value
        else jsonb_set(variation.value, '{price_php_cents}', to_jsonb(product.price_php_cents), true)
      end
      order by variation.ordinality
    )
    from jsonb_array_elements(product.variations) with ordinality as variation(value, ordinality)
  ),
  '[]'::jsonb
)
where jsonb_typeof(product.variations) = 'array'
  and jsonb_array_length(product.variations) > 0;

create or replace function public.create_manual_order(
  p_items jsonb,
  p_shipping_address jsonb,
  p_shipping_region text,
  p_display_currency text default 'PHP',
  p_fx_rate numeric default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_order_id uuid;
  v_order_number text;
  v_status public.order_status;
  v_total_cents integer;
  v_subtotal_cents integer := 0;
  v_shipping_cents integer;
  v_display_currency text := upper(trim(coalesce(p_display_currency, 'PHP')));
  v_fx_rate numeric := coalesce(p_fx_rate, 1);
  v_lines jsonb := '[]'::jsonb;
  v_item jsonb;
  v_product public.products%rowtype;
  v_quantity integer;
  v_finish text;
  v_unit_price integer;
begin
  if v_user_id is null then raise exception 'You must be signed in to create an order.'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Your cart is empty.'; end if;
  if not public.is_valid_delivery_address(p_shipping_address) then raise exception 'A valid delivery address is required.'; end if;
  if p_shipping_region not in ('ph', 'us', 'canada', 'international') then raise exception 'Shipping region is invalid.'; end if;
  if not (
    (p_shipping_address ->> 'country_code' = 'PH' and p_shipping_region = 'ph')
    or (p_shipping_address ->> 'country_code' = 'US' and p_shipping_region = 'us')
    or (p_shipping_address ->> 'country_code' = 'CA' and p_shipping_region = 'canada')
    or (p_shipping_address ->> 'country_code' = 'OTHER' and p_shipping_region = 'international')
  ) then raise exception 'Shipping region does not match the delivery address.'; end if;
  if v_display_currency !~ '^[A-Z]{3}$' or v_fx_rate <= 0 then raise exception 'Currency display is invalid.'; end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    select * into v_product from public.products where id = v_item ->> 'product_id' and archived = false;
    if not found then raise exception 'One of the products is no longer available.'; end if;
    if jsonb_typeof(v_item) <> 'object' or not (v_item ? 'quantity') then raise exception 'A cart line is invalid.'; end if;
    v_quantity := (v_item ->> 'quantity')::integer;
    v_finish := trim(coalesce(v_item ->> 'finish', ''));
    if v_quantity is null or v_quantity < 1 or v_quantity > 99 then raise exception 'Product quantity is invalid.'; end if;
    if v_finish = '' then v_finish := v_product.finishes ->> 0; end if;
    if v_finish = '' or not exists (
      select 1 from jsonb_array_elements_text(v_product.finishes) as available_finish(finish)
      where available_finish.finish = v_finish
    ) then raise exception 'Product finish is invalid.'; end if;

    select coalesce(
      (
        select (variation.value ->> 'price_php_cents')::integer
        from jsonb_array_elements(v_product.variations) as variation(value)
        where variation.value ->> 'finish' = v_finish
          and variation.value ? 'price_php_cents'
        limit 1
      ),
      v_product.price_php_cents
    ) into v_unit_price;
    if v_unit_price < 0 then raise exception 'Variation price is invalid for %.', v_finish; end if;

    v_subtotal_cents := v_subtotal_cents + (v_unit_price * v_quantity);
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id', v_product.id, 'product_name', v_product.name, 'finish', v_finish,
      'quantity', v_quantity, 'unit_price_cents', v_unit_price,
      'line_total_cents', v_unit_price * v_quantity
    ));
  end loop;

  v_shipping_cents := public.calculate_shipping_cents(p_items, p_shipping_address, p_shipping_region, v_subtotal_cents);
  v_total_cents := v_subtotal_cents + v_shipping_cents;
  insert into public.orders (user_id, shipping_region, shipping_address, subtotal_cents, shipping_cents, total_cents, currency, display_currency, fx_rate)
  values (v_user_id, p_shipping_region, p_shipping_address, v_subtotal_cents, v_shipping_cents, v_total_cents, 'PHP', v_display_currency, v_fx_rate)
  returning id, order_number, status, total_cents into v_order_id, v_order_number, v_status, v_total_cents;

  insert into public.order_items (order_id, product_id, product_name, finish, quantity, unit_price_cents, line_total_cents)
  select v_order_id, item ->> 'product_id', item ->> 'product_name', item ->> 'finish',
    (item ->> 'quantity')::integer, (item ->> 'unit_price_cents')::integer, (item ->> 'line_total_cents')::integer
  from jsonb_array_elements(v_lines) as item;

  return jsonb_build_object('id', v_order_id, 'order_number', v_order_number, 'status', v_status,
    'total_cents', v_total_cents, 'currency', 'PHP', 'display_currency', v_display_currency,
    'fx_rate', v_fx_rate, 'shipping_address', p_shipping_address);
end;
$$;

revoke all on function public.create_manual_order(jsonb, jsonb, text, text, numeric) from public;
grant execute on function public.create_manual_order(jsonb, jsonb, text, text, numeric) to authenticated;
