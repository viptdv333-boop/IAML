// Thin PostgreSQL layer over node-postgres: pool + transaction helper.
import pg from 'pg';

// bigint (int8: ids, COUNT(*)) → JS number. All values stay far below 2^53.
pg.types.setTypeParser(20, (v) => Number(v));

function bind(runner) {
  return {
    query: (text, params) => runner.query(text, params),
    /** first row or null */
    one: async (text, params) => (await runner.query(text, params)).rows[0] ?? null,
    /** all rows */
    many: async (text, params) => (await runner.query(text, params)).rows,
  };
}

export function createDb(databaseUrl, { max = 10, onError } = {}) {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 20_000,
  });
  pool.on('error', (err) => onError?.(err));

  const db = {
    pool,
    ...bind(pool),
    /** Run fn(tx) inside BEGIN/COMMIT; rolls back on throw. tx has query/one/many bound to the same client. */
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const result = await fn(bind(client));
        await client.query('commit');
        return result;
      } catch (err) {
        try { await client.query('rollback'); } catch { /* connection already broken */ }
        throw err;
      } finally {
        client.release();
      }
    },
    /** true when the database answers */
    async ping() {
      try { await pool.query('select 1'); return true; } catch { return false; }
    },
    async close() { await pool.end(); },
  };
  return db;
}
