import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { PASSWORD, client, createUser, loginAs, resetDb, seedBase, startApp } from './helpers.js';

let ctx;
let admin; // logged-in admin client
let boss; // admin user row
before(async () => { ctx = await startApp(); });
after(async () => { await ctx.close(); });
beforeEach(async () => {
  await resetDb(ctx.db);
  boss = await createUser(ctx.db, { role: 'admin', first: 'Chief', last: 'Admin', email: 'chief@example.org' });
  admin = await loginAs(ctx.app, boss);
});

const A = '/api/admin';
const words = (n) => Array.from({ length: n }, (_, i) => `w${i + 1}`).join(' ');

describe('authorization', () => {
  test('anonymous → 401, member → 403, for every admin route family', async () => {
    const member = await loginAs(ctx.app, await createUser(ctx.db));
    const anon = client(ctx.app);
    const routes = [
      ['get', '/news'], ['post', '/news'], ['put', '/news/1'], ['del', '/news/1'], ['get', '/menu'], ['post', '/menu/reorder'],
      ['get', '/settings'], ['put', '/settings'], ['get', '/reports'], ['post', '/reports/1/resolve'], ['get', '/discuss/threads'],
      ['post', '/discuss/comments/1/status'], ['get', '/users'], ['patch', '/users/00000000-0000-0000-0000-000000000000'],
      ['get', '/subscribers'], ['get', '/subscribers.csv'], ['get', '/messages'], ['get', '/stats'], ['get', '/mail'],
      ['post', '/mail/1/retry'], ['get', '/audit'], ['post', '/jobs/digest'], ['get', '/links'], ['get', '/contact-recipients'],
    ];
    for (const [m, p] of routes) {
      const a = await anon[m](A + p, {});
      assert.equal(a.status, 401, `anon ${m} ${p}`);
      const r = await member[m](A + p, {});
      assert.equal(r.status, 403, `member ${m} ${p}`);
      assert.equal(r.body.error.code, 'forbidden');
    }
    assert.equal((await admin.get(`${A}/stats`)).status, 200);
  });

  test('a demoted or disabled admin loses access at once', async () => {
    const other = await createUser(ctx.db, { role: 'admin' });
    const c = await loginAs(ctx.app, other);
    assert.equal((await c.get(`${A}/stats`)).status, 200);
    await ctx.db.query(`update users set role = 'member' where id = $1`, [other.id]);
    assert.equal((await c.get(`${A}/stats`)).status, 403);
  });
});

