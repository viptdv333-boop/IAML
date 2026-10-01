// npm run admin:create -- --email a@b.org --first Ada --last Lovelace [--workplace "…"] [--password …]
// Creates a verified administrator, or promotes (and re-enables) an existing account. Prints a generated
// password once when none is supplied (also read from ADMIN_PASSWORD).
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { hashPassword } from '../src/lib/crypto.js';
import { migrate } from '../src/migrate.js';
import { scriptDb } from './_db.js';

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    first: { type: 'string' },
    last: { type: 'string' },
    workplace: { type: 'string' },
    password: { type: 'string' },
  },
});

const email = (values.email ?? '').trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
  console.error('Usage: npm run admin:create -- --email a@b.org --first Ada --last Lovelace [--workplace "…"] [--password …]');
  process.exit(2);
}
let password = values.password ?? process.env.ADMIN_PASSWORD;
let generated = false;
if (!password) {
  password = randomBytes(12).toString('base64url');
  generated = true;
}
if (password.length < 8) {
  console.error('The password must be at least 8 characters.');
  process.exit(2);
}

const db = scriptDb();
try {
  await migrate(db, { log: () => {} });
  const existing = await db.one('select id, email_verified_at from users where email = $1', [email]);
  if (existing) {
    // An UNVERIFIED account may be somebody else's pre-registration of this address (with a password of their
    // choosing): never keep that password for an administrator — always set a fresh one.
    const explicit = Boolean(values.password || process.env.ADMIN_PASSWORD);
    const setPassword = explicit || !existing.email_verified_at;
    await db.query(
      `update users set role = 'admin', disabled_at = null, email_verified_at = coalesce(email_verified_at, now()),
              password_hash = case when $2::text is null then password_hash else $2 end
        where id = $1`,
      [existing.id, setPassword ? await hashPassword(password) : null],
    );
    await db.query('delete from sessions where user_id = $1', [existing.id]);
    console.log(`Existing account ${email} is now an administrator.`);
    if (setPassword) console.log(explicit ? 'Its password was updated.' : `Its password was replaced because the account had never been confirmed. New password (shown once): ${password}`);
  } else {
    const first = (values.first ?? 'Admin').trim() || 'Admin';
    const last = (values.last ?? 'IAML').trim() || 'IAML';
    const workplace = (values.workplace ?? 'IAML').trim() || 'IAML';
    await db.query(
      `insert into users (email, password_hash, first_name, last_name, workplace, role, email_verified_at)
       values ($1, $2, $3, $4, $5, 'admin', now())`,
      [email, await hashPassword(password), first, last, workplace],
    );
    console.log(`Administrator created: ${email}`);
    if (generated) console.log(`Password (shown once — change it after the first login): ${password}`);
  }
} finally {
  await db.close();
}
