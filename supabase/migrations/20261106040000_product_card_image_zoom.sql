alter table public.products
  add column if not exists card_image_zoom numeric not null default 1
  check (card_image_zoom between 1 and 3);
