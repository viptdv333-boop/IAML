// Second language (Mongolian): API fallback rules, admin fields, e-mails, digest, unsubscribe page (docs/I18N.md).
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { unsubscribeToken } from '../src/lib/crypto.js';
import { runDigest } from '../src/jobs/digest.js';
import { PASSWORD, client, createUser, lastCode, loginAs, mailTo, resetDb, seedBase, startApp } from './helpers.js';

let ctx;
before(async () => { ctx = await startApp(); });
after(async () => { await ctx.close(); });
beforeEach(async () => { await resetDb(ctx.db); });

const A = '/api/admin';
const words = (n) => Array.from({ length: n }, (_, i) => `w${i + 1}`).join(' ');

describe('public API: ?lang=mn with fallback to English', () => {
  test('news: translated only when title AND text exist; the "lang" field says what was delivered', async () => {
    await ctx.db.query(
      `insert into news (title, body, title_mn, body_mn, published_at) values
        ('Both', 'English body', 'Хоёулаа', $1, now() - interval '1 day'),
        ('Title only', 'English body 2', 'Зөвхөн гарчиг', null, now() - interval '2 days'),
        ('None', 'English body 3', null, null, now() - interval '3 days'),
        ('Blank', 'English body 4', '   ', '', now() - interval '4 days')`,
      [`${words(300)}`],
    );
    const c = client(ctx.app);
    const en = (await c.get('/api/news')).body.items;
    assert.deepEqual(en.map((n) => [n.title, n.lang]), [['Both', 'en'], ['Title only', 'en'], ['None', 'en'], ['Blank', 'en']]);

    const mn = (await c.get('/api/news?lang=mn')).body.items;
    assert.deepEqual(mn.map((n) => [n.title, n.lang]), [['Хоёулаа', 'mn'], ['Title only', 'en'], ['None', 'en'], ['Blank', 'en']]);
    assert.equal(mn[0].body.split(' ').length, 300);
    assert.ok(mn[0].preview.endsWith('…'), 'the preview is cut from the Mongolian text');
    assert.equal(mn[1].body, 'English body 2');

    assert.deepEqual((await c.get('/api/news?lang=xx')).body.items.map((n) => n.lang), ['en', 'en', 'en', 'en'], 'unknown language = English');
    assert.equal((await c.get('/api/news?lang=mn&limit=1')).body.total, 4);
  });

  test('events: translated when the title is; location / summary / body fall back one by one', async () => {
    await ctx.db.query(
      `insert into events (title, location, summary, body, title_mn, location_mn, summary_mn, starts_at) values
        ('Conf', 'Ulaanbaatar', 'Short', 'Long', 'Чуулган', 'Улаанбаатар', null, now() + interval '5 days'),
        ('Workshop', 'Prague', 'S', 'B', null, 'Прага', 'Товч', now() + interval '9 days')`,
    );
    const c = client(ctx.app);
    const mn = (await c.get('/api/events?lang=mn')).body.items;
    assert.deepEqual(mn[0], { ...mn[0], title: 'Чуулган', location: 'Улаанбаатар', summary: 'Short', body: 'Long', lang: 'mn' });
    assert.deepEqual([mn[1].title, mn[1].location, mn[1].summary, mn[1].lang], ['Workshop', 'Prague', 'S', 'en'], 'no translated title → whole item stays English');
    assert.equal((await c.get('/api/events')).body.items[0].title, 'Conf');
  });

  test('publications: title + summary needed; topic falls back', async () => {
    await ctx.db.query(
      `insert into publications (title, authors, topic, summary, title_mn, topic_mn, summary_mn, published_at) values
        ('Grammar', 'A. Author', 'Syntax', 'English summary', 'Дүрэм', 'Синтакс', 'Монгол хураангуй', now() - interval '1 day'),
        ('Lexicon', 'B. Author', 'Lexis', 'English summary 2', 'Үгсийн сан', null, null, now() - interval '2 days')`,
    );
    const mn = (await client(ctx.app).get('/api/publications?lang=mn')).body.items;
    assert.deepEqual([mn[0].title, mn[0].topic, mn[0].summary, mn[0].authors, mn[0].lang], ['Дүрэм', 'Синтакс', 'Монгол хураангуй', 'A. Author', 'mn']);
    assert.deepEqual([mn[1].title, mn[1].topic, mn[1].lang], ['Lexicon', 'Lexis', 'en']);
  });

  test('pages: title + body; slug lookup unchanged', async () => {
    await ctx.db.query(`insert into pages (slug, title, body, title_mn, body_mn) values ('history', 'History', 'English text', 'Түүх', '# Түүх')`);
    const c = client(ctx.app);
    assert.deepEqual(Object.keys((await c.get('/api/pages/history')).body).sort(), ['body', 'lang', 'slug', 'title', 'updated_at']);
    const mn = (await c.get('/api/pages/history?lang=mn')).body;
    assert.deepEqual([mn.title, mn.body, mn.lang], ['Түүх', '# Түүх', 'mn']);
    assert.equal((await c.get('/api/pages/history')).body.lang, 'en');
  });

  test('menu, participants, links, contacts are localised with per-field fallback (seeded defaults)', async () => {
    await seedBase(ctx.db);
    const c = client(ctx.app);
    const menu = (await c.get('/api/menu?lang=mn')).body.items;
    assert.deepEqual(menu.map((m) => m.title), ['Бидний тухай', 'Мэдээ', 'Арга хэмжээ', 'Нийтлэлүүд', 'Оролцогчид', 'Mongolist', 'Хэлэлцүүлэг', 'Холбоо барих', 'Ашигтай холбоосууд']);
    assert.equal((await c.get('/api/menu')).body.items[1].title, 'News');
    const page = await ctx.db.one(`insert into pages (slug, title, body) values ('plain', 'Plain page', 'x') returning id`);
    await ctx.db.query(`insert into menu_items (key, title, href, sort_order, page_id) values ('page:plain', 'Plain page', 'page.html?slug=plain', 99, $1)`, [page.id]);
    assert.equal((await c.get('/api/menu?lang=mn')).body.items.at(-1).title, 'Plain page', 'no Mongolian title → English');

    const parts = (await c.get('/api/participants?lang=mn')).body.positions;
    assert.deepEqual(parts.map((p) => p.name), ['Ерөнхийлөгч', 'Хүндэт ерөнхийлөгч', 'Дэд ерөнхийлөгчид', 'Гүйцэтгэх захирал', 'Удирдах зөвлөлийн гишүүд']);
    assert.equal(parts[2].singular, 'Дэд ерөнхийлөгч');
    assert.equal(parts[0].participants[0].name, 'Juha Janhunen', 'a name without a Mongolian spelling stays as written');
    await ctx.db.query(`update participants set name_mn = 'Юха Янхунен', org_mn = 'Эрдэм шинжилгээний хүрээлэн' where name = 'Juha Janhunen'`);
    const p0 = (await c.get('/api/participants?lang=mn')).body.positions[0].participants[0];
    assert.deepEqual([p0.name, p0.org], ['Юха Янхунен', 'Эрдэм шинжилгээний хүрээлэн']);
    assert.equal((await c.get('/api/participants')).body.positions[0].participants[0].name, 'Juha Janhunen');

    const cat = await ctx.db.one(`select id from link_categories where slug = 'corpora'`);
    await ctx.db.query(`insert into useful_links (category_id, title, description, title_mn) values ($1, 'A corpus', 'Desc', 'Корпус')`, [cat.id]);
    const links = (await c.get('/api/links?lang=mn')).body.categories[0];
    assert.deepEqual([links.title, links.links[0].title, links.links[0].description], ['Корпусууд', 'Корпус', 'Desc']);

    const contacts = (await c.get('/api/contacts?lang=mn')).body;
    assert.equal(contacts.address, 'Улаанбаатар, Монгол улс');
    assert.deepEqual(contacts.people.map((p) => p.position), ['Ерөнхийлөгч', 'Гүйцэтгэх захирал', 'Технологийн захирал (CTO)']);
    assert.equal((await c.get('/api/contacts')).body.address, 'Ulaanbaatar, Mongolia');
    await ctx.db.query(`delete from site_settings where key = 'contact.address_mn'`);
    assert.equal((await c.get('/api/contacts?lang=mn')).body.address, 'Ulaanbaatar, Mongolia', 'missing Mongolian address → English');
  });
});

