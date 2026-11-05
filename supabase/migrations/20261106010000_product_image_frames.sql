alter table public.products
  add column if not exists image_frames jsonb not null default '{}'::jsonb;

alter table public.products
  drop constraint if exists image_frames_is_object;

alter table public.products
  add constraint image_frames_is_object check (jsonb_typeof(image_frames) = 'object');
