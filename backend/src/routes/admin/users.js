// Members, Mongolist subscribers (summary + CSV), and the contact inbox (docs/API.md §5).
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { ValidationError, conflict, forbidden, notFound } from '../../errors.js';
import { audit } from '../../lib/audit.js';
import { avatarUrl } from '../../lib/dto.js';
import { idParam, likePattern, paging, validate, v } from '../../lib/validate.js';
import { ADMIN_LOCK } from '../me.js';

const TOPICS = ['news', 'events', 'publications', 'participants', 'discuss'];
const PATCH = { role: v.enum(['member', 'admin']), disabled: v.bool() };
const MSG_PATCH = { is_read: v.bool() };

const userItem = (r) => ({
  id: r.id,
  email: r.email,
  first_name: r.first_name,
  last_name: r.last_name,
  workplace: r.workplace,
  role: r.role,
  lang: r.lang,
  email_verified: !!r.email_verified_at,
  disabled: !!r.disabled_at,
  avatar_url: avatarUrl(r.avatar_file),
  created_at: r.created_at,
  last_login_at: r.last_login_at,
});

/** Spreadsheet-safe CSV cell (neutralises =, +, -, @ formulas). */
const csvCell = (value) => {
  let s = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export default async function userRoutes(app) {
  const { db, config } = app;

  // ───────────── members ─────────────
  app.get('/api/admin/users', async (req) => {
    const { limit, offset } = paging(req.query, { max: 200, def: 50 });
    const params = [];
    const where = [];
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q) {
      params.push(likePattern(q));
      where.push(`(email ilike $${params.length} or first_name ilike $${params.length} or last_name ilike $${params.length} or workplace ilike $${params.length})`);
    }
    if (req.query.role === 'admin' || req.query.role === 'member') {
      params.push(req.query.role);
      where.push(`role = $${params.length}::user_role`);
    }
    const w = where.length ? `where ${where.join(' and ')}` : '';
    const [rows, total] = await Promise.all([
      db.many(`select * from users ${w} order by created_at desc limit $${params.length + 1} offset $${params.length + 2}`, [...params, limit, offset]),
      db.one(`select count(*)::int as n from users ${w}`, params),
    ]);
    return { items: rows.map(userItem), total: total.n };
  });

  async function otherActiveAdmins(tx, exceptId) {
    return (await tx.one(`select count(*)::int as n from users where role = 'admin' and disabled_at is null and id <> $1`, [exceptId])).n;
  }

  app.patch('/api/admin/users/:id', async (req) => {
    const id = req.params.id;
    if (!/^[0-9a-f-]{36}$/.test(id)) throw notFound();
    const data = validate(PATCH, req.body, { partial: true });
    if (!Object.keys(data).length) throw new ValidationError({ _: 'Nothing to update.' });

    const row = await db.tx(async (tx) => {
      await tx.query('select pg_advisory_xact_lock($1)', [ADMIN_LOCK]);
      const u = await tx.one('select * from users where id = $1 for update', [id]);
      if (!u) throw notFound();
      if (data.role === 'admin' && !u.email_verified_at) throw conflict('Only accounts with a confirmed e-mail address can become administrators.');
      const demoting = data.role === 'member' && u.role === 'admin';
      const disabling = data.disabled === true && !u.disabled_at;
      if (id === req.user.id && (demoting || disabling)) throw forbidden('You cannot demote or disable your own account.');
      if ((demoting || (disabling && u.role === 'admin')) && (await otherActiveAdmins(tx, id)) === 0) {
        throw conflict('This is the last active administrator.');
      }
      if (data.role !== undefined) await tx.query('update users set role = $2 where id = $1', [id, data.role]);
      if (data.disabled !== undefined) {
        await tx.query('update users set disabled_at = case when $2 then coalesce(disabled_at, now()) else null end where id = $1', [id, data.disabled]);
        if (data.disabled) await tx.query('delete from sessions where user_id = $1', [id]);
      }
      await audit(tx, req.user.id, 'update', 'user', id, { email: u.email, ...data });
      return tx.one('select * from users where id = $1', [id]);
    });
    return { item: userItem(row) };
  });

  app.delete('/api/admin/users/:id', async (req, reply) => {
    const id = req.params.id;
    if (!/^[0-9a-f-]{36}$/.test(id)) throw notFound();
    if (id === req.user.id) throw forbidden('You cannot delete your own account here — use your account page.');
    const avatar = await db.tx(async (tx) => {
      await tx.query('select pg_advisory_xact_lock($1)', [ADMIN_LOCK]);
      const u = await tx.one('select id, email, role, avatar_file, disabled_at from users where id = $1 for update', [id]);
      if (!u) throw notFound();
      if (u.role === 'admin' && !u.disabled_at && (await otherActiveAdmins(tx, id)) === 0) throw conflict('This is the last active administrator.');
      await tx.query('delete from users where id = $1', [id]);
      await audit(tx, req.user.id, 'delete', 'user', id, { email: u.email });
      return u.avatar_file;
    });
    if (avatar && /^[0-9a-f-]{36}\.webp$/.test(avatar)) {
      try { await unlink(path.join(config.uploadsDir, 'avatars', avatar)); } catch { /* already gone */ }
    }
    return reply.code(204).send();
  });

  // ───────────── subscribers ─────────────
  app.get('/api/admin/subscribers', async () => {
    const rows = await db.many(
      `select sp.topic, sp.frequency, count(*)::int as n
         from subscription_prefs sp join users u on u.id = sp.user_id
        where sp.enabled and u.disabled_at is null and u.email_verified_at is not null
        group by sp.topic, sp.frequency`,
    );
    const summary = Object.fromEntries(TOPICS.map((t) => [t, { instant: 0, daily: 0, weekly: 0 }]));
    for (const r of rows) summary[r.topic][r.frequency] = r.n;
    const total = await db.one(
      `select count(distinct sp.user_id)::int as n from subscription_prefs sp join users u on u.id = sp.user_id
        where sp.enabled and u.disabled_at is null and u.email_verified_at is not null`,
    );
    return { summary, total_users: total.n };
  });

  app.get('/api/admin/subscribers.csv', async (req, reply) => {
    const topic = TOPICS.includes(req.query.topic) ? req.query.topic : null;
    const rows = await db.many(
      `select u.email, u.first_name, u.last_name, sp.topic, sp.frequency
         from subscription_prefs sp join users u on u.id = sp.user_id
        where sp.enabled and u.disabled_at is null and u.email_verified_at is not null and ($1::sub_topic is null or sp.topic = $1::sub_topic)
        order by sp.topic, u.email`,
      [topic],
    );
    const csv = ['email,first_name,last_name,topic,frequency', ...rows.map((r) => [r.email, r.first_name, r.last_name, r.topic, r.frequency].map(csvCell).join(','))].join('\r\n') + '\r\n';
    return reply
      .type('text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="mongolist-subscribers${topic ? `-${topic}` : ''}.csv"`)
      .send('﻿' + csv);
  });

  // ───────────── inbox ─────────────
  app.get('/api/admin/messages', async (req) => {
    const { limit, offset } = paging(req.query, { max: 200, def: 50 });
    const unreadOnly = req.query.unread === '1' || req.query.unread === 'true';
    const [rows, total, unread] = await Promise.all([
      db.many(
        `select id, name, email, subject, message, source, is_read, created_at from contact_messages
          where ($1::boolean is false or not is_read) order by created_at desc, id desc limit $2 offset $3`,
        [unreadOnly, limit, offset],
      ),
      db.one('select count(*)::int as n from contact_messages where ($1::boolean is false or not is_read)', [unreadOnly]),
      db.one('select count(*)::int as n from contact_messages where not is_read'),
    ]);
    return { items: rows, total: total.n, unread: unread.n };
  });

  app.patch('/api/admin/messages/:id', async (req) => {
    const id = idParam(req.params.id);
    const { is_read } = validate(MSG_PATCH, req.body);
    const row = await db.one(
      'update contact_messages set is_read = $2 where id = $1 returning id, name, email, subject, message, source, is_read, created_at',
      [id, is_read],
    );
    if (!row) throw notFound();
    return { item: row };
  });

  app.delete('/api/admin/messages/:id', async (req, reply) => {
    const id = idParam(req.params.id);
    const r = await db.query('delete from contact_messages where id = $1', [id]);
    if (!r.rowCount) throw notFound();
    await audit(db, req.user.id, 'delete', 'message', id);
    return reply.code(204).send();
  });
}
