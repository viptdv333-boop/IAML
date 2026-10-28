-- Second language (Mongolian, Cyrillic). Every translatable text gets an optional "_mn" twin; empty / NULL = "not translated"
-- (the public API then falls back to the English text). See docs/I18N.md.

alter table users add column lang text not null default 'en' check (lang in ('en', 'mn'));

alter table news
  add column title_mn text check (title_mn is null or char_length(title_mn) <= 200),
  add column body_mn  text check (body_mn  is null or char_length(body_mn)  <= 8000);

alter table events
  add column title_mn    text check (title_mn    is null or char_length(title_mn)    <= 200),
  add column location_mn text check (location_mn is null or char_length(location_mn) <= 200),
  add column summary_mn  text check (summary_mn  is null or char_length(summary_mn)  <= 400),
  add column body_mn     text check (body_mn     is null or char_length(body_mn)     <= 8000);

alter table publications
  add column title_mn   text check (title_mn   is null or char_length(title_mn)   <= 300),
  add column topic_mn   text check (topic_mn   is null or char_length(topic_mn)   <= 80),
  add column summary_mn text check (summary_mn is null or char_length(summary_mn) <= 8000);

alter table pages
  add column title_mn text check (title_mn is null or char_length(title_mn) <= 120),
  add column body_mn  text check (body_mn  is null or char_length(body_mn)  <= 50000);

alter table menu_items
  add column title_mn text check (title_mn is null or char_length(title_mn) <= 40);

alter table positions
  add column name_mn     text check (name_mn     is null or char_length(name_mn)     <= 80),
  add column singular_mn text check (singular_mn is null or char_length(singular_mn) <= 80);

alter table participants
  add column name_mn text check (name_mn is null or char_length(name_mn) <= 120),
  add column org_mn  text check (org_mn  is null or char_length(org_mn)  <= 300);

alter table link_categories
  add column title_mn text check (title_mn is null or char_length(title_mn) <= 80),
  add column blurb_mn text check (blurb_mn is null or char_length(blurb_mn) <= 200);

alter table useful_links
  add column title_mn       text check (title_mn       is null or char_length(title_mn)       <= 200),
  add column description_mn text check (description_mn is null or char_length(description_mn) <= 400);

alter table contact_people
  add column position_mn text check (position_mn is null or char_length(position_mn) <= 80),
  add column name_mn     text check (name_mn     is null or char_length(name_mn)     <= 120);

-- ── Mongolian defaults for the rows that exist in every installation (new installations get the same from seeds/base.sql) ──
update menu_items set title_mn = case key
    when 'about'        then 'Бидний тухай'
    when 'news'         then 'Мэдээ'
    when 'events'       then 'Арга хэмжээ'
    when 'publications' then 'Нийтлэлүүд'
    when 'participants' then 'Оролцогчид'
    when 'mongolist'    then 'Mongolist'
    when 'discuss'      then 'Хэлэлцүүлэг'
    when 'contacts'     then 'Холбоо барих'
    when 'links'        then 'Ашигтай холбоосууд'
  end
 where is_core and title_mn is null;

update positions set name_mn = v.name_mn, singular_mn = v.singular_mn
  from (values
    ('President',          'Ерөнхийлөгч',                'Ерөнхийлөгч'),
    ('Honorary President', 'Хүндэт ерөнхийлөгч',         'Хүндэт ерөнхийлөгч'),
    ('Vice Presidents',    'Дэд ерөнхийлөгчид',          'Дэд ерөнхийлөгч'),
    ('Executive Director', 'Гүйцэтгэх захирал',          'Гүйцэтгэх захирал'),
    ('Board Members',      'Удирдах зөвлөлийн гишүүд',   'Удирдах зөвлөлийн гишүүн')
  ) as v(name, name_mn, singular_mn)
 where positions.name = v.name and positions.name_mn is null;

update link_categories set title_mn = v.title_mn, blurb_mn = v.blurb_mn
  from (values
    ('corpora',      'Корпусууд',         'Монгол хэлүүдийн бичвэр болон яриан корпусууд.'),
    ('data-banks',   'Өгөгдлийн сангууд', 'Хэл шинжлэлийн өгөгдлийн сан, архивууд.'),
    ('dictionaries', 'Толь бичгүүд',      'Толь бичиг болон үгийн сангийн нөөцүүд.'),
    ('textbooks',    'Сурах бичгүүд',     'Сургалт, заах аргын материалууд.'),
    ('monographs',   'Монографиуд',       'Онлайнаар унших боломжтой эрдэм шинжилгээний монографи, номууд.')
  ) as v(slug, title_mn, blurb_mn)
 where link_categories.slug = v.slug and link_categories.title_mn is null;

update contact_people set position_mn = case position
    when 'President'                       then 'Ерөнхийлөгч'
    when 'Executive Director'              then 'Гүйцэтгэх захирал'
    when 'CTO (Chief Technology Officer)'  then 'Технологийн захирал (CTO)'
  end
 where position_mn is null;

insert into site_settings (key, value)
select 'contact.address_mn', '"Улаанбаатар, Монгол улс"'::jsonb
 where exists (select 1 from site_settings where key = 'contact.address')
on conflict (key) do nothing;
