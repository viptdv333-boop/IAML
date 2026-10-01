# IAML backend — API contract (v1)

Single source of truth for the backend (`backend/`), the public pages (`assets/js/*.js`)
and the admin panel (`admin.html`, `assets/js/admin.js`). If the code and this file
disagree, fix the code or update this file in the same change.

* Stack: Node.js (Fastify) + PostgreSQL 16. Everything runs on the operator's own VPS
  (Docker Compose + Caddy). Transactional mail goes through **Resend** (HTTP API).
* **Same origin.** The site (static files) and the API are served from one origin, API under
  `/api`. There is no CORS. Cookies are `HttpOnly; SameSite=Lax` (`Secure` when `SITE_URL` is https).
* The static site must keep working **without** a backend (GitHub Pages draft): every page ships
  static placeholder content and only upgrades to live data when `/api/health` answers.

---------------------------------------------------------------------------

## 1. Conventions

| Topic | Rule |
|---|---|
| Format | JSON in/out (`application/json; charset=utf-8`). Only the avatar upload is `multipart/form-data`. |
| Time | All timestamps are ISO-8601 UTC strings (`2026-07-10T11:30:00.000Z`). The site displays **UTC+3** (`Intl` zone `Etc/GMT-3`); admin forms take UTC+3 input and send UTC. |
| IDs | `users.id` is a UUID string. Everything else is an integer (JSON number). |
| Text | Plain text only (no HTML). Clients must escape / use `textContent`. |
| Auth | Session cookie `iaml_sid`. Frontend never sees the token. |
| CSRF | Every non-GET/HEAD request must send header `X-Requested-With: IAML` (a browser cannot add it cross-site without CORS). Missing → `403 csrf`. If `Origin` is present it must equal `SITE_URL`'s origin. |
| Pagination | `?limit=&offset=`; lists return `{ "items": [...], "total": N }`. |
| Errors | Always `{ "error": { "code": "...", "message": "...", "fields": { "<field>": "<msg>" } } }` (`fields` only for validation). |
| Cache | API responses are `Cache-Control: no-store`. |

### Error codes
| HTTP | `code` | Meaning |
|---|---|---|
| 400 | `validation_error` | body/query invalid; `fields` filled |
| 400 | `invalid_code` | wrong, expired, used or unknown confirmation / reset code (deliberately indistinguishable) |
| 401 | `unauthenticated` | login required |
| 401 | `invalid_credentials` | wrong e-mail or password |
| 403 | `forbidden` | not allowed (e.g. not admin, not the owner) |
| 403 | `csrf` | missing/invalid `X-Requested-With` or foreign `Origin` |
| 403 | `email_not_verified` | login with unverified account (`error.email` echoed; a fresh code is e-mailed automatically) |
| 403 | `account_disabled` | account disabled by an admin |
| 404 | `not_found` | |
| 409 | `conflict` | uniqueness / referential conflict (e.g. delete a position that has participants). A unique violation also carries `error.fields` (`{ "name": "is already in use" }`). |
| 413 | `payload_too_large` | body / avatar too large |
| 415 | `unsupported_media_type` | avatar is not JPEG/PNG/WebP |
| 429 | `rate_limited` | `Retry-After` header (seconds) set |
| 500 | `internal_error` | |

### Shared object shapes

```jsonc
// Self (returned by auth endpoints and /api/me)
User = { "id": "uuid", "email": "a@b.org", "first_name": "Ada", "last_name": "Lovelace",
         "workplace": "University of X", "avatar_url": "/uploads/avatars/<uuid>.webp" | null,
         "role": "member" | "admin", "created_at": "ISO" }

// Public author card (Discuss). Deleted accounts become { id: null, name: "Deleted user", ... }
Author = { "id": "uuid" | null, "name": "Ada Lovelace", "first_name": "Ada", "last_name": "Lovelace",
           "avatar_url": "/uploads/avatars/<uuid>.webp" | null, "role": "member" | "admin" }
```
E-mail and workplace are **never** public. Only admins see them (`/api/admin/*`).

---------------------------------------------------------------------------

## 2. Public endpoints (no login)

