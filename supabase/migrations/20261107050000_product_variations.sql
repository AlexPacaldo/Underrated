-- Product-specific option groups and combinations for finish-level inventory.
alter table public.products
  add column if not exists variation_attributes jsonb not null default '[]'::jsonb
    check (jsonb_typeof(variation_attributes) = 'array'),
  add column if not exists variations jsonb not null default '[]'::jsonb
    check (jsonb_typeof(variations) = 'array');

-- Retired combinations remain editable in inventory until their stock and
-- reservations are cleared, but cannot receive new orders.
create or replace function public.admin_set_product_finish_stock(
  p_product_id text,
  p_finish text,
  p_stock_quantity integer
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
begin
  if not public.is_store_admin() then
    raise exception 'Only store administrators can manage inventory.';
  end if;
  if p_stock_quantity is null or p_stock_quantity < 0 then
    raise exception 'Stock quantity must be a non-negative whole number.';
  end if;

  select * into v_product from public.products where id = p_product_id for update;
  if not found then raise exception 'Shop item not found.'; end if;
  if not (v_product.finish_stock ? p_finish) then
    raise exception 'This finish has no inventory record.';
  end if;

  v_reserved := coalesce((v_product.finish_reserved_stock ->> p_finish)::integer, 0);
  if p_stock_quantity < v_reserved then
    raise exception 'Stock cannot be lower than % unit(s) reserved for this finish.', v_reserved;
  end if;
  v_stock_map := jsonb_set(v_product.finish_stock, array[p_finish], to_jsonb(p_stock_quantity), true);
  update public.products
  set finish_stock = v_stock_map,
      stock_quantity = (select coalesce(sum(value::integer), 0)::integer from jsonb_each_text(v_stock_map))
  where id = p_product_id;

  return jsonb_build_object(
    'product_id', p_product_id,
    'finish', p_finish,
    'stock_quantity', p_stock_quantity,
    'reserved_quantity', v_reserved,
    'available_quantity', p_stock_quantity - v_reserved
  );
end;
$$;

create or replace function public.sync_product_finish_inventory()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_finish text;
  v_reserved integer;
  v_stock integer;
begin
  for v_finish, v_reserved in
    select key, value::integer from jsonb_each_text(new.finish_reserved_stock)
  loop
    v_stock := coalesce((new.finish_stock ->> v_finish)::integer, 0);
    if v_stock < v_reserved then
      raise exception 'Stock for % cannot be lower than its reserved quantity (%).', v_finish, v_reserved;
    end if;
  end loop;

  new.stock_quantity := (select coalesce(sum(value::integer), 0)::integer from jsonb_each_text(new.finish_stock));
  new.reserved_quantity := (select coalesce(sum(value::integer), 0)::integer from jsonb_each_text(new.finish_reserved_stock));
  return new;
end;
$$;

drop trigger if exists products_sync_finish_inventory on public.products;
create trigger products_sync_finish_inventory
before insert or update on public.products
for each row execute function public.sync_product_finish_inventory();

revoke all on function public.admin_set_product_finish_stock(text, text, integer) from public;
grant execute on function public.admin_set_product_finish_stock(text, text, integer) to authenticated;
revoke all on function public.sync_product_finish_inventory() from public;
