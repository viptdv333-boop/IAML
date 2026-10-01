// Mail outbox: everything the site sends is first written to `mail_outbox` (in the caller's transaction when
// possible) and delivered by the worker — so a Resend outage or a crash never loses a message.
import { oneLine } from '../lib/text.js';

const ADDRESS_RE = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]{2,}$/;

/**
 * enqueueMail(db|tx, { to, toName?, subject, text, html?, replyTo?, headers?, purpose?, priority?, delaySec? })
 * priority: lower is sent first (codes 1, contact 3, digests 8).
 * Returns the outbox id, or null when the address is unusable (never throws for bad recipients).
 */
export async function enqueueMail(db, m) {
  const to = String(m.to ?? '').trim().toLowerCase();
  if (!ADDRESS_RE.test(to) || to.length > 254) return null;
  const subject = oneLine(m.subject).slice(0, 200);
  const row = await db.one(
    `insert into mail_outbox (to_email, to_name, subject, text_body, html_body, reply_to, headers, purpose, priority, next_attempt_at)
     values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, now() + make_interval(secs => $10))
     returning id`,
    [
      to,
      m.toName ? oneLine(m.toName).slice(0, 120) : null,
      subject || '(no subject)',
      String(m.text ?? ''),
      m.html ?? null,
      m.replyTo && ADDRESS_RE.test(String(m.replyTo).trim()) ? String(m.replyTo).trim() : null,
      JSON.stringify(m.headers ?? {}),
      m.purpose ?? 'misc',
      m.priority ?? 5,
      m.delaySec ?? 0,
    ],
  );
  return row.id;
}

/** Purposes whose body contains a one-time code — scrubbed from the DB once delivered/expired. */
export const SECRET_PURPOSES = ['verify_email', 'reset_password'];
