-- Track physical inventory and reserve units for open orders. Physical stock
-- is deducted when the parcel is handed to the carrier (status: shipped).
alter table public.products
  add column if not exists stock_quantity integer not null default 0
    check (stock_quantity >= 0),
  add column if not exists reserved_quantity integer not null default 0
    check (reserved_quantity >= 0 and reserved_quantity <= stock_quantity);

alter table public.order_items
  add column if not exists inventory_state text not null default 'unreserved'
    check (inventory_state in ('unreserved', 'reserved', 'fulfilled', 'released'));

create or replace function public.admin_set_product_stock(
  p_product_id text,
  p_stock_quantity integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reserved_quantity integer;
begin
  if not public.is_store_admin() then
    raise exception 'Only store administrators can manage inventory.';
  end if;
  if p_stock_quantity is null or p_stock_quantity < 0 then
    raise exception 'Stock quantity must be a non-negative whole number.';
  end if;

  select reserved_quantity into v_reserved_quantity
  from public.products
  where id = p_product_id
  for update;
  if not found then
    raise exception 'Shop item not found.';
  end if;
  if p_stock_quantity < v_reserved_quantity then
    raise exception 'Stock cannot be lower than % unit(s) reserved for open orders.',
      v_reserved_quantity;
  end if;

  update public.products
  set stock_quantity = p_stock_quantity
  where id = p_product_id;

  return jsonb_build_object(
    'product_id', p_product_id,
    'stock_quantity', p_stock_quantity,
    'reserved_quantity', v_reserved_quantity,
    'available_quantity', p_stock_quantity - v_reserved_quantity
  );
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
begin
  select * into v_product
  from public.products
  where id = new.product_id and archived = false
  for update;

  if not found then
    raise exception 'This item is no longer available.';
  end if;
  if v_product.stock_quantity - v_product.reserved_quantity < new.quantity then
    raise exception 'Only % unit(s) of % are available.',
      greatest(v_product.stock_quantity - v_product.reserved_quantity, 0),
      v_product.name;
  end if;

  update public.products
  set reserved_quantity = reserved_quantity + new.quantity
  where id = new.product_id;

  update public.order_items
  set inventory_state = 'reserved'
  where id = new.id;

  return new;
end;
$$;

drop trigger if exists order_items_reserve_inventory on public.order_items;
create trigger order_items_reserve_inventory
after insert on public.order_items
for each row execute function public.reserve_inventory_for_order_item();

create or replace function public.apply_order_inventory_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.order_items%rowtype;
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  if new.status = 'shipped' then
    for v_item in
      select * from public.order_items
      where order_id = new.id and inventory_state in ('reserved', 'unreserved')
      order by product_id, id
      for update
    loop
      if v_item.inventory_state = 'reserved' then
        update public.products
        set stock_quantity = stock_quantity - v_item.quantity,
            reserved_quantity = reserved_quantity - v_item.quantity
        where id = v_item.product_id
          and stock_quantity >= v_item.quantity
          and reserved_quantity >= v_item.quantity;
      else
        -- Orders created before inventory tracking have no reservation. Check
        -- current unreserved stock before allowing them to ship.
        update public.products
        set stock_quantity = stock_quantity - v_item.quantity
        where id = v_item.product_id
          and stock_quantity - reserved_quantity >= v_item.quantity;
      end if;

      if not found then
        raise exception 'Not enough unreserved stock to ship %.', v_item.product_name;
      end if;

      update public.order_items
      set inventory_state = 'fulfilled'
      where id = v_item.id;
    end loop;

  elsif new.status in ('cancelled', 'rejected') then
    for v_item in
      select * from public.order_items
      where order_id = new.id and inventory_state = 'reserved'
      order by product_id, id
      for update
    loop
      update public.products
      set reserved_quantity = reserved_quantity - v_item.quantity
      where id = v_item.product_id
        and reserved_quantity >= v_item.quantity;
      if not found then
        raise exception 'Could not release the stock reservation for %.', v_item.product_name;
      end if;
      update public.order_items
      set inventory_state = 'released'
      where id = v_item.id;
    end loop;
  end if;

  return new;
end;
$$;

create or replace function public.prevent_cancelling_shipped_order()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status in ('shipped', 'delivered') and new.status = 'cancelled' then
    raise exception 'A shipped order cannot be cancelled. Process a return instead.';
  end if;
  return new;
end;
$$;

create or replace function public.prevent_deleting_reserved_product()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.reserved_quantity > 0 then
    raise exception 'This item has units reserved for open orders and cannot be deleted.';
  end if;
  return old;
end;
$$;

drop trigger if exists orders_prevent_cancelling_shipped on public.orders;
create trigger orders_prevent_cancelling_shipped
before update of status on public.orders
for each row execute function public.prevent_cancelling_shipped_order();

drop trigger if exists orders_apply_inventory_status on public.orders;
create trigger orders_apply_inventory_status
after update of status on public.orders
for each row execute function public.apply_order_inventory_status();

drop trigger if exists products_prevent_deleting_reserved on public.products;
create trigger products_prevent_deleting_reserved
before delete on public.products
for each row execute function public.prevent_deleting_reserved_product();

revoke all on function public.reserve_inventory_for_order_item() from public;
revoke all on function public.apply_order_inventory_status() from public;
revoke all on function public.prevent_cancelling_shipped_order() from public;
revoke all on function public.prevent_deleting_reserved_product() from public;
revoke all on function public.admin_set_product_stock(text, integer) from public;
grant execute on function public.admin_set_product_stock(text, integer) to authenticated;
