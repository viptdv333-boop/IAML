import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConfigError, loadConfig } from '../src/config.js';
import { ValidationError } from '../src/errors.js';
import { hashCode, hashPassword, newCode, readToken, signToken, unsubscribeToken, userIdFromUnsubscribeToken, verifyPassword } from '../src/lib/crypto.js';
import { formatDateTime, lastSlot, tzLabel } from '../src/lib/tz.js';
import { oneLine, preview, snippet } from '../src/lib/text.js';
import { paging, validate, v, words } from '../src/lib/validate.js';

const BASE = { DATABASE_URL: 'postgres://u:p@h/db', SITE_URL: 'https://iaml.org', SESSION_SECRET: 'x'.repeat(32), NODE_ENV: 'production' };

test('config: valid production config', () => {
  const c = loadConfig({ ...BASE, MAIL_TRANSPORT: 'resend', RESEND_API_KEY: 're_x', MAIL_FROM: 'IAML <no-reply@iaml.org>' });
  assert.equal(c.siteOrigin, 'https://iaml.org');
  assert.equal(c.secureCookies, true);
  assert.equal(c.mail.transport, 'resend');
  assert.equal(c.siteTz, 'Etc/GMT-3');
  assert.equal(c.digestHour, 8);
  assert.throws(() => { c.port = 1; }, TypeError, 'config is frozen');
});

test('config: reports every problem at once', () => {
  assert.throws(() => loadConfig({}), (e) => e instanceof ConfigError && e.problems.length >= 3);
  assert.throws(() => loadConfig({ ...BASE, SESSION_SECRET: 'short' }), /at least 32/);
  assert.throws(() => loadConfig({ ...BASE, SITE_URL: 'http://iaml.org' }), /https/);
  assert.throws(() => loadConfig({ ...BASE, MAIL_TRANSPORT: 'resend' }), /RESEND_API_KEY/);
  assert.throws(() => loadConfig({ ...BASE, MAIL_TRANSPORT: 'smtp' }), /log" or "resend/);
  assert.throws(() => loadConfig({ ...BASE, SITE_TZ: 'Mars/Base' }), /SITE_TZ/);
  assert.throws(() => loadConfig({ ...BASE, PORT: 'abc' }), /PORT/);
});

test('config: http is fine on localhost; trailing paths are dropped to the origin', () => {
  const c = loadConfig({ ...BASE, NODE_ENV: 'development', SITE_URL: 'http://localhost:3100/some/path' });
  assert.equal(c.siteUrl, 'http://localhost:3100');
  assert.equal(c.secureCookies, false);
});

test('validate: strings, trimming, limits, control characters', () => {
  const spec = { name: v.str({ max: 5 }), note: v.str({ max: 20, multiline: true }).optional('') };
  assert.deepEqual(validate(spec, { name: '  Bat  ' }), { name: 'Bat', note: '' });
  assert.throws(() => validate(spec, { name: 'toolong' }), (e) => e instanceof ValidationError && /at most 5/.test(e.fields.name));
  assert.throws(() => validate(spec, {}), (e) => e.fields.name === 'is required');
  assert.throws(() => validate(spec, { name: 'a\nb' }), (e) => /single line/.test(e.fields.name));
  assert.throws(() => validate(spec, { name: 'a\u0000b' }), (e) => /invalid characters/.test(e.fields.name));
  assert.equal(validate(spec, { name: 'x', note: 'a\r\nb' }).note, 'a\nb');
  assert.throws(() => validate(spec, null), ValidationError);
});

test('validate: e-mail, int, bool, enum, iso, url, slug', () => {
  const spec = { e: v.email(), i: v.int({ min: 1, max: 9 }), b: v.bool(), k: v.enum(['a', 'b']), d: v.iso(), u: v.url(), s: v.slug() };
  const ok = validate(spec, { e: ' Ada@Example.ORG ', i: '5', b: 'true', k: 'a', d: '2026-07-10T14:30:00+03:00', u: 'https://example.org/x', s: 'About-Us' });
  assert.deepEqual(ok, { e: 'ada@example.org', i: 5, b: true, k: 'a', d: '2026-07-10T11:30:00.000Z', u: 'https://example.org/x', s: 'about-us' });
  const bad = (field, value) => assert.throws(() => validate({ [field]: spec[field] }, { [field]: value }), (e) => !!e.fields[field]);
  bad('e', 'nope'); bad('e', 'a@b'); bad('i', 10); bad('i', 1.5); bad('b', 'maybe'); bad('k', 'c');
  bad('d', '2026-07-10'); bad('d', '2026-07-10T14:30:00'); bad('d', '2026-13-40T00:00:00Z'); bad('u', 'javascript:alert(1)'); bad('u', 'ftp://x.org'); bad('s', 'Has Space');
});

test('validate: partial mode only touches provided fields; optional empty values reset', () => {
  const spec = { a: v.str({ max: 5 }), b: v.str({ max: 5 }).optional(null) };
  assert.deepEqual(validate(spec, { a: 'x' }, { partial: true }), { a: 'x' });
  assert.deepEqual(validate(spec, {}, { partial: true }), {});
  assert.deepEqual(validate(spec, { b: '' }, { partial: true }), { b: null });
  assert.throws(() => validate(spec, { a: '' }, { partial: true }), (e) => e.fields.a === 'is required');
});

