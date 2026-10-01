// Fastify application factory. server.js starts it; tests build it directly.
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { createRequire } from 'node:module';
import { createDb } from './db.js';
import { HttpError, rateLimited } from './errors.js';
import { createBudget } from './lib/budget.js';
import { mapPgError } from './lib/pgerrors.js';
import { createTransport } from './mail/transports.js';
import { createMailWorker } from './mail/worker.js';
import { runDigest } from './jobs/digest.js';
import securityPlugin from './plugins/security.js';
import sessionPlugin from './plugins/session.js';
import staticPlugin from './plugins/static.js';
import registerRoutes from './routes/index.js';

function loggerOptions(config) {
  if (config.isTest) return false;
  const opts = {
    level: config.logLevel,
    redact: { paths: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'], censor: '[redacted]' },
    serializers: {
      // never log query strings (tokens) or headers
      req: (req) => ({ method: req.method, url: String(req.url).split('?')[0], ip: req.ip }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
  };
  if (!config.isProd && process.stdout.isTTY) {
    try {
      createRequire(import.meta.url).resolve('pino-pretty');
      opts.transport = { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } };
    } catch { /* pino-pretty is a devDependency; plain JSON logs are fine */ }
  }
  return opts;
}

const STATUS_CODES = { 400: 'bad_request', 401: 'unauthenticated', 403: 'forbidden', 404: 'not_found', 405: 'method_not_allowed', 409: 'conflict', 413: 'payload_too_large', 415: 'unsupported_media_type', 429: 'rate_limited' };

export async function buildApp(config, { db: injectedDb, transport: injectedTransport } = {}) {
  const app = Fastify({
    logger: loggerOptions(config),
    trustProxy: config.trustProxy,
    bodyLimit: 256 * 1024,
    requestIdHeader: false,
    routerOptions: { ignoreTrailingSlash: true, maxParamLength: 200 },
  });

  app.decorate('config', config);
  app.decorate('budget', createBudget()); // global ceilings for abusable operations (code e-mails, registrations, …)
  const db = injectedDb ?? createDb(config.databaseUrl, { max: config.dbPoolMax, onError: (err) => app.log.error({ err }, 'pg pool error') });
  app.decorate('db', db);
  if (!injectedDb) app.addHook('onClose', async () => { await db.close(); });

  const transport = injectedTransport ?? createTransport(config, { log: app.log });
  const worker = createMailWorker({ db, config, transport, log: app.log });
  app.decorate('mail', { transport, worker });
  app.decorate('jobs', { runDigest: (opts) => runDigest({ db, config, log: app.log }, opts) });

  // JSON bodies: empty body → {}, no prototype-pollution keys.
  app.addContentTypeParser('application/json', { parseAs: 'string', bodyLimit: 256 * 1024 }, (req, body, done) => {
    if (!body) return done(null, {});
    try {
      done(null, JSON.parse(body, (k, v) => (k === '__proto__' || k === 'constructor' ? undefined : v)));
    } catch {
      done(new HttpError(400, 'validation_error', 'The request body is not valid JSON.'));
    }
  });

  app.setErrorHandler((rawErr, req, reply) => {
    const err = mapPgError(rawErr) ?? rawErr;
    if (err instanceof HttpError) {
      const { retryAfter, ...extra } = err.extra ?? {};
      if (retryAfter) reply.header('Retry-After', String(retryAfter));
      const error = { code: err.code, message: err.message, ...extra };
      if (err.fields) error.fields = err.fields;
      return reply.code(err.status).send({ error });
    }
    const status = Number(err.statusCode) || 500;
    if (status === 429) {
      return reply.code(429).send({ error: { code: 'rate_limited', message: 'Too many requests. Please try again later.' } });
    }
    if (status >= 400 && status < 500) {
      let code = STATUS_CODES[status] ?? 'bad_request';
      let message = err.message || 'Bad request.';
      if (err.code === 'FST_REQ_FILE_TOO_LARGE' || err.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
        code = 'payload_too_large';
        message = 'The upload is too large.';
      }
      if (err.code?.startsWith('FST_ERR_CTP_')) {
        message = status === 415 ? 'Unsupported content type.' : status === 413 ? 'The request is too large.' : 'The request body is invalid.';
        if (status === 400) code = 'validation_error';
      }
      return reply.code(status).send({ error: { code, message } });
    }
    req.log.error({ err }, 'unhandled error');
    return reply.code(500).send({ error: { code: 'internal_error', message: 'Something went wrong on our side. Please try again.' } });
  });

  await app.register(cookie);
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    errorResponseBuilder: (req, ctx) => rateLimited('Too many requests. Please try again later.', Math.max(1, Math.ceil(ctx.ttl / 1000))),
  });
  await app.register(multipart, {
    throwFileSizeLimit: true,
    limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 0, fieldSize: 1024, parts: 2, headerPairs: 30 },
  });

  // Plain functions (not app.register): their hooks/decorators must live on the root scope.
  await securityPlugin(app);
  await sessionPlugin(app);
  await staticPlugin(app);
  await app.register(registerRoutes);

  return app;
}