### `GET /api/health`
`200 { "ok": true, "version": "1.0.0", "time": "ISO", "site": { "timezone": "Etc/GMT-3", "tz_label": "UTC+3" } }`
`503 { "ok": false }` when the database is unreachable. **This is the backend-detection probe
the frontend uses.** Any non-JSON / non-200 answer (GitHub Pages 404, offline, `file://`) ⇒ static mode.

### `GET /api/menu`
`{ "items": [ { "key": "about", "title": "About", "href": "index.html" }, ... ] }`
Visible items only, ordered. Custom pages use `href: "page.html?slug=<slug>"`.
The menu is backend-managed: order, titles, hiding, extra pages.

### `GET /api/pages/:slug`
`{ "slug": "history", "title": "History", "body": "<markdown subset>", "updated_at": "ISO" }` — `404` if missing/unpublished.
`body` is the **safe Markdown subset** (§6).

### `GET /api/news?limit=60&offset=0`  (limit ≤ 200)
`{ "items": [ { "id": 1, "title": "…", "body": "full text (≤ 500 words)", "preview": "first ~150 words…", "published_at": "ISO" } ], "total": 12 }`
Newest first. Only `is_published && published_at <= now()`.

### `GET /api/events`
`{ "items": [ { "id": 1, "title": "…", "location": "Ulaanbaatar" | null, "starts_at": "ISO", "ends_at": "ISO" | null, "summary": "short (≤ 400 chars)", "body": "full text", "is_past": false } ] }`
Order: upcoming (`is_past=false`) by `starts_at` ascending, then past by `starts_at` descending.
An event is *past* when `coalesce(ends_at, starts_at + 3h) < now()`.

### `GET /api/publications?limit=60&offset=0`
`{ "items": [ { "id": 1, "title": "…", "authors": "A. Author, B. Author", "topic": "Phonology" | null, "summary": "full summary (≤ 500 words)", "preview": "first ~150 words…", "published_at": "ISO" } ], "total": 5 }`

### `GET /api/participants`
`{ "positions": [ { "id": 1, "name": "Vice Presidents", "singular": "Vice President", "participants": [ { "id": 3, "name": "Pavel Rykin", "org": "School of Mongolian Studies, …" | null } ] } ] }`
Only positions that have visible participants; fixed order (positions' `sort_order`, then participants' `sort_order`).

### `GET /api/links`
`{ "categories": [ { "id": 1, "slug": "corpora", "title": "Corpora", "blurb": "…" | null, "links": [ { "id": 1, "title": "…", "description": "…" | null, "url": "https://…" | null } ] } ] }`
Categories without visible links are omitted.

### `GET /api/contacts`
`{ "people": [ { "id": 1, "position": "President", "name": "Juha Janhunen", "email": "x@y.org" | null } ], "email": "info@iaml.org" | null, "address": "Ulaanbaatar, Mongolia" | null }`

### `POST /api/contact`  — contact form (Contacts page and Participants page)
Body `{ "name": "…", "email": "…", "subject": "…"?, "message": "…", "source": "contacts" | "participants", "website": "" }`
(`website` is a honeypot — must be empty; if filled the request is silently accepted and dropped.)
`202 { "ok": true }`. Stored in the inbox and e-mailed to the configured recipients
(`reply-to` = sender). Rate limit: 5/hour/IP, 3/hour/e-mail.

### `GET /api/unsubscribe?t=<token>` / `POST /api/unsubscribe?t=<token>`
One-click unsubscribe from a mailing-list e-mail (token is HMAC-signed, no login; exempt from the CSRF header rule). **GET only shows a confirmation page** (link scanners must not unsubscribe anyone); POST (RFC 8058 `List-Unsubscribe=One-Click`, `application/x-www-form-urlencoded`) switches off every Mongolist topic of that user and answers `200 {ok:true}` (or a small HTML page when the request accepts `text/html`, e.g. the confirmation form). Invalid token → `400`.

---------------------------------------------------------------------------

## 3. Auth & account

Registration is **e-mail + password with a one-time 6-digit e-mail code** (confirm once).
Codes live 15 min, max 5 wrong attempts per code, resend cool-down 60 s, ≤ 5 codes/hour/user.

