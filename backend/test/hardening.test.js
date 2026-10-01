// Regression tests for the findings of the security review (concurrency, bypasses, abuse limits).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { after, before, beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../src/lib/crypto.js';
import { runDigest } from '../src/jobs/digest.js';
import { cleanup } from '../src/jobs/scheduler.js';
import { PASSWORD, TEST_DB_URL, client, createUser, loginAs, mailTo, resetDb, startApp } from './helpers.js';

let ctx;
before(async () => { ctx = await startApp(); });
after(async () => { await ctx.close(); });
beforeEach(async () => {
  await resetDb(ctx.db);
  ctx.app.budget.reset();
});

describe('login throttle', () => {
  test('parallel guesses cannot outrun the limit: at most 5 passwords are ever evaluated', async () => {
    await createUser(ctx.db, { email: 'target@example.org' });
    const guesses = Array.from({ length: 28 }, (_, i) =>
      client(ctx.app).post('/api/auth/login', { email: 'target@example.org', password: i === 23 ? PASSWORD : `wrong-guess-${i}` }));
    const statuses = (await Promise.all(guesses)).map((r) => r.status);
    const evaluated = statuses.filter((s) => s === 200 || s === 401).length;
    assert.ok(evaluated <= 5, `evaluated ${evaluated} passwords: ${statuses.join(',')}`);
    assert.ok(statuses.filter((s) => s === 429).length >= 23);
  });

  test('a successful login clears the counter', async () => {
    await createUser(ctx.db, { email: 'ok@example.org' });
    for (let i = 0; i < 3; i++) await client(ctx.app).post('/api/auth/login', { email: 'ok@example.org', password: 'nope-nope' });
    assert.equal((await client(ctx.app).post('/api/auth/login', { email: 'ok@example.org', password: PASSWORD })).status, 200);
    assert.equal((await ctx.db.one(`select count(*)::int as n from auth_attempts where kind = 'login'`)).n, 0);
  });
});

describe('IPv6 clients share one bucket per /64', () => {
  test('rate limits cannot be dodged by rotating addresses inside a /64', async () => {
    const forgot = (ip) => client(ctx.app, { ip }).post('/api/auth/forgot', { email: 'someone@example.org' });
    for (let i = 1; i <= 5; i++) assert.equal((await forgot(`2001:db8:1:2:${i}::1`)).status, 202);
    const blocked = await forgot('2001:db8:1:2:ffff::9');
    assert.equal(blocked.status, 429);
    assert.equal((await forgot('2001:db8:1:3::1')).status, 202, 'another /64 is unaffected');
  });

  test('the DB-backed login throttle uses the same bucket', async () => {
    await createUser(ctx.db, { email: 'v6@example.org' });
    for (let i = 1; i <= 10; i++) {
      await client(ctx.app, { ip: `2001:db8:9:9:${i}::5` }).post('/api/auth/login', { email: `nobody${i}@example.org`, password: 'wrong-pass' });
    }
    const r = await client(ctx.app, { ip: '2001:db8:9:9:abcd::1' }).post('/api/auth/login', { email: 'v6@example.org', password: PASSWORD });
    assert.equal(r.status, 429, 'ten failures from one /64 in a minute block further log-ins from it');
  });
});

describe('request hygiene', () => {
  test('percent-encoded and odd spellings of an API path still need the CSRF header', async () => {
    const c = client(ctx.app);
    const encoded = await c.post('/%61pi/auth/login', { email: 'a@b.org', password: 'x' }, { headers: { 'x-requested-with': null } });
    assert.equal(encoded.status, 403);
    assert.equal(encoded.body.error.code, 'csrf');
    const unknown = await c.post('/definitely/not/an/api', {}, { headers: { 'x-requested-with': null } });
    assert.equal(unknown.status, 403);
  });

  test('NUL bytes and control characters in e-mail addresses are a 400, never a 500', async () => {
    const c = client(ctx.app);
    for (const email of ['a\u0000@b.co', 'a\u0007@b.co', 'a@b\u0000.co']) {
      for (const [url, body] of [['/api/auth/login', { password: 'x' }], ['/api/auth/forgot', {}], ['/api/auth/resend', {}]]) {
        const r = await c.post(url, { email, ...body });
        assert.equal(r.status, 400, `${url} ${JSON.stringify(email)}`);
      }
    }
  });

  test('the not-found handler (static site, sitemap) is rate limited too', async () => {
    const c = client(ctx.app);
    let last;
    for (let i = 0; i < 320; i++) {
      last = await c.get('/sitemap.xml');
      if (last.status === 429) break;
    }
    assert.equal(last.status, 429);
  });
});

