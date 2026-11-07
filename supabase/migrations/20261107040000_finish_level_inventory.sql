-- Keep stock and reservations independently for each selectable finish.
alter table public.products
  add column if not exists finish_stock jsonb not null default '{}'::jsonb
    check (jsonb_typeof(finish_stock) = 'object'),
  add column if not exists finish_reserved_stock jsonb not null default '{}'::jsonb
    check (jsonb_typeof(finish_reserved_stock) = 'object');

-- Preserve the existing product totals. Existing on-hand stock that was not
-- associated with a finish is assigned to the first listed finish.
do $$
declare
  v_product record;
  v_finish text;
  v_first boolean;
  v_reserved integer;
  v_remaining integer;
  v_stock_map jsonb;
  v_reserved_map jsonb;
begin
  for v_product in
    select id, finishes, stock_quantity, reserved_quantity
    from public.products
  loop
    v_stock_map := '{}'::jsonb;
    v_reserved_map := '{}'::jsonb;
    v_remaining := greatest(v_product.stock_quantity - v_product.reserved_quantity, 0);
    v_first := true;

    for v_finish in
      select option.finish
      from (
        select value as finish, true as selectable
        from jsonb_array_elements_text(v_product.finishes)
        union
        select distinct finish, false as selectable
        from public.order_items
        where product_id = v_product.id and inventory_state = 'reserved'
      ) as option
      order by option.selectable desc, option.finish
    loop
      select coalesce(sum(quantity), 0)::integer into v_reserved
      from public.order_items
      where product_id = v_product.id
        and finish = v_finish
        and inventory_state = 'reserved';

      v_reserved_map := jsonb_set(v_reserved_map, array[v_finish], to_jsonb(v_reserved), true);
      v_stock_map := jsonb_set(
        v_stock_map,
        array[v_finish],
        to_jsonb(v_reserved + case when v_first then v_remaining else 0 end),
        true
      );
      v_first := false;
    end loop;

    update public.products
    set finish_stock = v_stock_map,
        finish_reserved_stock = v_reserved_map
    where id = v_product.id;
  end loop;
end;
$$;

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

  select * into v_product
  from public.products
  where id = p_product_id
  for update;
  if not found then raise exception 'Shop item not found.'; end if;
  if not (v_product.finishes ? p_finish) then
    raise exception 'This finish is no longer available.';
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