describe('news / events / publications', () => {
  test('news CRUD with validation, 500-word limit, scheduling and created_by', async () => {
    const future = new Date(Date.now() + 5 * 86400e3).toISOString();
    const r = await admin.post(`${A}/news`, { title: 'Hello', body: 'Body text', published_at: future });
    assert.equal(r.status, 201);
    const item = r.body.item;
    assert.equal(item.is_published, true);
    assert.equal(item.published_at, future);
    assert.equal(item.created_by, boss.id);
    assert.equal((await client(ctx.app).get('/api/news')).body.total, 0, 'scheduled → not public yet');

    const bad = await admin.post(`${A}/news`, { title: '', body: words(501), published_at: 'tomorrow' });
    assert.equal(bad.status, 400);
    assert.deepEqual(Object.keys(bad.body.error.fields).sort(), ['body', 'published_at', 'title']);
    assert.match(bad.body.error.fields.body, /500 words/);
    assert.equal((await admin.post(`${A}/news`, { title: 'x', body: words(500), published_at: future })).status, 201);

    const upd = await admin.put(`${A}/news/${item.id}`, { title: 'Hello again', published_at: new Date(Date.now() - 1000).toISOString() });
    assert.equal(upd.status, 200);
    assert.equal(upd.body.item.title, 'Hello again');
    assert.equal(upd.body.item.body, 'Body text', 'partial update keeps other fields');
    assert.equal((await client(ctx.app).get('/api/news')).body.total, 1);

    assert.equal((await admin.put(`${A}/news/${item.id}`, { is_published: false })).status, 200);
    assert.equal((await client(ctx.app).get('/api/news')).body.total, 0);

    const list = await admin.get(`${A}/news?q=hello`);
    assert.equal(list.body.total, 1);
    assert.equal((await admin.get(`${A}/news?q=zzz`)).body.total, 0);
    assert.equal((await admin.get(`${A}/news/${item.id}`)).body.item.id, item.id);
    assert.equal((await admin.del(`${A}/news/${item.id}`)).status, 204);
    assert.equal((await admin.get(`${A}/news/${item.id}`)).status, 404);
    assert.equal((await admin.del(`${A}/news/${item.id}`)).status, 404);
    assert.equal((await admin.put(`${A}/news/abc`, {})).status, 404);
  });

  test('events: end before start is rejected; optional fields can be cleared; defaults', async () => {
    const start = '2026-12-01T10:00:00.000Z';
    const bad = await admin.post(`${A}/events`, { title: 'E', starts_at: start, ends_at: '2026-12-01T09:00:00.000Z' });
    assert.equal(bad.status, 400);
    assert.ok(bad.body.error.fields.ends_at);

    const ok = await admin.post(`${A}/events`, { title: 'Conference', starts_at: start, ends_at: '2026-12-02T18:00:00.000Z', location: 'Ulaanbaatar', summary: 'Short', body: 'Long text' });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.item.location, 'Ulaanbaatar');
    assert.ok(Date.parse(ok.body.item.published_at), 'published_at defaults to now');
    const id = ok.body.item.id;

    const cleared = await admin.put(`${A}/events/${id}`, { location: '', ends_at: '' });
    assert.equal(cleared.body.item.location, null);
    assert.equal(cleared.body.item.ends_at, null);
    const badUpdate = await admin.put(`${A}/events/${id}`, { ends_at: '2026-11-30T00:00:00.000Z' });
    assert.equal(badUpdate.status, 400, 'checked against the stored start');

    const min = await admin.post(`${A}/events`, { title: 'Minimal', starts_at: start });
    assert.equal(min.status, 201);
    assert.equal(min.body.item.summary, '');
    assert.equal(min.body.item.is_published, true);
  });

  test('publications: required fields and word limit', async () => {
    const bad = await admin.post(`${A}/publications`, { title: 'P', published_at: new Date().toISOString() });
    assert.equal(bad.status, 400);
    assert.ok(bad.body.error.fields.authors && bad.body.error.fields.summary);
    const ok = await admin.post(`${A}/publications`, { title: 'P', authors: 'A. B.', topic: 'Syntax', summary: 'Abstract', published_at: new Date().toISOString() });
    assert.equal(ok.status, 201);
    assert.equal((await admin.put(`${A}/publications/${ok.body.item.id}`, { topic: '' })).body.item.topic, null);
  });
});

