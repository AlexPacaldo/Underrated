-- Add missing journal fields to homepage_content table
alter table public.homepage_content
  add column if not exists journal_label text not null default 'Visual journal',
  add column if not exists journal_title text not null default 'Notes from the',
  add column if not exists journal_accent text not null default 'bench.',
  add column if not exists journal_description text not null default 'The supplied social work sets the visual direction: bold parts, tough shadows, no apologies.',
  add column if not exists journal_post_one_image_path text not null default '/manus-storage/underrated-reference-profile_080efc99.png',
  add column if not exists journal_post_one_label text not null default 'From the bench',
  add column if not exists journal_post_one_place text not null default 'Studio notes',
  add column if not exists journal_post_two_image_path text not null default '/manus-storage/underrated-reference-grid-1_ab5c0361.png',
  add column if not exists journal_post_two_label text not null default 'Release archive',
  add column if not exists journal_post_two_place text not null default 'Hoods / caps / color',
  add column if not exists journal_post_three_image_path text not null default '/manus-storage/underrated-reference-grid-2_92e5ffa0.png',
  add column if not exists journal_post_three_label text not null default 'Built to show',
  add column if not exists journal_post_three_place text not null default 'Details in the dark';