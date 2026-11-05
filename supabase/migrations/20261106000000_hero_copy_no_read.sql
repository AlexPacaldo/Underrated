-- Hero intro: keep the copy focused on the build, without the word "read".
update public.homepage_content
set hero_description = 'Small parts change the whole build. Find the grip, color, and hardware that make it yours.'
where id = 'primary';
