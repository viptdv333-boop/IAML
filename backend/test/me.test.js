import assert from 'node:assert/strict';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { after, before, beforeEach, describe, test } from 'node:test';
import sharp from 'sharp';
import { PASSWORD, client, createUser, loginAs, resetDb, startApp } from './helpers.js';

let ctx;
before(async () => { ctx = await startApp(); });
after(async () => { await ctx.close(); });
beforeEach(async () => {
  await resetDb(ctx.db);
  rmSync(path.join(ctx.uploads, 'avatars'), { recursive: true, force: true });
});

function multipart(field, filename, type, data) {
  const boundary = '----iamltest' + Math.random().toString(16).slice(2);
  const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`);
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { body: Buffer.concat([head, data, tail]), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}
const png = (w = 300, h = 200) => sharp({ create: { width: w, height: h, channels: 3, background: '#336699' } }).png().toBuffer();
const avatarFiles = () => (existsSync(path.join(ctx.uploads, 'avatars')) ? readdirSync(path.join(ctx.uploads, 'avatars')) : []);

describe('authorization', () => {
  test('all /api/me endpoints need a verified session', async () => {
    const c = client(ctx.app);
    for (const [m, u] of [['get', '/api/me/subscriptions'], ['put', '/api/me/subscriptions'], ['patch', '/api/me'], ['post', '/api/me/password'], ['del', '/api/me'], ['del', '/api/me/avatar']]) {
      const r = await c[m](u, {});
      assert.equal(r.status, 401, `${m} ${u}`);
      assert.equal(r.body.error.code, 'unauthenticated');
    }
  });
});

describe('profile', () => {
  test('PATCH updates only the given fields and returns the user', async () => {
    const u = await createUser(ctx.db, { first: 'Ada', last: 'Lovelace', workplace: 'Old' });
    const c = await loginAs(ctx.app, u);
    const r = await c.patch('/api/me', { workplace: '  New Place  ', first_name: 'Augusta' });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.workplace, 'New Place');
    assert.equal(r.body.user.first_name, 'Augusta');
    assert.equal(r.body.user.last_name, 'Lovelace');
    assert.equal(r.body.user.email, u.email);
    const empty = await c.patch('/api/me', {});
    assert.equal(empty.status, 400);
    const blank = await c.patch('/api/me', { first_name: '   ' });
    assert.equal(blank.status, 400);
    assert.ok(blank.body.error.fields.first_name);
    // role / e-mail cannot be changed through this endpoint
    await c.patch('/api/me', { first_name: 'X', role: 'admin', email: 'evil@example.org' });
    const row = await ctx.db.one('select role, email from users where id = $1', [u.id]);
    assert.equal(row.role, 'member');
    assert.equal(row.email, u.email);
  });
});

describe('avatar', () => {
  test('upload re-encodes to a 256×256 WebP, replaces the previous file, serves it', async () => {
    const u = await createUser(ctx.db);
    const c = await loginAs(ctx.app, u);
    const up = multipart('avatar', 'me.png', 'image/png', await png(500, 300));
    const r = await c.post('/api/me/avatar', up.body, { headers: up.headers });
    assert.equal(r.status, 200);
    assert.match(r.body.user.avatar_url, /^\/uploads\/avatars\/[0-9a-f-]{36}\.webp$/);
    assert.equal(avatarFiles().length, 1);

    const served = await c.get(r.body.user.avatar_url);
    assert.equal(served.status, 200);
    const meta = await sharp(served.rawBody).metadata();
    assert.equal(meta.format, 'webp');
    assert.equal(meta.width, 256);
    assert.equal(meta.height, 256);

    const first = avatarFiles()[0];
    const up2 = multipart('avatar', 'again.png', 'image/png', await png(64, 64));
    const r2 = await c.post('/api/me/avatar', up2.body, { headers: up2.headers });
    assert.equal(r2.status, 200);
    assert.equal(avatarFiles().length, 1, 'old file removed');
    assert.notEqual(avatarFiles()[0], first);
    assert.equal((await c.get('/api/auth/me')).body.user.avatar_url, r2.body.user.avatar_url);

    const del = await c.del('/api/me/avatar');
    assert.equal(del.status, 200);
    assert.equal(del.body.user.avatar_url, null);
    assert.equal(avatarFiles().length, 0);
  });

  test('strips metadata (EXIF) from the stored image', async () => {
    const u = await createUser(ctx.db);
    const c = await loginAs(ctx.app, u);
    const withExif = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#fff' } })
      .jpeg().withExif({ IFD0: { Copyright: 'secret-copyright-marker' } }).toBuffer();
    const up = multipart('avatar', 'x.jpg', 'image/jpeg', withExif);
    const r = await c.post('/api/me/avatar', up.body, { headers: up.headers });
    assert.equal(r.status, 200);
    const file = avatarFiles()[0];
    const stored = await sharp(path.join(ctx.uploads, 'avatars', file)).metadata();
    assert.equal(stored.exif, undefined);
  });

  test('rejects non-images, spoofed content types, oversized files, wrong field, wrong media type', async () => {
    const u = await createUser(ctx.db);
    const c = await loginAs(ctx.app, u);
    const post = (up) => c.post('/api/me/avatar', up.body, { headers: up.headers });

    const html = await post(multipart('avatar', 'x.png', 'image/png', Buffer.from('<html><script>alert(1)</script></html>')));
    assert.equal(html.status, 415);
    assert.equal(html.body.error.code, 'unsupported_media_type');
    const svg = await post(multipart('avatar', 'x.svg', 'image/svg+xml', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')));
    assert.equal(svg.status, 415);
    const truncated = await post(multipart('avatar', 'x.png', 'image/png', (await png()).subarray(0, 40)));
    assert.equal(truncated.status, 415);

    const big = await post(multipart('avatar', 'big.png', 'image/png', Buffer.concat([await png(), Buffer.alloc(2.2 * 1024 * 1024)])));
    assert.equal(big.status, 413);
    assert.equal(big.body.error.code, 'payload_too_large');

    const wrong = await post(multipart('photo', 'x.png', 'image/png', await png()));
    assert.equal(wrong.status, 400);
    const json = await c.post('/api/me/avatar', { avatar: 'x' });
    assert.equal(json.status, 415);
    assert.equal(avatarFiles().length, 0);
  });

  test('pixel bombs are refused', async () => {
    const u = await createUser(ctx.db);
    const c = await loginAs(ctx.app, u);
    // 6000×6000 = 36 Mpx > the 25 Mpx limit, but compresses to a tiny PNG
    const bomb = await sharp({ create: { width: 6000, height: 6000, channels: 3, background: '#000' } }).png({ compressionLevel: 9 }).toBuffer();
    assert.ok(bomb.length < 2 * 1024 * 1024);
    const up = multipart('avatar', 'bomb.png', 'image/png', bomb);
    const r = await c.post('/api/me/avatar', up.body, { headers: up.headers });
    assert.equal(r.status, 415);
  });
});

describe('password and account deletion', () => {
  test('change password: needs the current one, revokes other sessions, keeps this one', async () => {
    const u = await createUser(ctx.db);
    const a = await loginAs(ctx.app, u);
    const b = await loginAs(ctx.app, u);
    const wrong = await a.post('/api/me/password', { current_password: 'nope-nope', new_password: 'BrandNewPass1!' });
    assert.equal(wrong.status, 400);
    assert.ok(wrong.body.error.fields.current_password);
    const weak = await a.post('/api/me/password', { current_password: PASSWORD, new_password: 'short' });
    assert.equal(weak.status, 400);

    const ok = await a.post('/api/me/password', { current_password: PASSWORD, new_password: 'BrandNewPass1!' });
    assert.equal(ok.status, 204);
    assert.ok((await a.get('/api/auth/me')).body.user, 'this session survives');
    assert.equal((await b.get('/api/auth/me')).body.user, null, 'other sessions are revoked');
    assert.equal((await client(ctx.app).post('/api/auth/login', { email: u.email, password: 'BrandNewPass1!' })).status, 200);
  });

  test('delete account: password required, data removed, Discuss posts stay as "Deleted user"', async () => {
    const u = await createUser(ctx.db, { first: 'Gone', last: 'Soon' });
    const c = await loginAs(ctx.app, u);
    const up = multipart('avatar', 'a.png', 'image/png', await png());
    await c.post('/api/me/avatar', up.body, { headers: up.headers });
    const thread = (await c.post('/api/discuss/threads', { title: 'My last question', body: 'Anyone?' })).body.thread;
    await c.put('/api/me/subscriptions', { topics: [{ topic: 'news', enabled: true, frequency: 'daily' }] });

    const bad = await c.del('/api/me', { password: 'wrong-password' });
    assert.equal(bad.status, 400);
    assert.equal((await c.del('/api/me', { password: PASSWORD })).status, 204);

    assert.equal((await ctx.db.one('select count(*)::int as n from users')).n, 0);
    assert.equal((await ctx.db.one('select count(*)::int as n from sessions')).n, 0);
    assert.equal((await ctx.db.one('select count(*)::int as n from subscription_prefs')).n, 0);
    assert.equal(avatarFiles().length, 0);
    assert.equal((await c.get('/api/auth/me')).body.user, null);

    const t = await client(ctx.app).get(`/api/discuss/threads/${thread.id}`);
    assert.equal(t.status, 200);
    assert.equal(t.body.thread.author.name, 'Deleted user');
    assert.equal(t.body.thread.author.id, null);
  });

  test('the only administrator cannot delete their account', async () => {
    const admin = await createUser(ctx.db, { role: 'admin' });
    const c = await loginAs(ctx.app, admin);
    const r = await c.del('/api/me', { password: PASSWORD });
    assert.equal(r.status, 409);
    assert.equal(r.body.error.code, 'conflict');
    const other = await createUser(ctx.db, { role: 'admin' });
    assert.equal((await c.del('/api/me', { password: PASSWORD })).status, 204);
    assert.ok(other.id);
  });
});

describe('Mongolist subscriptions', () => {
  test('GET before saving returns suggested defaults with configured=false and creates nothing', async () => {
    const u = await createUser(ctx.db);
    const c = await loginAs(ctx.app, u);
    const r = await c.get('/api/me/subscriptions');
    assert.equal(r.status, 200);
    assert.equal(r.body.configured, false);
    assert.deepEqual(r.body.topics, [
      { topic: 'news', enabled: true, frequency: 'daily' },
      { topic: 'events', enabled: true, frequency: 'daily' },
      { topic: 'publications', enabled: true, frequency: 'daily' },
      { topic: 'participants', enabled: false, frequency: 'weekly' },
      { topic: 'discuss', enabled: false, frequency: 'daily' },
    ]);
    assert.equal((await ctx.db.one('select count(*)::int as n from subscription_prefs')).n, 0, 'nothing is e-mailed before the first save');
  });

  test('PUT saves, fills missing topics as disabled, and a newly enabled topic starts from now', async () => {
    const u = await createUser(ctx.db);
    const c = await loginAs(ctx.app, u);
    const r = await c.put('/api/me/subscriptions', { topics: [{ topic: 'news', enabled: true, frequency: 'instant' }, { topic: 'discuss', enabled: true, frequency: 'weekly' }] });
    assert.equal(r.status, 200);
    assert.equal(r.body.configured, true);
    assert.deepEqual(r.body.topics.map((t) => [t.topic, t.enabled, t.frequency]), [
      ['news', true, 'instant'], ['events', false, 'daily'], ['publications', false, 'daily'], ['participants', false, 'weekly'], ['discuss', true, 'weekly'],
    ]);
    const row = await ctx.db.one(`select last_sent_at from subscription_prefs where topic = 'news'`);
    assert.ok(Date.now() - new Date(row.last_sent_at).getTime() < 5000);

    // backdate the cursor; re-saving an already-enabled topic keeps it, switching a topic ON resets it to now
    await ctx.db.query(`update subscription_prefs set last_sent_at = now() - interval '3 days'`);
    await c.put('/api/me/subscriptions', { topics: [{ topic: 'news', enabled: true, frequency: 'daily' }, { topic: 'events', enabled: true, frequency: 'daily' }] });
    const rows = Object.fromEntries((await ctx.db.many('select topic, last_sent_at from subscription_prefs')).map((x) => [x.topic, x.last_sent_at]));
    assert.ok(Date.now() - new Date(rows.news).getTime() > 2 * 86400e3, 'unchanged topic keeps its cursor');
    assert.ok(Date.now() - new Date(rows.events).getTime() < 5000, 'newly enabled topic starts now');
  });

  test('validation: unknown topic / frequency / empty list', async () => {
    const c = await loginAs(ctx.app, await createUser(ctx.db));
    for (const body of [
      { topics: [{ topic: 'spam', enabled: true, frequency: 'daily' }] },
      { topics: [{ topic: 'news', enabled: true, frequency: 'hourly' }] },
      { topics: [{ topic: 'news', enabled: 'maybe', frequency: 'daily' }] },
      { topics: [] },
      {},
    ]) {
      const r = await c.put('/api/me/subscriptions', body);
      assert.equal(r.status, 400, JSON.stringify(body));
    }
  });

  test('subscriptions are per user', async () => {
    const a = await loginAs(ctx.app, await createUser(ctx.db));
    const b = await loginAs(ctx.app, await createUser(ctx.db));
    await a.put('/api/me/subscriptions', { topics: [{ topic: 'news', enabled: true, frequency: 'weekly' }] });
    assert.equal((await b.get('/api/me/subscriptions')).body.configured, false);
  });
});
