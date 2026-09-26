-- Add image_positions column to products table for photo framing/crop
alter table public.products
  add column if not exists image_positions jsonb not null default '{}'::jsonb check (jsonb_typeof(image_positions) = 'object');