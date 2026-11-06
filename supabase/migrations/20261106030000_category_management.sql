-- Categories become first-class records so the admin can add, rename, reorder, and remove
-- them without editing code. Products still store the category name, and the admin RPCs
-- keep that name in sync when a category is renamed.
create table if not exists public.categories (
  id text primary key,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Earlier drafts of this table carried free-form labels the storefront never used.
-- The display index is derived from each category's position in the list.
alter table public.categories drop column if exists note;
alter table public.categories drop column if exists index_label;

create unique index if not exists categories_name_lower_key
  on public.categories (lower(name));

create index if not exists products_category_idx on public.products (category);

alter table public.categories enable row level security;

drop policy if exists "Categories are readable" on public.categories;
create policy "Categories are readable"
  on public.categories
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Admins can manage categories" on public.categories;
create policy "Admins can manage categories"
  on public.categories
  for all
  to authenticated
  using (public.is_store_admin())
  with check (public.is_store_admin());

drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

-- Seed the categories the storefront already uses, then make sure any legacy
-- category strings still attached to products are manageable from the admin too.
update public.products
set category = btrim(category)
where category is distinct from btrim(category);

insert into public.categories (id, name, sort_order) values
  ('cockpit', 'Cockpit', 10),
  ('hoods', 'Hoods', 20),
  ('valve-caps', 'Valve Caps', 30),
  ('saddles', 'Saddles', 40),
  ('accessories', 'Accessories', 50)
on conflict do nothing;

insert into public.categories (id, name, sort_order)
select
  lower(coalesce(nullif(regexp_replace(btrim(p.category), '[^a-zA-Z0-9]+', '-', 'g'), ''), 'category')) || '-' || substr(md5(p.category), 1, 6),
  btrim(p.category),
  60 + (row_number() over (order by p.category))::integer * 10
from (select distinct category from public.products where btrim(category) <> '') p
where not exists (
  select 1 from public.categories c where lower(c.name) = lower(btrim(p.category))
)
on conflict do nothing;

create or replace function public.admin_save_category(
  p_id text,
  p_name text,
  p_sort_order integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category public.categories%rowtype;
  v_old_name text;
begin
  if not public.is_store_admin() then
    raise exception 'Only store administrators can manage categories.';
  end if;
  if btrim(coalesce(p_id, '')) = '' then
    raise exception 'A category id is required.';
  end if;
  if btrim(coalesce(p_name, '')) = '' then
    raise exception 'A category name is required.';
  end if;

  select * into v_category from public.categories where id = btrim(p_id) for update;

  if found then
    v_old_name := v_category.name;
    update public.categories
    set name = btrim(p_name),
        sort_order = coalesce(p_sort_order, sort_order)
    where id = v_category.id
    returning * into v_category;

    -- Renaming a category moves every product with it, including archived items.
    if v_old_name is distinct from v_category.name then
      update public.products set category = v_category.name where category = v_old_name;
    end if;
  else
    insert into public.categories (id, name, sort_order)
    values (
      btrim(p_id),
      btrim(p_name),
      coalesce(p_sort_order, 0)
    );
  end if;
end;
$$;

create or replace function public.admin_delete_category(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_in_use integer;
begin
  if not public.is_store_admin() then
    raise exception 'Only store administrators can manage categories.';
  end if;

  select name into v_name from public.categories where id = p_id for update;
  if not found then
    raise exception 'Category not found.';
  end if;

  select count(*) into v_in_use from public.products where category = v_name;
  if v_in_use > 0 then
    raise exception 'This category still has % shop item(s). Move them to another category first.', v_in_use;
  end if;

  delete from public.categories where id = p_id;
end;
$$;

create or replace function public.admin_move_category(p_id text, p_direction integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category public.categories%rowtype;
  v_neighbor_id text;
  v_neighbor_sort integer;
begin
  if not public.is_store_admin() then
    raise exception 'Only store administrators can manage categories.';
  end if;
  if p_direction not in (-1, 1) then
    raise exception 'Direction must be -1 or 1.';
  end if;

  select * into v_category from public.categories where id = p_id for update;
  if not found then
    raise exception 'Category not found.';
  end if;

  if p_direction < 0 then
    select id, sort_order into v_neighbor_id, v_neighbor_sort
    from public.categories
    where sort_order < v_category.sort_order
    order by sort_order desc, name
    limit 1
    for update;
  else
    select id, sort_order into v_neighbor_id, v_neighbor_sort
    from public.categories
    where sort_order > v_category.sort_order
    order by sort_order asc, name
    limit 1
    for update;
  end if;

  if v_neighbor_id is null then
    return;
  end if;

  update public.categories set sort_order = v_neighbor_sort where id = v_category.id;
  update public.categories set sort_order = v_category.sort_order where id = v_neighbor_id;
end;
$$;

revoke all on function public.admin_save_category(text, text, integer) from public;
grant execute on function public.admin_save_category(text, text, integer) to authenticated;
revoke all on function public.admin_delete_category(text) from public;
grant execute on function public.admin_delete_category(text) to authenticated;
revoke all on function public.admin_move_category(text, integer) from public;
grant execute on function public.admin_move_category(text, integer) to authenticated;
