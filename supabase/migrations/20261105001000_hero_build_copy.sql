-- Hero heading: "Make the build yours." with the final line highlighted.
update public.homepage_content
set hero_accent = 'build',
    hero_suffix = 'yours.'
where id = 'primary';