describe('positions and participants', () => {
  test('positions: unique names (409), deletion blocked while in use, reorder', async () => {
    await seedBase(ctx.db);
    const list = (await admin.get(`${A}/positions`)).body;
    assert.equal(list.total, 5);
    assert.deepEqual(list.items.map((p) => p.name), ['President', 'Honorary President', 'Vice Presidents', 'Executive Director', 'Board Members']);

    const dup = await admin.post(`${A}/positions`, { name: 'President' });
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error.code, 'conflict');
    assert.ok(dup.body.error.fields.name);

    const used = list.items[0];
    const del = await admin.del(`${A}/positions/${used.id}`);
    assert.equal(del.status, 409);
    assert.match(del.body.error.message, /participant/);

    const fresh = (await admin.post(`${A}/positions`, { name: 'Advisors', singular: 'Advisor' })).body.item;
    assert.equal(fresh.sort_order, 6, 'appended');
    assert.equal((await admin.del(`${A}/positions/${fresh.id}`)).status, 204);

    const ids = list.items.map((p) => p.id).reverse();
    assert.equal((await admin.post(`${A}/positions/reorder`, { ids })).status, 204);
    assert.deepEqual((await admin.get(`${A}/positions`)).body.items.map((p) => p.id), ids);
    assert.equal((await client(ctx.app).get('/api/participants')).body.positions[0].name, 'Board Members');
    assert.equal((await admin.post(`${A}/positions/reorder`, { ids: [] })).status, 400);
  });

  test('participants: CRUD with position name, filter, visibility, bad position → 400', async () => {
    await seedBase(ctx.db);
    const pos = (await admin.get(`${A}/positions`)).body.items.find((p) => p.name === 'Board Members');
    const r = await admin.post(`${A}/participants`, { name: 'Newcomer Testov', position_id: pos.id, org: 'University of Naples' });
    assert.equal(r.status, 201);
    assert.equal(r.body.item.position, 'Board Members');
    assert.equal(r.body.item.is_visible, true);
    assert.equal((await admin.post(`${A}/participants`, { name: 'Nobody', position_id: 99999 })).status, 400);
    assert.equal((await admin.post(`${A}/participants`, { name: 'Nobody' })).status, 400);

    const filtered = await admin.get(`${A}/participants?position_id=${pos.id}`);
    assert.equal(filtered.body.total, 24, '23 seeded board members + the new one');
    assert.equal((await admin.get(`${A}/participants?position_id=abc`)).status, 400);
    assert.equal((await admin.get(`${A}/participants?q=naples`)).body.items.some((p) => p.id === r.body.item.id), true);

    await admin.put(`${A}/participants/${r.body.item.id}`, { is_visible: false });
    const pub = (await client(ctx.app).get('/api/participants')).body.positions.find((p) => p.name === 'Board Members');
    assert.ok(!pub.participants.some((p) => p.name === 'Newcomer Testov'));
    assert.equal((await admin.del(`${A}/participants/${r.body.item.id}`)).status, 204);
  });
});

describe('pages and menu', () => {
  test('creating a page adds a menu entry; slug rules; unique slug; update keeps the menu in sync; delete removes it', async () => {
    await seedBase(ctx.db);
    const bad = await admin.post(`${A}/pages`, { slug: 'Bad Slug!', title: 'x' });
    assert.equal(bad.status, 400);
    assert.ok(bad.body.error.fields.slug);

    const r = await admin.post(`${A}/pages`, { slug: 'history', title: 'History of IAML', body: '# Title\n\nText' });
    assert.equal(r.status, 201);
    assert.equal(r.body.item.show_in_menu, true);
    let menu = (await client(ctx.app).get('/api/menu')).body.items;
    assert.deepEqual(menu.at(-1), { key: 'page:history', title: 'History of IAML', href: 'page.html?slug=history' });
    assert.equal((await client(ctx.app).get('/api/pages/history')).body.title, 'History of IAML');
    assert.equal((await admin.post(`${A}/pages`, { slug: 'history', title: 'Again' })).status, 409);

    // rename slug → menu href follows
    await admin.put(`${A}/pages/${r.body.item.id}`, { slug: 'our-history', title: 'Our history' });
    menu = (await client(ctx.app).get('/api/menu')).body.items;
    assert.deepEqual(menu.at(-1), { key: 'page:our-history', title: 'Our history', href: 'page.html?slug=our-history' });
    // hide from menu without unpublishing
    await admin.put(`${A}/pages/${r.body.item.id}`, { show_in_menu: false });
    assert.ok(!(await client(ctx.app).get('/api/menu')).body.items.some((m) => m.key.startsWith('page:')));
    assert.equal((await client(ctx.app).get('/api/pages/our-history')).status, 200);
    await admin.put(`${A}/pages/${r.body.item.id}`, { show_in_menu: true });
    assert.equal((await admin.get(`${A}/pages/${r.body.item.id}`)).body.item.show_in_menu, true);

    assert.equal((await admin.del(`${A}/pages/${r.body.item.id}`)).status, 204);
    assert.ok(!(await client(ctx.app).get('/api/menu')).body.items.some((m) => m.key.startsWith('page:')));
    assert.equal((await ctx.db.one('select count(*)::int as n from menu_items where page_id is not null')).n, 0);
  });

  test('menu: list / rename / hide / reorder only — no create, no delete; read-only fields stay put', async () => {
    await seedBase(ctx.db);
    const list = (await admin.get(`${A}/menu`)).body.items;
    assert.equal(list.length, 9);
    assert.equal((await admin.post(`${A}/menu`, { title: 'X' })).status, 404);
    assert.equal((await admin.del(`${A}/menu/${list[0].id}`)).status, 404);
    const news = list.find((m) => m.key === 'news');
    const r = await admin.put(`${A}/menu/${news.id}`, { title: 'Latest news', is_visible: false, key: 'hacked', href: 'evil.html' });
    assert.equal(r.status, 200);
    assert.equal(r.body.item.title, 'Latest news');
    assert.equal(r.body.item.key, 'news');
    assert.equal(r.body.item.href, 'news.html');
    assert.ok(!(await client(ctx.app).get('/api/menu')).body.items.some((m) => m.key === 'news'));
    const ids = list.map((m) => m.id).reverse();
    await admin.post(`${A}/menu/reorder`, { ids });
    assert.equal((await client(ctx.app).get('/api/menu')).body.items[0].key, 'links');
    assert.equal((await admin.put(`${A}/menu/${news.id}`, { title: 'T'.repeat(41) })).status, 400);
  });
});

