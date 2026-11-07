create or replace function public.admin_set_product_variation(
  p_product_id text,
  p_finish text,
  p_stock_quantity integer,
  p_price_php_cents integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.products%rowtype;
  v_reserved integer;
  v_stock_map jsonb;
  v_variations jsonb;
begin
  if not public.is_store_admin() then
    raise exception 'Only store administrators can manage product variations.';
  end if;
  if p_stock_quantity is null or p_stock_quantity < 0 then
    raise exception 'Stock quantity must be a non-negative whole number.';
  end if;
  if p_price_php_cents is not null and p_price_php_cents < 0 then
    raise exception 'Price must be a non-negative amount.';
  end if;

  select * into v_product
  from public.products
  where id = p_product_id
  for update;
  if not found then raise exception 'Shop item not found.'; end if;
  if not (v_product.finishes ? p_finish) then
    raise exception 'This variation is no longer available.';
  end if;

  v_reserved := coalesce((v_product.finish_reserved_stock ->> p_finish)::integer, 0);
  if p_stock_quantity < v_reserved then
    raise exception 'Stock cannot be lower than % unit(s) reserved for this variation.', v_reserved;
  end if;

  v_stock_map := jsonb_set(v_product.finish_stock, array[p_finish], to_jsonb(p_stock_quantity), true);
  v_variations := v_product.variations;
  if p_price_php_cents is not null then
    if not exists (
      select 1
      from jsonb_array_elements(v_product.variations) as variation(value)
      where variation.value ->> 'finish' = p_finish
    ) then
      raise exception 'This variation has no editable price.';
    end if;
    select jsonb_agg(
      case
        when variation.value ->> 'finish' = p_finish
          then jsonb_set(variation.value, '{price_php_cents}', to_jsonb(p_price_php_cents), true)
        else variation.value
      end
      order by variation.ordinality
    )
    into v_variations
    from jsonb_array_elements(v_product.variations) with ordinality as variation(value, ordinality);
  end if;

  update public.products
  set finish_stock = v_stock_map,
      variations = coalesce(v_variations, '[]'::jsonb),
      stock_quantity = (select coalesce(sum(value::integer), 0)::integer from jsonb_each_text(v_stock_map))
  where id = p_product_id;

  return jsonb_build_object(
    'product_id', p_product_id,
    'finish', p_finish,
    'stock_quantity', p_stock_quantity,
    'reserved_quantity', v_reserved,
    'price_php_cents', p_price_php_cents
  );
end;
$$;

revoke all on function public.admin_set_product_variation(text, text, integer, integer) from public;
grant execute on function public.admin_set_product_variation(text, text, integer, integer) to authenticated;
