import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { after, before, beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { cleanup, startScheduler } from '../src/jobs/scheduler.js';
import { PASSWORD, TEST_DB_URL, client, createUser, makeConfig, resetDb, startApp } from './helpers.js';

let ctx;
before(async () => { ctx = await startApp(); });
after(async () => { await ctx.close(); });
beforeEach(async () => { await resetDb(ctx.db); });

describe('housekeeping', () => {
  test('cleanup removes expired sessions, old codes/attempts and delivered mail; keeps what is still needed', async () => {
    const u = await createUser(ctx.db);
    await ctx.db.query(`insert into sessions (id, user_id, expires_at) values ('\\x${'01'.repeat(32)}', $1, now() - interval '1 day'), ('\\x${'02'.repeat(32)}', $1, now() + interval '1 day')`, [u.id]);
    await ctx.db.query(`insert into email_codes (user_id, purpose, code_hash, expires_at, created_at) values ($1, 'verify_email', '\\x00', now(), now() - interval '3 days'), ($1, 'verify_email', '\\x01', now(), now())`, [u.id]);
    await ctx.db.query(`insert into auth_attempts (kind, key, created_at) values ('login', 'a', now() - interval '3 days'), ('login', 'b', now())`);
    await ctx.db.query(
      `insert into mail_outbox (to_email, subject, text_body, status, created_at) values
         ('a@example.org', 'old sent', 'x', 'sent', now() - interval '40 days'),
         ('b@example.org', 'old failed', 'x', 'failed', now() - interval '40 days'),
         ('c@example.org', 'old queued', 'x', 'queued', now() - interval '40 days'),
         ('d@example.org', 'recent sent', 'x', 'sent', now() - interval '1 day')`,
    );
    const out = await cleanup({ db: ctx.db, config: ctx.config });
    assert.equal(out.sessions, 1);
    assert.equal(out.codes, 1);
    assert.equal(out.attempts, 1);
    assert.equal(out.mail, 2);
    assert.deepEqual((await ctx.db.many('select subject from mail_outbox order by id')).map((m) => m.subject), ['old queued', 'recent sent']);
    assert.equal((await ctx.db.one('select count(*)::int as n from sessions')).n, 1);
  });

  test('with a real mail provider, delivered one-time codes are scrubbed from the outbox', async () => {
    const config = makeConfig({ MAIL_TRANSPORT: 'resend', RESEND_API_KEY: 're_x', MAIL_FROM: 'IAML <no-reply@example.org>' });
    await ctx.db.query(
      `insert into mail_outbox (to_email, subject, text_body, html_body, purpose, status, created_at) values
         ('a@example.org', 's', 'code 123456', '<p>123456</p>', 'verify_email', 'failed', now() - interval '2 hours'),
         ('b@example.org', 's', 'code 654321', null, 'reset_password', 'queued', now() - interval '2 hours'),
         ('c@example.org', 's', 'plain', null, 'contact', 'sent', now() - interval '2 hours')`,
    );
    const out = await cleanup({ db: ctx.db, config });
    assert.equal(out.scrubbed, 1, 'queued mail is untouched');
    const rows = await ctx.db.many('select to_email, text_body from mail_outbox order by id');
    assert.deepEqual(rows.map((r) => r.text_body), ['[removed]', 'code 654321', 'plain']);
  });

  test('scheduler tick runs the digest and cleanup without throwing, and stops cleanly', async () => {
    const scheduler = startScheduler({ db: ctx.db, config: ctx.config });
    await scheduler.tick();
    await scheduler.tick();
    await scheduler.stop();
  });
});

describe('registration race', () => {
  test('two simultaneous registrations of the same new address both succeed identically (no leak, no 500)', async () => {
    const body = { first_name: 'Ada', last_name: 'L', workplace: 'W', email: 'race@example.org', password: PASSWORD };
    const results = await Promise.all([client(ctx.app).post('/api/auth/register', body), client(ctx.app).post('/api/auth/register', body)]);
    assert.deepEqual(results.map((r) => r.status), [201, 201]);
    assert.equal((await ctx.db.one(`select count(*)::int as n from users where email = 'race@example.org'`)).n, 1);
  });
});

// ── process-level boot test (config errors, real listen, graceful shutdown) ──
const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const freePort = () => new Promise((resolve) => {
  const s = net.createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
});

function boot(env) {
  const child = spawn(process.execPath, ['src/server.js'], { cwd: backendDir, env: { PATH: process.env.PATH, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  const exited = new Promise((resolve) => child.on('exit', (code, signal) => resolve({ code, signal })));
  return { child, exited, output: () => out };
}

describe('process boot', () => {
  test('invalid configuration exits with code 78 and lists the problems', async () => {
    const p = boot({ NODE_ENV: 'production' });
    const { code } = await p.exited;
    assert.equal(code, 78);
    assert.match(p.output(), /DATABASE_URL is required/);
    assert.match(p.output(), /SESSION_SECRET is required/);
  });

  test('starts, migrates, serves the site and the API, and shuts down gracefully on SIGTERM', async () => {
    const port = await freePort();
    const p = boot({
      NODE_ENV: 'test', PORT: String(port), HOST: '127.0.0.1', DATABASE_URL: TEST_DB_URL, SITE_URL: `http://127.0.0.1:${port}`,
      SESSION_SECRET: 'boot-test-secret-0123456789abcdef0123456789', MAIL_TRANSPORT: 'log', JOBS_ENABLED: 'true', LOG_LEVEL: 'warn',
    });
    try {
      let health = null;
      for (let i = 0; i < 60 && !health; i++) {
        try { health = await (await fetch(`http://127.0.0.1:${port}/api/health`)).json(); } catch { await new Promise((r) => setTimeout(r, 250)); }
      }
      assert.ok(health?.ok, `server did not come up:\n${p.output()}`);
      const home = await fetch(`http://127.0.0.1:${port}/`);
      assert.equal(home.status, 200);
      assert.match(home.headers.get('content-security-policy'), /script-src 'self'/);
      assert.equal((await fetch(`http://127.0.0.1:${port}/backend/package.json`)).status, 404);
    } finally {
      p.child.kill('SIGTERM');
    }
    const { code } = await p.exited;
    if (process.platform !== 'win32') assert.equal(code, 0, `graceful shutdown expected, output:\n${p.output()}`);
  });
});

describe('migrations', () => {
  test('the checksum ignores line endings (CRLF checkouts on Windows)', async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
    const os = await import('node:os');
    const { migrate } = await import('../src/migrate.js');
    const dir = mkdtempSync(path.join(os.tmpdir(), 'iaml-mig-'));
    try {
      writeFileSync(path.join(dir, '900_crlf_probe.sql'), 'create table if not exists _crlf_probe (id int);\n-- probe\n');
      assert.deepEqual(await migrate(ctx.db, { dir }), ['900_crlf_probe.sql']);
      writeFileSync(path.join(dir, '900_crlf_probe.sql'), 'create table if not exists _crlf_probe (id int);\r\n-- probe\r\n');
      assert.deepEqual(await migrate(ctx.db, { dir }), [], 'same content with CRLF is not "modified"');
      writeFileSync(path.join(dir, '900_crlf_probe.sql'), 'create table if not exists _crlf_probe (id int, x int);\n');
      await assert.rejects(() => migrate(ctx.db, { dir }), /modified after it was applied/);
    } finally {
      await ctx.db.query(`drop table if exists _crlf_probe; delete from schema_migrations where name = '900_crlf_probe.sql'`);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