describe('links, contacts, settings', () => {
  test('link categories + links: reorder, empty URL = coming soon, URL scheme check, category delete cascades', async () => {
    const cat = (await admin.post(`${A}/link-categories`, { slug: 'corpora', title: 'Corpora', blurb: 'Text corpora' })).body.item;
    assert.equal((await admin.post(`${A}/link-categories`, { slug: 'corpora', title: 'Dup' })).status, 409);
    const l1 = (await admin.post(`${A}/links`, { category_id: cat.id, title: 'One', url: 'https://one.example/' })).body.item;
    const l2 = (await admin.post(`${A}/links`, { category_id: cat.id, title: 'Two', url: '' })).body.item;
    assert.equal(l2.url, null);
    assert.equal((await admin.post(`${A}/links`, { category_id: cat.id, title: 'Bad', url: 'javascript:alert(1)' })).status, 400);
    assert.equal((await admin.post(`${A}/links`, { category_id: 99999, title: 'Orphan' })).status, 400);
    assert.equal((await admin.get(`${A}/links?category_id=${cat.id}`)).body.total, 2);
    assert.equal((await admin.get(`${A}/links`)).body.items[0].category, 'Corpora');

    await admin.post(`${A}/links/reorder`, { ids: [l2.id, l1.id] });
    assert.deepEqual((await client(ctx.app).get('/api/links')).body.categories[0].links.map((l) => l.title), ['Two', 'One']);
    assert.equal((await admin.del(`${A}/link-categories/${cat.id}`)).status, 204);
    assert.equal((await ctx.db.one('select count(*)::int as n from useful_links')).n, 0);
  });

  test('contact people, recipients and settings (allow-listed keys only)', async () => {
    const p = await admin.post(`${A}/contact-people`, { position: 'President', name: 'Juha Janhunen', email: 'juha@example.org' });
    assert.equal(p.status, 201);
    assert.equal((await admin.post(`${A}/contact-people`, { position: 'X', name: 'Y', email: 'nope' })).status, 400);
    assert.equal((await admin.put(`${A}/contact-people/${p.body.item.id}`, { email: '' })).body.item.email, null);

    const rcp = await admin.post(`${A}/contact-recipients`, { email: 'Office@Example.org', label: 'Office' });
    assert.equal(rcp.body.item.email, 'office@example.org');
    assert.equal((await admin.post(`${A}/contact-recipients`, { email: 'office@example.org' })).status, 409);

    const s = await admin.put(`${A}/settings`, { settings: { 'contact.email': 'info@example.org', 'contact.address': 'Ulaanbaatar', 'session.secret': 'pwned' } });
    assert.equal(s.status, 200);
    assert.deepEqual(s.body.settings, { 'contact.email': 'info@example.org', 'contact.address': 'Ulaanbaatar', 'contact.address_mn': null });
    assert.equal((await ctx.db.one(`select count(*)::int as n from site_settings where key = 'session.secret'`)).n, 0);
    assert.equal((await admin.put(`${A}/settings`, { settings: { 'contact.email': 'bad' } })).status, 400);
    const pub = (await client(ctx.app).get('/api/contacts')).body;
    assert.equal(pub.email, 'info@example.org');
    assert.equal(pub.people[0].email, null);
    assert.equal((await admin.get(`${A}/settings`)).body.settings['contact.address'], 'Ulaanbaatar');
  });
});

