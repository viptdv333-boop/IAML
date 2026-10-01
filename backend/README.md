# IAML backend

Node.js (≥ 22, ESM) · Fastify 5 · PostgreSQL 16. One process serves the static site (from an allow-list), the JSON API under `/api`, avatar uploads, the mail-outbox worker and the Mongolist digest scheduler. E-mail is delivered through [Resend](https://resend.com) (HTTP API). Nothing else is external.

The API contract is [`../docs/API.md`](../docs/API.md) — the single source of truth for the backend, the public pages and the admin panel. Deployment and operations (Russian): [`../docs/DEPLOY.md`](../docs/DEPLOY.md), [`../docs/OPERATIONS.md`](../docs/OPERATIONS.md).

## Run it locally

```bash
docker run -d --name iaml-pg -e POSTGRES_USER=iaml -e POSTGRES_PASSWORD=devpass -e POSTGRES_DB=iaml -p 127.0.0.1:55432:5432 postgres:16
cd backend
npm ci
cat > .env <<'EOF'            # git-ignored
NODE_ENV=development
PORT=3100
DATABASE_URL=postgres://iaml:devpass@localhost:55432/iaml
SITE_URL=http://localhost:3100
SESSION_SECRET=dev-only-secret-0123456789abcdef0123456789abcdef
MAIL_TRANSPORT=log
EOF
npm run migrate          # also runs automatically on start
npm run seed:demo        # base data + sample news/events/publications/Discuss (never in production)
npm run admin:create -- --email you@example.org --first You --last Admin
npm run dev              # http://localhost:3100  (site + API)
```

With `MAIL_TRANSPORT=log` nothing is sent; messages (including one-time codes) stay readable in the `mail_outbox` table.

## Tests

```bash
docker exec iaml-pg psql -U iaml -d postgres -c "create database iaml_test"
npm test                 # 130+ tests, ~45 s, real PostgreSQL
```

Tests use `TEST_DATABASE_URL` (default `postgres://iaml:devpass@localhost:55432/iaml_test`) and **wipe every table** — the helper refuses any database whose name does not contain `test`. The Resend transport is tested against a local mock HTTP server; no network access is needed.

## Layout

```
src/server.js          entry point (config → migrate → listen → worker + scheduler → graceful shutdown)
src/app.js             Fastify factory (also used by tests)
src/config.js          environment → validated, frozen config
src/plugins/           security (CSP, CSRF), session (cookie → user), static (allow-list, robots/sitemap)
src/routes/            public, contact, auth, me, discuss, unsubscribe, admin/*
src/mail/              outbox, transports (resend | log), worker, templates
src/jobs/              digest engine (Mongolist), scheduler + cleanup
src/lib/               validate, crypto (scrypt, HMAC codes/tokens), tz, dto, audit, settings, pg error mapping
migrations/            plain SQL, applied in order, once, checksummed (never edit an applied file — add 002_*.sql)
seeds/                 base.sql (applied once), demo.sql (development only)
scripts/               seed.js, create-admin.js
test/                  node:test suites
```

## Security notes

* **Passwords:** scrypt (N=2¹⁶), at most 4 hashes in parallel with a bounded queue (a flood gets quick `503 busy` answers instead of exhausting memory). The password is chosen/confirmed at `/api/auth/verify` by the person who holds the e-mailed code, so pre-registering somebody else's address gains nothing.
* **Codes:** 6 digits, HMAC-stored, 15 min, ≤ 5 tries per code, cool-down 60 s, ≤ 5 per hour; every failure answers identically. Code e-mails carry a constant subject and a generic greeting; delivered code mails are scrubbed from the outbox.
* **Throttles:** log-ins reserve an attempt *before* the password check (parallel guessing cannot outrun the limit); per-IP counters use the IPv6 /64; global ceilings cap code e-mails (150/h) and registrations (120/h); accounts never confirmed within 7 days are deleted.
* **Sessions:** random 256-bit cookie token (`HttpOnly; SameSite=Lax`, `Secure` under https), only its SHA-256 is stored, 30-day sliding expiry, replaced at every log-in.
* **CSRF:** every non-GET request needs `X-Requested-With: IAML` and a same-origin `Origin`, decided on the matched route (not on URL text); only the token-authenticated `/api/unsubscribe` is exempt.
* **Content:** CSP `script-src 'self'`; strict static allow-list; avatars re-encoded by `sharp` (256×256 WebP, EXIF stripped, ≤ 2 MB, pixel-bomb limit). Names may not contain links; Discuss posts wait 10 minutes (links stripped) before they can be mailed to subscribers.
* **Operations:** secrets only through environment variables (production refuses sample secrets); request logs never contain query strings, cookies or authorization headers; set `TRUST_PROXY=1` behind Caddy.
