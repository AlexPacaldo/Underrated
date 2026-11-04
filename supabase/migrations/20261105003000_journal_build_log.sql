-- Visual journal heading: swap "Notes from the bench" for "From the build log".
update public.homepage_content
set journal_title = 'From the',
    journal_accent = 'build log.'
where id = 'primary';