describe('moderation', () => {
  async function discussFixture() {
    const ada = await createUser(ctx.db, { first: 'Ada', last: 'L', email: 'ada@example.org' });
    const bat = await createUser(ctx.db, { first: 'Bat', last: 'E', email: 'bat@example.org' });
    const a = await loginAs(ctx.app, ada);
    const b = await loginAs(ctx.app, bat);
    const t = (await a.post('/api/discuss/threads', { title: 'Topic', body: 'Opening post' })).body.thread;
    const c = (await b.post(`/api/discuss/threads/${t.id}/comments`, { body: 'A rude comment' })).body.comment;
    return { ada, bat, a, b, t, c };
  }

  test('reports queue: list with context, remove resolves all reports for the target, dismiss keeps content', async () => {
    const { a, b, t, c } = await discussFixture();
    await a.post('/api/discuss/reports', { target_type: 'comment', target_id: c.id, reason: 'Rude' });
    await b.post('/api/discuss/reports', { target_type: 'thread', target_id: t.id });
    const carol = await loginAs(ctx.app, await createUser(ctx.db));
    await carol.post('/api/discuss/reports', { target_type: 'comment', target_id: c.id });

    const q = (await admin.get(`${A}/reports`)).body;
    assert.equal(q.total, 3);
    const rep = q.items.find((r) => r.target_type === 'comment' && r.reporter.email === 'ada@example.org');
    assert.equal(rep.reason, 'Rude');
    assert.equal(rep.reporter.email, 'ada@example.org');
    assert.equal(rep.target.body, 'A rude comment');
    assert.equal(rep.target.thread_id, t.id);
    assert.equal(rep.target.author.email, 'bat@example.org');

    const removed = await admin.post(`${A}/reports/${rep.id}/resolve`, { action: 'remove' });
    assert.equal(removed.status, 200);
    assert.equal(removed.body.item.status, 'resolved');
    assert.equal((await ctx.db.one('select status from discuss_comments')).status, 'removed');
    assert.equal((await ctx.db.one(`select count(*)::int as n from reports where target_type = 'comment' and status = 'resolved'`)).n, 2, 'all reports for that comment');

    const threadReport = (await admin.get(`${A}/reports?status=open`)).body.items[0];
    const dismissed = await admin.post(`${A}/reports/${threadReport.id}/resolve`, { action: 'dismiss' });
    assert.equal(dismissed.body.item.status, 'dismissed');
    assert.equal((await ctx.db.one(`select status from discuss_threads`)).status, 'visible');
    assert.equal((await admin.get(`${A}/reports?status=open`)).body.total, 0);
    assert.equal((await admin.get(`${A}/reports?status=all`)).body.total, 3);
    assert.equal((await admin.post(`${A}/reports/${threadReport.id}/resolve`, { action: 'explode' })).status, 400);
    assert.equal((await admin.post(`${A}/reports/99999/resolve`, { action: 'dismiss' })).status, 404);
  });

  test('threads list + detail include removed content for admins; status can be restored', async () => {
    const { t, c, a } = await discussFixture();
    await a.post('/api/discuss/reports', { target_type: 'comment', target_id: c.id });
    const list = (await admin.get(`${A}/discuss/threads`)).body;
    assert.equal(list.total, 1);
    assert.equal(list.items[0].reply_count, 1);
    assert.equal(list.items[0].reports_open, 1);
    assert.equal(list.items[0].author.email, 'ada@example.org');
    assert.equal((await admin.get(`${A}/discuss/threads?q=bat%40`)).body.total, 0, 'search covers thread author, not commenters');
    assert.equal((await admin.get(`${A}/discuss/threads?q=ada%40`)).body.total, 1);

    assert.equal((await admin.post(`${A}/discuss/comments/${c.id}/status`, { status: 'removed', reason: 'Abusive' })).status, 200);
    const detail = (await admin.get(`${A}/discuss/threads/${t.id}`)).body;
    assert.equal(detail.comments[0].status, 'removed');
    assert.equal(detail.comments[0].body, 'A rude comment', 'admins still see the body');
    assert.equal(detail.comments[0].status_reason, 'Abusive');
    assert.equal((await admin.get(`${A}/discuss/threads?status=visible`)).body.items[0].reply_count, 0);

    assert.equal((await admin.post(`${A}/discuss/comments/${c.id}/status`, { status: 'visible' })).status, 200);
    assert.equal((await ctx.db.one('select status, status_by from discuss_comments')).status, 'visible');
    assert.equal((await admin.post(`${A}/discuss/threads/${t.id}/status`, { status: 'removed' })).status, 200);
    assert.equal((await admin.get(`${A}/discuss/threads?status=removed`)).body.total, 1);
    assert.equal((await client(ctx.app).get(`/api/discuss/threads/${t.id}`)).status, 404);
    assert.equal((await admin.post(`${A}/discuss/threads/${t.id}/status`, { status: 'deleted' })).status, 400);
    assert.equal((await admin.post(`${A}/discuss/threads/99999/status`, { status: 'removed' })).status, 404);
  });
});

