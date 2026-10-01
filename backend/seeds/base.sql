-- IAML base data (idempotent). Applied by `npm run seed`. Safe to run on every deploy:
-- rows are only inserted when missing; the participant roster is only inserted into an EMPTY table, so
-- anything the administrator edited later is never overwritten.

-- ── the five fixed positions ──
insert into positions (name, singular, sort_order) values
  ('President', 'President', 1),
  ('Honorary President', 'Honorary President', 2),
  ('Vice Presidents', 'Vice President', 3),
  ('Executive Director', 'Executive Director', 4),
  ('Board Members', 'Board Member', 5)
on conflict (name) do nothing;

-- ── participants roster (30 people, from the members file) ──
do $$
begin
  if not exists (select 1 from participants) then
    insert into participants (name, position_id, org, sort_order)
    select v.name, p.id, v.org, v.ord
      from (values
    ('Juha Janhunen', 'President', 'Institute for Linguistic Studies, Russian Academy of Sciences', 1),
    ('Tumurtogoo Domii', 'Honorary President', 'Institute of Language and Literature, Mongolian Academy of Sciences, Mongolia', 1),
    ('Bat-Ireedui Jantsan', 'Vice Presidents', 'Institute of Language and Literature, Mongolian Academy of Sciences, Mongolia', 1),
    ('Pavel Rykin', 'Vice Presidents', 'School of Mongolian Studies, Inner Mongolia University, China', 2),
    ('Veronika Kapišovská', 'Vice Presidents', 'Charles University, Czech Republic', 3),
    ('Nakashima Yoshiteru', 'Vice Presidents', 'Osaka University, Japan', 4),
    ('Erdene-Ochir Tumen-Ochir', 'Executive Director', 'Department of Mongolian Language and Linguistics, National University of Mongolia', 1),
    ('Zayabaatar Dalai', 'Board Members', 'National University of Mongolia & International Association for Mongolian Studies', 1),
    ('Bold Luvsandorj', 'Board Members', 'Institute of Language and Literature, Mongolian Academy of Sciences, Mongolia', 2),
    ('Unurbayan Tsedev', 'Board Members', 'Mongolian National University of Education, Mongolia', 3),
    ('Lee Seong Gyu', 'Board Members', 'Dankook University, Republic of Korea', 4),
    ('Khabtagaeva Bayarma', 'Board Members', 'University of Naples L''Orientale, Italy', 5),
    ('Elena Skribnik', 'Board Members', 'Ludwig-Maximilian-Universität München, Germany', 6),
    ('Ölmez Mehmet', 'Board Members', 'Istanbul University, Republic of Türkiye', 7),
    ('Kereidjin.D.Bürgüd', 'Board Members', 'Chinese Academy of Social Sciences, People''s Republic of China', 8),
    ('Elisabetta Ragagnin', 'Board Members', 'Ca'' Foscari University of Venice, Republic of Italy', 9),
    ('Veronika Zikmundová', 'Board Members', 'Charles University, Czech Republic', 10),
    ('Rákos Attila', 'Board Members', 'Department of Mongolian and Inner Asian Studies, ELTE, Hungary', 11),
    ('Benjamin Brosig', 'Board Members', 'Nazarbayev University, Republic of Kazakhstan', 12),
    ('Ekaterina V. Sundueva', 'Board Members', 'Institute for Mongolian, Buddhist and Tibetan Studies of Siberian Branch of Russian Academy of Sciences', 13),
    ('Peng Daruhan', 'Board Members', 'School of Mongolian Studies, Inner Mongolia University, People''s Republic of China', 14),
    ('Yamada Yohei', 'Board Members', 'Tokyo University of Foreign Studies, Japan', 15),
    ('Jan Rogala', 'Board Members', 'University of Warsaw, Republic of Poland', 16),
    ('Kukanova Victoria Vasilievna', 'Board Members', 'Director of Kalmyk Scientific Center, the Russian Academy of Sciences', 17),
    ('Park Sangchul', 'Board Members', 'Seoul National University, Republic of Korea', 18),
    ('Jargal Badagarov', 'Board Members', 'Heidelberg, Germany', 19),
    ('Baranova Vlada', 'Board Members', 'Hamburg, Germany', 20),
    ('Andrew Shimunek', 'Board Members', 'Indiana, USA', 21),
    ('Bao Wuyun', 'Board Members', 'Inner Mongolian Normal University, People''s Republic of China', 22),
    ('Saiyinjiya CAIDENGDUOERJI', 'Board Members', 'Paris, France', 23)
      ) as v(name, position, org, ord)
      join positions p on p.name = v.position;
  end if;
end $$;

-- ── core menu (order / titles / visibility are editable in the admin panel) ──
insert into menu_items (key, title, href, sort_order, is_core) values
  ('about',        'About',        'index.html',        1, true),
  ('news',         'News',         'news.html',         2, true),
  ('events',       'Events',       'events.html',       3, true),
  ('publications', 'Publications', 'publications.html', 4, true),
  ('participants', 'Participants', 'participants.html', 5, true),
  ('mongolist',    'Mongolist',    'mongolist.html',    6, true),
  ('discuss',      'Discuss',      'discuss.html',      7, true),
  ('contacts',     'Contacts',     'contacts.html',     8, true),
  ('links',        'Useful Links', 'useful-links.html', 9, true)
on conflict (key) do nothing;

-- ── Useful Links categories (entries are added by the administrator) ──
insert into link_categories (slug, title, blurb, sort_order) values
  ('corpora',      'Corpora',      'Text and speech corpora of Mongolic languages.',   1),
  ('data-banks',   'Data banks',   'Databases and archives of linguistic data.',       2),
  ('dictionaries', 'Dictionaries', 'Dictionaries and lexical resources.',              3),
  ('textbooks',    'Textbooks',    'Learning and teaching materials.',                 4),
  ('monographs',   'Monographs',   'Monographs and scholarly books available online.', 5)
on conflict (slug) do nothing;

-- ── Contacts: three people blocks (e-mail addresses are added in the admin panel) ──
do $$
begin
  if not exists (select 1 from contact_people) then
    insert into contact_people (position, name, email, sort_order) values
      ('President',                      'Juha Janhunen',            null, 1),
      ('Executive Director',             'Erdene-Ochir Tumen-Ochir', null, 2),
      ('CTO (Chief Technology Officer)', 'Denis Tikhomirov',         null, 3);
  end if;
end $$;

-- ── site settings (editable in the admin panel) ──
insert into site_settings (key, value) values
  ('contact.email',   '"info@iaml.org"'::jsonb),
  ('contact.address', '"Ulaanbaatar, Mongolia"'::jsonb)
on conflict (key) do nothing;