### `POST /api/auth/register`
Body `{ "first_name", "last_name", "workplace", "email", "password", "website": "" }` (`website` honeypot).
`201 { "ok": true, "status": "verification_required", "email": "a@b.org" }` — a code is e-mailed.
Non-enumerating: the same answer is returned if the e-mail is already registered (the owner then gets an
"you already have an account" e-mail instead of a code). Registering again with an **unverified** e-mail
while its code is still live changes nothing; after the code lapsed it replaces the pending data and sends a new code.
Names (`first_name`, `last_name`) may contain only letters, spaces, dots, hyphens and apostrophes. The e-mails carry a constant subject (no code) and a generic greeting. Accounts never confirmed within 7 days are deleted.

### `POST /api/auth/verify`  `{ "email", "code", "password" }`
`200 { "user": User }` + `Set-Cookie` (logged in). **The password is set here**, by the person who holds the code: whatever password a stranger may have registered for the address is replaced, so nobody can pre-register someone else's mailbox and keep access. Every failure (wrong / expired / used code, unknown or already confirmed account) answers the same `400 invalid_code`; `429 rate_limited` after repeated failures.

### `POST /api/auth/resend`  `{ "email", "purpose": "verify_email" | "reset_password" }`
`202 { "ok": true }` always (cool-down enforced silently; `429` only for IP abuse).

### `POST /api/auth/login`  `{ "email", "password" }`
`200 { "user": User }` + cookie (a previous session of the same browser is replaced). Errors: `invalid_credentials` (401), `email_not_verified` (403, UI should switch to the verify step), `account_disabled` (403), `rate_limited` (429; 5 failures / 15 min per e-mail, 10/min per IP).

### `POST /api/auth/logout`  → `204`
### `GET /api/auth/me`  → `200 { "user": User | null }` — never 401, safe to call on every page load.

### `POST /api/auth/forgot`  `{ "email" }` → `202 { "ok": true }` (always; e-mails a reset code if a verified account exists)
### `POST /api/auth/reset`  `{ "email", "code", "password" }` → `200 { "user": User }` + cookie; every other session of the user is revoked.

### `PATCH /api/me`  `{ "first_name"?, "last_name"?, "workplace"? }` → `200 { "user": User }`
### `POST /api/me/avatar`  multipart field `avatar` (JPEG/PNG/WebP, ≤ 2 MB) → `200 { "user": User }`
The server re-encodes to a 256×256 WebP (strips EXIF). `DELETE /api/me/avatar` → `200 { "user": User }`.
### `POST /api/me/password`  `{ "current_password", "new_password" }` → `204` (other sessions revoked)
### `DELETE /api/me`  `{ "password" }` → `204` — deletes the account; Discuss posts stay, shown as "Deleted user".

### Mongolist subscriptions (login required)
Topics: `news`, `events`, `publications`, `participants`, `discuss`. Frequencies: `instant`, `daily`, `weekly`.

`GET /api/me/subscriptions` →
`{ "configured": false, "topics": [ { "topic": "news", "enabled": true, "frequency": "daily" }, ... 5 entries ... ] }`
Until the user saves once, `configured` is `false` and the entries are the **suggested defaults**
(news/events/publications enabled `daily`, participants `weekly` disabled, discuss `daily` disabled) — nothing is e-mailed before the first save.

`PUT /api/me/subscriptions` `{ "topics": [ { "topic", "enabled", "frequency" } ] }` → same shape as GET with `configured: true`.
Newly enabled topics start from "now" (no backlog e-mail).

---------------------------------------------------------------------------

## 4. Discuss (Reddit-style forum)

Anyone reads; verified members post. Post-moderation (content is visible immediately, admins remove it).
Replies are nested (`parent_id`, max depth 6). Plain text. Rate limits per user: 5 threads/h, 30 comments/h.

### `GET /api/discuss/threads?limit=20&offset=0` (limit ≤ 50)
`{ "items": [ { "id": 7, "title": "…", "snippet": "first ~200 chars…", "author": Author, "created_at": "ISO", "last_activity_at": "ISO", "reply_count": 3 } ], "total": 41 }` — newest first.

