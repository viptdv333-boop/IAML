import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { client, createUser, loginAs, resetDb, startApp } from './helpers.js';

let ctx;
before(async () => { ctx = await startApp(); });
after(async () => { await ctx.close(); });
beforeEach(async () => { await resetDb(ctx.db); });

async function setup() {
  const ada = await createUser(ctx.db, { first: 'Ada', last: 'Lovelace', email: 'ada@example.org', workplace: 'Secret Lab' });
  const bat = await createUser(ctx.db, { first: 'Bat', last: 'Erdene', email: 'bat@example.org' });
  const boss = await createUser(ctx.db, { first: 'Admin', last: 'Boss', role: 'admin' });
  return { ada, bat, boss, a: await loginAs(ctx.app, ada), b: await loginAs(ctx.app, bat), admin: await loginAs(ctx.app, boss), anon: client(ctx.app) };
}
const newThread = async (c, title = 'A question', body = 'Details here') => (await c.post('/api/discuss/threads', { title, body })).body.thread;

describe('reading', () => {
  test('anyone can read; author cards show name + avatar but never e-mail or workplace', async () => {
    const { a, anon } = await setup();
    const t = await newThread(a, 'Middle Mongol converbs', 'Which sources?');
    const list = await anon.get('/api/discuss/threads');
    assert.equal(list.status, 200);
    assert.equal(list.body.total, 1);
    const item = list.body.items[0];
    assert.equal(item.title, 'Middle Mongol converbs');
    assert.equal(item.snippet, 'Which sources?');
    assert.equal(item.reply_count, 0);
    assert.equal(item.author.name, 'Ada Lovelace');
    assert.deepEqual(Object.keys(item.author).sort(), ['avatar_url', 'first_name', 'id', 'last_name', 'name', 'role']);
    const raw = JSON.stringify((await anon.get(`/api/discuss/threads/${t.id}`)).body);
    assert.ok(!raw.includes('ada@example.org') && !raw.includes('Secret Lab'));
  });

  test('threads are newest-first and paged; bad ids are 404', async () => {
    const { a, anon } = await setup();
    for (let i = 1; i <= 3; i++) await newThread(a, `Thread ${i}`);
    const p = await anon.get('/api/discuss/threads?limit=2');
    assert.deepEqual(p.body.items.map((x) => x.title), ['Thread 3', 'Thread 2']);
    assert.equal(p.body.total, 3);
    assert.deepEqual((await anon.get('/api/discuss/threads?limit=2&offset=2')).body.items.map((x) => x.title), ['Thread 1']);
    for (const id of ['abc', '0', '-1', '99999999999', '1.5', '999999']) assert.equal((await anon.get(`/api/discuss/threads/${id}`)).status, 404, id);
  });
});

