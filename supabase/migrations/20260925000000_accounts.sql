create type public.account_role as enum ('customer', 'staff', 'admin');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  role public.account_role not null default 'customer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

create or replace function public.prevent_profile_role_self_change()
returns trigger
language plpgsql
as $$
begin
  if old.role is distinct from new.role and auth.role() = 'authenticated' then
    raise exception 'Only service-role operations can change account roles.';
  end if;

  return new;
end;
$$;

create trigger profiles_prevent_role_self_change
before update on public.profiles
for each row
execute function public.prevent_profile_role_self_change();

create policy "Profiles are readable by their owner"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

create policy "Users can create their own customer profile"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id and role = 'customer');

create policy "Users can update their own profile details"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);