### `GET /api/discuss/threads/:id`
```jsonc
{ "thread": { "id": 7, "title": "…", "body": "…", "author": Author, "created_at": "ISO", "reply_count": 3 },
  "comments": [ { "id": 11, "parent_id": null | 10, "depth": 0, "author": Author, "body": "…" | null,
                  "status": "visible" | "removed" | "deleted", "created_at": "ISO" } ] }
```
`comments` are flat, oldest first; clients nest them by `parent_id`. For `removed` (moderator) / `deleted` (author) comments
`body` is `null` — render "[removed by a moderator]" / "[deleted]". A removed/deleted thread is `404` for everyone except admins.

### `POST /api/discuss/threads`  `{ "title" (3–200), "body" (1–5000) }` → `201 { "thread": { …as above… } }`
### `POST /api/discuss/threads/:id/comments`  `{ "body" (1–3000), "parent_id"? }` → `201 { "comment": { … } }`
### `DELETE /api/discuss/threads/:id` / `DELETE /api/discuss/comments/:id` → `204` (own post or admin)
### `POST /api/discuss/reports`  `{ "target_type": "thread" | "comment", "target_id": 11, "reason"? (≤ 500) }` → `201 { "ok": true }` (idempotent per reporter+target)

New Discuss threads feed the `discuss` Mongolist topic.

---------------------------------------------------------------------------

## 5. Admin API  (`role = admin`, otherwise `403 forbidden`; every write is audit-logged)

All list endpoints: `GET …?limit=50&offset=0&q=<substring>` → `{ "items": [...], "total": N }` (`limit` ≤ 200). Extra filters: `participants?position_id=`, `links?category_id=`.
Generic CRUD resources expose: `GET /api/admin/<res>`, `POST /api/admin/<res>` (→ `201 { "item": {…} }`),
`GET /api/admin/<res>/:id` (→ `{ "item": {…} }`), `PUT /api/admin/<res>/:id` (partial update allowed, → `{ "item": {…} }`),
`DELETE /api/admin/<res>/:id` (→ `204`). Resources with `sort_order` also get
`POST /api/admin/<res>/reorder` `{ "ids": [3,1,2] }` → `204` (sets order to the given sequence).
All items include `id`, `created_at`, `updated_at` unless stated. `*` = required on create.

