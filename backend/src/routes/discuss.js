// Discuss: Reddit-style threads with nested replies, post-moderation, user reports (docs/API.md §4).
import { ValidationError, notFound, rateLimited } from '../errors.js';
import { toAuthor } from '../lib/dto.js';
import { snippet } from '../lib/text.js';
import { idParam, paging, validate, v } from '../lib/validate.js';

const THREAD = { title: v.str({ min: 3, max: 200 }), body: v.str({ min: 1, max: 5000, multiline: true }) };
const COMMENT = { body: v.str({ min: 1, max: 3000, multiline: true }), parent_id: v.int({ min: 1 }).optional(null) };
const REPORT = {
  target_type: v.enum(['thread', 'comment']),
  target_id: v.int({ min: 1 }),
  reason: v.str({ max: 500, multiline: true }).optional(null),
};

const MAX_DEPTH = 6;
const THREADS_PER_HOUR = 5;
const COMMENTS_PER_HOUR = 30;

const AUTHOR_COLS = `u.id as author_id, u.first_name as author_first_name, u.last_name as author_last_name,
                     u.avatar_file as author_avatar_file, u.role as author_role`;

export default async function discussRoutes(app) {
  const { db } = app;
  const auth = { preHandler: app.requireUser };

  const REPLY_COUNT = `(select count(*)::int from discuss_comments c where c.thread_id = t.id and c.status = 'visible')`;

  const threadDto = (row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    author: toAuthor(row),
    created_at: row.created_at,
    reply_count: row.reply_count,
  });

  const commentDto = (row) => {
    const hidden = row.status !== 'visible';
    return {
      id: row.id,
      parent_id: row.parent_id,
      depth: row.depth,
      author: hidden ? toAuthor({}) : toAuthor(row), // removed/deleted comments don't show who wrote them
      body: hidden ? null : row.body,
      status: row.status,
      created_at: row.created_at,
    };
  };

  async function loadThread(id) {
    return db.one(
      `select t.*, ${AUTHOR_COLS}, ${REPLY_COUNT} as reply_count
         from discuss_threads t left join users u on u.id = t.author_id where t.id = $1`,
      [id],
    );
  }

  async function assertRate(runner, table, userId, max, what) {
    const r = await runner.one(`select count(*)::int as n from ${table} where author_id = $1 and created_at > now() - interval '1 hour'`, [userId]);
    if (r.n >= max) throw rateLimited(`You are posting too fast — at most ${max} ${what} per hour. Please try again later.`, 900);
  }

  /** Count-then-insert must be atomic per user, or parallel requests all pass the hourly limit. */
  const withUserLock = (userId, fn) =>
    db.tx(async (tx) => {
      await tx.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [`discuss:${userId}`]);
      return fn(tx);
    });

  // ───────────── read ─────────────
  app.get('/api/discuss/threads', async (req) => {
    const { limit, offset } = paging(req.query, { max: 50, def: 20 });
    const [rows, total] = await Promise.all([
      db.many(
        `select t.id, t.title, t.body, t.created_at, t.last_activity_at, ${AUTHOR_COLS}, ${REPLY_COUNT} as reply_count
           from discuss_threads t left join users u on u.id = t.author_id
          where t.status = 'visible'
          order by t.created_at desc, t.id desc limit $1 offset $2`,
        [limit, offset],
      ),
      db.one(`select count(*)::int as n from discuss_threads where status = 'visible'`),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        title: r.title,
        snippet: snippet(r.body, 200),
        author: toAuthor(r),
        created_at: r.created_at,
        last_activity_at: r.last_activity_at,
        reply_count: r.reply_count,
      })),
      total: total.n,
    };
  });

  app.get('/api/discuss/threads/:id', async (req) => {
    const id = idParam(req.params.id);
    const thread = await loadThread(id);
    if (!thread || (thread.status !== 'visible' && req.user?.role !== 'admin')) throw notFound('Thread not found.');
    const comments = await db.many(
      `select c.id, c.parent_id, c.depth, c.body, c.status, c.created_at, ${AUTHOR_COLS}
         from discuss_comments c left join users u on u.id = c.author_id
        where c.thread_id = $1 order by c.created_at, c.id`,
      [id],
    );
    return { thread: threadDto(thread), comments: comments.map(commentDto) };
  });

  // ───────────── write ─────────────
  app.post('/api/discuss/threads', auth, async (req, reply) => {
    const body = validate(THREAD, req.body);
    const row = await withUserLock(req.user.id, async (tx) => {
      await assertRate(tx, 'discuss_threads', req.user.id, THREADS_PER_HOUR, 'new questions');
      return tx.one('insert into discuss_threads (author_id, title, body) values ($1, $2, $3) returning id', [req.user.id, body.title, body.body]);
    });
    return reply.code(201).send({ thread: threadDto(await loadThread(row.id)) });
  });

  app.post('/api/discuss/threads/:id/comments', auth, async (req, reply) => {
    const id = idParam(req.params.id);
    const body = validate(COMMENT, req.body);
    const thread = await db.one(`select id, status from discuss_threads where id = $1`, [id]);
    if (!thread || thread.status !== 'visible') throw notFound('Thread not found.');

    let depth = 0;
    if (body.parent_id) {
      const parent = await db.one('select id, depth, status from discuss_comments where id = $1 and thread_id = $2', [body.parent_id, id]);
      if (!parent || parent.status !== 'visible') throw new ValidationError({ parent_id: 'The comment you are replying to no longer exists.' });
      depth = parent.depth + 1;
      if (depth > MAX_DEPTH) throw new ValidationError({ parent_id: `Replies can be nested at most ${MAX_DEPTH} levels deep.` });
    }
    const row = await withUserLock(req.user.id, async (tx) => {
      await assertRate(tx, 'discuss_comments', req.user.id, COMMENTS_PER_HOUR, 'comments');
      const c = await tx.one(
        `insert into discuss_comments (thread_id, parent_id, depth, author_id, body) values ($1, $2, $3, $4, $5) returning id`,
        [id, body.parent_id, depth, req.user.id, body.body],
      );
      await tx.query('update discuss_threads set last_activity_at = now() where id = $1', [id]);
      return c;
    });
    const full = await db.one(
      `select c.id, c.parent_id, c.depth, c.body, c.status, c.created_at, ${AUTHOR_COLS}
         from discuss_comments c left join users u on u.id = c.author_id where c.id = $1`,
      [row.id],
    );
    return reply.code(201).send({ comment: commentDto(full) });
  });

  // soft delete: authors "delete", admins "remove" (post-moderation); bodies stay in the DB for the audit trail
  async function softDelete(table, id, user) {
    const row = await db.one(`select author_id, status from ${table} where id = $1`, [id]);
    if (!row) throw notFound();
    const isAdmin = user.role === 'admin';
    if (row.author_id !== user.id && !isAdmin) throw notFound(); // don't reveal other people's posts
    if (row.status !== 'visible') return;
    await db.query(
      `update ${table} set status = $2::content_status, status_by = $3, status_at = now(), status_reason = $4 where id = $1`,
      [id, row.author_id === user.id ? 'deleted' : 'removed', user.id, row.author_id === user.id ? null : 'Removed by an administrator'],
    );
  }

  app.delete('/api/discuss/threads/:id', auth, async (req, reply) => {
    await softDelete('discuss_threads', idParam(req.params.id), req.user);
    return reply.code(204).send();
  });

  app.delete('/api/discuss/comments/:id', auth, async (req, reply) => {
    await softDelete('discuss_comments', idParam(req.params.id), req.user);
    return reply.code(204).send();
  });

  app.post('/api/discuss/reports', { ...auth, config: { rateLimit: { max: 30, timeWindow: '1 hour' } } }, async (req, reply) => {
    const body = validate(REPORT, req.body);
    const table = body.target_type === 'thread' ? 'discuss_threads' : 'discuss_comments';
    const target = await db.one(`select id, status from ${table} where id = $1`, [body.target_id]);
    if (!target || target.status !== 'visible') throw notFound('That post no longer exists.');
    await db.query(
      `insert into reports (target_type, target_id, reporter_id, reason) values ($1, $2, $3, $4)
       on conflict (target_type, target_id, reporter_id) where reporter_id is not null do nothing`,
      [body.target_type, body.target_id, req.user.id, body.reason],
    );
    return reply.code(201).send({ ok: true });
  });
}
