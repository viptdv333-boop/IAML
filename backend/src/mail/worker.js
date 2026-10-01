// Outbox worker: claims due rows (FOR UPDATE SKIP LOCKED), sends them one at a time at a Resend-friendly pace,
// retries with exponential back-off, and recovers rows stuck in "sending" after a crash.
import { SECRET_PURPOSES } from './outbox.js';

const MAX_ATTEMPTS = 8;
const STUCK_AFTER_MIN = 10;
const CODE_MAX_AGE_MIN = 30; // a confirmation code older than this is useless — don't deliver it

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const backoffMs = (attempt) => Math.min(30_000 * 2 ** (attempt - 1), 3_600_000);

export function createMailWorker({ db, config, transport, log }) {
  let running = false;
  let stopping = false;
  let timer = null;
  let current = Promise.resolve();
  const scrub = config.mail.transport !== 'log'; // dev/test keep codes visible in the outbox

  async function claim() {
    return db.one(
      `update mail_outbox set status = 'sending', locked_at = now(), attempts = attempts + 1
        where id = (select id from mail_outbox
                     where status = 'queued' and next_attempt_at <= now()
                     order by priority, next_attempt_at, id
                     for update skip locked limit 1)
        returning *`,
    );
  }

  async function finishSent(row, providerId) {
    const secret = scrub && SECRET_PURPOSES.includes(row.purpose);
    await db.query(
      `update mail_outbox set status = 'sent', sent_at = now(), locked_at = null, last_error = null, provider_id = $2,
              text_body = case when $3 then '[removed after delivery]' else text_body end,
              html_body = case when $3 then null else html_body end
        where id = $1`,
      [row.id, providerId, secret],
    );
  }

  async function finishFailed(row, err) {
    const permanent = !err.retryable || row.attempts >= MAX_ATTEMPTS;
    const wait = Math.max(backoffMs(row.attempts), err.retryAfterMs || 0);
    const secretGone = permanent && SECRET_PURPOSES.includes(row.purpose);
    await db.query(
      `update mail_outbox
          set status = $2::mail_status, locked_at = null, last_error = left($3, 500),
              next_attempt_at = now() + make_interval(secs => $4),
              text_body = case when $5 then '[removed]' else text_body end,
              html_body = case when $5 then null else html_body end
        where id = $1`,
      [row.id, permanent ? 'failed' : 'queued', err.message, wait / 1000, secretGone],
    );
    log?.warn({ id: row.id, attempts: row.attempts, permanent, err: err.message }, 'mail delivery failed');
  }

  async function deliver(row) {
    // A code mail that sat in the queue for too long is worthless (and the code has expired anyway).
    if (SECRET_PURPOSES.includes(row.purpose) && Date.now() - new Date(row.created_at).getTime() > CODE_MAX_AGE_MIN * 60_000) {
      await finishFailed(row, Object.assign(new Error('expired before delivery'), { retryable: false }));
      return;
    }
    try {
      const out = await transport.send({
        id: row.id,
        to: row.to_email,
        toName: row.to_name,
        subject: row.subject,
        text: row.text_body,
        html: row.html_body,
        replyTo: row.reply_to,
        headers: row.headers,
        purpose: row.purpose,
      });
      await finishSent(row, out.id);
    } catch (err) {
      await finishFailed(row, err instanceof Error && 'retryable' in err ? err : Object.assign(err, { retryable: true }));
    }
  }

  /** Send everything that is due right now (at most `max`). Returns the number of messages processed. */
  async function drain({ max = 500 } = {}) {
    let n = 0;
    // Recover rows whose worker died mid-send (the idempotency key makes a re-send safe).
    await db.query(
      `update mail_outbox set status = 'queued', locked_at = null
        where status = 'sending' and locked_at < now() - make_interval(mins => $1)`,
      [STUCK_AFTER_MIN],
    );
    while (n < max && !stopping) {
      const row = await claim();
      if (!row) break;
      await deliver(row);
      n++;
      if (config.mail.minIntervalMs && transport.name === 'resend') await sleep(config.mail.minIntervalMs);
    }
    return n;
  }

  async function loop() {
    if (!running) return;
    try {
      await drain();
    } catch (err) {
      log?.error({ err }, 'mail worker tick failed');
    }
    if (running) timer = setTimeout(() => { current = loop(); }, config.mail.workerIntervalMs);
  }

  return {
    transport,
    drain,
    start() {
      if (running) return;
      running = true;
      current = loop();
    },
    async stop() {
      running = false;
      stopping = true;
      if (timer) clearTimeout(timer);
      await current;
    },
  };
}
