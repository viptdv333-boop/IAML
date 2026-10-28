// The logged-in member's own account: profile, avatar, password, deletion, Mongolist subscriptions (docs/API.md §3).
import { randomUUID } from 'node:crypto';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { HttpError, ValidationError, conflict } from '../errors.js';
import { toSelf } from '../lib/dto.js';
import { hashPassword, verifyPassword } from '../lib/crypto.js';
import { validate, v } from '../lib/validate.js';
import { checkPasswordStrength, passwordRule } from './auth.js';

sharp.cache(false);

/** Advisory-lock key shared by every code path that can remove / demote / disable an administrator. */
export const ADMIN_LOCK = 727274003;

export const TOPICS = ['news', 'events', 'publications', 'participants', 'discuss'];
const DEFAULT_PREFS = {
  news: { enabled: true, frequency: 'daily' },
  events: { enabled: true, frequency: 'daily' },
  publications: { enabled: true, frequency: 'daily' },
  participants: { enabled: false, frequency: 'weekly' },
  discuss: { enabled: false, frequency: 'daily' },
};

const PROFILE = {
  first_name: v.name(),
  last_name: v.name(),
  workplace: v.str({ max: 200 }),
  lang: v.enum(['en', 'mn']),
};
const PASSWORD = { current_password: v.str({ min: 1, max: 128, trim: false }), new_password: passwordRule() };
const DELETE_ME = { password: v.str({ min: 1, max: 128, trim: false }) };
const SUBS = {
  topics: v.array(
    v.object({
      topic: v.enum(TOPICS),
      enabled: v.bool(),
      frequency: v.enum(['instant', 'daily', 'weekly']).optional('daily'),
    }),
    { min: 1, max: 5 },
  ),
};

