// npm run seed         → base data, applied once (positions, 30 participants, menu, link categories, contacts, settings)
// npm run seed:demo    → base data + sample news / events / publications / Discuss (development only)
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../src/lib/crypto.js';
import { migrate } from '../src/migrate.js';
import { scriptDb } from './_db.js';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'seeds');
const demo = process.argv.includes('--demo');

if (demo && process.env.NODE_ENV === 'production' && !process.argv.includes('--force')) {
  console.error('Refusing to load DEMO data with NODE_ENV=production.');
  process.exit(1);
}

const db = scriptDb();
try {
  await migrate(db, { log: () => {} }); // make sure the schema exists
  // Base data is applied once. Afterwards the administrator owns it: re-running must never resurrect rows
  // that were deleted in the admin panel (use --force to re-apply on purpose).
  const applied = await db.one(`select value from site_settings where key = 'seed.base'`);
  if (applied && !process.argv.includes('--force')) {
    console.log('base data: already applied (use --force to re-apply)');
  } else {
    await db.query(await readFile(path.join(dir, 'base.sql'), 'utf8'));
    await db.query(
      `insert into site_settings (key, value) values ('seed.base', to_jsonb(now()::text))
       on conflict (key) do update set value = excluded.value, updated_at = now()`,
    );
    console.log('base data: ok');
  }

  if (demo) {
    await db.query(await readFile(path.join(dir, 'demo.sql'), 'utf8'));
    console.log('demo news / events / publications: ok');

    // demo members + a small Discuss conversation
    const existing = await db.one(`select count(*)::int as n from discuss_threads`);
    if (!existing.n) {
      const password = randomBytes(9).toString('base64url');
      const mk = async (email, first, last, workplace) =>
        (await db.one(
          `insert into users (id, email, password_hash, first_name, last_name, workplace, email_verified_at)
           values ($1, $2, $3, $4, $5, $6, now())
           on conflict (email) do update set first_name = excluded.first_name returning id`,
          [randomUUID(), email, await hashPassword(password), first, last, workplace],
        )).id;
      const ada = await mk('ada.demo@example.org', 'Ada', 'Demo', 'Example University');
      const bat = await mk('bat.demo@example.org', 'Bat', 'Demo', 'Institute of Examples');

      const t1 = (await db.one(
        `insert into discuss_threads (author_id, title, body) values ($1, $2, $3) returning id`,
        [ada, 'Looking for sources on Middle Mongol verb morphology',
         'Can anyone recommend recent descriptions of the Middle Mongol verbal system, in particular converbs and participles? Grammars and article-length studies are both welcome.'],
      )).id;
      const c1 = (await db.one(
        `insert into discuss_comments (thread_id, parent_id, depth, author_id, body) values ($1, null, 0, $2, $3) returning id`,
        [t1, bat, 'A good starting point is the survey chapters in the handbooks of Mongolic languages; I can send a reading list.'],
      )).id;
      const c2 = (await db.one(
        `insert into discuss_comments (thread_id, parent_id, depth, author_id, body) values ($1, $2, 1, $3, $4) returning id`,
        [t1, c1, ada, 'That would be wonderful, thank you!'],
      )).id;
      await db.query(
        `insert into discuss_comments (thread_id, parent_id, depth, author_id, body) values ($1, $2, 2, $3, $4)`,
        [t1, c2, bat, 'Sent by e-mail — and I will add it to the Useful Links page suggestions as well.'],
      );
      await db.query(
        `insert into discuss_threads (author_id, title, body) values ($1, $2, $3)`,
        [bat, 'Orthography conventions for Oirat texts', 'Which transcription conventions do you use for Oirat texts in publications? I would like to align with the most widespread practice.'],
      );
      console.log(`demo members: ada.demo@example.org, bat.demo@example.org   password: ${password}`);
    }
  }
} finally {
  await db.close();
}
