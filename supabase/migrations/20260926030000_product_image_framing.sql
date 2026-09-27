-- 20260926030000_product_image_framing.sql
-- Add per-photo framing (object-position) so each photo can be positioned inside its frame.

-- 20260926000001_add_image_positions.sql already added this column, so a fresh
-- database that applies the migrations in filename order fails here on
-- "column image_positions of relation products already exists". The column and the
-- constraint are both written idempotently so this file is safe to run on its own,
-- after 0001, or against a database that was provisioned before 0001 existed.

alter table public.products
add column if not exists image_positions jsonb not null default '{}'::jsonb;

-- Ensure the column holds a JSON object. 0001 adds the same rule as an unnamed
-- inline check constraint, so only this file's named constraint is replaced.
alter table public.products
drop constraint if exists image_positions_is_object;

alter table public.products
add constraint image_positions_is_object check (jsonb_typeof(image_positions) = 'object');
