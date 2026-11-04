-- Latest drop section copy: clearer label and heading.
update public.homepage_content
set drop_label = 'Just landed',
    drop_title = 'Latest',
    drop_accent = 'drop.'
where id = 'primary';
