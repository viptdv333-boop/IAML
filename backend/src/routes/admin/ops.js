// Operations: dashboard counters, mail queue, audit trail, manual digest run (docs/API.md §5).
import { conflict, notFound } from '../../errors.js';
import { audit } from '../../lib/audit.js';
import { fullName } from '../../lib/dto.js';
import { idParam, paging, validate, v } from '../../lib/validate.js';

const DIGEST = { mode: v.enum(['all']).optional(null) };

export default async function opsRoutes(app) {
  const { db } = app;

  app.get('/api/admin/stats', async () =>
    db.one(
      `select
         (select count(*)::int from users) as users,
         (select count(*)::int from users where email_verified_at is not null) as users_verified,
         (select count(*)::int from users where role = 'admin') as admins,
         (select count(*)::int from news) as news,
         (select count(*)::int from events) as events,
         (select count(*)::int from publications) as publications,
         (select count(*)::int from discuss_threads where status = 'visible') as threads,
         (select count(*)::int from discuss_comments where status = 'visible') as comments,
         (select count(*)::int from reports where status = 'open') as reports_open,
         (select count(*)::int from contact_messages where not is_read) as messages_unread,
         (select count(*)::int from mail_outbox where status in ('queued', 'sending')) as mail_queued,
         (select count(*)::int from mail_outbox where status = 'failed') as mail_failed,
         (select count(distinct user_id)::int from subscription_prefs where enabled) as subscribers`,
    ));

  app.get('/api/admin/mail', async (req) => {
    const { limit, offset } = paging(req.query, { max: 200, def: 50 });
    const status = ['queued', 'sent', 'failed', 'all'].includes(req.query.status) ? req.query.status : 'all';
    const [rows, total] = await Promise.all([
      db.many(
        `select id, to_email, subject, purpose, status, attempts, last_error, created_at, sent_at
           from mail_outbox where ($1 = 'all' or status = $1::mail_status or ($1 = 'queued' and status = 'sending'))
          order by id desc limit $2 offset $3`,
        [status, limit, offset],
      ),
      db.one(`select count(*)::int as n from mail_outbox where ($1 = 'all' or status = $1::mail_status or ($1 = 'queued' and status = 'sending'))`, [status]),
    ]);
    return { items: rows, total: total.n };
  });

  app.post('/api/admin/mail/:id/retry', async (req) => {
    const id = idParam(req.params.id);
    const row = await db.one('select id, status, text_body from mail_outbox where id = $1', [id]);
    if (!row) throw notFound();
    if (row.status === 'sent') throw conflict('This message was already delivered.');
    if (row.text_body.startsWith('[removed')) throw conflict('The message body is no longer stored (one-time codes are removed), so it cannot be re-sent.');
    await db.query(`update mail_outbox set status = 'queued', attempts = 0, next_attempt_at = now(), last_error = null, locked_at = null where id = $1`, [id]);
    await audit(db, req.user.id, 'mail.retry', 'mail', id);
    return { ok: true };
  });

  app.get('/api/admin/audit', async (req) => {
    const { limit, offset } = paging(req.query, { max: 500, def: 100 });
    const [rows, total] = await Promise.all([
      db.many(
        `select a.id, a.action, a.entity, a.entity_id, a.meta, a.created_at, u.id as actor_id, u.first_name, u.last_name
           from audit_log a left join users u on u.id = a.actor_id order by a.id desc limit $1 offset $2`,
        [limit, offset],
      ),
      db.one('select count(*)::int as n from audit_log'),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        actor: r.actor_id ? { id: r.actor_id, name: fullName(r.first_name, r.last_name) } : null,
        action: r.action, entity: r.entity, entity_id: r.entity_id, meta: r.meta, created_at: r.created_at,
      })),
      total: total.n,
    };
  });

  app.post('/api/admin/jobs/digest', async (req) => {
    const { mode } = validate(DIGEST, req.body ?? {});
    const result = await app.jobs.runDigest({ force: mode === 'all' });
    await audit(db, req.user.id, 'job.digest', 'job', null, { mode: mode ?? 'due', queued: result.emails_queued });
    return { ok: true, emails_queued: result.emails_queued };
  });
}
