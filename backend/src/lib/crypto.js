// Password hashing (scrypt), one-time e-mail codes (HMAC), signed tokens.
import { createHmac, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { HttpError } from '../errors.js';

const scryptAsync = promisify(scrypt);
const N = 65536, R = 8, P = 1, KEYLEN = 64;
const MAXMEM = 160 * 1024 * 1024; // 128·N·r = 64 MiB needed; leave headroom

// Each scrypt costs ~64 MiB and ~100 ms of CPU: cap the parallel ones, and the queue behind them, so a flood of
// log-in / registration requests degrades into quick "busy" answers instead of exhausting memory or starving
// everyone else's log-ins.
const MAX_PARALLEL_HASHES = 4;
const MAX_HASH_QUEUE = 40;
let activeHashes = 0;
const hashQueue = [];
async function withHashSlot(fn) {
  if (activeHashes < MAX_PARALLEL_HASHES) {
    activeHashes++;
  } else {
    if (hashQueue.length >= MAX_HASH_QUEUE) throw new HttpError(503, 'busy', 'The server is busy. Please try again in a moment.');
    await new Promise((resolve) => hashQueue.push(resolve)); // the releasing task hands its slot over
  }
  try {
    return await fn();
  } finally {
    const next = hashQueue.shift();
    if (next) next(); else activeHashes--;
  }
}

/** "scrypt$N$r$p$salt$hash" (base64url). */
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const dk = await withHashSlot(() => scryptAsync(password.normalize('NFKC'), salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM }));
  return ['scrypt', N, R, P, salt.toString('base64url'), dk.toString('base64url')].join('$');
}

export async function verifyPassword(password, stored) {
  let scheme, n, r, p, salt, expected;
  try {
    let hash;
    [scheme, n, r, p, salt, hash] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    expected = Buffer.from(hash, 'base64url');
    salt = Buffer.from(salt, 'base64url');
  } catch {
    return false;
  }
  let dk;
  try {
    dk = await withHashSlot(() => scryptAsync(password.normalize('NFKC'), salt, expected.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: MAXMEM }));
  } catch (err) {
    if (err instanceof HttpError) throw err; // "busy" must not be mistaken for a wrong password
    return false;
  }
  return dk.length === expected.length && timingSafeEqual(dk, expected);
}

/** A throw-away hash used to keep login timing uniform for unknown e-mails. */
let dummy;
export async function dummyVerify(password) {
  dummy ??= await hashPassword('iaml-timing-equaliser');
  await verifyPassword(password, dummy);
  return false;
}

/** Uniform 6-digit numeric code. */
export const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

/** HMAC of a code, bound to user + purpose so a code can't be replayed elsewhere. */
export function hashCode(secret, userId, purpose, code) {
  return createHmac('sha256', secret).update(`code:${userId}:${purpose}:${code}`).digest();
}

export function safeEqual(a, b) {
  const x = Buffer.isBuffer(a) ? a : Buffer.from(String(a));
  const y = Buffer.isBuffer(b) ? b : Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Signed token for one-click unsubscribe: base64url(userId.topic?).sig — no expiry (unsubscribe links must keep working). */
export function signToken(secret, payload) {
  const body = Buffer.from(payload).toString('base64url');
  const sig = createHmac('sha256', secret).update(`tok:${body}`).digest('base64url');
  return `${body}.${sig}`;
}

export function readToken(secret, token) {
  if (typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = createHmac('sha256', secret).update(`tok:${body}`).digest('base64url');
  if (!safeEqual(sig, expected)) return null;
  try { return Buffer.from(body, 'base64url').toString('utf8'); } catch { return null; }
}

/** Token embedded in Mongolist e-mails (List-Unsubscribe). */
export const unsubscribeToken = (secret, userId) => signToken(secret, `unsub:${userId}`);

/** → user id (uuid) or null when the token is forged / malformed. */
export function userIdFromUnsubscribeToken(secret, token) {
  const m = /^unsub:([0-9a-f-]{36})$/.exec(readToken(secret, token) ?? '');
  return m ? m[1] : null;
}