describe('admin: Mongolian fields', () => {
  let admin;
  beforeEach(async () => {
    admin = await loginAs(ctx.app, await createUser(ctx.db, { role: 'admin' }));
  });

  test('news: create / update / clear the Mongolian version; has_mn follows; limits apply', async () => {
    const now = new Date().toISOString();
    const r = await admin.post(`${A}/news`, { title: 'Hello', body: 'Body', published_at: now, title_mn: 'Сайн уу', body_mn: 'Агуулга' });
    assert.equal(r.status, 201);
    assert.deepEqual([r.body.item.title_mn, r.body.item.body_mn, r.body.item.has_mn], ['Сайн уу', 'Агуулга', true]);
    const half = await admin.put(`${A}/news/${r.body.item.id}`, { body_mn: '' });
    assert.deepEqual([half.body.item.body_mn, half.body.item.has_mn], [null, false]);
    const none = await admin.post(`${A}/news`, { title: 'Only English', body: 'x', published_at: now });
    assert.deepEqual([none.body.item.title_mn, none.body.item.has_mn], [null, false]);

    const bad = await admin.post(`${A}/news`, { title: 'T', body: 'b', published_at: now, title_mn: 'x'.repeat(201), body_mn: words(501) });
    assert.equal(bad.status, 400);
    assert.ok(bad.body.error.fields.title_mn && bad.body.error.fields.body_mn);
    assert.equal((await admin.get(`${A}/news?q=${encodeURIComponent('Сайн')}`)).body.total, 1, 'search covers the Mongolian title');
  });

  test('events, publications, pages, menu, positions, participants, links, contacts accept their Mongolian twins', async () => {
    await seedBase(ctx.db);
    const ev = await admin.post(`${A}/events`, { title: 'E', starts_at: '2027-01-01T10:00:00.000Z', title_mn: 'Арга хэмжээ', location_mn: 'Улаанбаатар', summary_mn: 'Товч', body_mn: 'Дэлгэрэнгүй' });
    assert.deepEqual([ev.body.item.has_mn, ev.body.item.location_mn], [true, 'Улаанбаатар']);
    const pub = await admin.post(`${A}/publications`, { title: 'P', authors: 'A', summary: 's', published_at: new Date().toISOString(), title_mn: 'Нийтлэл', topic_mn: 'Сэдэв', summary_mn: 'Хураангуй' });
    assert.deepEqual([pub.body.item.has_mn, pub.body.item.topic_mn], [true, 'Сэдэв']);
    const page = await admin.post(`${A}/pages`, { slug: 'about-mn', title: 'About', body: 'x', title_mn: 'Тухай', body_mn: 'Агуулга' });
    assert.equal(page.body.item.has_mn, true);

    const menu = (await admin.get(`${A}/menu`)).body.items.find((m) => m.key === 'news');
    assert.equal(menu.title_mn, 'Мэдээ', 'seeded default');
    assert.equal((await admin.put(`${A}/menu/${menu.id}`, { title_mn: 'Мэдээ мэдээлэл' })).body.item.title_mn, 'Мэдээ мэдээлэл');
    assert.equal((await admin.put(`${A}/menu/${menu.id}`, { title_mn: '' })).body.item.title_mn, null);

    const pos = (await admin.get(`${A}/positions`)).body.items[0];
    assert.deepEqual([pos.name_mn, pos.singular_mn], ['Ерөнхийлөгч', 'Ерөнхийлөгч']);
    assert.equal((await admin.put(`${A}/positions/${pos.id}`, { name_mn: 'Тэргүүн' })).body.item.name_mn, 'Тэргүүн');
    const part = (await admin.get(`${A}/participants`)).body.items[0];
    const up = await admin.put(`${A}/participants/${part.id}`, { name_mn: 'Нэр', org_mn: 'Байгууллага' });
    assert.deepEqual([up.body.item.name_mn, up.body.item.org_mn], ['Нэр', 'Байгууллага']);

    const cat = (await admin.get(`${A}/link-categories`)).body.items[0];
    assert.equal((await admin.put(`${A}/link-categories/${cat.id}`, { blurb_mn: 'Тайлбар' })).body.item.blurb_mn, 'Тайлбар');
    const link = await admin.post(`${A}/links`, { category_id: cat.id, title: 'L', title_mn: 'Холбоос', description_mn: 'Тайлбар' });
    assert.equal(link.body.item.title_mn, 'Холбоос');
    const person = (await admin.get(`${A}/contact-people`)).body.items[0];
    assert.deepEqual([person.position_mn], ['Ерөнхийлөгч']);
    assert.equal((await admin.put(`${A}/contact-people/${person.id}`, { name_mn: 'Нэр Овог' })).body.item.name_mn, 'Нэр Овог');

    const s = await admin.put(`${A}/settings`, { settings: { 'contact.address_mn': 'Монгол, Улаанбаатар' } });
    assert.equal(s.body.settings['contact.address_mn'], 'Монгол, Улаанбаатар');
    assert.equal((await client(ctx.app).get('/api/contacts?lang=mn')).body.address, 'Монгол, Улаанбаатар');
  });

  test('the user list shows each member\'s e-mail language', async () => {
    const u = await createUser(ctx.db, { email: 'mn@example.org' });
    await ctx.db.query(`update users set lang = 'mn' where id = $1`, [u.id]);
    const items = (await admin.get(`${A}/users?q=mn%40`)).body.items;
    assert.equal(items.find((x) => x.email === 'mn@example.org').lang, 'mn');
  });
});

