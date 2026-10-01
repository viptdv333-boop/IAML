import assert from 'node:assert/strict';
import http from 'node:http';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';
import { createDb } from '../src/db.js';
import { enqueueMail } from '../src/mail/outbox.js';
import { createTransport } from '../src/mail/transports.js';
import { createMailWorker } from '../src/mail/worker.js';
import { migrate } from '../src/migrate.js';
import { TEST_DB_URL, makeConfig, resetDb } from './helpers.js';

let db;
let mock;
before(async () => {
  db = createDb(TEST_DB_URL, { max: 6 });
  await migrate(db);
});
after(async () => { await db.close(); });
beforeEach(async () => {
  await resetDb(db);
  mock = await mockResend();
});
afterEach(async () => { await mock.close(); });

/** Tiny stand-in for the Resend HTTP API. `script` holds queued responses; default is 200 { id }. */
function mockResend() {
  const calls = [];
  const script = [];
  const server = http.createServer((req, res) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => {
      calls.push({ method: req.method, url: req.url, headers: req.headers, body: data ? JSON.parse(data) : null });
      const r = script.shift() ?? { status: 200, body: { id: `re_${calls.length}` } };
      res.writeHead(r.status, { 'content-type': 'application/json', ...(r.headers ?? {}) });
      res.end(JSON.stringify(r.body));
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({
    url: `http://127.0.0.1:${server.address().port}`,
    calls,
    script,
    close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }),
  })));
}

const resendWorker = (over = {}) => {
  const config = makeConfig({ MAIL_TRANSPORT: 'resend', RESEND_API_KEY: 're_test_key', MAIL_FROM: 'IAML <no-reply@example.org>', RESEND_API_BASE: mock.url, MAIL_MIN_INTERVAL_MS: '0', ...over });
  return { config, worker: createMailWorker({ db, config, transport: createTransport(config) }) };
};
const row = (id) => db.one('select * from mail_outbox where id = $1', [id]);
const send = (over = {}) => enqueueMail(db, { to: 'ada@example.org', subject: 'Hello', text: 'Plain body', html: '<p>Hi</p>', ...over });

describe('outbox', () => {
  test('rejects unusable recipients, strips line breaks from subjects, caps length', async () => {
    assert.equal(await send({ to: 'not-an-address' }), null);
    assert.equal(await send({ to: 'a@b' }), null);
    assert.equal(await send({ to: 'x@example.org\r\nBcc: evil@example.org' }), null);
    const id = await send({ subject: 'Line1\r\nBcc: evil@example.org', replyTo: 'bad\r\nx' });
    const r = await row(id);
    assert.ok(!/[\r\n]/.test(r.subject));
    assert.equal(r.reply_to, null);
    const long = await row(await send({ subject: 'x'.repeat(500) }));
    assert.equal(long.subject.length, 200);
    assert.equal((await row(await send({ to: ' ADA@Example.ORG ' }))).to_email, 'ada@example.org');
  });
});

describe('log transport', () => {
  test('drain marks messages sent with a provider id', async () => {
    const config = makeConfig();
    const worker = createMailWorker({ db, config, transport: createTransport(config) });
    const id = await send({ purpose: 'verify_email', text: 'code 123456' });
    assert.equal(await worker.drain(), 1);
    const r = await row(id);
    assert.equal(r.status, 'sent');
    assert.equal(r.attempts, 1);
    assert.match(r.provider_id, /^log-/);
    assert.equal(r.text_body, 'code 123456', 'dev keeps bodies so codes can be read');
    assert.equal(await worker.drain(), 0);
  });
});