describe('posting', () => {
  test('anonymous visitors cannot post; members can; validation applies', async () => {
    const { a, anon } = await setup();
    assert.equal((await anon.post('/api/discuss/threads', { title: 'x', body: 'y' })).status, 401);
    const bad = await a.post('/api/discuss/threads', { title: 'ab', body: '' });
    assert.equal(bad.status, 400);
    assert.ok(bad.body.error.fields.title && bad.body.error.fields.body);
    const r = await a.post('/api/discuss/threads', { title: 'Hello', body: 'Line 1\nLine 2' });
    assert.equal(r.status, 201);
    assert.equal(r.body.thread.body, 'Line 1\nLine 2');
    assert.equal(r.body.thread.author.name, 'Ada Lovelace');
    assert.equal(r.body.thread.reply_count, 0);
    assert.equal((await a.post('/api/discuss/threads', { title: 'T'.repeat(201), body: 'x' })).status, 400);
    assert.equal((await a.post('/api/discuss/threads', { title: 'Fine', body: 'x'.repeat(5001) })).status, 400);
  });

  test('unverified accounts cannot post', async () => {
    const u = await createUser(ctx.db, { verified: false });
    const c = client(ctx.app);
    await ctx.db.query(`insert into sessions (id, user_id, expires_at) values ('\\x${'ab'.repeat(32)}', $1, now() + interval '1 day')`, [u.id]);
    assert.equal((await c.post('/api/discuss/threads', { title: 'Hello', body: 'x' })).status, 401);
  });

  test('HTML in posts is stored verbatim as text (the client escapes it)', async () => {
    const { a, anon } = await setup();
    const t = await newThread(a, '<img src=x onerror=alert(1)>', '<script>alert(1)</script>');
    const r = await anon.get(`/api/discuss/threads/${t.id}`);
    assert.equal(r.body.thread.title, '<img src=x onerror=alert(1)>');
    assert.match(r.headers['content-type'], /application\/json/);
  });

  test('nested replies: depth tracking, max depth 6, parent must belong to the thread', async () => {
    const { a, b } = await setup();
    const t = await newThread(a);
    const other = await newThread(a, 'Another thread');
    let parent = null;
    const ids = [];
    for (let depth = 0; depth <= 6; depth++) {
      const r = await b.post(`/api/discuss/threads/${t.id}/comments`, { body: `level ${depth}`, parent_id: parent });
      assert.equal(r.status, 201, `depth ${depth}`);
      assert.equal(r.body.comment.depth, depth);
      assert.equal(r.body.comment.parent_id, parent);
      assert.equal(r.body.comment.author.name, 'Bat Erdene');
      parent = r.body.comment.id;
      ids.push(parent);
    }
    const tooDeep = await b.post(`/api/discuss/threads/${t.id}/comments`, { body: 'level 7', parent_id: parent });
    assert.equal(tooDeep.status, 400);
    assert.ok(tooDeep.body.error.fields.parent_id);
    const foreign = await b.post(`/api/discuss/threads/${other.id}/comments`, { body: 'x', parent_id: ids[0] });
    assert.equal(foreign.status, 400);
    assert.equal((await b.post(`/api/discuss/threads/${t.id}/comments`, { body: 'x', parent_id: 987654 })).status, 400);
    assert.equal((await b.post(`/api/discuss/threads/99999/comments`, { body: 'x' })).status, 404);
    assert.equal((await b.post(`/api/discuss/threads/${t.id}/comments`, { body: '' })).status, 400);

    const full = (await client(ctx.app).get(`/api/discuss/threads/${t.id}`)).body;
    assert.equal(full.comments.length, 7);
    assert.equal(full.thread.reply_count, 7);
    assert.deepEqual(full.comments.map((c) => c.depth), [0, 1, 2, 3, 4, 5, 6]);
    assert.equal((await client(ctx.app).get('/api/discuss/threads')).body.items.find((x) => x.id === t.id).reply_count, 7);
  });

  test('a reply bumps last_activity_at', async () => {
    const { a, b } = await setup();
    const t = await newThread(a);
    await ctx.db.query(`update discuss_threads set last_activity_at = now() - interval '1 day'`);
    await b.post(`/api/discuss/threads/${t.id}/comments`, { body: 'hi' });
    const row = await ctx.db.one('select last_activity_at from discuss_threads');
    assert.ok(Date.now() - new Date(row.last_activity_at).getTime() < 5000);
  });

  test('rate limits per user: 5 threads/hour, 30 comments/hour', async () => {
    const { a, b } = await setup();
    for (let i = 0; i < 5; i++) assert.equal((await a.post('/api/discuss/threads', { title: `Thread ${i}`, body: 'x' })).status, 201);
    const blocked = await a.post('/api/discuss/threads', { title: 'One too many', body: 'x' });
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.error.code, 'rate_limited');
    const t = await newThread(b, 'Host thread');
    for (let i = 0; i < 30; i++) assert.equal((await b.post(`/api/discuss/threads/${t.id}/comments`, { body: `c${i}` })).status, 201);
    assert.equal((await b.post(`/api/discuss/threads/${t.id}/comments`, { body: 'c31' })).status, 429);
  });
});

