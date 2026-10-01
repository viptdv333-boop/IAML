// In-process scheduler: digest check every minute, housekeeping hourly.
import { runDigest } from './digest.js';

export async function cleanup({ db, config, log }) {
  const q = (sql) => db.query(sql).then((r) => r.rowCount);
  const out = {
    sessions: await q(`delete from sessions where expires_at < now()`),
    codes: await q(`delete from email_codes where created_at < now() - interval '2 days'`),
    attempts: await q(`delete from auth_attempts where created_at < now() - interval '2 days'`),
    mail: await q(`delete from mail_outbox where status in ('sent', 'failed') and created_at < now() - interval '30 days'`),
    // registrations that never confirmed their e-mail (their codes cascade)
    unverified: await q(`delete from users where email_verified_at is null and created_at < now() - interval '7 days'`),
  };
  if (config.mail.transport !== 'log') {
    // one-time codes must not linger in the database
    out.scrubbed = await q(
      `update mail_outbox set text_body = '[removed]', html_body = null
        where purpose in ('verify_email', 'reset_password') and status <> 'queued'
          and created_at < now() - interval '1 hour' and text_body <> '[removed]' and text_body <> '[removed after delivery]'`,
    );
  }
  log?.debug(out, 'cleanup done');
  return out;
}

export function startScheduler(ctx) {
  const { log } = ctx;
  let timer = null;
  let ticks = 0;
  let busy = null;

  async function tick() {
    if (busy) return busy;
    busy = (async () => {
      try {
        try {
          await runDigest(ctx);
        } catch (err) {
          log?.error({ err }, 'digest run failed');
        }
        if (ticks % 60 === 0) {
          try {
            await cleanup(ctx);
          } catch (err) {
            log?.error({ err }, 'cleanup failed');
          }
        }
        ticks++;
      } finally {
        busy = null;
      }
    })();
    return busy;
  }

  const first = setTimeout(tick, 5_000);
  timer = setInterval(tick, 60_000);
  first.unref?.();
  timer.unref?.();

  return {
    tick,
    async stop() {
      clearTimeout(first);
      clearInterval(timer);
      await busy;
    },
  };
}
