import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { unsubscribeToken } from '../src/lib/crypto.js';
import { runDigest } from '../src/jobs/digest.js';
import { client, createUser, resetDb, seedBase, startApp } from './helpers.js';

let ctx;
before(async () => { ctx = await startApp(); });
after(async () => { await ctx.close(); });
beforeEach(async () => { await resetDb(ctx.db); });

// Thursday 2026-10-01 09:00 local (UTC+3). Daily slot = 08:00 local = 05:00Z; weekly slot (Monday) = 2026-09-28 05:00Z.
const NOW = new Date('2026-10-01T06:00:00Z');
const UPPER = new Date(NOW.getTime() - 30_000);
const iso = (d) => new Date(d).toISOString();
const run = (opts = {}) => runDigest({ db: ctx.db, config: ctx.config }, { now: NOW, ...opts });
const mails = () => ctx.db.many(`select * from mail_outbox where purpose = 'digest' order by id`);

async function subscribe(user, topic, frequency, cursor, enabled = true) {
  await ctx.db.query(
    `insert into subscription_prefs (user_id, topic, enabled, frequency, last_sent_at) values ($1, $2, $3, $4, $5)
     on conflict (user_id, topic) do update set enabled = $3, frequency = $4, last_sent_at = $5`,
    [user.id, topic, enabled, frequency, cursor],
  );
}
const cursorOf = async (user, topic) => new Date((await ctx.db.one('select last_sent_at from subscription_prefs where user_id = $1 and topic = $2', [user.id, topic])).last_sent_at);
const news = (title, at, extra = {}) =>
  ctx.db.query('insert into news (title, body, published_at, is_published) values ($1, $2, $3, $4)', [title, extra.body ?? `Body of ${title}`, at, extra.published ?? true]);

