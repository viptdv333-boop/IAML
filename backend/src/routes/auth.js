// Registration, e-mail confirmation (one-time codes), login/logout, password reset (docs/API.md §3).
//
// Security notes (see the security review in the repository history):
//  * The password is bound to the person who proves control of the mailbox: `verify` takes the password and sets it
//    when the code is accepted, so whoever (mis)used /register for somebody else's address cannot keep access.
//  * Failed-attempt counters are written BEFORE the slow password check (reserve-then-verify), so parallel guesses
//    cannot slip past the limit; counters are keyed by e-mail and by the client's IPv6 /64 (or IPv4) bucket.
//  * Every failure of a code check answers the same way, and cheap checks run before any scrypt work.
import { normalizeIP } from '@fastify/rate-limit';
import { HttpError, ValidationError, badRequest, forbidden, rateLimited } from '../errors.js';
import { toSelf } from '../lib/dto.js';
import { dummyVerify, hashCode, hashPassword, newCode, safeEqual, verifyPassword } from '../lib/crypto.js';
import { validate, v } from '../lib/validate.js';
import { enqueueMail } from '../mail/outbox.js';
import { accountExistsMail, resetPasswordMail, verifyEmailMail } from '../mail/templates.js';

const CODE_TTL_MIN = 15;
const CODE_MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SEC = 60;
const MAX_CODES_PER_HOUR = 5;
const HOUR = 3_600_000;

const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890', 'qwertyui', 'qwerty123', 'qwertyuiop',
  'iloveyou', 'admin123', 'letmein123', 'welcome123', '11111111', '00000000', 'abc12345', 'iaml1234', 'mongolia',
]);

export const passwordRule = () =>
  v.str({ min: 8, max: 128, trim: false });

export function checkPasswordStrength(password, email) {
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return 'is too common — please choose another one';
  if (email && password.toLowerCase() === String(email).toLowerCase()) return 'must not be your e-mail address';
  return null;
}

const REGISTER = {
  first_name: v.name(),
  last_name: v.name(),
  workplace: v.str({ max: 200 }),
  email: v.email(),
  password: passwordRule(),
  lang: v.enum(['en', 'mn']).optional('en'),
  website: v.str({ max: 200 }).optional(''),
};
const VERIFY = { email: v.email(), code: v.str({ min: 6, max: 6 }), password: passwordRule() };
const RESEND = { email: v.email(), purpose: v.enum(['verify_email', 'reset_password']).optional('verify_email') };
const LOGIN = { email: v.email(), password: v.str({ min: 1, max: 128, trim: false }) };
const FORGOT = { email: v.email() };
const RESET = { email: v.email(), code: v.str({ min: 6, max: 6 }), password: passwordRule() };

const invalidCode = () => badRequest('invalid_code', 'That code is not correct or has expired. Please request a new one.');
const busy = () => rateLimited('The service is busy right now. Please try again later.', 600);

