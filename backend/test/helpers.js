// Shared test harness: isolated database (name must contain "test"), app factory, cookie-jar client, fixtures.
import { mkdtempSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { REPO_DIR, loadConfig } from '../src/config.js';
import { buildApp } from '../src/app.js';
import { createDb } from '../src/db.js';
import { hashPassword } from '../src/lib/crypto.js';
import { migrate } from '../src/migrate.js';

export const TEST_DB_URL =
  process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgres://iaml:devpass@localhost:55432/iaml_test';

const dbName = decodeURIComponent(new URL(TEST_DB_URL).pathname.slice(1));
if (!/test/i.test(dbName)) {
  throw new Error(`Refusing to run tests against database "${dbName}": its name must contain "test" (tests wipe all tables).`);
}

export const PASSWORD = 'CorrectHorse9!';
const TABLES = [
  'users', 'sessions', 'email_codes', 'auth_attempts', 'pages', 'menu_items', 'news', 'events', 'publications',
  'positions', 'participants', 'discuss_threads', 'discuss_comments', 'reports', 'subscription_prefs', 'mail_outbox',
  'contact_messages', 'contact_recipients', 'contact_people', 'site_settings', 'link_categories', 'useful_links', 'audit_log',
];

export function makeConfig(env = {}) {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DB_URL,
    SITE_URL: 'http://localhost:3000',
    SESSION_SECRET: 'test-secret-0123456789abcdef0123456789abcdef',
    MAIL_TRANSPORT: 'log',
    PORT: '3000',
    JOBS_ENABLED: 'false',
    STATIC_DIR: REPO_DIR,
    ...env,
  });
}

/** One database pool + one app per test file. */
export async function startApp({ env = {}, transport } = {}) {
  const uploads = mkdtempSync(path.join(os.tmpdir(), 'iaml-uploads-'));
  const config = makeConfig({ UPLOADS_DIR: uploads, ...env });
  const db = createDb(TEST_DB_URL, { max: 6 });
  await migrate(db);
  await resetDb(db);
  const app = await buildApp(config, { db, transport });
  await app.ready();
  return {
    app, db, config, uploads,
    async close() {
      await app.close();
      await db.close();
      rmSync(uploads, { recursive: true, force: true });
    },
  };
}

export async function resetDb(db) {
  await db.query(`truncate ${TABLES.join(', ')} restart identity cascade`);
}

export async function seedBase(db) {
  await db.query(await readFile(path.join(REPO_DIR, 'backend', 'seeds', 'base.sql'), 'utf8'));
}

let ipCounter = 10;
/** HTTP client with a cookie jar and its own (fake) client IP, so per-IP rate limits never leak between tests. */
export function client(app, { ip } = {}) {
  const remoteAddress = ip ?? `10.${Math.floor(ipCounter / 250)}.${ipCounter++ % 250}.1`;
  const jar = new Map();

  async function request(method, url, { body, headers = {}, query } = {}) {
    const h = { 'x-requested-with': 'IAML', ...headers };
    for (const k of Object.keys(h)) if (h[k] === null) delete h[k];
    if (jar.size) h.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    let payload = body;
    if (body !== undefined && !Buffer.isBuffer(body) && typeof body !== 'string') {
      payload = JSON.stringify(body);
      h['content-type'] ??= 'application/json';
    }
    const res = await app.inject({ method, url, headers: h, payload, query, remoteAddress });
    for (const c of res.cookies) {
      const gone = c.value === '' || c.maxAge === 0 || (c.expires && new Date(c.expires).getTime() < Date.now());
      if (gone) jar.delete(c.name); else jar.set(c.name, c.value);
    }
    let json = null;
    if (String(res.headers['content-type'] ?? '').includes('json')) { try { json = res.json(); } catch { /* not json */ } }
    return { status: res.statusCode, headers: res.headers, body: json, text: res.payload, rawBody: res.rawPayload };
  }

  return {
    jar, request, ip: remoteAddress,
    get: (url, o) => request('GET', url, o),
    post: (url, body, o) => request('POST', url, { body, ...o }),
    put: (url, body, o) => request('PUT', url, { body, ...o }),
    patch: (url, body, o) => request('PATCH', url, { body, ...o }),
    del: (url, body, o) => request('DELETE', url, { body, ...o }),
  };
}

const hashCache = new Map();
async function hashed(password) {
  if (!hashCache.has(password)) hashCache.set(password, await hashPassword(password));
  return hashCache.get(password);
}

let userCounter = 0;
export async function createUser(db, o = {}) {
  const n = ++userCounter;
  const u = {
    email: o.email ?? `user${n}@example.org`,
    first: o.first ?? 'Ada',
    last: o.last ?? `Tester${n}`,
    workplace: o.workplace ?? 'Example University',
    password: o.password ?? PASSWORD,
    role: o.role ?? 'member',
    verified: o.verified ?? true,
    disabled: o.disabled ?? false,
  };
  const row = await db.one(
    `insert into users (email, password_hash, first_name, last_name, workplace, role, email_verified_at, disabled_at)
     values ($1, $2, $3, $4, $5, $6, ${u.verified ? 'now()' : 'null'}, ${u.disabled ? 'now()' : 'null'}) returning id`,
    [u.email, await hashed(u.password), u.first, u.last, u.workplace, u.role],
  );
  return { ...u, id: row.id };
}

/** A client that is already logged in as `user` (fresh session via the real login endpoint). */
export async function loginAs(app, user) {
  const c = client(app);
  const res = await c.post('/api/auth/login', { email: user.email, password: user.password ?? PASSWORD });
  if (res.status !== 200) throw new Error(`login failed for ${user.email}: ${res.status} ${res.text}`);
  return c;
}

export const mailTo = (db, to, purpose) =>
  db.many(`select * from mail_outbox where to_email = $1 ${purpose ? 'and purpose = $2' : ''} order by id`, purpose ? [to, purpose] : [to]);

/** Latest 6-digit code mailed to `email` for the purpose. */
export async function lastCode(db, email, purpose = 'verify_email') {
  const rows = await mailTo(db, email, purpose);
  const m = /\b(\d{6})\b/.exec(rows.at(-1)?.text_body ?? '');
  return m ? m[1] : null;
}

/** Wait for a condition (polling) — for the few places that involve timers. */
export async function until(fn, { timeout = 3000, step = 25 } = {}) {
  const end = Date.now() + timeout;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('until(): timed out');
    await new Promise((r) => setTimeout(r, step));
  }
}