describe('schedule slots', () => {
  test('daily: due once its 08:00 slot has passed since the last cursor; window is (cursor, now − 30 s]', async () => {
    const u = await createUser(ctx.db, { first: 'Ada', email: 'ada@example.org' });
    await subscribe(u, 'news', 'daily', '2026-09-30T05:30:00Z');
    await news('Before the cursor', '2026-09-30T04:00:00Z');
    await news('Yesterday evening', '2026-09-30T18:00:00Z');
    await news('This morning', '2026-10-01T04:00:00Z');
    await news('Too fresh (inside the 30 s lag)', iso(NOW.getTime() - 10_000));

    const r = await run();
    assert.equal(r.emails_queued, 1);
    const [m] = await mails();
    assert.equal(m.to_email, 'ada@example.org');
    assert.match(m.text_body, /Yesterday evening/);
    assert.match(m.text_body, /This morning/);
    assert.ok(!/Before the cursor/.test(m.text_body));
    assert.ok(!/Too fresh/.test(m.text_body));
    assert.match(m.subject, /^IAML digest: 2 updates$/);
    assert.equal((await cursorOf(u, 'news')).toISOString(), UPPER.toISOString(), 'cursor moves to the window end, not to "now"');

    // same moment again: nothing new, nothing re-sent
    assert.equal((await run()).emails_queued, 0);
    // a minute later the fresh item is outside the cursor window but the daily slot is not due again → still nothing today
    assert.equal((await run({ now: new Date(NOW.getTime() + 60_000) })).emails_queued, 0);
    // tomorrow's slot picks it up
    const next = await run({ now: new Date('2026-10-02T06:00:00Z') });
    assert.equal(next.emails_queued, 1);
    assert.match((await mails())[1].text_body, /Too fresh/);
  });

  test('daily: not due when the cursor is already past today\'s slot', async () => {
    const u = await createUser(ctx.db);
    await subscribe(u, 'news', 'daily', '2026-10-01T05:10:00Z');
    await news('Fresh', '2026-10-01T05:30:00Z');
    assert.equal((await run()).emails_queued, 0);
    assert.equal((await cursorOf(u, 'news')).toISOString(), '2026-10-01T05:10:00.000Z', 'untouched');
  });

  test('catch-up: after an outage one digest covers everything since the cursor', async () => {
    const u = await createUser(ctx.db);
    await subscribe(u, 'news', 'daily', '2026-09-25T05:30:00Z');
    for (let d = 26; d <= 30; d++) await news(`Day ${d}`, `2026-09-${d}T12:00:00Z`);
    const r = await run();
    assert.equal(r.emails_queued, 1);
    const text = (await mails())[0].text_body;
    for (let d = 26; d <= 30; d++) assert.match(text, new RegExp(`Day ${d}`));
  });

  test('weekly: due after Monday 08:00, not twice in a week', async () => {
    const u = await createUser(ctx.db);
    await subscribe(u, 'news', 'weekly', '2026-09-27T12:00:00Z'); // Sunday
    await news('Midweek', '2026-09-30T10:00:00Z');
    assert.equal((await run()).emails_queued, 1);
    await news('Another', '2026-10-03T12:00:00Z');
    assert.equal((await run({ now: new Date('2026-10-02T06:00:00Z') })).emails_queued, 0, 'Friday: weekly slot already served');
    assert.equal((await run({ now: new Date('2026-10-05T06:00:00Z') })).emails_queued, 1, 'next Monday');
  });

  test('instant: runs on every tick but only mails when there is something new', async () => {
    const u = await createUser(ctx.db);
    await subscribe(u, 'news', 'instant', '2026-10-01T05:00:00Z');
    assert.equal((await run()).emails_queued, 0);
    await news('Breaking', '2026-10-01T06:00:10Z');
    const t1 = new Date('2026-10-01T06:01:00Z');
    const r = await run({ now: t1 });
    assert.equal(r.emails_queued, 1);
    const [m] = await mails();
    assert.match(m.subject, /^IAML: Breaking$/);
    assert.match(m.text_body, /new on the IAML website/);
    assert.equal((await run({ now: new Date(t1.getTime() + 60_000) })).emails_queued, 0, 'no duplicate');
    await news('Second', '2026-10-01T06:01:40Z');
    assert.equal((await run({ now: new Date('2026-10-01T06:03:00Z') })).emails_queued, 1);
    assert.equal((await mails()).length, 2);
  });

  test('force (admin "send now") ignores the slot but keeps the window', async () => {
    const u = await createUser(ctx.db);
    await subscribe(u, 'news', 'daily', '2026-10-01T05:10:00Z');
    await news('Old', '2026-10-01T05:00:00Z');
    await news('New', '2026-10-01T05:30:00Z');
    assert.equal((await run()).emails_queued, 0);
    assert.equal((await run({ force: true })).emails_queued, 1);
    const text = (await mails())[0].text_body;
    assert.match(text, /New/);
    assert.ok(!/Old/.test(text));
  });
});