const isJpeg = (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
const isPng = (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
const isWebp = (b) => b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP';

export default async function meRoutes(app) {
  const { db, config } = app;
  const auth = { preHandler: app.requireUser };
  const avatarsDir = path.join(config.uploadsDir, 'avatars');

  const loadSelf = (id) =>
    db.one('select id, email, first_name, last_name, workplace, avatar_file, role, lang, created_at from users where id = $1', [id]);

  const removeAvatarFile = async (file) => {
    if (!file || !/^[0-9a-f-]{36}\.webp$/.test(file)) return;
    try { await unlink(path.join(avatarsDir, file)); } catch { /* already gone */ }
  };

  // ───────────── profile ─────────────
  app.patch('/api/me', auth, async (req) => {
    const data = validate(PROFILE, req.body, { partial: true });
    const keys = Object.keys(data);
    if (!keys.length) throw new ValidationError({ _: 'Nothing to update.' });
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    await db.query(`update users set ${sets} where id = $1`, [req.user.id, ...keys.map((k) => data[k])]);
    return { user: toSelf(await loadSelf(req.user.id)) };
  });

  // ───────────── avatar ─────────────
  app.post('/api/me/avatar', { ...auth, config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (req) => {
    if (!req.isMultipart()) throw new HttpError(415, 'unsupported_media_type', 'Send the image as multipart/form-data (field "avatar").');
    const part = await req.file();
    if (!part || part.fieldname !== 'avatar') throw new ValidationError({ avatar: 'is required' });
    const input = await part.toBuffer(); // throws FST_REQ_FILE_TOO_LARGE (→ 413) above 2 MB

    if (!isJpeg(input) && !isPng(input) && !isWebp(input)) {
      throw new HttpError(415, 'unsupported_media_type', 'Please upload a JPEG, PNG or WebP image.');
    }
    let webp;
    try {
      webp = await sharp(input, { limitInputPixels: 25_000_000, failOn: 'error' })
        .rotate()                                  // honour EXIF orientation, then metadata is dropped
        .resize(256, 256, { fit: 'cover' })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      throw new HttpError(415, 'unsupported_media_type', 'That file could not be read as an image.');
    }

    const file = `${randomUUID()}.webp`;
    await mkdir(avatarsDir, { recursive: true });
    const tmp = path.join(avatarsDir, `.${file}.tmp`);
    await writeFile(tmp, webp);
    await rename(tmp, path.join(avatarsDir, file));

    const old = await db.one('select avatar_file from users where id = $1', [req.user.id]);
    await db.query('update users set avatar_file = $2 where id = $1', [req.user.id, file]);
    await removeAvatarFile(old?.avatar_file);
    return { user: toSelf(await loadSelf(req.user.id)) };
  });

  app.delete('/api/me/avatar', auth, async (req) => {
    const old = await db.one('select avatar_file from users where id = $1', [req.user.id]);
    await db.query('update users set avatar_file = null where id = $1', [req.user.id]);
    await removeAvatarFile(old?.avatar_file);
    return { user: toSelf(await loadSelf(req.user.id)) };
  });

  // ───────────── password / delete account ─────────────
  app.post('/api/me/password', { ...auth, config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req, reply) => {
    const body = validate(PASSWORD, req.body);
    const row = await db.one('select password_hash, email from users where id = $1', [req.user.id]);
    if (!(await verifyPassword(body.current_password, row.password_hash))) {
      throw new ValidationError({ current_password: 'is not correct' });
    }
    const weak = checkPasswordStrength(body.new_password, row.email);
    if (weak) throw new ValidationError({ new_password: weak });
    await db.query('update users set password_hash = $2 where id = $1', [req.user.id, await hashPassword(body.new_password)]);
    await app.revokeSessions(req.user.id, req.sessionId);
    return reply.code(204).send();
  });

  app.delete('/api/me', { ...auth, config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (req, reply) => {
    const body = validate(DELETE_ME, req.body);
    const row = await db.one('select password_hash, avatar_file, role from users where id = $1', [req.user.id]);
    if (!(await verifyPassword(body.password, row.password_hash))) throw new ValidationError({ password: 'is not correct' });
    await db.tx(async (tx) => {
      await tx.query('select pg_advisory_xact_lock($1)', [ADMIN_LOCK]); // serialises every "last administrator" decision
      const me = await tx.one('select role from users where id = $1 for update', [req.user.id]);
      if (!me) return;
      if (me.role === 'admin') {
        const others = await tx.one(`select count(*)::int as n from users where role = 'admin' and disabled_at is null and id <> $1`, [req.user.id]);
        if (others.n === 0) throw conflict('You are the only administrator. Promote someone else before deleting this account.');
      }
      await tx.query('delete from users where id = $1', [req.user.id]); // sessions, codes, subscriptions cascade; posts keep author_id = null
    });
    await removeAvatarFile(row.avatar_file);
    reply.clearCookie('iaml_sid', { path: '/' });
    return reply.code(204).send();
  });

  // ───────────── Mongolist subscriptions ─────────────
  async function readSubscriptions(userId) {
    const rows = await db.many('select topic, enabled, frequency from subscription_prefs where user_id = $1', [userId]);
    const byTopic = new Map(rows.map((r) => [r.topic, r]));
    const configured = rows.length > 0;
    return {
      configured,
      topics: TOPICS.map((topic) => {
        const r = byTopic.get(topic);
        if (r) return { topic, enabled: r.enabled, frequency: r.frequency };
        const d = DEFAULT_PREFS[topic];
        return { topic, enabled: configured ? false : d.enabled, frequency: d.frequency };
      }),
    };
  }

  app.get('/api/me/subscriptions', auth, async (req) => readSubscriptions(req.user.id));

  app.put('/api/me/subscriptions', auth, async (req) => {
    const { topics } = validate(SUBS, req.body);
    const incoming = new Map(topics.map((t) => [t.topic, t]));
    await db.tx(async (tx) => {
      const existing = new Set((await tx.many('select topic from subscription_prefs where user_id = $1', [req.user.id])).map((r) => r.topic));
      for (const topic of TOPICS) {
        const t = incoming.get(topic) ?? (existing.has(topic) ? null : { topic, enabled: false, frequency: DEFAULT_PREFS[topic].frequency });
        if (!t) continue;
        // a topic switched on starts from "now": no backlog e-mail
        await tx.query(
          `insert into subscription_prefs (user_id, topic, enabled, frequency, last_sent_at)
           values ($1, $2, $3, $4, now())
           on conflict (user_id, topic) do update
             set enabled = excluded.enabled,
                 frequency = excluded.frequency,
                 updated_at = now(),
                 last_sent_at = case when excluded.enabled and not subscription_prefs.enabled then now() else subscription_prefs.last_sent_at end`,
          [req.user.id, topic, t.enabled, t.frequency],
        );
      }
    });
    return readSubscriptions(req.user.id);
  });
}