describe('users', () => {
  test('list/search/filter; e-mail and workplace visible to admins only', async () => {
    await createUser(ctx.db, { email: 'ada@example.org', first: 'Ada', workplace: 'Cambridge' });
    await createUser(ctx.db, { email: 'pending@example.org', verified: false });
    const r = (await admin.get(`${A}/users`)).body;
    assert.equal(r.total, 3);
    const ada = r.items.find((u) => u.email === 'ada@example.org');
    assert.equal(ada.workplace, 'Cambridge');
    assert.equal(ada.email_verified, true);
    assert.equal(ada.disabled, false);
    assert.ok(!('password_hash' in ada));
    assert.equal(r.items.find((u) => u.email === 'pending@example.org').email_verified, false);
    assert.equal((await admin.get(`${A}/users?q=cambridge`)).body.total, 1);
    assert.equal((await admin.get(`${A}/users?role=admin`)).body.total, 1);
  });

  test('promote / demote / disable, with self-protection and last-admin protection', async () => {
    const m = await createUser(ctx.db, { email: 'm@example.org' });
    const mc = await loginAs(ctx.app, m);
    const promoted = await admin.patch(`${A}/users/${m.id}`, { role: 'admin' });
    assert.equal(promoted.body.item.role, 'admin');
    assert.equal((await mc.get(`${A}/stats`)).status, 200);

    // cannot demote or disable yourself
    assert.equal((await admin.patch(`${A}/users/${boss.id}`, { role: 'member' })).status, 403);
    assert.equal((await admin.patch(`${A}/users/${boss.id}`, { disabled: true })).status, 403);
    // but the other admin can demote the first one... and then is the last admin
    assert.equal((await mc.patch(`${A}/users/${boss.id}`, { role: 'member' })).status, 200);
    assert.equal((await mc.patch(`${A}/users/${m.id}`, { role: 'member' })).status, 403, 'self');
    // disabling revokes sessions
    const victim = await createUser(ctx.db);
    const vc = await loginAs(ctx.app, victim);
    assert.equal((await mc.patch(`${A}/users/${victim.id}`, { disabled: true })).body.item.disabled, true);
    assert.equal((await vc.get('/api/auth/me')).body.user, null);
    assert.equal((await mc.patch(`${A}/users/${victim.id}`, { disabled: false })).body.item.disabled, false);
    assert.equal((await mc.patch(`${A}/users/${victim.id}`, {})).status, 400);
    assert.equal((await mc.patch(`${A}/users/${victim.id}`, { role: 'owner' })).status, 400);
    assert.equal((await mc.patch(`${A}/users/not-a-uuid`, { role: 'member' })).status, 404);
  });

  test('last active admin cannot be removed by any route', async () => {
    const other = await createUser(ctx.db, { role: 'admin', disabled: true });
    // `other` is a disabled admin: it does not count as an active admin
    const c = await loginAs(ctx.app, boss);
    assert.equal((await c.del(`${A}/users/${other.id}`)).status, 204);
    const second = await createUser(ctx.db, { role: 'admin' });
    const sc = await loginAs(ctx.app, second);
    assert.equal((await c.patch(`${A}/users/${second.id}`, { disabled: true })).status, 200);
    assert.equal((await sc.get(`${A}/stats`)).status, 401);
    await ctx.db.query(`update users set disabled_at = null where id = $1`, [second.id]);
    assert.equal((await c.del(`${A}/users/${boss.id}`)).status, 403, 'not yourself');
    assert.equal((await c.del(`${A}/users/${second.id}`)).status, 204);
  });

  test('deleting a member removes their data but keeps their Discuss posts', async () => {
    const m = await createUser(ctx.db, { first: 'Gone' });
    const mc = await loginAs(ctx.app, m);
    await mc.post('/api/discuss/threads', { title: 'Question', body: 'Body' });
    assert.equal((await admin.del(`${A}/users/${m.id}`)).status, 204);
    assert.equal((await ctx.db.one(`select author_id from discuss_threads`)).author_id, null);
    assert.equal((await ctx.db.one('select count(*)::int as n from sessions where user_id = $1', [m.id])).n, 0);
    assert.equal((await admin.del(`${A}/users/${m.id}`)).status, 404);
  });
});