describe('who gets mail', () => {
  test('one e-mail per user covering all due topics; empty topics still advance their cursor', async () => {
    const u = await createUser(ctx.db, { first: 'Bat', email: 'bat@example.org' });
    for (const t of ['news', 'events', 'publications', 'participants', 'discuss']) await subscribe(u, t, 'daily', '2026-09-30T05:30:00Z');
    await news('A news item', '2026-09-30T12:00:00Z');
    await ctx.db.query(`insert into events (title, location, starts_at, summary, published_at) values ('Workshop', 'Prague', '2026-11-05T09:00:00Z', 'Hands-on', '2026-09-30T13:00:00Z')`);
    await seedBase(ctx.db);
    await ctx.db.query(`update participants set created_at = '2026-01-01Z'`);
    await ctx.db.query(`insert into participants (name, position_id, created_at) values ('Newly Added', (select id from positions where name = 'Board Members'), '2026-09-30T14:00:00Z')`);
    await ctx.db.query(`insert into participants (name, position_id, created_at, is_visible) values ('Hidden Person', (select id from positions where name = 'Board Members'), '2026-09-30T14:00:00Z', false)`);
    const author = await createUser(ctx.db, { first: 'Carol', last: 'Writer' });
    await ctx.db.query(`insert into discuss_threads (author_id, title, body, created_at) values ($1, 'Fresh question', 'Please help with this thing', '2026-09-30T15:00:00Z')`, [author.id]);
    await ctx.db.query(`insert into discuss_threads (author_id, title, body, created_at, status) values ($1, 'Removed question', 'x', '2026-09-30T15:00:00Z', 'removed')`, [author.id]);

    const r = await run();
    assert.equal(r.emails_queued, 1);
    const all = await mails();
    assert.equal(all.length, 1);
    const t = all[0].text_body;
    assert.match(t, /== News ==/);
    assert.match(t, /== Events ==/);
    assert.match(t, /Workshop — 2026-11-05 12:00 \(UTC\+3\) · Prague/);
    assert.match(t, /== New participants ==/);
    assert.match(t, /Newly Added/);
    assert.ok(!/Hidden Person/.test(t));
    assert.match(t, /== New discussions ==/);
    assert.match(t, /Fresh question — by Carol Writer/);
    assert.ok(!/Removed question/.test(t));
    assert.ok(!/== Publications ==/.test(t), 'topics with nothing new are omitted');
    assert.match(t, /http:\/\/localhost:3000\/events\.html/);
    for (const topic of ['news', 'events', 'publications', 'participants', 'discuss']) {
      const expected = topic === 'discuss' ? new Date(UPPER.getTime() - 10 * 60_000) : UPPER; // Discuss is held back 10 min
      assert.equal((await cursorOf(u, topic)).toISOString(), expected.toISOString(), `${topic} cursor advanced`);
    }
  });

  test('skips disabled topics, disabled and unverified accounts; subscribers with nothing new get no mail', async () => {
    const ok = await createUser(ctx.db, { email: 'ok@example.org' });
    const off = await createUser(ctx.db, { email: 'off@example.org', disabled: true });
    const pend = await createUser(ctx.db, { email: 'pend@example.org', verified: false });
    const opt = await createUser(ctx.db, { email: 'optout@example.org' });
    const quiet = await createUser(ctx.db, { email: 'quiet@example.org' });
    for (const u of [ok, off, pend]) await subscribe(u, 'news', 'daily', '2026-09-30T05:30:00Z');
    await subscribe(opt, 'news', 'daily', '2026-09-30T05:30:00Z', false);
    await subscribe(quiet, 'events', 'daily', '2026-09-30T05:30:00Z');
    await news('Item', '2026-09-30T12:00:00Z');
    await run();
    assert.deepEqual((await mails()).map((m) => m.to_email), ['ok@example.org']);
    assert.equal((await cursorOf(opt, 'news')).toISOString(), '2026-09-30T05:30:00.000Z');
    assert.equal((await cursorOf(quiet, 'events')).toISOString(), UPPER.toISOString());
  });

  test('unpublished and scheduled content is never mailed before it is public', async () => {
    const u = await createUser(ctx.db);
    await subscribe(u, 'news', 'daily', '2026-09-30T05:30:00Z');
    await news('Draft', '2026-09-30T12:00:00Z', { published: false });
    await news('Scheduled', '2026-10-03T12:00:00Z');
    assert.equal((await run()).emails_queued, 0);
    // once the scheduled time has passed it goes out in the next due digest
    const later = await run({ now: new Date('2026-10-04T06:00:00Z') });
    assert.equal(later.emails_queued, 1);
    const text = (await mails())[0].text_body;
    assert.match(text, /Scheduled/);
    assert.ok(!/Draft/.test(text));
  });

  test('long lists are capped at 8 items with an "…and N more" line', async () => {
    const u = await createUser(ctx.db);
    await subscribe(u, 'news', 'daily', '2026-09-30T05:30:00Z');
    for (let i = 1; i <= 11; i++) await news(`Item ${String(i).padStart(2, '0')}`, `2026-09-30T${String(6 + i).padStart(2, '0')}:00:00Z`);
    await run();
    const [m] = await mails();
    assert.match(m.text_body, /…and 3 more/);
    assert.equal((m.text_body.match(/^• Item/gm) ?? []).length, 8);
    assert.match(m.subject, /11 updates/);
  });

  test('HTML in titles is escaped in the HTML part', async () => {
    const u = await createUser(ctx.db);
    await subscribe(u, 'news', 'daily', '2026-09-30T05:30:00Z');
    await news('<script>alert(1)</script>', '2026-09-30T12:00:00Z');
    await run();
    const [m] = await mails();
    assert.ok(!m.html_body.includes('<script>'));
    assert.ok(m.html_body.includes('&lt;script&gt;'));
  });
});