describe('accounts and e-mails in Mongolian', () => {
  const reg = (over = {}) => ({ first_name: 'Бат', last_name: 'Эрдэнэ', workplace: 'Их сургууль', email: 'bat@example.org', password: PASSWORD, website: '', ...over });

  test('register with lang=mn: the confirmation e-mail is Mongolian, the account remembers it', async () => {
    const c = client(ctx.app);
    assert.equal((await c.post('/api/auth/register', reg({ lang: 'mn' }))).status, 201);
    const [mail] = await mailTo(ctx.db, 'bat@example.org', 'verify_email');
    assert.equal(mail.subject, 'Таны ОУМХСН баталгаажуулах код');
    assert.match(mail.text_body, /Сайн байна уу,/);
    assert.match(mail.html_body, /<html lang="mn">/);
    assert.ok(!mail.subject.includes(await lastCode(ctx.db, 'bat@example.org')));
    const code = await lastCode(ctx.db, 'bat@example.org');
    const v = await c.post('/api/auth/verify', { email: 'bat@example.org', code, password: PASSWORD });
    assert.equal(v.body.user.lang, 'mn');
    assert.equal((await c.get('/api/auth/me')).body.user.lang, 'mn');
  });

  test('default is English; unknown languages are rejected; PATCH /me switches the e-mail language', async () => {
    const c = client(ctx.app);
    await c.post('/api/auth/register', reg({ email: 'en@example.org' }));
    assert.equal((await mailTo(ctx.db, 'en@example.org', 'verify_email'))[0].subject, 'Your IAML confirmation code');
    assert.equal((await ctx.db.one(`select lang from users where email = 'en@example.org'`)).lang, 'en');
    const bad = await client(ctx.app).post('/api/auth/register', reg({ email: 'xx@example.org', lang: 'fr' }));
    assert.equal(bad.status, 400);
    assert.ok(bad.body.error.fields.lang);

    const u = await createUser(ctx.db, { email: 'switch@example.org' });
    const me = await loginAs(ctx.app, u);
    assert.equal((await me.patch('/api/me', { lang: 'mn' })).body.user.lang, 'mn');
    assert.equal((await me.patch('/api/me', { lang: 'de' })).status, 400);
    await client(ctx.app).post('/api/auth/forgot', { email: 'switch@example.org' });
    const [reset] = await mailTo(ctx.db, 'switch@example.org', 'reset_password');
    assert.equal(reset.subject, 'Таны ОУМХСН нууц үг сэргээх код');
    assert.match(reset.text_body, /нууц үг/);
  });

  test('"you already have an account" mail follows the existing member\'s language', async () => {
    const u = await createUser(ctx.db, { email: 'have@example.org' });
    await ctx.db.query(`update users set lang = 'mn' where id = $1`, [u.id]);
    await client(ctx.app).post('/api/auth/register', reg({ email: 'have@example.org' }));
    const [mail] = await mailTo(ctx.db, 'have@example.org', 'account_exists');
    assert.equal(mail.subject, 'Та ОУМХСН-д аль хэдийн бүртгэлтэй байна');
  });
});