describe('Resend transport', () => {
  test('POSTs the documented payload with auth + idempotency headers, then scrubs one-time codes', async () => {
    const { worker } = resendWorker();
    const code = await send({ purpose: 'verify_email', text: 'Your code is 123456', replyTo: 'sender@example.org', headers: { 'List-Unsubscribe': '<https://x/u>' }, to: 'ada@example.org' });
    const plain = await send({ purpose: 'contact', text: 'Visible message', to: 'office@example.org' });
    await db.query(`update mail_outbox set to_name = 'Ada Lovelace' where id = $1`, [code]);
    assert.equal(await worker.drain(), 2);

    assert.equal(mock.calls.length, 2);
    const c = mock.calls[0];
    assert.equal(c.method, 'POST');
    assert.equal(c.url, '/emails');
    assert.equal(c.headers.authorization, 'Bearer re_test_key');
    assert.equal(c.headers['idempotency-key'], `iaml-outbox-${code}`);
    assert.equal(c.headers['content-type'], 'application/json');
    assert.deepEqual(c.body, {
      from: 'IAML <no-reply@example.org>',
      to: ['ada@example.org'],
      subject: 'Hello',
      text: 'Your code is 123456',
      html: '<p>Hi</p>',
      reply_to: 'sender@example.org',
      headers: { 'List-Unsubscribe': '<https://x/u>' },
    });
    const a = await row(code);
    assert.equal(a.status, 'sent');
    assert.equal(a.provider_id, 're_1');
    assert.equal(a.text_body, '[removed after delivery]', 'codes do not linger in the database');
    assert.equal(a.html_body, null);
    assert.equal((await row(plain)).text_body, 'Visible message');
  });

  test('429 with Retry-After: kept queued, rescheduled, then delivered', async () => {
    const { worker } = resendWorker();
    const id = await send();
    mock.script.push({ status: 429, headers: { 'retry-after': '120' }, body: { name: 'rate_limit_exceeded', message: 'Too many requests' } });
    assert.equal(await worker.drain(), 1);
    let r = await row(id);
    assert.equal(r.status, 'queued');
    assert.equal(r.attempts, 1);
    assert.match(r.last_error, /rate limited/i);
    assert.ok(new Date(r.next_attempt_at).getTime() - Date.now() > 100_000, 'honours Retry-After');
    assert.equal(await worker.drain(), 0, 'not due yet');

    await db.query(`update mail_outbox set next_attempt_at = now() where id = $1`, [id]);
    assert.equal(await worker.drain(), 1);
    r = await row(id);
    assert.equal(r.status, 'sent');
    assert.equal(r.attempts, 2);
    assert.equal(r.last_error, null);
    assert.equal(mock.calls[1].headers['idempotency-key'], mock.calls[0].headers['idempotency-key'], 'retries reuse the key');
  });

  test('daily quota exhaustion backs off for an hour', async () => {
    const { worker } = resendWorker();
    const id = await send();
    mock.script.push({ status: 429, body: { name: 'daily_quota_exceeded', message: 'You have reached your daily email sending quota.' } });
    await worker.drain();
    const r = await row(id);
    assert.equal(r.status, 'queued');
    assert.ok(new Date(r.next_attempt_at).getTime() - Date.now() > 3_000_000);
  });

  test('5xx retries with exponential back-off and fails permanently after 8 attempts', async () => {
    const { worker } = resendWorker();
    const id = await send();
    mock.script.push({ status: 503, body: { message: 'unavailable' } });
    await worker.drain();
    let r = await row(id);
    assert.equal(r.status, 'queued');
    const first = new Date(r.next_attempt_at).getTime() - Date.now();
    assert.ok(first > 20_000 && first < 40_000, `first back-off ≈ 30 s (was ${first})`);

    await db.query(`update mail_outbox set attempts = 7, next_attempt_at = now() where id = $1`, [id]);
    mock.script.push({ status: 500, body: { message: 'still broken' } });
    await worker.drain();
    r = await row(id);
    assert.equal(r.status, 'failed');
    assert.equal(r.attempts, 8);
    assert.match(r.last_error, /500/);
  });

  test('validation errors (4xx) fail at once without retrying; codes are scrubbed', async () => {
    const { worker } = resendWorker();
    const id = await send({ purpose: 'reset_password', text: 'code 654321' });
    mock.script.push({ status: 422, body: { name: 'validation_error', message: 'Invalid `to` field.' } });
    await worker.drain();
    const r = await row(id);
    assert.equal(r.status, 'failed');
    assert.equal(r.attempts, 1);
    assert.match(r.last_error, /Invalid `to` field/);
    assert.equal(r.text_body, '[removed]');
    assert.equal(await worker.drain(), 0);
  });

  test('401/403 (bad key, unverified domain) keep the mail and retry slowly', async () => {
    const { worker } = resendWorker();
    const id = await send();
    mock.script.push({ status: 403, body: { name: 'validation_error', message: 'The iaml.org domain is not verified.' } });
    await worker.drain();
    const r = await row(id);
    assert.equal(r.status, 'queued');
    assert.match(r.last_error, /not verified/);
    assert.ok(new Date(r.next_attempt_at).getTime() - Date.now() > 800_000);
  });

  test('network failure is retryable', async () => {
    const { worker } = resendWorker({ RESEND_API_BASE: 'http://127.0.0.1:1' });
    const id = await send();
    await worker.drain();
    const r = await row(id);
    assert.equal(r.status, 'queued');
    assert.match(r.last_error, /network error/);
  });

  test('responses that are not JSON are handled', async () => {
    const { worker } = resendWorker();
    const id = await send();
    mock.script.push({ status: 502, body: 'Bad Gateway' });
    await worker.drain();
    assert.equal((await row(id)).status, 'queued');
  });
});