describe('unsubscribe', () => {
  test('digest mails carry RFC 8058 headers and a working one-click link', async () => {
    const u = await createUser(ctx.db, { email: 'sub@example.org' });
    await subscribe(u, 'news', 'daily', '2026-09-30T05:30:00Z');
    await subscribe(u, 'events', 'weekly', '2026-09-30T05:30:00Z');
    await news('Item', '2026-09-30T12:00:00Z');
    await run();
    const [m] = await mails();
    const link = m.headers['List-Unsubscribe'].slice(1, -1);
    assert.match(link, /^http:\/\/localhost:3000\/api\/unsubscribe\?t=/);
    assert.equal(m.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
    assert.ok(m.text_body.includes(link));
    assert.ok(m.html_body.includes(link.replace(/&/g, '&amp;')));
    const path = link.replace('http://localhost:3000', '');

    const c = client(ctx.app);
    // a GET (link prefetchers, scanners) must NOT unsubscribe — it only shows a confirmation page
    const page = await c.get(path);
    assert.equal(page.status, 200);
    assert.match(page.headers['content-type'], /text\/html/);
    assert.match(page.text, /<form method="post"/);
    assert.equal((await ctx.db.one(`select count(*)::int as n from subscription_prefs where enabled`)).n, 2);

    // RFC 8058 one-click POST: no CSRF header, no cookie, JSON answer
    const post = await c.request('POST', path, { headers: { 'x-requested-with': null, 'content-type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' });
    assert.equal(post.status, 200);
    assert.deepEqual(post.body, { ok: true });
    assert.equal((await ctx.db.one(`select count(*)::int as n from subscription_prefs where enabled`)).n, 0);
    // the browser form POST answers a human page
    const form = await c.request('POST', path, { headers: { 'x-requested-with': null, accept: 'text/html' }, body: '' });
    assert.match(form.text, /You are unsubscribed/);
  });

  test('forged, truncated or foreign tokens are rejected', async () => {
    const u = await createUser(ctx.db);
    await subscribe(u, 'news', 'daily', '2026-09-30T05:30:00Z');
    const good = unsubscribeToken(ctx.config.sessionSecret, u.id);
    const c = client(ctx.app);
    for (const t of ['', 'abc', good.slice(0, -2), `${good}x`, unsubscribeToken('another-secret-0123456789abcdef0123456789', u.id)]) {
      const r = await c.request('POST', `/api/unsubscribe?t=${encodeURIComponent(t)}`, { headers: { 'x-requested-with': null } });
      assert.equal(r.status, 400, `token "${t.slice(0, 10)}"`);
      assert.equal((await c.get(`/api/unsubscribe?t=${encodeURIComponent(t)}`)).status, 400);
    }
    assert.equal((await ctx.db.one(`select count(*)::int as n from subscription_prefs where enabled`)).n, 1);
  });
});

describe('concurrency', () => {
  test('only one digest run at a time (advisory lock)', async () => {
    const u = await createUser(ctx.db);
    await subscribe(u, 'news', 'daily', '2026-09-30T05:30:00Z');
    await news('Item', '2026-09-30T12:00:00Z');
    let release;
    const held = new Promise((r) => { release = r; });
    let locked;
    const lockReady = new Promise((r) => { locked = r; });
    const holder = ctx.db.tx(async (tx) => {
      await tx.query('select pg_advisory_xact_lock(727274002)');
      locked();
      await held;
    });
    await lockReady;
    const skipped = await run();
    assert.equal(skipped.emails_queued, 0);
    assert.match(skipped.skipped, /in progress/);
    release();
    await holder;
    assert.equal((await run()).emails_queued, 1);
  });

  test('parallel runs never duplicate a digest', async () => {
    const u = await createUser(ctx.db);
    await subscribe(u, 'news', 'daily', '2026-09-30T05:30:00Z');
    await news('Item', '2026-09-30T12:00:00Z');
    await Promise.all([run(), run(), run()]);
    assert.equal((await mails()).length, 1);
  });
});
