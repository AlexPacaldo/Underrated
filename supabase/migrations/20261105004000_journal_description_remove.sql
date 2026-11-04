-- Visual journal: remove the intro paragraph from the section.
update public.homepage_content
set journal_description = ''
where id = 'primary';
