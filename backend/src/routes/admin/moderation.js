// Discuss moderation: reports queue, removing / restoring threads and comments (docs/API.md §5).
import { ValidationError, notFound } from '../../errors.js';
import { audit } from '../../lib/audit.js';
import { fullName, toAuthorAdmin } from '../../lib/dto.js';
import { idParam, likePattern, paging, validate, v } from '../../lib/validate.js';

const AUTHOR_COLS = `u.id as author_id, u.first_name as author_first_name, u.last_name as author_last_name,
                     u.avatar_file as author_avatar_file, u.role as author_role, u.email as author_email, u.workplace as author_workplace`;

const STATUS = { status: v.enum(['visible', 'removed']), reason: v.str({ max: 500, multiline: true }).optional(null) };
const RESOLVE = { action: v.enum(['remove', 'dismiss']) };

const person = (id, first, last, email) => (id ? { id, name: fullName(first, last), email } : null);

export default async function moderationRoutes(app) {
  const { db } = app;

  async function reportItems(rows) {
    const threadIds = rows.filter((r) => r.target_type === 'thread').map((r) => r.target_id);
    const commentIds = rows.filter((r) => r.target_type === 'comment').map((r) => r.target_id);
    const [threads, comments] = await Promise.all([
      threadIds.length
        ? db.many(
            `select t.id, t.title, t.body, t.status, ${AUTHOR_COLS} from discuss_threads t left join users u on u.id = t.author_id where t.id = any($1::bigint[])`,
            [threadIds],
          )
        : [],
      commentIds.length
        ? db.many(
            `select c.id, c.thread_id, th.title, c.body, c.status, ${AUTHOR_COLS}
               from discuss_comments c join discuss_threads th on th.id = c.thread_id left join users u on u.id = c.author_id
              where c.id = any($1::bigint[])`,
            [commentIds],
          )
        : [],
    ]);
    const tMap = new Map(threads.map((t) => [t.id, t]));
    const cMap = new Map(comments.map((c) => [c.id, c]));
    return rows.map((r) => {
      let target = null;
      if (r.target_type === 'thread') {
        const t = tMap.get(r.target_id);
        if (t) target = { thread_id: t.id, title: t.title, body: t.body, status: t.status, author: person(t.author_id, t.author_first_name, t.author_last_name, t.author_email) };
      } else {
        const c = cMap.get(r.target_id);
        if (c) target = { thread_id: c.thread_id, comment_id: c.id, title: c.title, body: c.body, status: c.status, author: person(c.author_id, c.author_first_name, c.author_last_name, c.author_email) };
      }
      return {
        id: r.id,
        target_type: r.target_type,
        target_id: r.target_id,
        reason: r.reason,
        status: r.status,
        created_at: r.created_at,
        resolved_at: r.resolved_at,
        reporter: person(r.reporter_id, r.reporter_first_name, r.reporter_last_name, r.reporter_email),
        target,
      };
    });
  }

  const REPORT_SELECT = `r.id, r.target_type, r.target_id, r.reason, r.status, r.created_at, r.resolved_at,
       ru.id as reporter_id, ru.first_name as reporter_first_name, ru.last_name as reporter_last_name, ru.email as reporter_email`;

  app.get('/api/admin/reports', async (req) => {
    const { limit, offset } = paging(req.query, { max: 200, def: 50 });
    const status = ['open', 'resolved', 'dismissed', 'all'].includes(req.query.status) ? req.query.status : 'open';
    const [rows, total] = await Promise.all([
      db.many(
        `select ${REPORT_SELECT} from reports r left join users ru on ru.id = r.reporter_id
          where ($1 = 'all' or r.status = $1::report_status) order by r.created_at desc, r.id desc limit $2 offset $3`,
        [status, limit, offset],
      ),
      db.one(`select count(*)::int as n from reports r where ($1 = 'all' or r.status = $1::report_status)`, [status]),
    ]);
    return { items: await reportItems(rows), total: total.n };
  });

  app.post('/api/admin/reports/:id/resolve', async (req) => {
    const id = idParam(req.params.id);
    const { action } = validate(RESOLVE, req.body);
    await db.tx(async (tx) => {
      const report = await tx.one('select id, target_type, target_id, status from reports where id = $1 for update', [id]);
      if (!report) throw notFound();
      if (action === 'dismiss') {
        await tx.query(`update reports set status = 'dismissed', resolved_by = $2, resolved_at = now() where id = $1`, [id, req.user.id]);
      } else {
        const table = report.target_type === 'thread' ? 'discuss_threads' : 'discuss_comments';
        await tx.query(
          `update ${table} set status = 'removed', status_by = $2, status_at = now(), status_reason = 'Removed after a report'
            where id = $1 and status = 'visible'`,
          [report.target_id, req.user.id],
        );
        await tx.query(
          `update reports set status = 'resolved', resolved_by = $3, resolved_at = now()
            where target_type = $1 and target_id = $2 and status = 'open'`,
          [report.target_type, report.target_id, req.user.id],
        );
      }
      await audit(tx, req.user.id, `report.${action}`, 'report', id, { target: `${report.target_type}:${report.target_id}` });
    });
    const rows = await db.many(`select ${REPORT_SELECT} from reports r left join users ru on ru.id = r.reporter_id where r.id = $1`, [id]);
    return { item: (await reportItems(rows))[0] };
  });

  // ───────────── threads & comments ─────────────
  app.get('/api/admin/discuss/threads', async (req) => {
    const { limit, offset } = paging(req.query, { max: 200, def: 50 });
    const status = ['visible', 'removed', 'deleted', 'all'].includes(req.query.status) ? req.query.status : 'all';
    const params = [status];
    let search = '';
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q) {
      params.push(likePattern(q));
      search = `and (t.title ilike $${params.length} or t.body ilike $${params.length} or u.email ilike $${params.length} or (u.first_name || ' ' || u.last_name) ilike $${params.length})`;
    }
    const where = `where ($1 = 'all' or t.status = $1::content_status) ${search}`;
    const [rows, total] = await Promise.all([
      db.many(
        `select t.id, t.title, t.body, t.status, t.status_reason, t.created_at, t.last_activity_at, ${AUTHOR_COLS},
                (select count(*)::int from discuss_comments c where c.thread_id = t.id and c.status = 'visible') as reply_count,
                (select count(*)::int from reports r where r.status = 'open'
                   and ((r.target_type = 'thread' and r.target_id = t.id)
                     or (r.target_type = 'comment' and r.target_id in (select id from discuss_comments where thread_id = t.id)))) as reports_open
           from discuss_threads t left join users u on u.id = t.author_id
           ${where} order by t.created_at desc, t.id desc limit $${params.length + 1} offset $${params.length + 2}`,
        [...params, limit, offset],
      ),
      db.one(`select count(*)::int as n from discuss_threads t left join users u on u.id = t.author_id ${where}`, params),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id, title: r.title, body: r.body, status: r.status, status_reason: r.status_reason,
        author: toAuthorAdmin(r), created_at: r.created_at, last_activity_at: r.last_activity_at,
        reply_count: r.reply_count, reports_open: r.reports_open,
      })),
      total: total.n,
    };
  });

  app.get('/api/admin/discuss/threads/:id', async (req) => {
    const id = idParam(req.params.id);
    const t = await db.one(
      `select t.id, t.title, t.body, t.status, t.status_reason, t.created_at, ${AUTHOR_COLS}
         from discuss_threads t left join users u on u.id = t.author_id where t.id = $1`,
      [id],
    );
    if (!t) throw notFound();
    const comments = await db.many(
      `select c.id, c.parent_id, c.depth, c.body, c.status, c.status_reason, c.created_at, ${AUTHOR_COLS}
         from discuss_comments c left join users u on u.id = c.author_id where c.thread_id = $1 order by c.created_at, c.id`,
      [id],
    );
    return {
      thread: { id: t.id, title: t.title, body: t.body, status: t.status, status_reason: t.status_reason, author: toAuthorAdmin(t), created_at: t.created_at },
      comments: comments.map((c) => ({
        id: c.id, parent_id: c.parent_id, depth: c.depth, body: c.body, status: c.status, status_reason: c.status_reason,
        author: toAuthorAdmin(c), created_at: c.created_at,
      })),
    };
  });

  async function setStatus(table, kind, req) {
    const id = idParam(req.params.id);
    const { status, reason } = validate(STATUS, req.body);
    await db.tx(async (tx) => {
      const row = await tx.one(`select id from ${table} where id = $1 for update`, [id]);
      if (!row) throw notFound();
      if (status === 'visible') {
        await tx.query(`update ${table} set status = 'visible', status_by = null, status_at = null, status_reason = null where id = $1`, [id]);
      } else {
        await tx.query(`update ${table} set status = 'removed', status_by = $2, status_at = now(), status_reason = $3 where id = $1`, [id, req.user.id, reason]);
      }
      await audit(tx, req.user.id, `${kind}.${status}`, kind, id, { reason });
    });
    return { ok: true };
  }

  app.post('/api/admin/discuss/threads/:id/status', (req) => setStatus('discuss_threads', 'thread', req));
  app.post('/api/admin/discuss/comments/:id/status', (req) => setStatus('discuss_comments', 'comment', req));
}
