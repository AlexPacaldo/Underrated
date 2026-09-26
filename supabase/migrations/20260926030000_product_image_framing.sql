-- 20260926030000_product_image_framing.sql
-- Add per-photo framing (object-position) so each photo can be positioned inside its frame.

alter table public.products
add column image_positions jsonb not null default '{}'::jsonb;

-- Ensure the column holds a JSON object.
alter table public.products
add constraint image_positions_is_object check (jsonb_typeof(image_positions) = 'object');