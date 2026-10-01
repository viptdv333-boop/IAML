import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { client, createUser, mailTo, resetDb, seedBase, startApp } from './helpers.js';

let ctx;
before(async () => { ctx = await startApp(); });
after(async () => { await ctx.close(); });
beforeEach(async () => { await resetDb(ctx.db); });

const words = (n) => Array.from({ length: n }, (_, i) => `w${i + 1}`).join(' ');

describe('public content API', () => {
  test('health reports version, time zone and DB status', async () => {
    const r = await client(ctx.app).get('/api/health');
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.deepEqual(r.body.site, { timezone: 'Etc/GMT-3', tz_label: 'UTC+3' });
    assert.ok(Date.parse(r.body.time));
  });

  test('menu: visible items only, ordered; custom pages appear and hide with their page', async () => {
    await seedBase(ctx.db);
    const c = client(ctx.app);
    let items = (await c.get('/api/menu')).body.items;
    assert.deepEqual(items.map((i) => i.key), ['about', 'news', 'events', 'publications', 'participants', 'mongolist', 'discuss', 'contacts', 'links']);
    assert.deepEqual(items[8], { key: 'links', title: 'Useful Links', href: 'useful-links.html' });

    await ctx.db.query(`update menu_items set is_visible = false where key = 'events'`);
    await ctx.db.query(`update menu_items set sort_order = 0 where key = 'discuss'`);
    const page = await ctx.db.one(`insert into pages (slug, title, body) values ('history', 'History', 'x') returning id`);
    await ctx.db.query(`insert into menu_items (key, title, href, sort_order, page_id) values ('page:history', 'History', 'page.html?slug=history', 99, $1)`, [page.id]);
    items = (await c.get('/api/menu')).body.items;
    assert.equal(items[0].key, 'discuss');
    assert.ok(!items.some((i) => i.key === 'events'));
    assert.equal(items.at(-1).href, 'page.html?slug=history');

    await ctx.db.query(`update pages set is_published = false where id = $1`, [page.id]);
    assert.ok(!(await c.get('/api/menu')).body.items.some((i) => i.key === 'page:history'));
  });

  test('pages: published only; bad slugs are 404', async () => {
    await ctx.db.query(`insert into pages (slug, title, body, is_published) values ('about-us', 'About us', '# Hi', true), ('draft', 'Draft', 'x', false)`);
    const c = client(ctx.app);
    const ok = await c.get('/api/pages/about-us');
    assert.equal(ok.status, 200);
    assert.deepEqual(Object.keys(ok.body).sort(), ['body', 'slug', 'title', 'updated_at']);
    assert.equal((await c.get('/api/pages/draft')).status, 404);
    assert.equal((await c.get('/api/pages/nope')).status, 404);
    assert.equal((await c.get('/api/pages/..%2F..%2Fetc')).status, 404);
  });

  test('news: newest first, scheduled and unpublished items are hidden, preview is ~150 words', async () => {
    await ctx.db.query(
      `insert into news (title, body, published_at, is_published) values
        ('old', $1, now() - interval '3 days', true),
        ('new', 'short body', now() - interval '1 day', true),
        ('scheduled', 'later', now() + interval '2 days', true),
        ('draft', 'hidden', now() - interval '1 day', false)`,
      [words(400)],
    );
    const c = client(ctx.app);
    const r = await c.get('/api/news');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.items.map((n) => n.title), ['new', 'old']);
    assert.equal(r.body.total, 2);
    const old = r.body.items[1];
    assert.equal(old.body.split(' ').length, 400);
    assert.ok(old.preview.endsWith('…'));
    assert.equal(old.preview.replace('…', '').split(' ').length, 150);
    assert.equal(r.body.items[0].preview, 'short body');

    const page = await c.get('/api/news?limit=1&offset=1');
    assert.deepEqual(page.body.items.map((n) => n.title), ['old']);
    assert.equal(page.body.total, 2);
    // scheduled news appears once its time has come
    await ctx.db.query(`update news set published_at = now() - interval '1 second' where title = 'scheduled'`);
    assert.equal((await c.get('/api/news')).body.total, 3);
  });

  test('events: upcoming nearest-first, then past most-recent-first; is_past uses end time or start+3h', async () => {
    await ctx.db.query(
      `insert into events (title, starts_at, ends_at) values
        ('later',   now() + interval '30 days', null),
        ('soon',    now() + interval '2 days', now() + interval '2 days 4 hours'),
        ('ongoing', now() - interval '1 hour', now() + interval '5 hours'),
        ('just-ended-no-end', now() - interval '4 hours', null),
        ('long-ago', now() - interval '90 days', now() - interval '89 days')`,
    );
    await ctx.db.query(`insert into events (title, starts_at, is_published) values ('hidden', now() + interval '1 day', false)`);
    const r = await client(ctx.app).get('/api/events');
    assert.deepEqual(r.body.items.map((e) => e.title), ['ongoing', 'soon', 'later', 'just-ended-no-end', 'long-ago']);
    assert.deepEqual(r.body.items.map((e) => e.is_past), [false, false, false, true, true]);
    assert.deepEqual(Object.keys(r.body.items[0]).sort(), ['body', 'ends_at', 'id', 'is_past', 'location', 'starts_at', 'summary', 'title']);
  });

  test('publications: preview + paging', async () => {
    await ctx.db.query(
      `insert into publications (title, authors, topic, summary, published_at) values
        ('P1', 'A. One', 'Phonology', $1, now() - interval '2 days'),
        ('P2', 'B. Two', null, 'brief', now() - interval '1 day')`,
      [words(300)],
    );
    const r = await client(ctx.app).get('/api/publications');
    assert.deepEqual(r.body.items.map((p) => p.title), ['P2', 'P1']);
    assert.equal(r.body.items[1].topic, 'Phonology');
    assert.ok(r.body.items[1].preview.endsWith('…'));
    assert.equal(r.body.total, 2);
  });

  test('participants: grouped by position in fixed order; hidden people and empty positions are omitted', async () => {
    await seedBase(ctx.db);
    const c = client(ctx.app);
    let r = (await c.get('/api/participants')).body;
    assert.deepEqual(r.positions.map((p) => p.name), ['President', 'Honorary President', 'Vice Presidents', 'Executive Director', 'Board Members']);
    assert.equal(r.positions.reduce((n, p) => n + p.participants.length, 0), 30);
    assert.equal(r.positions[2].singular, 'Vice President');
    assert.equal(r.positions[2].participants.length, 4);
    assert.ok(r.positions[0].participants[0].org.includes('Institute'));

    await ctx.db.query(`update participants set is_visible = false where position_id = (select id from positions where name = 'President')`);
    r = (await c.get('/api/participants')).body;
    assert.ok(!r.positions.some((p) => p.name === 'President'));
  });

  test('links: categories without visible links are omitted; invisible links hidden', async () => {
    await seedBase(ctx.db);
    const c = client(ctx.app);
    assert.deepEqual((await c.get('/api/links')).body, { categories: [] });
    const cat = await ctx.db.one(`select id from link_categories where slug = 'corpora'`);
    await ctx.db.query(
      `insert into useful_links (category_id, title, url, sort_order) values ($1, 'B', 'https://b.example', 2), ($1, 'A', null, 1)`, [cat.id]);
    await ctx.db.query(`insert into useful_links (category_id, title, is_visible) values ($1, 'secret', false)`, [cat.id]);
    const r = (await c.get('/api/links')).body;
    assert.equal(r.categories.length, 1);
    assert.deepEqual(r.categories[0].links.map((l) => [l.title, l.url]), [['A', null], ['B', 'https://b.example']]);
  });

  test('contacts: people + settings', async () => {
    await seedBase(ctx.db);
    const r = (await client(ctx.app).get('/api/contacts')).body;
    assert.deepEqual(r.people.map((p) => p.position), ['President', 'Executive Director', 'CTO (Chief Technology Officer)']);
    assert.equal(r.email, 'info@iaml.org');
    assert.equal(r.address, 'Ulaanbaatar, Mongolia');
  });
});

