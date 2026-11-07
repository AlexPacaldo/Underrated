-- Preserve the current finish selector for products that existed before
-- configurable variation attributes were introduced. An empty attribute list
-- after this backfill means the product intentionally has no selectable options.
update public.products as product
set variation_attributes = jsonb_build_array(
      jsonb_build_object('name', 'Color', 'options', product.finishes)
    ),
    variations = coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'finish', finish.finish,
            'values', jsonb_build_object('Color', finish.finish)
          )
          order by finish.ordinality
        )
        from jsonb_array_elements_text(product.finishes)
          with ordinality as finish(finish, ordinality)
      ),
      '[]'::jsonb
    )
where product.variation_attributes = '[]'::jsonb
  and jsonb_array_length(product.finishes) > 0;
