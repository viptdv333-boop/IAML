// Server-side sessions. The cookie holds a random 256-bit token; the DB stores only its SHA-256.
import { createHash, randomBytes } from 'node:crypto';
import { forbidden, unauthenticated } from '../errors.js';

export const COOKIE = 'iaml_sid';
const TTL_MS = 30 * 24 * 3600 * 1000;     // sliding 30 days
const TOUCH_AFTER_MS = 10 * 60 * 1000;    // refresh last_seen/expiry at most every 10 min
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export const hashToken = (token) => createHash('sha256').update(token).digest();

function cookieOptions(config, maxAgeSec = TTL_MS / 1000) {
  return { httpOnly: true, sameSite: 'lax', secure: config.secureCookies, path: '/', maxAge: maxAgeSec };
}

export default async function sessionPlugin(app) {
  const { config, db } = app;
  app.decorateRequest('user', null);
  app.decorateRequest('sessionId', null);

  /** Create a session for the user and set the cookie on the reply. */
  app.decorate('createSession', async (userId, req, reply) => {
    // logging in again from the same browser replaces its previous session (no stale sessions pile up)
    if (req.sessionId) await db.query('delete from sessions where id = $1', [req.sessionId]);
    const token = randomBytes(32).toString('base64url');
    await db.query(
      `insert into sessions (id, user_id, expires_at, ip, user_agent)
       values ($1, $2, now() + interval '30 days', $3, $4)`,
      [hashToken(token), userId, req.ip || null, String(req.headers['user-agent'] || '').slice(0, 300) || null],
    );
    await db.query('update users set last_login_at = now() where id = $1', [userId]);
    reply.setCookie(COOKIE, token, cookieOptions(config));
  });

  /** End the current session (cookie + row). */
  app.decorate('destroySession', async (req, reply) => {
    if (req.sessionId) await db.query('delete from sessions where id = $1', [req.sessionId]);
    reply.clearCookie(COOKIE, { path: '/' });
  });

  /** Revoke every session of a user (optionally keeping one). */
  app.decorate('revokeSessions', async (userId, exceptSessionId = null) => {
    await db.query('delete from sessions where user_id = $1 and ($2::bytea is null or id <> $2)', [userId, exceptSessionId]);
  });

  app.addHook('onRequest', async (req, reply) => {
    if (!req.routeOptions?.url?.startsWith('/api/')) return; // static assets and 404s never touch the DB
    const token = req.cookies?.[COOKIE];
    if (!token || !TOKEN_RE.test(token)) return;
    const id = hashToken(token);
    const row = await db.one(
      `select s.last_seen_at, u.id, u.email, u.first_name, u.last_name, u.workplace, u.avatar_file, u.role, u.lang,
              u.email_verified_at, u.created_at
         from sessions s join users u on u.id = s.user_id
        where s.id = $1 and s.expires_at > now() and u.disabled_at is null`,
      [id],
    );
    if (!row) { reply.clearCookie(COOKIE, { path: '/' }); return; }
    req.user = { ...row, verified: !!row.email_verified_at };
    req.sessionId = id;
    if (Date.now() - new Date(row.last_seen_at).getTime() > TOUCH_AFTER_MS) {
      await db.query(`update sessions set last_seen_at = now(), expires_at = now() + interval '30 days' where id = $1`, [id]);
      reply.setCookie(COOKIE, token, cookieOptions(config));
    }
  });

  /** preHandler: any logged-in, verified user. */
  app.decorate('requireUser', async (req) => {
    if (!req.user) throw unauthenticated();
    if (!req.user.verified) throw forbidden('Please confirm your e-mail first.', 'email_not_verified');
  });

  /** preHandler: administrators only. */
  app.decorate('requireAdmin', async (req) => {
    if (!req.user) throw unauthenticated();
    if (req.user.role !== 'admin') throw forbidden('Administrator access required.');
  });
}