export default async function authRoutes(app) {
  const { db, config } = app;
  const secret = config.sessionSecret;
  const budget = app.budget;

  /** Client bucket for DB-backed throttles: IPv4 address, or the IPv6 /64 (an attacker owns a whole /64). */
  const ipKey = (req) => (req.ip ? normalizeIP(req.ip) : null);

  /**
   * Create and e-mail a one-time code. Silent no-op when the cool-down or the hourly cap applies
   * (the caller always answers the same way, so nothing leaks). Locks the user row so parallel calls
   * cannot issue several live codes.
   */
  async function issueCode(tx, user, purpose) {
    await tx.one('select id from users where id = $1 for update', [user.id]);
    const last = await tx.one(
      `select count(*) filter (where created_at > now() - interval '1 hour')::int as hourly,
              max(created_at) as last_at
         from email_codes where user_id = $1 and purpose = $2`,
      [user.id, purpose],
    );
    if (last.hourly >= MAX_CODES_PER_HOUR) return false;
    if (last.last_at && Date.now() - new Date(last.last_at).getTime() < RESEND_COOLDOWN_SEC * 1000) return false;

    const code = newCode();
    await tx.query(`update email_codes set consumed_at = now() where user_id = $1 and purpose = $2 and consumed_at is null`, [user.id, purpose]);
    await tx.query(
      `insert into email_codes (user_id, purpose, code_hash, expires_at)
       values ($1, $2, $3, now() + make_interval(mins => $4))`,
      [user.id, purpose, hashCode(secret, user.id, purpose, code), CODE_TTL_MIN],
    );
    const mail = (purpose === 'verify_email' ? verifyEmailMail : resetPasswordMail)({ code, siteUrl: config.siteUrl, lang: user.lang });
    await enqueueMail(tx, { to: user.email, ...mail, purpose, priority: 1 });
    return true;
  }

  const hasActiveCode = async (tx, userId, purpose) =>
    !!(await tx.one(
      `select 1 from email_codes where user_id = $1 and purpose = $2 and consumed_at is null and expires_at > now() and attempts < $3 limit 1`,
      [userId, purpose, CODE_MAX_ATTEMPTS],
    ));

  /** Failed-code throttle (per e-mail, across codes). */
  async function assertCodeThrottle(email, purpose) {
    const key = `${purpose}:${email}`;
    const r = await db.one(
      `select count(*)::int as n from auth_attempts where kind = 'code' and key = $1 and created_at > now() - interval '15 minutes'`,
      [key],
    );
    if (r.n >= 8) throw rateLimited('Too many wrong codes. Please wait 15 minutes or request a new code.', 900);
    return key;
  }

  /**
   * Check a submitted code. Returns { row } on success or { error } on failure — it never throws for a wrong code,
   * because the failed-attempt counters must be COMMITTED (a throw inside db.tx would roll them back).
   * Every failure answers identically (no hint whether the account exists, is pending, or the code expired).
   */
  async function checkCode(tx, user, purpose, code, key, ip) {
    const row = user
      ? await tx.one(
          `select id, code_hash, attempts from email_codes
            where user_id = $1 and purpose = $2 and consumed_at is null and expires_at > now() and attempts < $3
            order by created_at desc limit 1 for update`,
          [user.id, purpose, CODE_MAX_ATTEMPTS],
        )
      : null;
    if (!row) {
      await tx.query('insert into auth_attempts (kind, key, ip) values ($1, $2, $3)', ['code', key, ip]);
      return { error: invalidCode() };
    }
    if (!safeEqual(row.code_hash, hashCode(secret, user.id, purpose, code))) {
      await tx.query('update email_codes set attempts = attempts + 1 where id = $1', [row.id]);
      await tx.query('insert into auth_attempts (kind, key, ip) values ($1, $2, $3)', ['code', key, ip]);
      return { error: invalidCode() };
    }
    return { row };
  }

  const findUser = (tx, email) =>
    tx.one(
      `select id, email, password_hash, first_name, last_name, workplace, avatar_file, role, lang, email_verified_at, disabled_at, created_at
         from users where email = $1`,
      [email],
    );

  // ───────────── register ─────────────
  app.post('/api/auth/register', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req, reply) => {
    const body = validate(REGISTER, req.body);
    if (body.website) return reply.code(201).send({ ok: true, status: 'verification_required', email: body.email });
    const weak = checkPasswordStrength(body.password, body.email);
    if (weak) throw new ValidationError({ password: weak });
    if (!budget.take('register', 120, HOUR)) throw busy();

    const hash = await hashPassword(body.password); // always hashed → same timing for every branch

    const register = () => db.tx(async (tx) => {
      const existing = await tx.one(
        `select id, email, first_name, last_name, lang, email_verified_at, disabled_at from users where email = $1 for update`,
        [body.email],
      );
      if (!existing) {
        const user = await tx.one(
          `insert into users (email, password_hash, first_name, last_name, workplace, lang) values ($1, $2, $3, $4, $5, $6)
           returning id, email, first_name, last_name, lang`,
          [body.email, hash, body.first_name, body.last_name, body.workplace, body.lang],
        );
        await issueCode(tx, user, 'verify_email');
      } else if (!existing.email_verified_at && !existing.disabled_at) {
        // A pending registration. While its code is still live nothing is replaced (a stranger must not be able to
        // swap the data under the mailbox owner); once it lapsed, the new data + a fresh code replace it. Either way
        // the password is chosen again at /verify, by the person who holds the code.
        if (!(await hasActiveCode(tx, existing.id, 'verify_email'))) {
          await tx.query(
            'update users set password_hash = $2, first_name = $3, last_name = $4, workplace = $5, lang = $6 where id = $1',
            [existing.id, hash, body.first_name, body.last_name, body.workplace, body.lang],
          );
          await issueCode(tx, { ...existing, lang: body.lang }, 'verify_email');
        }
      } else {
        // someone registers an address that already has an account: tell the owner (at most once an hour)
        const recent = await tx.one(
          `select 1 from mail_outbox where to_email = $1 and purpose = 'account_exists' and created_at > now() - interval '1 hour' limit 1`,
          [existing.email],
        );
        if (!recent) {
          await enqueueMail(tx, { to: existing.email, ...accountExistsMail({ siteUrl: config.siteUrl, lang: existing.lang }), purpose: 'account_exists', priority: 4 });
        }
      }
    });
    try {
      await register();
    } catch (err) {
      // two simultaneous registrations of a brand-new address: the loser re-runs as an "existing account" case
      if (err?.code !== '23505') throw err;
      await register();
    }
    return reply.code(201).send({ ok: true, status: 'verification_required', email: body.email });
  });

  // ───────────── verify e-mail (+ choose the password) ─────────────
  app.post('/api/auth/verify', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { email, code, password } = validate(VERIFY, req.body);
    if (!/^\d{6}$/.test(code)) throw invalidCode();
    const weak = checkPasswordStrength(password, email);
    if (weak) throw new ValidationError({ password: weak });
    const key = await assertCodeThrottle(email, 'verify_email');
    const ip = ipKey(req);

    // 1) is the code right? (commits the attempt counters; no password work yet, so wrong guesses stay cheap)
    const first = await db.tx(async (tx) => {
      const u = await findUser(tx, email);
      const usable = u && !u.email_verified_at && !u.disabled_at ? u : null;
      const check = await checkCode(tx, usable, 'verify_email', code, key, ip);
      return check.error ? { error: check.error } : { userId: u.id, codeId: check.row.id };
    });
    if (first.error) throw first.error;

    // 2) only now spend the scrypt time; 3) consume the code and activate the account atomically
    const hash = await hashPassword(password);
    const out = await db.tx(async (tx) => {
      const row = await tx.one(`select id from email_codes where id = $1 and consumed_at is null and expires_at > now() for update`, [first.codeId]);
      const u = row && await tx.one(
        `select id, email, first_name, last_name, workplace, avatar_file, role, lang, email_verified_at, disabled_at, created_at from users where id = $1 for update`,
        [first.userId],
      );
      if (!row || !u || u.email_verified_at || u.disabled_at) return { error: invalidCode() };
      await tx.query('update email_codes set consumed_at = now() where id = $1', [row.id]);
      await tx.query('update users set email_verified_at = now(), password_hash = $2 where id = $1', [u.id, hash]);
      return { user: { ...u, email_verified_at: new Date() } };
    });
    if (out.error) throw out.error;
    await app.createSession(out.user.id, req, reply);
    return { user: toSelf(out.user) };
  });

  // ───────────── resend ─────────────
  app.post('/api/auth/resend', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req, reply) => {
    const { email, purpose } = validate(RESEND, req.body);
    if (!budget.take('code-mail', 150, HOUR)) throw busy();
    await db.tx(async (tx) => {
      const u = await findUser(tx, email);
      if (!u || u.disabled_at) return;
      if (purpose === 'verify_email' && u.email_verified_at) return;
      if (purpose === 'reset_password' && !u.email_verified_at) return;
      await issueCode(tx, u, purpose);
    });
    return reply.code(202).send({ ok: true });
  });

  // ───────────── login ─────────────
  app.post('/api/auth/login', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { email, password } = validate(LOGIN, req.body);
    const ip = ipKey(req);

    // Reserve first, then count (the reservation is included), then verify: N parallel guesses are N reservations,
    // so everything beyond the limit is refused before a single password is evaluated.
    await db.query(`insert into auth_attempts (kind, key, ip) values ('login', $1, $2)`, [email, ip]);
    const [byEmail, byIp] = await Promise.all([
      db.one(
        `select count(*)::int as n from auth_attempts where kind = 'login' and key = $1 and created_at > now() - interval '15 minutes'`,
        [email],
      ),
      ip
        ? db.one(`select count(*)::int as n from auth_attempts where kind = 'login' and ip = $1 and created_at > now() - interval '1 minute'`, [ip])
        : { n: 0 },
    ]);
    if (byEmail.n > 5) throw rateLimited('Too many failed log-in attempts. Please try again in 15 minutes.', 900);
    if (byIp.n > 10) throw rateLimited('Too many failed log-in attempts. Please try again in a minute.', 60);

    const user = await findUser(db, email);
    const ok = user ? await verifyPassword(password, user.password_hash) : await dummyVerify(password);
    if (!ok) throw new HttpError(401, 'invalid_credentials', 'E-mail or password is not correct.'); // the reservation stays = a failure

    await db.query(`delete from auth_attempts where kind = 'login' and key = $1`, [email]); // right password: clean slate
    if (user.disabled_at) throw forbidden('This account has been disabled.', 'account_disabled');
    if (!user.email_verified_at) {
      await db.tx((tx) => issueCode(tx, user, 'verify_email'));
      throw forbidden('Please confirm your e-mail first — we sent you a new code.', 'email_not_verified', { email: user.email });
    }
    await app.createSession(user.id, req, reply);
    return { user: toSelf(user) };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    await app.destroySession(req, reply);
    return reply.code(204).send();
  });

  app.get('/api/auth/me', async (req) => ({ user: req.user ? toSelf(req.user) : null }));

  // ───────────── forgot / reset password ─────────────
  app.post('/api/auth/forgot', { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (req, reply) => {
    const { email } = validate(FORGOT, req.body);
    if (!budget.take('code-mail', 150, HOUR)) throw busy();
    await db.tx(async (tx) => {
      const u = await findUser(tx, email);
      if (u && u.email_verified_at && !u.disabled_at) await issueCode(tx, u, 'reset_password');
    });
    return reply.code(202).send({ ok: true });
  });

  app.post('/api/auth/reset', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { email, code, password } = validate(RESET, req.body);
    if (!/^\d{6}$/.test(code)) throw invalidCode();
    const weak = checkPasswordStrength(password, email);
    if (weak) throw new ValidationError({ password: weak });
    const key = await assertCodeThrottle(email, 'reset_password');
    const ip = ipKey(req);

    const first = await db.tx(async (tx) => {
      const u = await findUser(tx, email);
      const usable = u && u.email_verified_at && !u.disabled_at ? u : null;
      const check = await checkCode(tx, usable, 'reset_password', code, key, ip);
      return check.error ? { error: check.error } : { userId: u.id, codeId: check.row.id };
    });
    if (first.error) throw first.error;

    const hash = await hashPassword(password);
    const out = await db.tx(async (tx) => {
      const row = await tx.one(`select id from email_codes where id = $1 and consumed_at is null and expires_at > now() for update`, [first.codeId]);
      const u = row && await tx.one(
        `select id, email, first_name, last_name, workplace, avatar_file, role, lang, email_verified_at, disabled_at, created_at from users where id = $1 for update`,
        [first.userId],
      );
      if (!row || !u || !u.email_verified_at || u.disabled_at) return { error: invalidCode() };
      await tx.query('update email_codes set consumed_at = now() where id = $1', [row.id]);
      await tx.query('update users set password_hash = $2 where id = $1', [u.id, hash]);
      await tx.query('delete from sessions where user_id = $1', [u.id]);
      await tx.query(`delete from auth_attempts where kind = 'login' and key = $1`, [email]);
      return { user: u };
    });
    if (out.error) throw out.error;
    await app.createSession(out.user.id, req, reply);
    return { user: toSelf(out.user) };
  });
}