describe('static site serving (allow-list)', () => {
  test('serves pages, assets, generated robots/sitemap/manifest', async () => {
    const c = client(ctx.app);
    const home = await c.get('/');
    assert.equal(home.status, 200);
    assert.match(home.headers['content-type'], /text\/html/);
    assert.equal(home.headers['cache-control'], 'no-cache');
    assert.equal((await c.get('/news.html')).status, 200);
    const css = await c.get('/iaml-site.css');
    assert.equal(css.status, 200);
    assert.match(css.headers['content-type'], /text\/css/);
    assert.equal((await c.get('/assets/js/app.js')).status, 200);
    assert.equal((await c.get('/favicon.svg')).status, 200);

    const robots = await c.get('/robots.txt');
    assert.match(robots.text, /Sitemap: http:\/\/localhost:3000\/sitemap\.xml/);
    assert.match(robots.text, /Disallow: \/admin\.html/);
    const sitemap = await c.get('/sitemap.xml');
    assert.match(sitemap.text, /<loc>http:\/\/localhost:3000\/<\/loc>/);
    assert.match(sitemap.text, /useful-links\.html/);
    const manifest = await c.get('/site.webmanifest');
    assert.equal(manifest.body?.start_url ?? JSON.parse(manifest.text).start_url, '/');
  });

  test('custom pages are listed in the sitemap', async () => {
    await ctx.db.query(`insert into pages (slug, title, body) values ('history', 'History', 'x')`);
    const r = await client(ctx.app).get('/sitemap.xml');
    assert.match(r.text, /page\.html\?slug=history/);
  });

  test('everything outside the allow-list is 404 — source, config, git, docs, drafts, traversal', async () => {
    const c = client(ctx.app);
    for (const p of [
      '/backend/package.json', '/backend/.env', '/backend/src/server.js', '/docs/API.md', '/.git/config', '/.gitignore',
      '/logo/index.html', '/deploy/', '/.claude/launch.json', '/package.json', '/Dockerfile',
      '/assets/../backend/package.json', '/assets/%2e%2e/backend/package.json', '/assets/..%2fbackend%2fpackage.json',
      '/%2e%2e/%2e%2e/etc/passwd', '/assets//js/app.js', '/index.html%00.png',
      '/uploads/../backend/package.json', '/uploads/avatars/../../x',
    ]) {
      const r = await c.get(p);
      assert.ok(r.status === 404 || r.status === 400, `${p} → ${r.status}`);
      assert.ok(!/"name":\s*"iaml-backend"|DATABASE_URL/.test(r.text), `${p} leaked content`);
    }
    const nf = await c.get('/definitely-not-here.html');
    assert.equal(nf.status, 404);
    assert.match(nf.text, /<html/i);
  });

  test('unknown API path → JSON 404; wrong method is not a 500', async () => {
    const c = client(ctx.app);
    const r = await c.get('/api/nope');
    assert.equal(r.status, 404);
    assert.equal(r.body.error.code, 'not_found');
    const m = await c.post('/api/menu', {});
    assert.equal(m.status, 404);
    assert.equal(m.body.error.code, 'not_found');
  });

  test('avatars: only well-formed names, served as image/webp with nosniff and a locked-down CSP', async () => {
    const { mkdirSync, writeFileSync } = await import('node:fs');
    const path = await import('node:path');
    mkdirSync(path.join(ctx.uploads, 'avatars'), { recursive: true });
    const name = '0b0f1c3a-5a52-4d3c-9d41-7f0a1d3f6e11.webp';
    writeFileSync(path.join(ctx.uploads, 'avatars', name), Buffer.from('RIFFxxxxWEBPVP8 '));
    const c = client(ctx.app);
    const ok = await c.get(`/uploads/avatars/${name}`);
    assert.equal(ok.status, 200);
    assert.equal(ok.headers['content-type'], 'image/webp');
    assert.equal(ok.headers['x-content-type-options'], 'nosniff');
    assert.match(ok.headers['content-security-policy'], /default-src 'none'/);
    assert.match(ok.headers['cache-control'], /immutable/);
    assert.equal((await c.get('/uploads/avatars/not-a-uuid.webp')).status, 404);
    assert.equal((await c.get('/uploads/avatars/0b0f1c3a-5a52-4d3c-9d41-7f0a1d3f6e11.png')).status, 404);
    assert.equal((await c.get('/uploads/')).status, 404);
  });
});

