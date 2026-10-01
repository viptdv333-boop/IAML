// Environment → validated, frozen config object. See docs/API.md §8 for the variable list.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const BACKEND_DIR = path.resolve(here, '..');
export const REPO_DIR = path.resolve(BACKEND_DIR, '..');

const pkg = JSON.parse(readFileSync(path.join(BACKEND_DIR, 'package.json'), 'utf8'));

export class ConfigError extends Error {
  constructor(problems) {
    super('Invalid configuration:\n - ' + problems.join('\n - '));
    this.name = 'ConfigError';
    this.problems = problems;
  }
}

const TRUE = new Set(['1', 'true', 'yes', 'on']);
const FALSE = new Set(['0', 'false', 'no', 'off']);

export function loadConfig(env = process.env) {
  const problems = [];
  const get = (key, def) => (env[key] !== undefined && env[key] !== '' ? String(env[key]) : def);

  const bool = (key, def) => {
    const raw = get(key, undefined);
    if (raw === undefined) return def;
    const v = raw.toLowerCase();
    if (TRUE.has(v)) return true;
    if (FALSE.has(v)) return false;
    problems.push(`${key} must be true/false (got "${raw}")`);
    return def;
  };
  const int = (key, def, min, max) => {
    const raw = get(key, undefined);
    if (raw === undefined) return def;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min || n > max) {
      problems.push(`${key} must be an integer between ${min} and ${max} (got "${raw}")`);
      return def;
    }
    return n;
  };

  const nodeEnv = get('NODE_ENV', 'development');
  const isProd = nodeEnv === 'production';

  // ── required ──
  const databaseUrl = get('DATABASE_URL', undefined);
  if (!databaseUrl) problems.push('DATABASE_URL is required');

  let siteUrl = get('SITE_URL', undefined);
  let siteOrigin = '';
  let secureCookies = false;
  if (!siteUrl) {
    problems.push('SITE_URL is required (public origin, e.g. https://iaml.org)');
  } else {
    try {
      const u = new URL(siteUrl);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('protocol');
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
      if (isProd && u.protocol !== 'https:' && !local) problems.push('SITE_URL must be https:// in production');
      siteOrigin = u.origin;
      siteUrl = siteOrigin; // the site lives at the origin root
      secureCookies = u.protocol === 'https:';
    } catch {
      problems.push(`SITE_URL is not a valid http(s) URL (got "${siteUrl}")`);
    }
  }

  const sessionSecret = get('SESSION_SECRET', undefined);
  if (!sessionSecret) problems.push('SESSION_SECRET is required (≥ 32 random characters)');
  else if (sessionSecret.length < 32) problems.push('SESSION_SECRET must be at least 32 characters');

  // ── mail ──
  const transport = get('MAIL_TRANSPORT', 'log');
  if (!['log', 'resend'].includes(transport)) problems.push(`MAIL_TRANSPORT must be "log" or "resend" (got "${transport}")`);
  const resendApiKey = get('RESEND_API_KEY', '');
  const mailFrom = get('MAIL_FROM', '');
  if (transport === 'resend') {
    if (!resendApiKey) problems.push('RESEND_API_KEY is required when MAIL_TRANSPORT=resend');
    if (!mailFrom) problems.push('MAIL_FROM is required when MAIL_TRANSPORT=resend (e.g. "IAML <no-reply@iaml.org>")');
  }

  // ── schedule ──
  const siteTz = get('SITE_TZ', 'Etc/GMT-3'); // Etc/GMT-3 == UTC+3 (the POSIX sign is inverted)
  try {
    new Intl.DateTimeFormat('en', { timeZone: siteTz });
  } catch {
    problems.push(`SITE_TZ is not a valid IANA time zone (got "${siteTz}")`);
  }

  // numeric / boolean settings are validated BEFORE the problem check so a typo is reported, not silently ignored
  const port = int('PORT', 3000, 1, 65535);
  const dbPoolMax = int('DB_POOL_MAX', 10, 1, 100);
  // TRUST_PROXY: true = trust every hop of X-Forwarded-For, a number = trust exactly that many proxy hops
  // (behind Caddy: 1), false = use the socket address.
  let trustProxy = false;
  const rawProxy = get('TRUST_PROXY', undefined);
  if (rawProxy !== undefined) {
    if (/^\d+$/.test(rawProxy)) trustProxy = Number(rawProxy);
    else if (TRUE.has(rawProxy.toLowerCase())) trustProxy = true;
    else if (!FALSE.has(rawProxy.toLowerCase())) problems.push(`TRUST_PROXY must be true, false or a number of proxy hops (got "${rawProxy}")`);
  }
  const minIntervalMs = int('MAIL_MIN_INTERVAL_MS', 600, 0, 60000);
  const workerIntervalMs = int('MAIL_WORKER_INTERVAL_MS', 2000, 100, 60000);
  const digestHour = int('DIGEST_HOUR', 8, 0, 23);
  const digestWeekday = int('DIGEST_WEEKDAY', 1, 1, 7);
  const migrateOnStart = bool('MIGRATE_ON_START', true);
  const jobsEnabled = bool('JOBS_ENABLED', true);

  // a secret copied from the README / examples must never protect a real site
  if (isProd && sessionSecret && /^(dev-only|change-?me|test-secret|ci-only)|0123456789abcdef0123456789abcdef/i.test(sessionSecret)) {
    problems.push('SESSION_SECRET looks like a sample value from the documentation — generate a random one (deploy/gen-env.sh)');
  }
  const warnings = [];
  if (isProd && transport === 'log') warnings.push('MAIL_TRANSPORT=log in production: no e-mail is delivered and one-time codes stay readable in the database');

  if (problems.length) throw new ConfigError(problems);

  return Object.freeze({
    warnings,
    env: nodeEnv,
    isProd,
    isTest: nodeEnv === 'test',
    version: pkg.version,
    port,
    host: get('HOST', '0.0.0.0'),
    databaseUrl,
    dbPoolMax,
    siteUrl,
    siteOrigin,
    secureCookies,
    sessionSecret,
    trustProxy,
    staticDir: path.resolve(get('STATIC_DIR', REPO_DIR)),
    uploadsDir: path.resolve(get('UPLOADS_DIR', path.join(BACKEND_DIR, 'data', 'uploads'))),
    mail: Object.freeze({
      transport,
      resendApiKey,
      resendApiBase: get('RESEND_API_BASE', 'https://api.resend.com').replace(/\/+$/, ''),
      from: mailFrom || 'IAML <no-reply@localhost>',
      minIntervalMs,
      workerIntervalMs,
    }),
    siteTz,
    digestHour,
    digestWeekday,
    migrateOnStart,
    jobsEnabled,
    logLevel: get('LOG_LEVEL', isProd ? 'info' : 'debug'),
  });
}
