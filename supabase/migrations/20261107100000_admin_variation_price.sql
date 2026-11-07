create or replace function public.admin_set_product_variation_price(
  p_product_id text,
  p_finish text,
  p_price_php_cents integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.products%rowtype;
  v_variations jsonb;
begin
  if not public.is_store_admin() then
    raise exception 'Only store administrators can manage product prices.';
  end if;
  if p_price_php_cents is null or p_price_php_cents < 0 then
    raise exception 'Price must be a non-negative amount.';
  end if;

  select * into v_product
  from public.products
  where id = p_product_id
  for update;
  if not found then raise exception 'Shop item not found.'; end if;
  if not exists (
    select 1
    from jsonb_array_elements(v_product.variations) as variation(value)
    where variation.value ->> 'finish' = p_finish
  ) then
    raise exception 'This product variation is no longer available.';
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

  update public.products
  set variations = coalesce(v_variations, '[]'::jsonb)
  where id = p_product_id;

  return jsonb_build_object(
    'product_id', p_product_id,
    'finish', p_finish,
    'price_php_cents', p_price_php_cents
  );
end;
$$;

revoke all on function public.admin_set_product_variation_price(text, text, integer) from public;
grant execute on function public.admin_set_product_variation_price(text, text, integer) to authenticated;
