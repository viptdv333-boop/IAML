// Shared bootstrap for CLI scripts: a small pool from DATABASE_URL (no SITE_URL / SESSION_SECRET needed).
import { createDb } from '../src/db.js';

export function scriptDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set.');
    process.exit(78);
  }
  return createDb(url, { max: 2 });
}
