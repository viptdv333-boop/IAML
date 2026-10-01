-- IAML backend — initial schema (PostgreSQL 16)
-- Applied by `npm run migrate` (src/migrate.js). Never edit an applied migration — add 002_*.sql.

create extension if not exists citext;

-- ───────────────────────── helpers ─────────────────────────
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ───────────────────────── enums ─────────────────────────
create type user_role      as enum ('member', 'admin');
create type code_purpose   as enum ('verify_email', 'reset_password');
create type content_status as enum ('visible', 'removed', 'deleted');
create type report_status  as enum ('open', 'resolved', 'dismissed');
create type sub_topic      as enum ('news', 'events', 'publications', 'participants', 'discuss');
create type sub_freq       as enum ('instant', 'daily', 'weekly');
create type mail_status    as enum ('queued', 'sending', 'sent', 'failed');

-- ───────────────────────── accounts ─────────────────────────
create table users (
  id                uuid primary key default gen_random_uuid(),
  email             citext not null unique check (char_length(email) <= 254),
  password_hash     text not null,
  first_name        text not null check (char_length(btrim(first_name)) between 1 and 80),
  last_name         text not null check (char_length(btrim(last_name))  between 1 and 80),
  workplace         text not null check (char_length(btrim(workplace))  between 1 and 200),
  avatar_file       text check (avatar_file is null or avatar_file ~ '^[0-9a-f-]{36}\.webp$'),
  role              user_role not null default 'member',
  email_verified_at timestamptz,
  disabled_at       timestamptz,
  last_login_at     timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index users_role_idx on users (role) where role = 'admin';
create trigger users_updated before update on users for each row execute function set_updated_at();

-- server-side sessions; only the SHA-256 of the cookie token is stored
create table sessions (
  id           bytea primary key,
  user_id      uuid not null references users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at   timestamptz not null,
  ip           inet,
  user_agent   text
);
create index sessions_user_idx    on sessions (user_id);
create index sessions_expires_idx on sessions (expires_at);

-- one-time 6-digit codes (e-mail confirmation / password reset); stored as HMAC
create table email_codes (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references users (id) on delete cascade,
  purpose     code_purpose not null,
  code_hash   bytea not null,
  expires_at  timestamptz not null,
  attempts    integer not null default 0,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index email_codes_lookup_idx on email_codes (user_id, purpose, created_at desc);

-- failed-login / wrong-code counters (DB-backed so limits survive restarts)
create table auth_attempts (
  id         bigint generated always as identity primary key,
  kind       text not null check (kind in ('login', 'code')),
  key        text not null,
  ip         inet,
  created_at timestamptz not null default now()
);
create index auth_attempts_lookup_idx on auth_attempts (kind, key, created_at desc);

-- ───────────────────────── site structure ─────────────────────────
create table pages (
  id           integer generated always as identity primary key,
  slug         text not null unique check (slug = lower(slug) and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  title        text not null check (char_length(btrim(title)) between 1 and 120),
  body         text not null default '' check (char_length(body) <= 50000),
  is_published boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger pages_updated before update on pages for each row execute function set_updated_at();

create table menu_items (
  id         integer generated always as identity primary key,
  key        text not null unique,
  title      text not null check (char_length(btrim(title)) between 1 and 40),
  href       text not null,
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  is_core    boolean not null default false,
  page_id    integer unique references pages (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger menu_items_updated before update on menu_items for each row execute function set_updated_at();

-- ───────────────────────── content ─────────────────────────
create table news (
  id           bigint generated always as identity primary key,
  title        text not null check (char_length(btrim(title)) between 1 and 200),
  body         text not null check (char_length(btrim(body)) between 1 and 8000),
  published_at timestamptz not null default now(),
  is_published boolean not null default true,
  created_by   uuid references users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index news_published_idx on news (published_at desc) where is_published;
create trigger news_updated before update on news for each row execute function set_updated_at();

create table events (
  id           bigint generated always as identity primary key,
  title        text not null check (char_length(btrim(title)) between 1 and 200),
  location     text check (location is null or char_length(location) <= 200),
  starts_at    timestamptz not null,
  ends_at      timestamptz check (ends_at is null or ends_at >= starts_at),
  summary      text not null default '' check (char_length(summary) <= 400),
  body         text not null default '' check (char_length(body) <= 8000),
  published_at timestamptz not null default now(),
  is_published boolean not null default true,
  created_by   uuid references users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index events_starts_idx on events (starts_at) where is_published;
create trigger events_updated before update on events for each row execute function set_updated_at();

create table publications (
  id           bigint generated always as identity primary key,
  title        text not null check (char_length(btrim(title)) between 1 and 300),
  authors      text not null check (char_length(btrim(authors)) between 1 and 300),
  topic        text check (topic is null or char_length(topic) <= 80),
  summary      text not null check (char_length(btrim(summary)) between 1 and 8000),
  published_at timestamptz not null default now(),
  is_published boolean not null default true,
  created_by   uuid references users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index publications_published_idx on publications (published_at desc) where is_published;
create trigger publications_updated before update on publications for each row execute function set_updated_at();

-- ───────────────────────── participants (admin-curated roster) ─────────────────────────
create table positions (
  id         integer generated always as identity primary key,
  name       text not null unique check (char_length(btrim(name)) between 1 and 80),
  singular   text check (singular is null or char_length(singular) <= 80),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger positions_updated before update on positions for each row execute function set_updated_at();

create table participants (
  id          integer generated always as identity primary key,
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  position_id integer not null references positions (id) on delete restrict,
  org         text check (org is null or char_length(org) <= 300),
  sort_order  integer not null default 0,
  is_visible  boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index participants_position_idx on participants (position_id, sort_order);
create trigger participants_updated before update on participants for each row execute function set_updated_at();

-- ───────────────────────── Discuss ─────────────────────────
create table discuss_threads (
  id               bigint generated always as identity primary key,
  author_id        uuid references users (id) on delete set null,
  title            text not null check (char_length(btrim(title)) between 3 and 200),
  body             text not null check (char_length(btrim(body)) between 1 and 5000),
  status           content_status not null default 'visible',
  status_reason    text check (status_reason is null or char_length(status_reason) <= 500),
  status_by        uuid references users (id) on delete set null,
  status_at        timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);
create index discuss_threads_created_idx on discuss_threads (created_at desc) where status = 'visible';
create index discuss_threads_author_idx  on discuss_threads (author_id, created_at desc);
create trigger discuss_threads_updated before update on discuss_threads for each row execute function set_updated_at();

create table discuss_comments (
  id            bigint generated always as identity primary key,
  thread_id     bigint not null references discuss_threads (id) on delete cascade,
  parent_id     bigint references discuss_comments (id) on delete cascade,
  depth         smallint not null default 0 check (depth between 0 and 6),
  author_id     uuid references users (id) on delete set null,
  body          text not null check (char_length(btrim(body)) between 1 and 3000),
  status        content_status not null default 'visible',
  status_reason text check (status_reason is null or char_length(status_reason) <= 500),
  status_by     uuid references users (id) on delete set null,
  status_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index discuss_comments_thread_idx on discuss_comments (thread_id, created_at, id);
create index discuss_comments_author_idx on discuss_comments (author_id, created_at desc);
create trigger discuss_comments_updated before update on discuss_comments for each row execute function set_updated_at();

create table reports (
  id          bigint generated always as identity primary key,
  target_type text not null check (target_type in ('thread', 'comment')),
  target_id   bigint not null,
  reporter_id uuid references users (id) on delete set null,
  reason      text check (reason is null or char_length(reason) <= 500),
  status      report_status not null default 'open',
  resolved_by uuid references users (id) on delete set null,
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);
create unique index reports_one_per_reporter on reports (target_type, target_id, reporter_id) where reporter_id is not null;
create index reports_status_idx on reports (status, created_at desc);
create index reports_target_idx on reports (target_type, target_id);

-- ───────────────────────── Mongolist subscriptions ─────────────────────────
create table subscription_prefs (
  user_id      uuid not null references users (id) on delete cascade,
  topic        sub_topic not null,
  enabled      boolean not null default true,
  frequency    sub_freq not null default 'daily',
  last_sent_at timestamptz not null default now(),   -- digest cursor
  updated_at   timestamptz not null default now(),
  primary key (user_id, topic)
);
create index subscription_prefs_topic_idx on subscription_prefs (topic, frequency) where enabled;

-- ───────────────────────── mail outbox (retry-safe sending) ─────────────────────────
create table mail_outbox (
  id              bigint generated always as identity primary key,
  to_email        text not null,
  to_name         text,
  subject         text not null,
  text_body       text not null,
  html_body       text,
  reply_to        text,
  headers         jsonb not null default '{}'::jsonb,
  purpose         text not null default 'misc',
  priority        smallint not null default 5,          -- lower = sent first
  status          mail_status not null default 'queued',
  attempts        integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at       timestamptz,
  last_error      text,
  provider_id     text,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz
);
create index mail_outbox_due_idx     on mail_outbox (priority, next_attempt_at, id) where status = 'queued';
create index mail_outbox_created_idx on mail_outbox (created_at desc);
create index mail_outbox_status_idx  on mail_outbox (status, created_at desc);

-- ───────────────────────── contacts, links, settings ─────────────────────────
create table contact_messages (
  id         bigint generated always as identity primary key,
  name       text not null,
  email      text not null,
  subject    text,
  message    text not null,
  source     text not null default 'contacts' check (source in ('contacts', 'participants')),
  ip         inet,
  user_agent text,
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);
create index contact_messages_created_idx on contact_messages (created_at desc);
create index contact_messages_email_idx   on contact_messages (email, created_at desc);

create table contact_recipients (
  id         integer generated always as identity primary key,
  email      citext not null unique check (char_length(email) <= 254),
  label      text check (label is null or char_length(label) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger contact_recipients_updated before update on contact_recipients for each row execute function set_updated_at();

create table contact_people (
  id         integer generated always as identity primary key,
  position   text not null check (char_length(btrim(position)) between 1 and 80),
  name       text not null check (char_length(btrim(name)) between 1 and 120),
  email      text check (email is null or char_length(email) <= 254),
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger contact_people_updated before update on contact_people for each row execute function set_updated_at();

create table site_settings (
  key        text primary key,
  value      jsonb not null default 'null'::jsonb,
  updated_at timestamptz not null default now()
);

create table link_categories (
  id         integer generated always as identity primary key,
  slug       text not null unique check (slug = lower(slug) and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  title      text not null check (char_length(btrim(title)) between 1 and 80),
  blurb      text check (blurb is null or char_length(blurb) <= 200),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger link_categories_updated before update on link_categories for each row execute function set_updated_at();

create table useful_links (
  id          integer generated always as identity primary key,
  category_id integer not null references link_categories (id) on delete cascade,
  title       text not null check (char_length(btrim(title)) between 1 and 200),
  description text check (description is null or char_length(description) <= 400),
  url         text check (url is null or (url ~* '^https?://' and char_length(url) <= 2000)),
  sort_order  integer not null default 0,
  is_visible  boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index useful_links_category_idx on useful_links (category_id, sort_order);
create trigger useful_links_updated before update on useful_links for each row execute function set_updated_at();

-- ───────────────────────── audit trail ─────────────────────────
create table audit_log (
  id         bigint generated always as identity primary key,
  actor_id   uuid references users (id) on delete set null,
  action     text not null,
  entity     text not null,
  entity_id  text,
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_created_idx on audit_log (created_at desc);
