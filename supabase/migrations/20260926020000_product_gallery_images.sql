-- Let a shop item carry more than one photo, and let the admin item editor add them.
--
-- The catalog stored a single image_path, and the item view rendered one photo
-- plus two fixed CSS "views" (surface macro, workshop bench). An admin had no
-- way to show a second angle of a part, which is the whole point of a gallery.
--
-- products already stores its repeating data as jsonb arrays with a type check
-- (finishes, specs), so images follows that pattern. image_path stays the
-- primary photo so every existing reader keeps working untouched; images holds
-- only the extra photos, in gallery order. The client keeps the two in step on
-- write, and the reader drops any duplicate of the primary so the gallery can
-- never show the same photo twice.

alter table public.products
  add column if not exists images jsonb not null default '[]'::jsonb check (jsonb_typeof(images) = 'array');

-- Products seeded before this migration keep the single photo they always had,
-- so the storefront is unchanged until an admin adds another.
update public.products
set images = '[]'::jsonb
where images is null
   or jsonb_typeof(images) <> 'array';

-- The admin upsert writes the full row and the storefront reads published rows,
-- so the policies from 20260925003000 already cover the new column. No policy
-- change is needed: the column is only ever written by the admin write policy.