describe('abuse limits', () => {
  test('global ceiling on code e-mails (registrations, forgot, resend) keeps the mail quota bounded', async () => {
    for (let i = 0; i < 150; i++) assert.ok(ctx.app.budget.take('code-mail', 150, 3_600_000));
    const r = await client(ctx.app).post('/api/auth/forgot', { email: 'someone@example.org' });
    assert.equal(r.status, 429);
    assert.equal(r.body.error.code, 'rate_limited');
    ctx.app.budget.reset();
    assert.equal((await client(ctx.app).post('/api/auth/forgot', { email: 'someone@example.org' })).status, 202);
  });

  test('hashing floods are refused quickly once the queue is full (503), and never mistaken for a wrong password', async () => {
    const results = await Promise.allSettled(Array.from({ length: 70 }, (_, i) => hashPassword(`flood-password-${i}`)));
    const refused = results.filter((r) => r.status === 'rejected');
    assert.ok(refused.length >= 20, `expected the overflow to be refused, got ${refused.length}`);
    assert.ok(refused.every((r) => r.reason.status === 503 && r.reason.code === 'busy'));
    assert.ok(results.filter((r) => r.status === 'fulfilled').length >= 40);
  });

  test('abandoned registrations are deleted after 7 days; confirmed accounts never', async () => {
    const stale = await createUser(ctx.db, { email: 'stale@example.org', verified: false });
    const fresh = await createUser(ctx.db, { email: 'fresh@example.org', verified: false });
    const real = await createUser(ctx.db, { email: 'real@example.org' });
    await ctx.db.query(`update users set created_at = now() - interval '8 days' where id in ($1, $2)`, [stale.id, real.id]);
    const out = await cleanup({ db: ctx.db, config: ctx.config });
    assert.equal(out.unverified, 1);
    const left = (await ctx.db.many('select email from users order by email')).map((u) => u.email);
    assert.deepEqual(left, ['fresh@example.org', 'real@example.org']);
    assert.ok(fresh.id);
  });
});

describe('Discuss abuse', () => {
  test('parallel posts cannot exceed the hourly limit (5 threads, 30 comments)', async () => {
    const user = await createUser(ctx.db);
    const c = await loginAs(ctx.app, user);
    const threads = await Promise.all(Array.from({ length: 14 }, (_, i) => c.post('/api/discuss/threads', { title: `Parallel ${i}`, body: 'x' })));
    assert.equal(threads.filter((r) => r.status === 201).length, 5);
    assert.equal(threads.filter((r) => r.status === 429).length, 9);

    const host = (await ctx.db.one('select id from discuss_threads limit 1')).id;
    const comments = await Promise.all(Array.from({ length: 45 }, (_, i) => c.post(`/api/discuss/threads/${host}/comments`, { body: `c${i}` })));
    assert.equal(comments.filter((r) => r.status === 201).length, 30);
  });

  test('new threads wait 10 minutes before they can be mailed to subscribers, and links are stripped from the mail', async () => {
    const author = await createUser(ctx.db, { first: 'Eve', last: 'Poster' });
    const sub = await createUser(ctx.db, { email: 'sub@example.org' });
    const NOW = new Date('2026-10-01T06:00:00Z');
    await ctx.db.query(
      `insert into subscription_prefs (user_id, topic, enabled, frequency, last_sent_at) values ($1, 'discuss', true, 'instant', $2)`,
      [sub.id, '2026-10-01T05:00:00Z'],
    );
    await ctx.db.query(
      `insert into discuss_threads (author_id, title, body, created_at) values ($1, 'URGENT: verify at https://evil.example/login', 'Go to www.evil.example now http://x.y/z', $2)`,
      [author.id, '2026-10-01T05:55:00Z'],
    );
    const run = (now) => runDigest({ db: ctx.db, config: ctx.config }, { now });
    assert.equal((await run(NOW)).emails_queued, 0, 'only 5 minutes old: held back');
    assert.equal((await run(new Date(NOW.getTime() + 5 * 60_000))).emails_queued, 0, 'still inside the hold-back');
    const later = await run(new Date(NOW.getTime() + 20 * 60_000));
    assert.equal(later.emails_queued, 1);
    const [mail] = await mailTo(ctx.db, 'sub@example.org', 'digest');
    assert.ok(!/evil\.example|http:\/\/x\.y/.test(mail.text_body + mail.html_body), mail.text_body);
    assert.match(mail.text_body, /\[link removed\]/);
    // removed before it was mailed → never mailed
    await ctx.db.query(`insert into discuss_threads (author_id, title, body, created_at, status) values ($1, 'Spam', 'spam', '2026-10-01T06:30:00Z', 'removed')`, [author.id]);
    assert.equal((await run(new Date(NOW.getTime() + 60 * 60_000))).emails_queued, 0);
  });
});