| Resource | Fields |
|---|---|
| `news` | `title*` (≤200), `body*` (≤500 words and ≤8 000 characters), `published_at*` (ISO; may be in the future = scheduled), `is_published` (bool, default true) |
| `events` | `title*` (≤200), `location` (≤200), `starts_at*`, `ends_at`, `summary` (≤400 chars), `body` (≤500 words and ≤8 000 characters), `published_at` (default now), `is_published` |
| `publications` | `title*` (≤300), `authors*` (≤300), `topic` (≤80), `summary*` (≤500 words and ≤8 000 characters), `published_at*`, `is_published` |
| `positions` | `name*` (≤80, unique), `singular` (≤80), `sort_order` — delete → `409 conflict` while participants use it. Reorderable. |
| `participants` | `name*` (≤120, free text as written, e.g. "Khabtagaeva Bayarma"), `position_id*`, `org` (≤300), `sort_order`, `is_visible`. Reorderable. List items also carry `position` (name). |
| `pages` | `slug*` (`^[a-z0-9]+(-[a-z0-9]+)*$`, ≤60, unique), `title*` (≤120), `body` (≤50 000, Markdown subset), `is_published`, `show_in_menu` (bool — creates/removes the page's menu entry; default true). Delete removes its menu entry. |
| `menu` | list/update/reorder only — **no create/delete** (entries are core sections or created via `pages`). Fields: `key` (read-only), `title*` (≤40), `href` (read-only), `sort_order`, `is_visible`, `is_core` (read-only). Reorderable. |
| `link-categories` | `slug*` (unique), `title*` (≤80), `blurb` (≤200), `sort_order`. Reorderable. Delete cascades links. |
| `links` | `category_id*`, `title*` (≤200), `description` (≤400), `url` (`http(s)://…`, empty = "coming soon"), `sort_order`, `is_visible`. Reorderable. List supports `&category_id=`. |
| `contact-people` | `position*` (≤80), `name*` (≤120), `email` (valid or empty), `sort_order`, `is_visible`. Reorderable. |
| `contact-recipients` | `email*` (unique), `label` (≤80). *No recipients configured ⇒ the form e-mails every admin.* |

### Settings
`GET /api/admin/settings` → `{ "settings": { "contact.email": "info@iaml.org", "contact.address": "…" } }`
`PUT /api/admin/settings` `{ "settings": { "contact.email": "…", "contact.address": "…" } }` → same shape (allow-listed keys only).

### Moderation
* `GET /api/admin/reports?status=open|resolved|dismissed|all` → `{ "items": [ { "id", "target_type", "target_id", "reason", "status", "created_at", "reporter": { "id","name","email" } | null, "target": { "thread_id", "comment_id"? (comments only), "title" (thread title), "body", "status", "author": { "id","name","email" } | null } | null } ], "total" }` (default `status=open`)
* `POST /api/admin/reports/:id/resolve` `{ "action": "remove" | "dismiss" }` → `200 { "item": {...} }` (`remove` hides the reported content and resolves all open reports for it)
* `GET /api/admin/discuss/threads?status=visible|removed|deleted|all&q=` → threads with `author` (with e-mail), `status`, `reply_count`, `reports_open`
* `GET /api/admin/discuss/threads/:id` → thread + all comments incl. removed (with bodies)
* `POST /api/admin/discuss/threads/:id/status` `{ "status": "visible" | "removed", "reason"? }` → `200 { "ok": true }`
* `POST /api/admin/discuss/comments/:id/status` `{ "status": "visible" | "removed", "reason"? }` → `200 { "ok": true }`

### Users
* `GET /api/admin/users?q=&role=&limit=&offset=` → `{ "items": [ { "id","email","first_name","last_name","workplace","role","email_verified","disabled","avatar_url","created_at","last_login_at" } ], "total" }`
* `PATCH /api/admin/users/:id` `{ "role"?: "member"|"admin", "disabled"?: bool }` → `{ "item": … }` (cannot demote/disable yourself, cannot remove the last admin)
* `DELETE /api/admin/users/:id` → `204`
* `GET /api/admin/subscribers` → `{ "summary": { "<topic>": { "instant": n, "daily": n, "weekly": n } }, "total_users": n }`
* `GET /api/admin/subscribers.csv?topic=` → CSV `email,first_name,last_name,topic,frequency`

### Inbox (contact form messages)
* `GET /api/admin/messages?unread=1&limit&offset` → `{ "items": [ { "id","name","email","subject","message","source","is_read","created_at" } ], "total", "unread": n }`
* `PATCH /api/admin/messages/:id` `{ "is_read": bool }` · `DELETE /api/admin/messages/:id`

### Ops
* `GET /api/admin/stats` → `{ "users", "users_verified", "admins", "news", "events", "publications", "threads", "comments", "reports_open", "messages_unread", "mail_queued", "mail_failed", "subscribers" }`
* `GET /api/admin/mail?status=queued|sent|failed|all&limit&offset` → `{ "items": [ { "id","to_email","subject","purpose","status","attempts","last_error","created_at","sent_at" } ], "total" }`; `POST /api/admin/mail/:id/retry` → `{ "ok": true }` (`409` when the message was already delivered, or when its body is gone — one-time-code mails are scrubbed after delivery/expiry)
* `GET /api/admin/audit?limit=100&offset=0` → `{ "items": [ { "id","actor": {"id","name"} | null,"action","entity","entity_id","meta","created_at" } ], "total" }`
* `POST /api/admin/jobs/digest` `{ "mode"?: "all" }` → `{ "ok": true, "emails_queued": n }` (runs the Mongolist digest job now; `mode: "all"` treats every enabled subscription as due regardless of its daily/weekly slot. Each run mails everything published in (cursor, now − 30 s] and moves the cursors to that window end, so the next scheduled digest only covers items published afterwards)

---------------------------------------------------------------------------

## 6. Safe Markdown subset (custom pages)

Blocks separated by a blank line: `# `/`## `/`### ` headings, `- ` bullet list, `1. ` numbered list, `> ` quote, otherwise a paragraph
(single newline = line break). Inline: `**bold**`, `*italic*`, `` `code` ``, `[text](https://url)` (only `http`, `https`, `mailto`).
Raw HTML is **not** supported (shown as text). The client renders it by **building DOM nodes** (never `innerHTML`).

---------------------------------------------------------------------------

## 7. Frontend integration rules

* `assets/js/api.js` (shared) exposes `window.IAML.api`:
  `available() → Promise<boolean>` (cached `/api/health` probe), `get/post/put/patch/del(path, body)` → parsed JSON
  (adds `X-Requested-With: IAML`, `credentials: same-origin`, throws `ApiError {status, code, message, fields}`),
  `upload(path, FormData)`, and `session` helpers `me()`, `user` (cached), `onChange(cb)`.
  Pages must call `await IAML.api.available()` first; if `false` they keep their static markup untouched.
* Never put API data into `innerHTML` unescaped — use `textContent`, DOM construction, or `IAML.esc()`.
* Menu: render the static menu first; replace it with `/api/menu` (cache last answer in `localStorage` key `iaml-menu` to avoid flicker).
* Times: format with `Intl.DateTimeFormat('en-GB', { timeZone: 'Etc/GMT-3', … })` and label them `(UTC+3)`.

---------------------------------------------------------------------------

## 8. Configuration (environment variables)

| Variable | Default | Notes |
|---|---|---|
| `NODE_ENV` | `development` | `production` on the VPS |
| `PORT` / `HOST` | `3000` / `0.0.0.0` | |
| `DATABASE_URL` | — (required) | `postgres://user:pass@db:5432/iaml` |
| `SITE_URL` | — (required) | public origin, e.g. `https://iaml.org` (no trailing slash). Drives CSRF origin check, cookie `Secure`, links in e-mails |
| `SESSION_SECRET` | — (required, ≥ 32 chars) | HMAC key for e-mail codes and unsubscribe tokens |
| `TRUST_PROXY` | `false` | number of proxy hops in front of the app (`1` behind Caddy) so the real client IP is used for rate limits; `true` trusts every hop |
| `STATIC_DIR` | `../` (dev) / `/app/public` (Docker) | allow-listed static files only |
| `UPLOADS_DIR` | `./data/uploads` (dev) / `/data/uploads` (Docker) | avatars |
| `MAIL_TRANSPORT` | `log` | `resend` in production, `log` stores mail in the outbox only (dev/tests) |
| `RESEND_API_KEY` | — | required when `MAIL_TRANSPORT=resend` |
| `RESEND_API_BASE` | `https://api.resend.com` | override for tests |
| `MAIL_FROM` | — | e.g. `IAML <no-reply@iaml.org>` — domain must be verified in Resend |
| `MAIL_MIN_INTERVAL_MS` | `600` | Resend free tier allows 2 req/s |
| `SITE_TZ` | `Etc/GMT-3` | zone for digest schedule and e-mail dates (UTC+3) |
| `DIGEST_HOUR` | `8` | local hour (in `SITE_TZ`) of daily/weekly digests |
| `DIGEST_WEEKDAY` | `1` | weekly digest day (1 = Monday) |
| `MIGRATE_ON_START` | `true` | apply SQL migrations when the server starts |
| `LOG_LEVEL` | `info` | `debug` outside production |
| `DB_POOL_MAX` | `10` | PostgreSQL connections held by the app |
| `MAIL_WORKER_INTERVAL_MS` | `2000` | how often the outbox worker looks for due mail |
| `JOBS_ENABLED` | `true` | `false` disables the mail worker and the digest scheduler (tests, one-off scripts) |

CLI (run inside the app container or `cd backend`): `npm run migrate`, `npm run seed` (base data — positions, the 30-person roster, menu, link categories, contacts, settings — applied **once**; later runs do nothing so rows deleted in the admin panel never come back; `-- --force` re-applies on purpose),
`npm run seed:demo` (sample news/events/discuss — never in production),
`npm run admin:create -- --email a@b.org --first Ada --last Lovelace [--workplace "…"] [--password …]` (prints a generated password if none given;
promotes the account if the e-mail already exists).