describe('deleting and moderation (post-moderation)', () => {
  test('authors delete their own posts; others cannot (404); deleted comments lose their body and author', async () => {
    const { a, b } = await setup();
    const t = await newThread(a);
    const c1 = (await b.post(`/api/discuss/threads/${t.id}/comments`, { body: 'secret opinion' })).body.comment;
    const c2 = (await a.post(`/api/discuss/threads/${t.id}/comments`, { body: 'reply', parent_id: c1.id })).body.comment;

    assert.equal((await a.del(`/api/discuss/comments/${c1.id}`)).status, 404, "not someone else's comment");
    assert.equal((await client(ctx.app).del(`/api/discuss/comments/${c1.id}`)).status, 401);
    assert.equal((await b.del(`/api/discuss/comments/${c1.id}`)).status, 204);
    assert.equal((await b.del(`/api/discuss/comments/${c1.id}`)).status, 204, 'idempotent');

    const view = (await client(ctx.app).get(`/api/discuss/threads/${t.id}`)).body;
    const shown = view.comments.find((c) => c.id === c1.id);
    assert.equal(shown.status, 'deleted');
    assert.equal(shown.body, null);
    assert.equal(shown.author.name, 'Deleted user');
    assert.ok(!JSON.stringify(view).includes('secret opinion'));
    assert.equal(view.comments.find((c) => c.id === c2.id).body, 'reply', 'children stay');
    assert.equal(view.thread.reply_count, 1, 'deleted comments are not counted');

    assert.equal((await b.del(`/api/discuss/threads/${t.id}`)).status, 404);
    assert.equal((await a.del(`/api/discuss/threads/${t.id}`)).status, 204);
    assert.equal((await client(ctx.app).get(`/api/discuss/threads/${t.id}`)).status, 404);
    assert.equal((await client(ctx.app).get('/api/discuss/threads')).body.total, 0);
  });

  test('admins can remove any post; a removed thread is 404 for the public but readable by admins', async () => {
    const { a, b, admin, anon } = await setup();
    const t = await newThread(a, 'Bad thread', 'bad content');
    const c = (await b.post(`/api/discuss/threads/${t.id}/comments`, { body: 'bad comment' })).body.comment;
    assert.equal((await admin.del(`/api/discuss/comments/${c.id}`)).status, 204);
    const row = await ctx.db.one('select status, status_by from discuss_comments');
    assert.equal(row.status, 'removed');
    assert.ok(row.status_by);
    assert.equal((await anon.get(`/api/discuss/threads/${t.id}`)).body.comments[0].body, null);

    assert.equal((await admin.del(`/api/discuss/threads/${t.id}`)).status, 204);
    assert.equal((await anon.get(`/api/discuss/threads/${t.id}`)).status, 404);
    assert.equal((await admin.get(`/api/discuss/threads/${t.id}`)).status, 200);
    // and nobody can reply to or report a removed thread
    assert.equal((await b.post(`/api/discuss/threads/${t.id}/comments`, { body: 'x' })).status, 404);
    assert.equal((await b.post('/api/discuss/reports', { target_type: 'thread', target_id: t.id })).status, 404);
  });

  test('replying to a removed comment is refused', async () => {
    const { a, b, admin } = await setup();
    const t = await newThread(a);
    const c = (await b.post(`/api/discuss/threads/${t.id}/comments`, { body: 'x' })).body.comment;
    await admin.del(`/api/discuss/comments/${c.id}`);
    const r = await a.post(`/api/discuss/threads/${t.id}/comments`, { body: 'reply', parent_id: c.id });
    assert.equal(r.status, 400);
  });
});

describe('reports', () => {
  test('members report posts; reporting is idempotent and validated; anonymous cannot report', async () => {
    const { a, b, anon } = await setup();
    const t = await newThread(a);
    const c = (await a.post(`/api/discuss/threads/${t.id}/comments`, { body: 'rude' })).body.comment;
    assert.equal((await anon.post('/api/discuss/reports', { target_type: 'comment', target_id: c.id })).status, 401);
    for (let i = 0; i < 3; i++) {
      const r = await b.post('/api/discuss/reports', { target_type: 'comment', target_id: c.id, reason: 'Abusive' });
      assert.equal(r.status, 201);
      assert.deepEqual(r.body, { ok: true });
    }
    assert.equal((await ctx.db.one('select count(*)::int as n from reports')).n, 1);
    assert.equal((await b.post('/api/discuss/reports', { target_type: 'thread', target_id: t.id })).status, 201);
    assert.equal((await ctx.db.one('select count(*)::int as n from reports')).n, 2);

    assert.equal((await b.post('/api/discuss/reports', { target_type: 'comment', target_id: 99999 })).status, 404);
    assert.equal((await b.post('/api/discuss/reports', { target_type: 'user', target_id: 1 })).status, 400);
    assert.equal((await b.post('/api/discuss/reports', { target_type: 'thread', target_id: t.id, reason: 'x'.repeat(501) })).status, 400);
  });
});
