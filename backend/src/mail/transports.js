// Delivery back-ends. `resend` talks to the Resend HTTP API; `log` delivers nothing (dev / tests).
import { randomUUID } from 'node:crypto';

export class MailError extends Error {
  /** @param {{retryable?: boolean, retryAfterMs?: number, status?: number}} o */
  constructor(message, { retryable = true, retryAfterMs = 0, status = 0 } = {}) {
    super(message);
    this.name = 'MailError';
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
    this.status = status;
  }
}

const formatAddress = (email, name) => (name ? `${name.replace(/["<>\r\n]/g, '')} <${email}>` : email);

export function createLogTransport(log) {
  return {
    name: 'log',
    async send(msg) {
      log?.info({ to: msg.to, subject: msg.subject, purpose: msg.purpose }, 'mail (log transport — not delivered)');
      return { id: `log-${randomUUID()}` };
    },
  };
}

export function createResendTransport({ apiKey, apiBase, from }, { fetchImpl = fetch, log } = {}) {
  return {
    name: 'resend',
    async send(msg) {
      const payload = {
        from,
        to: [msg.to], // plain address: a display name ("Smith, John") could be mis-parsed into extra recipients
        subject: msg.subject,
        text: msg.text,
      };
      if (msg.html) payload.html = msg.html;
      if (msg.replyTo) payload.reply_to = msg.replyTo;
      if (msg.headers && Object.keys(msg.headers).length) payload.headers = msg.headers;

      let res;
      try {
        res = await fetchImpl(`${apiBase}/emails`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': `iaml-outbox-${msg.id}`,
            'User-Agent': 'iaml-backend/1',
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(20_000),
        });
      } catch (err) {
        throw new MailError(`network error: ${err.cause?.code ?? err.name}: ${err.message}`, { retryable: true });
      }

      let data = null;
      try { data = await res.json(); } catch { /* non-JSON error page */ }

      if (res.ok && data?.id) return { id: String(data.id) };

      const detail = data?.message || data?.error?.message || `HTTP ${res.status}`;
      const errName = data?.name || '';
      const status = res.status;
      log?.warn({ status, errName, detail }, 'resend rejected a message');

      if (status === 429) {
        const quota = /quota/i.test(errName) || /quota/i.test(detail);
        const retryAfter = Number(res.headers.get('retry-after'));
        throw new MailError(`rate limited by Resend (${errName || status}): ${detail}`, {
          retryable: true,
          retryAfterMs: quota ? 3_600_000 : (Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 5_000),
          status,
        });
      }
      if (status === 401 || status === 403) {
        // API key revoked / sending domain not verified: an operator problem — keep the mail, retry slowly.
        throw new MailError(`Resend refused (${status} ${errName}): ${detail}`, { retryable: true, retryAfterMs: 900_000, status });
      }
      if (status === 409 || status >= 500) {
        throw new MailError(`Resend ${status} ${errName}: ${detail}`, { retryable: true, status });
      }
      throw new MailError(`Resend ${status} ${errName}: ${detail}`, { retryable: false, status });
    },
  };
}

export function createTransport(config, { log, fetchImpl } = {}) {
  if (config.mail.transport === 'resend') {
    return createResendTransport(
      { apiKey: config.mail.resendApiKey, apiBase: config.mail.resendApiBase, from: config.mail.from },
      { log, fetchImpl },
    );
  }
  return createLogTransport(log);
}
