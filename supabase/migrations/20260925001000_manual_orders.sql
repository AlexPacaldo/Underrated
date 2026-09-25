create extension if not exists pgcrypto;

create type public.order_status as enum ('pending_payment', 'payment_submitted', 'paid', 'rejected', 'cancelled');
create type public.manual_payment_method as enum ('gcash_qr', 'bank_transfer');

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default ('UC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  status public.order_status not null default 'pending_payment',
  shipping_region text not null,
  subtotal_cents integer not null check (subtotal_cents >= 0),
  shipping_cents integer not null check (shipping_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id text not null,
  product_name text not null,
  finish text not null,
  quantity integer not null check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  line_total_cents integer not null check (line_total_cents >= 0),
  created_at timestamptz not null default now()
);

create table public.manual_payment_submissions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  payment_method public.manual_payment_method not null,
  reference_number text not null,
  payer_name text,
  note text,
  created_at timestamptz not null default now()
);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.manual_payment_submissions enable row level security;

create trigger orders_set_updated_at
before update on public.orders
for each row
execute function public.set_updated_at();

create or replace function public.prevent_customer_order_tampering()
returns trigger
language plpgsql
as $$
begin
  if auth.role() = 'authenticated' then
    if new.user_id is distinct from old.user_id
      or new.order_number is distinct from old.order_number
      or new.shipping_region is distinct from old.shipping_region
      or new.subtotal_cents is distinct from old.subtotal_cents
      or new.shipping_cents is distinct from old.shipping_cents
      or new.total_cents is distinct from old.total_cents then
      raise exception 'Order totals and ownership cannot be changed from the storefront.';
    end if;

    if not (old.status = 'pending_payment' and new.status in ('payment_submitted', 'cancelled')) then
      raise exception 'This order status change is not allowed from the storefront.';
    end if;
  end if;

  return new;
end;
$$;

create trigger orders_prevent_customer_tampering
before update on public.orders
for each row
execute function public.prevent_customer_order_tampering();

create policy "Users can create their own orders"
on public.orders
for insert
to authenticated
with check (auth.uid() = user_id and status = 'pending_payment');

create policy "Users can read their own orders"
on public.orders
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can submit or cancel pending orders"
on public.orders
for update
to authenticated
using (auth.uid() = user_id and status = 'pending_payment')
with check (auth.uid() = user_id and status in ('payment_submitted', 'cancelled'));

create policy "Users can create items for their own orders"
on public.order_items
for insert
to authenticated
with check (
  exists (
    select 1 from public.orders
    where orders.id = order_items.order_id
      and orders.user_id = auth.uid()
      and orders.status = 'pending_payment'
  )
);

create policy "Users can read their own order items"
on public.order_items
for select
to authenticated
using (
  exists (
    select 1 from public.orders
    where orders.id = order_items.order_id
      and orders.user_id = auth.uid()
  )
);

create policy "Users can submit manual payment references"
on public.manual_payment_submissions
for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.orders
    where orders.id = manual_payment_submissions.order_id
      and orders.user_id = auth.uid()
      and orders.status = 'pending_payment'
  )
);

create policy "Users can read their own manual payment submissions"
on public.manual_payment_submissions
for select
to authenticated
using (auth.uid() = user_id);
