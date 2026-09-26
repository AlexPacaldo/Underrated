-- Make the "Notes from the bench" journal section editable from the admin homepage preview.
--
-- The homepage preview draws an outline around every section and lets an admin
-- click it to edit, but the journal section had no columns behind it: its label,
-- heading, intro paragraph, and all three cards were hard-coded strings in the
-- React component. Editors saw a "fixed section" tag on it and no way in.
--
-- homepage_content is a single row keyed by id = 'primary' with one column per
-- editable string, so this follows the same flat pattern as hero_*, drop_*, and
-- story_*. The card alt text stays derived from the card label, matching how the
-- component built it before, so it is not stored.

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

-- Rows created before this migration keep the values the component rendered, so
-- the storefront is unchanged until an admin saves a new edit.
update public.homepage_content
set journal_label = 'Visual journal',
    journal_title = 'Notes from the',
    journal_accent = 'bench.',
    journal_post_one_label = 'From the bench',
    journal_post_one_place = 'Studio notes',
    journal_post_two_label = 'Release archive',
    journal_post_two_place = 'Hoods / caps / color',
    journal_post_three_label = 'Built to show',
    journal_post_three_place = 'Details in the dark'
where id = 'primary'
  and journal_title is distinct from 'Notes from the';

-- The save path upserts the whole row, so the anonymous read and admin write
-- policies from 20260925003000 already cover the new columns. No policy change.