describe('worker behaviour', () => {
  test('rows stuck in "sending" after a crash are recovered', async () => {
    const { worker } = resendWorker();
    const id = await send();
    await db.query(`update mail_outbox set status = 'sending', locked_at = now() - interval '20 minutes', attempts = 1 where id = $1`, [id]);
    assert.equal(await worker.drain(), 1);
    assert.equal((await row(id)).status, 'sent');
    // a fresh lock is left alone
    const id2 = await send();
    await db.query(`update mail_outbox set status = 'sending', locked_at = now() where id = $1`, [id2]);
    assert.equal(await worker.drain(), 0);
  });

  test('stale one-time-code mails are not delivered', async () => {
    const { worker } = resendWorker();
    const id = await send({ purpose: 'verify_email', text: 'code 111111' });
    await db.query(`update mail_outbox set created_at = now() - interval '40 minutes' where id = $1`, [id]);
    await worker.drain();
    const r = await row(id);
    assert.equal(r.status, 'failed');
    assert.match(r.last_error, /expired before delivery/);
    assert.equal(mock.calls.length, 0);
    assert.equal(r.text_body, '[removed]');
  });

  test('priority order: codes before contact mail before digests', async () => {
    const { worker } = resendWorker();
    await send({ subject: 'digest', priority: 8, to: 'a@example.org' });
    await send({ subject: 'code', priority: 1, to: 'b@example.org' });
    await send({ subject: 'contact', priority: 3, to: 'c@example.org' });
    await worker.drain();
    assert.deepEqual(mock.calls.map((c) => c.body.subject), ['code', 'contact', 'digest']);
  });

  test('two workers never send the same message twice (SKIP LOCKED)', async () => {
    const a = resendWorker().worker;
    const b = resendWorker().worker;
    for (let i = 0; i < 8; i++) await send({ to: `u${i}@example.org` });
    const [x, y] = await Promise.all([a.drain(), b.drain()]);
    assert.equal(x + y, 8);
    assert.equal(mock.calls.length, 8);
    assert.equal(new Set(mock.calls.map((c) => c.headers['idempotency-key'])).size, 8);
  });

  test('requests are paced to respect the provider rate limit', async () => {
    const { worker } = resendWorker({ MAIL_MIN_INTERVAL_MS: '150' });
    for (let i = 0; i < 3; i++) await send({ to: `u${i}@example.org` });
    const t0 = Date.now();
    await worker.drain();
    assert.ok(Date.now() - t0 >= 400, `3 mails at 150 ms spacing took ${Date.now() - t0} ms`);
  });

  test('start/stop runs the loop and shuts down cleanly', async () => {
    const { worker } = resendWorker({ MAIL_WORKER_INTERVAL_MS: '100' });
    worker.start();
    const id = await send();
    for (let i = 0; i < 40 && (await row(id)).status !== 'sent'; i++) await new Promise((r) => setTimeout(r, 50));
    assert.equal((await row(id)).status, 'sent');
    await worker.stop();
    const late = await send();
    await new Promise((r) => setTimeout(r, 300));
    assert.equal((await row(late)).status, 'queued', 'stopped worker sends nothing');
  });
});
