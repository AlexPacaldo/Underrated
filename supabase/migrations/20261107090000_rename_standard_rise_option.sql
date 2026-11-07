-- Rename the standard Rise choice to No Rise. Keep reservations under their
-- original finish keys so existing orders can still be shipped or cancelled.
do $$
declare
  v_product record;
  v_variant jsonb;
  v_values jsonb;
  v_new_variations jsonb;
  v_new_attributes jsonb;
  v_new_finishes jsonb;
  v_old_finish text;
  v_new_finish text;
  v_rise_key text;
  v_rise_value text;
  v_stock integer;
  v_reserved integer;
  v_stock_map jsonb;
  v_reserved_map jsonb;
begin
  for v_product in
    select id, variation_attributes, variations, finish_stock, finish_reserved_stock
    from public.products
    where exists (
      select 1
      from jsonb_array_elements(variation_attributes) as attribute(value)
      where lower(attribute.value ->> 'name') = 'rise'
        and exists (
          select 1
          from jsonb_array_elements_text(attribute.value -> 'options') as choice(value)
          where lower(choice.value) = 'standard'
        )
    )
  loop
    v_stock_map := v_product.finish_stock;
    v_reserved_map := v_product.finish_reserved_stock;
    v_new_variations := '[]'::jsonb;

    for v_variant in select value from jsonb_array_elements(v_product.variations)
    loop
      v_values := coalesce(v_variant -> 'values', '{}'::jsonb);
      select key, value into v_rise_key, v_rise_value
      from jsonb_each_text(v_values)
      where lower(key) = 'rise'
      limit 1;

      if found and lower(v_rise_value) = 'standard' then
        v_old_finish := v_variant ->> 'finish';
        if v_old_finish = v_rise_value then
          v_new_finish := 'No Rise';
        else
          v_new_finish := replace(
            v_old_finish,
            v_rise_key || ': ' || v_rise_value,
            'Rise: No Rise'
          );
        end if;

        v_values := (v_values - v_rise_key) || jsonb_build_object('Rise', 'No Rise');
        v_variant := jsonb_set(v_variant, '{finish}', to_jsonb(v_new_finish), true);
        v_variant := jsonb_set(v_variant, '{values}', v_values, true);

        if v_old_finish is distinct from v_new_finish then
          v_stock := coalesce((v_stock_map ->> v_old_finish)::integer, 0);
          v_reserved := coalesce((v_reserved_map ->> v_old_finish)::integer, 0);
          v_stock_map := v_stock_map - v_old_finish;
          v_reserved_map := v_reserved_map - v_old_finish;
          v_stock_map := jsonb_set(v_stock_map, array[v_new_finish], to_jsonb(greatest(v_stock - v_reserved, 0)), true);
          v_reserved_map := jsonb_set(v_reserved_map, array[v_new_finish], '0'::jsonb, true);
          if v_reserved > 0 then
            v_stock_map := jsonb_set(v_stock_map, array[v_old_finish], to_jsonb(v_reserved), true);
            v_reserved_map := jsonb_set(v_reserved_map, array[v_old_finish], to_jsonb(v_reserved), true);
          end if;
        end if;
      end if;

      v_new_variations := v_new_variations || jsonb_build_array(v_variant);
    end loop;

    select coalesce(jsonb_agg(
      case
        when lower(attribute.value ->> 'name') = 'rise' then
          jsonb_set(
            attribute.value,
            '{options}',
            coalesce((
              select jsonb_agg(to_jsonb(case
                when lower(choice.value) = 'standard' then 'No Rise'
                else choice.value
              end) order by choice.ordinality)
              from jsonb_array_elements_text(attribute.value -> 'options') with ordinality as choice(value, ordinality)
            ), '[]'::jsonb),
            true
          )
        else attribute.value
      end order by attribute.ordinality
    ), '[]'::jsonb)
    into v_new_attributes
    from jsonb_array_elements(v_product.variation_attributes) with ordinality as attribute(value, ordinality);

    select coalesce(jsonb_agg(to_jsonb(variation.value ->> 'finish') order by variation.ordinality), '[]'::jsonb)
    into v_new_finishes
    from jsonb_array_elements(v_new_variations) with ordinality as variation(value, ordinality);

    update public.products
    set variation_attributes = v_new_attributes,
        variations = v_new_variations,
        finishes = v_new_finishes,
        finish_stock = v_stock_map,
        finish_reserved_stock = v_reserved_map
    where id = v_product.id;
  end loop;
end;
$$;