-- Prevent older clients from writing only the aggregate count and bypassing
-- finish-specific quantities.
create or replace function public.admin_set_product_stock(
  p_product_id text,
  p_stock_quantity integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_store_admin() then
    raise exception 'Only store administrators can manage inventory.';
  end if;
  raise exception 'Set stock for an individual finish option instead.';
end;
$$;

create or replace function public.reserve_inventory_for_order_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.products%rowtype;
  v_stock integer;
  v_reserved integer;
  v_reserved_map jsonb;
begin
  select * into v_product
  from public.products
  where id = new.product_id and archived = false
  for update;
  if not found then raise exception 'This item is no longer available.'; end if;

  v_stock := coalesce((v_product.finish_stock ->> new.finish)::integer, 0);
  v_reserved := coalesce((v_product.finish_reserved_stock ->> new.finish)::integer, 0);
  if not (v_product.finishes ? new.finish) then
    raise exception 'This finish is no longer available.';
  end if;
  if v_stock - v_reserved < new.quantity then
    raise exception 'Only % unit(s) of % in % are available.',
      greatest(v_stock - v_reserved, 0), v_product.name, new.finish;
  end if;

  v_reserved_map := jsonb_set(
    v_product.finish_reserved_stock,
    array[new.finish],
    to_jsonb(v_reserved + new.quantity),
    true
  );
  update public.products
  set reserved_quantity = reserved_quantity + new.quantity,
      finish_reserved_stock = v_reserved_map
  where id = new.product_id;

  update public.order_items set inventory_state = 'reserved' where id = new.id;
  return new;
end;
$$;

create or replace function public.apply_order_inventory_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.order_items%rowtype;
  v_stock_map jsonb;
  v_reserved_map jsonb;
  v_stock integer;
  v_reserved integer;
  v_candidate record;
  v_candidate_stock integer;
  v_candidate_reserved integer;
  v_take integer;
  v_remaining integer;
begin
  if old.status is not distinct from new.status then return new; end if;

  if new.status = 'shipped' then
    for v_item in
      select * from public.order_items
      where order_id = new.id and inventory_state in ('reserved', 'unreserved')
      order by product_id, id for update
    loop
      select finish_stock, finish_reserved_stock into v_stock_map, v_reserved_map
      from public.products where id = v_item.product_id for update;
      v_stock := coalesce((v_stock_map ->> v_item.finish)::integer, 0);
      v_reserved := coalesce((v_reserved_map ->> v_item.finish)::integer, 0);

      if v_item.inventory_state = 'reserved' then
        if v_stock < v_item.quantity or v_reserved < v_item.quantity then
          raise exception 'Not enough reserved stock to ship % (%).', v_item.product_name, v_item.finish;
        end if;
        v_stock_map := jsonb_set(v_stock_map, array[v_item.finish], to_jsonb(v_stock - v_item.quantity), true);
        v_reserved_map := jsonb_set(v_reserved_map, array[v_item.finish], to_jsonb(v_reserved - v_item.quantity), true);
      else
        -- Older open orders predate finish-level reservations. Keep their
        -- fulfillment possible by consuming available stock across finishes.
        v_remaining := v_item.quantity;
        v_take := least(greatest(v_stock - v_reserved, 0), v_remaining);
        if v_take > 0 then
          v_stock_map := jsonb_set(v_stock_map, array[v_item.finish], to_jsonb(v_stock - v_take), true);
          v_remaining := v_remaining - v_take;
        end if;
        for v_candidate in
          select key, value from jsonb_each_text(v_stock_map)
          where key <> v_item.finish
        loop
          exit when v_remaining = 0;
          v_candidate_stock := v_candidate.value::integer;
          v_candidate_reserved := coalesce((v_reserved_map ->> v_candidate.key)::integer, 0);
          v_take := least(greatest(v_candidate_stock - v_candidate_reserved, 0), v_remaining);
          if v_take > 0 then
            v_stock_map := jsonb_set(v_stock_map, array[v_candidate.key], to_jsonb(v_candidate_stock - v_take), true);
            v_remaining := v_remaining - v_take;
          end if;
        end loop;
        if v_remaining > 0 then
          raise exception 'Not enough unreserved stock to ship % (%).', v_item.product_name, v_item.finish;
        end if;
      end if;
      update public.products
      set stock_quantity = stock_quantity - v_item.quantity,
          reserved_quantity = reserved_quantity - case when v_item.inventory_state = 'reserved' then v_item.quantity else 0 end,
          finish_stock = v_stock_map,
          finish_reserved_stock = v_reserved_map
      where id = v_item.product_id;
      update public.order_items set inventory_state = 'fulfilled' where id = v_item.id;
    end loop;

  elsif new.status in ('cancelled', 'rejected') then
    for v_item in
      select * from public.order_items
      where order_id = new.id and inventory_state = 'reserved'
      order by product_id, id for update
    loop
      select finish_reserved_stock into v_reserved_map
      from public.products where id = v_item.product_id for update;
      v_reserved := coalesce((v_reserved_map ->> v_item.finish)::integer, 0);
      if v_reserved < v_item.quantity then
        raise exception 'Could not release the % reservation for %.', v_item.finish, v_item.product_name;
      end if;
      v_reserved_map := jsonb_set(v_reserved_map, array[v_item.finish], to_jsonb(v_reserved - v_item.quantity), true);
      update public.products
      set reserved_quantity = reserved_quantity - v_item.quantity,
          finish_reserved_stock = v_reserved_map
      where id = v_item.product_id;
      update public.order_items set inventory_state = 'released' where id = v_item.id;
    end loop;
  end if;
  return new;
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
    if (old.finishes ? v_finish) and not (new.finishes ? v_finish) and v_reserved > 0 then
      raise exception 'Finish % has open orders and cannot be removed.', v_finish;
    end if;
  end loop;

  new.stock_quantity := (select coalesce(sum(value::integer), 0)::integer from jsonb_each_text(new.finish_stock));
  new.reserved_quantity := (select coalesce(sum(value::integer), 0)::integer from jsonb_each_text(new.finish_reserved_stock));
  return new;
end;
$$;

drop trigger if exists products_sync_finish_inventory on public.products;
create trigger products_sync_finish_inventory
before update on public.products
for each row execute function public.sync_product_finish_inventory();

revoke all on function public.admin_set_product_finish_stock(text, text, integer) from public;
grant execute on function public.admin_set_product_finish_stock(text, text, integer) to authenticated;
revoke all on function public.reserve_inventory_for_order_item() from public;
revoke all on function public.apply_order_inventory_status() from public;
revoke all on function public.sync_product_finish_inventory() from public;
