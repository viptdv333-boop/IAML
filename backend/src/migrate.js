// Minimal SQL migration runner: backend/migrations/NNN_name.sql, applied in order, once, each in a transaction.
// Safe to run concurrently (advisory lock) and on every start.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BACKEND_DIR } from './config.js';
import { createDb } from './db.js';

const LOCK_ID = 727_274_001; // arbitrary app-wide constant
export const MIGRATIONS_DIR = path.join(BACKEND_DIR, 'migrations');

export async function migrate(db, { dir = MIGRATIONS_DIR, log = () => {} } = {}) {
  const files = readdirSync(dir).filter((f) => /^\d+.*\.sql$/.test(f)).sort();
  const client = await db.pool.connect();
  const applied = [];
  try {
    await client.query('select pg_advisory_lock($1)', [LOCK_ID]);
    await client.query(`
      create table if not exists schema_migrations (
        name       text primary key,
        checksum   text not null,
        applied_at timestamptz not null default now()
      )`);
    const done = new Map((await client.query('select name, checksum from schema_migrations')).rows.map((r) => [r.name, r.checksum]));

    for (const file of files) {
      // the checksum must not depend on the checkout's line endings (CRLF on Windows)
      const sql = readFileSync(path.join(dir, file), 'utf8').replaceAll(String.fromCharCode(13, 10), String.fromCharCode(10));
      const checksum = createHash('sha256').update(sql).digest('hex');
      if (done.has(file)) {
        if (done.get(file) !== checksum) {
          throw new Error(`Migration ${file} was modified after it was applied. Never edit applied migrations — add a new one.`);
        }
        continue;
      }
      log(`applying ${file}`);
      try {
        await client.query('begin');
        await client.query(sql);
        await client.query('insert into schema_migrations (name, checksum) values ($1, $2)', [file, checksum]);
        await client.query('commit');
      } catch (err) {
        try { await client.query('rollback'); } catch { /* ignore */ }
        err.message = `Migration ${file} failed: ${err.message}`;
        throw err;
      }
      applied.push(file);
    }
    return applied;
  } finally {
    try { await client.query('select pg_advisory_unlock($1)', [LOCK_ID]); } catch { /* ignore */ }
    client.release();
  }
}

// CLI: `npm run migrate`
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (!process.env.DATABASE_URL) {
    console.error('[migrate] DATABASE_URL is not set');
    process.exit(78);
  }
  const db = createDb(process.env.DATABASE_URL, { max: 2 });
  try {
    const applied = await migrate(db, { log: (m) => console.log(`[migrate] ${m}`) });
    console.log(applied.length ? `[migrate] applied ${applied.length} migration(s)` : '[migrate] database is up to date');
  } catch (err) {
    console.error(`[migrate] ${err.message}`);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
}