test('validate: arrays and nested objects', () => {
  const spec = { items: v.array(v.object({ topic: v.enum(['x', 'y']), on: v.bool() }), { min: 1, max: 2 }) };
  assert.equal(validate(spec, { items: [{ topic: 'x', on: true }] }).items.length, 1);
  assert.throws(() => validate(spec, { items: [] }), (e) => /1–2 items/.test(e.fields.items));
  assert.throws(() => validate(spec, { items: [{ topic: 'z', on: true }] }), (e) => /item 1: topic/.test(e.fields.items));
});

test('validate: words() limits by word count', () => {
  const rule = { body: words({ maxWords: 5 }) };
  assert.equal(validate(rule, { body: 'one two three four five' }).body, 'one two three four five');
  assert.throws(() => validate(rule, { body: 'one two three four five six' }), (e) => /at most 5 words/.test(e.fields.body));
});

test('paging clamps limit and offset', () => {
  assert.deepEqual(paging({ limit: '999', offset: '-4' }, { max: 50 }), { limit: 50, offset: 0 });
  assert.deepEqual(paging({}, { max: 50, def: 20 }), { limit: 20, offset: 0 });
  assert.deepEqual(paging({ limit: 'x' }, { max: 50, def: 7 }), { limit: 7, offset: 0 });
});

test('text helpers', () => {
  assert.equal(preview('a b c d e', 3), 'a b c…');
  assert.equal(preview('a b', 3), 'a b');
  assert.equal(snippet('short', 200), 'short');
  assert.ok(snippet('word '.repeat(100), 50).length <= 51);
  assert.equal(oneLine('a\r\nb\nc'), 'a b c');
  assert.equal(oneLine('x pZl{} y'), 'x pZl{} y');
});

test('crypto: scrypt hashes verify, differ per call, reject wrong passwords', async () => {
  const h1 = await hashPassword('s3cret-pass');
  const h2 = await hashPassword('s3cret-pass');
  assert.notEqual(h1, h2);
  assert.ok(await verifyPassword('s3cret-pass', h1));
  assert.ok(!(await verifyPassword('s3cret-pasx', h1)));
  assert.ok(!(await verifyPassword('s3cret-pass', 'garbage')));
});

test('crypto: codes are 6 digits, bound to user+purpose; tokens are tamper-proof', () => {
  assert.match(newCode(), /^\d{6}$/);
  const a = hashCode('k'.repeat(32), 'u1', 'verify_email', '123456');
  assert.ok(a.equals(hashCode('k'.repeat(32), 'u1', 'verify_email', '123456')));
  assert.ok(!a.equals(hashCode('k'.repeat(32), 'u2', 'verify_email', '123456')));
  assert.ok(!a.equals(hashCode('k'.repeat(32), 'u1', 'reset_password', '123456')));

  const secret = 's'.repeat(32);
  const tok = signToken(secret, 'hello');
  assert.equal(readToken(secret, tok), 'hello');
  assert.equal(readToken(secret, tok + 'x'), null);
  assert.equal(readToken('other'.repeat(8), tok), null);
  const uid = '11111111-2222-3333-4444-555555555555';
  assert.equal(userIdFromUnsubscribeToken(secret, unsubscribeToken(secret, uid)), uid);
  assert.equal(userIdFromUnsubscribeToken(secret, signToken(secret, 'unsub:not-a-uuid')), null);
});

test('tz: UTC+3 label and formatting', () => {
  assert.equal(tzLabel('Etc/GMT-3'), 'UTC+3');
  assert.equal(tzLabel('UTC'), 'UTC+0');
  assert.equal(formatDateTime(new Date('2026-07-10T11:30:00Z'), 'Etc/GMT-3'), '2026-07-10 14:30 (UTC+3)');
});

test('tz: lastSlot returns the most recent daily / weekly slot', () => {
  const tz = 'Etc/GMT-3';
  // 08:00 local = 05:00 UTC. Thursday 2026-10-01 09:00 local → today's 08:00 slot
  assert.equal(lastSlot(new Date('2026-10-01T06:00:00Z'), tz, 8, null).toISOString(), '2026-10-01T05:00:00.000Z');
  // 07:00 local is before the slot → yesterday's slot
  assert.equal(lastSlot(new Date('2026-10-01T04:00:00Z'), tz, 8, null).toISOString(), '2026-09-30T05:00:00.000Z');
  // exactly on the slot counts as reached
  assert.equal(lastSlot(new Date('2026-10-01T05:00:00Z'), tz, 8, null).toISOString(), '2026-10-01T05:00:00.000Z');
  // weekly (Monday=1): Thursday 2026-10-01 → Monday 2026-09-28 08:00 local
  assert.equal(lastSlot(new Date('2026-10-01T06:00:00Z'), tz, 8, 1).toISOString(), '2026-09-28T05:00:00.000Z');
  // on Monday before the slot → previous Monday
  assert.equal(lastSlot(new Date('2026-09-28T04:00:00Z'), tz, 8, 1).toISOString(), '2026-09-21T05:00:00.000Z');
});

test('crypto: a burst of hashing queues instead of failing (parallel cap)', async () => {
  const hashes = await Promise.all(Array.from({ length: 10 }, (_, i) => hashPassword(`burst-password-${i}`)));
  assert.equal(new Set(hashes).size, 10);
  const checks = await Promise.all(hashes.map((h, i) => verifyPassword(`burst-password-${i}`, h)));
  assert.ok(checks.every(Boolean));
});