describe('subscribers and inbox', () => {
  test('summary counts only active verified subscribers; CSV is spreadsheet-safe', async () => {
    const a = await createUser(ctx.db, { email: 'a@example.org', first: '=HYPERLINK("x")', last: 'Smith, Jr.' });
    const b = await createUser(ctx.db, { email: 'b@example.org' });
    const off = await createUser(ctx.db, { email: 'off@example.org', disabled: true });
    for (const [u, topic, freq, on] of [[a, 'news', 'daily', true], [a, 'events', 'instant', true], [b, 'news', 'weekly', true], [b, 'discuss', 'daily', false], [off, 'news', 'daily', true]]) {
      await ctx.db.query('insert into subscription_prefs (user_id, topic, enabled, frequency) values ($1, $2, $3, $4)', [u.id, topic, on, freq]);
    }
    const r = (await admin.get(`${A}/subscribers`)).body;
    assert.deepEqual(r.summary.news, { instant: 0, daily: 1, weekly: 1 });
    assert.deepEqual(r.summary.events, { instant: 1, daily: 0, weekly: 0 });
    assert.deepEqual(r.summary.discuss, { instant: 0, daily: 0, weekly: 0 });
    assert.equal(r.total_users, 2);

    const csv = await admin.get(`${A}/subscribers.csv?topic=news`);
    assert.equal(csv.status, 200);
    assert.match(csv.headers['content-type'], /text\/csv/);
    assert.match(csv.headers['content-disposition'], /attachment; filename="mongolist-subscribers-news\.csv"/);
    const lines = csv.text.replace('﻿', '').trim().split('\r\n');
    assert.equal(lines[0], 'email,first_name,last_name,topic,frequency');
    assert.equal(lines.length, 3);
    assert.ok(lines[1].startsWith(`a@example.org,'=HYPERLINK("x"),`) || lines[1].includes(`"'=HYPERLINK(""x"")"`), lines[1]);
    assert.ok(lines[1].includes('"Smith, Jr."'));
    assert.equal((await admin.get(`${A}/subscribers.csv`)).text.trim().split('\r\n').length, 4);
  });

  test('inbox: list, unread filter, mark read, delete', async () => {
    const c = client(ctx.app);
    await c.post('/api/contact', { name: 'One', email: 'one@example.org', message: 'First message here' });
    await client(ctx.app).post('/api/contact', { name: 'Two', email: 'two@example.org', subject: 'Subj', message: 'Second message here', source: 'participants' });
    let r = (await admin.get(`${A}/messages`)).body;
    assert.equal(r.total, 2);
    assert.equal(r.unread, 2);
    assert.equal(r.items[0].name, 'Two');
    assert.equal(r.items[0].source, 'participants');
    const id = r.items[0].id;
    assert.equal((await admin.patch(`${A}/messages/${id}`, { is_read: true })).body.item.is_read, true);
    r = (await admin.get(`${A}/messages?unread=1`)).body;
    assert.equal(r.total, 1);
    assert.equal(r.unread, 1);
    assert.equal(r.items[0].name, 'One');
    assert.equal((await admin.del(`${A}/messages/${id}`)).status, 204);
    assert.equal((await admin.del(`${A}/messages/${id}`)).status, 404);
    assert.equal((await admin.patch(`${A}/messages/${id}`, { is_read: true })).status, 404);
    assert.equal((await admin.patch(`${A}/messages/${r.items[0].id}`, { is_read: 'x' })).status, 400);
  });
});