describe('contact form', () => {
  const msg = (o = {}) => ({ name: 'Ada Lovelace', email: 'ada@example.org', subject: 'Hello', message: 'I would like to join the association.', source: 'contacts', website: '', ...o });

  test('stores the message and mails every configured recipient with reply-to = sender', async () => {
    await ctx.db.query(`insert into contact_recipients (email, label) values ('president@example.org', 'President'), ('office@example.org', null)`);
    const r = await client(ctx.app).post('/api/contact', msg());
    assert.equal(r.status, 202);
    assert.deepEqual(r.body, { ok: true });
    const row = await ctx.db.one('select * from contact_messages');
    assert.equal(row.email, 'ada@example.org');
    assert.equal(row.source, 'contacts');
    assert.equal(row.is_read, false);
    const to = (await ctx.db.many(`select to_email, reply_to, subject, purpose from mail_outbox order by id`));
    assert.deepEqual(to.map((m) => m.to_email), ['president@example.org', 'office@example.org']);
    assert.ok(to.every((m) => m.reply_to === 'ada@example.org' && m.purpose === 'contact'));
    assert.match(to[0].subject, /^\[IAML Contacts page\] Hello/);
  });

  test('without recipients, every active verified admin is e-mailed', async () => {
    await createUser(ctx.db, { email: 'boss@example.org', role: 'admin' });
    await createUser(ctx.db, { email: 'off-admin@example.org', role: 'admin', disabled: true });
    await createUser(ctx.db, { email: 'member@example.org' });
    await client(ctx.app).post('/api/contact', msg({ source: 'participants' }));
    assert.deepEqual((await ctx.db.many('select to_email from mail_outbox')).map((m) => m.to_email), ['boss@example.org']);
    assert.equal((await ctx.db.one('select source from contact_messages')).source, 'participants');
  });

  test('header injection through name/subject is neutralised', async () => {
    await ctx.db.query(`insert into contact_recipients (email) values ('office@example.org')`);
    const r = await client(ctx.app).post('/api/contact', msg({ name: 'Eve', subject: 'Hi' }));
    assert.equal(r.status, 202);
    const bad = await client(ctx.app).post('/api/contact', msg({ subject: 'Hi\r\nBcc: victim@example.org' }));
    assert.equal(bad.status, 400); // single-line field
    const mails = await ctx.db.many('select subject, reply_to from mail_outbox');
    assert.ok(mails.every((m) => !/[\r\n]/.test(m.subject + m.reply_to)));
  });

  test('validation, honeypot, per-address rate limit', async () => {
    const c = client(ctx.app);
    const bad = await c.post('/api/contact', { name: '', email: 'x', message: 'hi' });
    assert.equal(bad.status, 400);
    assert.ok(bad.body.error.fields.name && bad.body.error.fields.email && bad.body.error.fields.message);

    const bot = await c.post('/api/contact', msg({ website: 'http://spam' }));
    assert.equal(bot.status, 202);
    assert.equal((await ctx.db.one('select count(*)::int as n from contact_messages')).n, 0);

    for (let i = 0; i < 3; i++) assert.equal((await client(ctx.app).post('/api/contact', msg())).status, 202);
    const blocked = await client(ctx.app).post('/api/contact', msg());
    assert.equal(blocked.status, 429);
    // another sender is unaffected
    assert.equal((await client(ctx.app).post('/api/contact', msg({ email: 'other@example.org' }))).status, 202);
  });

  test('per-IP rate limit (5 per hour)', async () => {
    const c = client(ctx.app);
    let last;
    for (let i = 0; i < 6; i++) last = await c.post('/api/contact', msg({ email: `s${i}@example.org` }));
    assert.equal(last.status, 429);
    assert.ok(last.headers['retry-after']);
    assert.equal(last.body.error.code, 'rate_limited');
  });

  test('HTML in a message is stored as text and escaped in the e-mail', async () => {
    await ctx.db.query(`insert into contact_recipients (email) values ('office@example.org')`);
    await client(ctx.app).post('/api/contact', msg({ message: '<script>alert(1)</script> <b>bold</b>' }));
    const [mail] = await mailTo(ctx.db, 'office@example.org');
    assert.ok(mail.text_body.includes('<script>alert(1)</script>'));
    assert.ok(!mail.html_body.includes('<script>'));
    assert.ok(mail.html_body.includes('&lt;script&gt;'));
  });
});

describe('branded 404', () => {
  test('any missing path serves 404.html with a root <base>, so its relative links work at any depth', async () => {
    const c = client(ctx.app);
    for (const p of ['/nope', '/a/b/c', '/nope.html', '/assets/js/nope.js']) {
      const r = await c.get(p);
      assert.equal(r.status, 404, p);
      assert.match(r.headers['content-type'], /text\/html/, p);
      assert.match(r.text, /<head[^>]*><base href="\/">/i, p);
    }
  });
});
