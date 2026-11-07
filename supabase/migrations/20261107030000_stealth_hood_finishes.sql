-- Expand the Stealth Hoods finish range to match the current product artwork.
-- Inventory remains shared across finishes and is tracked at the product level.
update public.products
set finishes = '["Matte Black", "Graphite", "Iced White", "Silver", "Violet", "Yellow", "Green", "Pink", "Signal Red"]'::jsonb
where slug = 'stealth-hoods';
