// Security headers (CSP for HTML), CSRF defence for the JSON API, no-store for API responses.
import { forbidden } from '../errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export default async function securityPlugin(app) {
  const { config } = app;
  const allowedOrigins = new Set([config.siteOrigin]);
  if (!config.isProd) {
    allowedOrigins.add(`http://localhost:${config.port}`);
    allowedOrigins.add(`http://127.0.0.1:${config.port}`);
  }

  // CSRF: cookies are SameSite=Lax; on top of that every state-changing API call must carry a custom
  // header (impossible cross-site without CORS, which we never enable) and a same-origin Origin.
  // Decided on the MATCHED route (not on the raw URL text, which can be percent-encoded or absolute-form), and for
  // every non-safe method, so no spelling of a URL skips the check.
  app.addHook('onRequest', async (req) => {
    if (SAFE_METHODS.has(req.method)) return;
    if (req.routeOptions?.url === '/api/unsubscribe') return; // token-authenticated one-click link (RFC 8058 POST has no custom header)
    if (req.headers['x-requested-with'] !== 'IAML') {
      throw forbidden('Missing X-Requested-With header.', 'csrf');
    }
    const origin = req.headers.origin;
    if (origin && !allowedOrigins.has(origin)) throw forbidden('Cross-origin request blocked.', 'csrf');
    const fetchSite = req.headers['sec-fetch-site'];
    if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') throw forbidden('Cross-site request blocked.', 'csrf');
  });

  app.addHook('onSend', async (req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Cross-Origin-Opener-Policy', 'same-origin');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
    if (config.secureCookies) reply.header('Strict-Transport-Security', 'max-age=31536000');

    const type = String(reply.getHeader('content-type') || '');
    if ((req.routeOptions?.url ?? '').startsWith('/api/') || req.url.startsWith('/api/')) {
      reply.header('Cache-Control', 'no-store');
    }
    if (type.startsWith('text/html')) reply.header('Content-Security-Policy', CSP);
    return payload;
  });
}
