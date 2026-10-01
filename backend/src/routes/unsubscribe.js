// One-click unsubscribe from Mongolist e-mails (RFC 8058): HMAC-signed token, no login.
// GET only shows a confirmation page (link scanners must not unsubscribe people); POST performs it.
import { userIdFromUnsubscribeToken } from '../lib/crypto.js';
import { escapeHtml as h } from '../lib/text.js';

const page = (title, bodyHtml, siteUrl) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${h(title)} — IAML</title>
<style>
  body{margin:0;background:#f4f6fa;font:16px/1.6 system-ui,Arial,sans-serif;color:#0f172a;display:grid;min-height:100vh;place-items:center;padding:16px}
  main{max-width:460px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:32px 28px;text-align:center}
  h1{margin:0 0 12px;font:600 24px Georgia,serif;color:#003F87}
  p{margin:0 0 16px}
  button,a.btn{display:inline-block;background:#003F87;color:#fff;border:0;border-radius:6px;padding:10px 22px;font:600 15px system-ui,Arial,sans-serif;text-decoration:none;cursor:pointer}
  a.plain{color:#003F87}
</style></head><body><main>${bodyHtml}<p style="margin-top:20px"><a class="plain" href="${h(siteUrl)}/">Back to the IAML website</a></p></main></body></html>`;

export default async function unsubscribeRoutes(app) {
  const { db, config } = app;

  const userFromToken = (t) => userIdFromUnsubscribeToken(config.sessionSecret, t);

  // RFC 8058 one-click POSTs ("List-Unsubscribe=One-Click") and the confirmation form are form-encoded.
  // Only this plugin (encapsulated) accepts that content type; the body itself is ignored — the token is in the URL.
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string', bodyLimit: 4096 }, (req, body, done) => done(null, {}));

  app.get('/api/unsubscribe', async (req, reply) => {
    const t = String(req.query?.t ?? '');
    if (!userFromToken(t)) {
      return reply.code(400).type('text/html; charset=utf-8').send(page('Invalid link', '<h1>Invalid link</h1><p>This unsubscribe link is not valid.</p>', config.siteUrl));
    }
    return reply.type('text/html; charset=utf-8').send(
      page(
        'Unsubscribe',
        `<h1>Unsubscribe from Mongolist</h1><p>You will stop receiving all IAML news, event, publication and discussion e-mails.</p>
         <form method="post" action="/api/unsubscribe?t=${h(encodeURIComponent(t))}"><button type="submit">Unsubscribe</button></form>`,
        config.siteUrl,
      ),
    );
  });

  app.post('/api/unsubscribe', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    const userId = userFromToken(String(req.query?.t ?? ''));
    if (!userId) {
      if ((req.headers.accept ?? '').includes('text/html')) {
        return reply.code(400).type('text/html; charset=utf-8').send(page('Invalid link', '<h1>Invalid link</h1><p>This unsubscribe link is not valid.</p>', config.siteUrl));
      }
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid unsubscribe link.' } });
    }
    await db.query('update subscription_prefs set enabled = false, updated_at = now() where user_id = $1 and enabled', [userId]);
    if ((req.headers.accept ?? '').includes('text/html')) {
      return reply.type('text/html; charset=utf-8').send(
        page('Unsubscribed', '<h1>You are unsubscribed</h1><p>You will no longer receive Mongolist e-mails. You can subscribe again at any time in your account.</p>', config.siteUrl),
      );
    }
    return { ok: true };
  });
}