describe('ops', () => {
  test('stats, mail queue + retry, audit trail, manual digest', async () => {
    await admin.post(`${A}/news`, { title: 'N', body: 'b', published_at: new Date().toISOString() });
    await client(ctx.app).post('/api/auth/register', { first_name: 'A', last_name: 'B', workplace: 'W', email: 'newbie@example.org', password: PASSWORD });

    const stats = (await admin.get(`${A}/stats`)).body;
    assert.equal(stats.users, 2);
    assert.equal(stats.users_verified, 1);
    assert.equal(stats.admins, 1);
    assert.equal(stats.news, 1);
    assert.equal(stats.mail_queued, 1);
    assert.equal(stats.mail_failed, 0);
    assert.deepEqual(Object.keys(stats).sort(), ['admins', 'comments', 'events', 'mail_failed', 'mail_queued', 'messages_unread', 'news', 'publications', 'reports_open', 'subscribers', 'threads', 'users', 'users_verified']);

    const queued = (await admin.get(`${A}/mail?status=queued`)).body;
    assert.equal(queued.total, 1);
    assert.equal(queued.items[0].to_email, 'newbie@example.org');
    assert.ok(!('text_body' in queued.items[0]), 'bodies (one-time codes) are never listed');

    await ctx.db.query(`insert into mail_outbox (to_email, subject, text_body, status, last_error, purpose) values ('x@example.org', 'Digest', 'body', 'failed', 'boom', 'digest')`);
    const failed = (await admin.get(`${A}/mail?status=failed`)).body.items[0];
    assert.equal(failed.last_error, 'boom');
    assert.equal((await admin.post(`${A}/mail/${failed.id}/retry`, {})).status, 200);
    assert.equal((await ctx.db.one('select status from mail_outbox where id = $1', [failed.id])).status, 'queued');
    // one-time-code mails whose body was scrubbed cannot be retried
    const scrubbed = await ctx.db.one(`insert into mail_outbox (to_email, subject, text_body, status, purpose) values ('y@example.org', 's', '[removed]', 'failed', 'verify_email') returning id`);
    assert.equal((await admin.post(`${A}/mail/${scrubbed.id}/retry`, {})).status, 409);
    assert.equal((await admin.post(`${A}/mail/99999/retry`, {})).status, 404);

    const audit = (await admin.get(`${A}/audit`)).body;
    assert.ok(audit.total >= 2);
    assert.ok(audit.items.some((e) => e.action === 'create' && e.entity === 'news' && e.actor.name === 'Chief Admin'));
    assert.ok(audit.items.some((e) => e.action === 'mail.retry'));

    const run = await admin.post(`${A}/jobs/digest`, { mode: 'all' });
    assert.equal(run.status, 200);
    assert.deepEqual(run.body, { ok: true, emails_queued: 0 });
    assert.equal((await admin.post(`${A}/jobs/digest`, { mode: 'bogus' })).status, 400);
  });
});