describe('Mongolist digest and unsubscribe page', () => {
  const NOW = new Date('2026-10-01T06:00:00Z');
  const subscribe = (user, topic) =>
    ctx.db.query(`insert into subscription_prefs (user_id, topic, enabled, frequency, last_sent_at) values ($1, $2, true, 'daily', '2026-09-30T05:30:00Z')`, [user.id, topic]);

  test('members get the digest in their language, with Mongolian item texts where they exist', async () => {
    const mn = await createUser(ctx.db, { email: 'mn@example.org', first: 'Бат' });
    const en = await createUser(ctx.db, { email: 'en@example.org', first: 'Ada' });
    await ctx.db.query(`update users set lang = 'mn' where id = $1`, [mn.id]);
    for (const u of [mn, en]) { await subscribe(u, 'news'); await subscribe(u, 'events'); }
    await ctx.db.query(
      `insert into news (title, body, title_mn, body_mn, published_at) values
        ('Translated news', 'English body', 'Орчуулсан мэдээ', 'Монгол агуулга', '2026-09-30T12:00:00Z'),
        ('Plain news', 'Only English', null, null, '2026-09-30T13:00:00Z')`,
    );
    await ctx.db.query(
      `insert into events (title, location, title_mn, location_mn, starts_at, summary, published_at) values
        ('A workshop', 'Prague', 'Семинар', 'Прага', '2026-11-05T09:00:00Z', 'S', '2026-09-30T14:00:00Z')`,
    );
    const r = await runDigest({ db: ctx.db, config: ctx.config }, { now: NOW });
    assert.equal(r.emails_queued, 2);

    const [mnMail] = await mailTo(ctx.db, 'mn@example.org', 'digest');
    assert.equal(mnMail.subject, 'ОУМХСН: 3 шинэ мэдээлэл');
    assert.match(mnMail.text_body, /Сайн байна уу, Бат!/);
    assert.match(mnMail.text_body, /== Мэдээ ==/);
    assert.match(mnMail.text_body, /• Орчуулсан мэдээ/);
    assert.match(mnMail.text_body, /• Plain news/, 'untranslated items stay English');
    assert.match(mnMail.text_body, /• Семинар — 2026-11-05 12:00 \(UTC\+3\) · Прага/);
    assert.match(mnMail.text_body, /Захиалгаа цуцлах: http:\/\/localhost:3000\/api\/unsubscribe\?t=[^&\s]+&lang=mn/);
    assert.match(mnMail.html_body, /<html lang="mn">/);
    assert.equal(mnMail.headers['List-Unsubscribe'].includes('&lang=mn'), true);

    const [enMail] = await mailTo(ctx.db, 'en@example.org', 'digest');
    assert.equal(enMail.subject, 'IAML digest: 3 updates');
    assert.match(enMail.text_body, /• Translated news/);
    assert.ok(!/lang=mn/.test(enMail.text_body));
  });

  test('the unsubscribe page speaks Mongolian when asked to, and still works', async () => {
    const u = await createUser(ctx.db, { email: 'sub@example.org' });
    await subscribe(u, 'news');
    const token = unsubscribeToken(ctx.config.sessionSecret, u.id);
    const c = client(ctx.app);
    const en = await c.get(`/api/unsubscribe?t=${token}`);
    assert.match(en.text, /<html lang="en">/);
    assert.match(en.text, /Unsubscribe from Mongolist/);
    const mn = await c.get(`/api/unsubscribe?t=${token}&lang=mn`);
    assert.match(mn.text, /<html lang="mn">/);
    assert.match(mn.text, /Mongolist-ийн захиалгаа цуцлах/);
    assert.match(mn.text, /action="\/api\/unsubscribe\?t=[^"]+&amp;lang=mn"/);
    const done = await c.request('POST', `/api/unsubscribe?t=${token}&lang=mn`, { headers: { 'x-requested-with': null, accept: 'text/html' }, body: '' });
    assert.match(done.text, /Та захиалгаа цуцаллаа/);
    assert.equal((await ctx.db.one(`select count(*)::int as n from subscription_prefs where enabled`)).n, 0);
    const bad = await c.get('/api/unsubscribe?t=nope&lang=mn');
    assert.equal(bad.status, 400);
    assert.match(bad.text, /Холбоос буруу байна/);
  });
});