describe('administrators', () => {
  test('two admins deleting themselves at the same time can never leave the site without one', async () => {
    const a = await createUser(ctx.db, { role: 'admin' });
    const b = await createUser(ctx.db, { role: 'admin' });
    const [ca, cb] = await Promise.all([loginAs(ctx.app, a), loginAs(ctx.app, b)]);
    const results = await Promise.all([ca.del('/api/me', { password: PASSWORD }), cb.del('/api/me', { password: PASSWORD })]);
    assert.deepEqual(results.map((r) => r.status).sort(), [204, 409]);
    assert.equal((await ctx.db.one(`select count(*)::int as n from users where role = 'admin'`)).n, 1);
  });

  test('an unverified account cannot be promoted to administrator', async () => {
    const boss = await createUser(ctx.db, { role: 'admin' });
    const pending = await createUser(ctx.db, { verified: false });
    const c = await loginAs(ctx.app, boss);
    const r = await c.patch(`/api/admin/users/${pending.id}`, { role: 'admin' });
    assert.equal(r.status, 409);
    assert.equal((await ctx.db.one('select role from users where id = $1', [pending.id])).role, 'member');
  });
});

describe('create-admin script', () => {
  const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const run = (...args) =>
    new Promise((resolve) => {
      const child = spawn(process.execPath, ['scripts/create-admin.js', ...args], { cwd: backendDir, env: { PATH: process.env.PATH, DATABASE_URL: TEST_DB_URL } });
      let out = '';
      child.stdout.on('data', (d) => { out += d; });
      child.stderr.on('data', (d) => { out += d; });
      child.on('exit', (code) => resolve({ code, out }));
    });

  test('promoting an UNVERIFIED pre-registration replaces the stranger\'s password', async () => {
    await ctx.db.query(
      `insert into users (email, password_hash, first_name, last_name, workplace) values ('info@example.org', $1, 'Mallory', 'X', 'Evil Corp')`,
      [await hashPassword('AttackerPass1!')],
    );
    const r = await run('--email', 'info@example.org', '--first', 'Real', '--last', 'Admin');
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /password was replaced/i);
    const newPassword = /\(shown once\): (\S+)/.exec(r.out)?.[1];
    assert.ok(newPassword);
    assert.equal((await client(ctx.app).post('/api/auth/login', { email: 'info@example.org', password: 'AttackerPass1!' })).status, 401);
    const ok = await client(ctx.app).post('/api/auth/login', { email: 'info@example.org', password: newPassword });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.user.role, 'admin');
  });

  test('promoting a confirmed account keeps its password unless one is given', async () => {
    const u = await createUser(ctx.db, { email: 'member@example.org' });
    const r = await run('--email', u.email);
    assert.equal(r.code, 0, r.out);
    assert.doesNotMatch(r.out, /password/i);
    assert.equal((await client(ctx.app).post('/api/auth/login', { email: u.email, password: PASSWORD })).body.user.role, 'admin');
  });
});
