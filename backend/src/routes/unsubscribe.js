// One-click unsubscribe from Mongolist e-mails (RFC 8058): HMAC-signed token, no login.
// GET only shows a confirmation page (link scanners must not unsubscribe people); POST performs it.
// The page speaks Mongolian when the link has &lang=mn (digest e-mails to Mongolian-language members add it).
import { userIdFromUnsubscribeToken } from '../lib/crypto.js';
import { langOf } from '../lib/lang.js';
import { escapeHtml as h } from '../lib/text.js';

const T = {
  en: {
    invalidTitle: 'Invalid link',
    invalidBody: 'This unsubscribe link is not valid.',
    invalidJson: 'Invalid unsubscribe link.',
    confirmTitle: 'Unsubscribe',
    confirmHeading: 'Unsubscribe from Mongolist',
    confirmBody: 'You will stop receiving all IAML news, event, publication and discussion e-mails.',
    button: 'Unsubscribe',
    doneTitle: 'Unsubscribed',
    doneHeading: 'You are unsubscribed',
    doneBody: 'You will no longer receive Mongolist e-mails. You can subscribe again at any time in your account.',
    back: 'Back to the IAML website',
    suffix: 'IAML',
  },
  mn: {
    invalidTitle: 'Холбоос буруу байна',
    invalidBody: 'Захиалгаа цуцлах энэ холбоос хүчингүй байна.',
    invalidJson: 'Захиалгаа цуцлах холбоос хүчингүй байна.',
    confirmTitle: 'Захиалгаа цуцлах',
    confirmHeading: 'Mongolist-ийн захиалгаа цуцлах',
    confirmBody: 'Та ОУМХСН-ийн мэдээ, арга хэмжээ, нийтлэл, хэлэлцүүлгийн имэйл хүлээн авахаа зогсооно.',
    button: 'Захиалгаа цуцлах',
    doneTitle: 'Захиалга цуцлагдлаа',
    doneHeading: 'Та захиалгаа цуцаллаа',
    doneBody: 'Та цаашид Mongolist-ийн имэйл хүлээн авахгүй. Хүссэн үедээ бүртгэлийн хэсэгтээ дахин захиалах боломжтой.',
    back: 'ОУМХСН-ийн вэбсайт руу буцах',
    suffix: 'ОУМХСН',
  },
};

const page = (t, lang, title, bodyHtml, siteUrl) => `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${h(title)} — ${h(t.suffix)}</title>
<style>
  body{margin:0;background:#f4f6fa;font:16px/1.6 system-ui,Arial,sans-serif;color:#0f172a;display:grid;min-height:100vh;place-items:center;padding:16px}
  main{max-width:460px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:32px 28px;text-align:center}
  h1{margin:0 0 12px;font:600 24px Georgia,serif;color:#003F87}
  p{margin:0 0 16px}
  button,a.btn{display:inline-block;background:#003F87;color:#fff;border:0;border-radius:6px;padding:10px 22px;font:600 15px system-ui,Arial,sans-serif;text-decoration:none;cursor:pointer}
  a.plain{color:#003F87}
</style></head><body><main>${bodyHtml}<p style="margin-top:20px"><a class="plain" href="${h(siteUrl)}/">${h(t.back)}</a></p></main></body></html>`;

export default async function unsubscribeRoutes(app) {
  const { db, config } = app;

  const userFromToken = (t) => userIdFromUnsubscribeToken(config.sessionSecret, t);
  const wantsHtml = (req) => (req.headers.accept ?? '').includes('text/html');

  // RFC 8058 one-click POSTs ("List-Unsubscribe=One-Click") and the confirmation form are form-encoded.
  // Only this plugin (encapsulated) accepts that content type; the body itself is ignored — the token is in the URL.
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string', bodyLimit: 4096 }, (req, body, done) => done(null, {}));

  const invalidPage = (req, reply) => {
    const lang = langOf(req);
    const t = T[lang];
    return reply.code(400).type('text/html; charset=utf-8').send(
      page(t, lang, t.invalidTitle, `<h1>${h(t.invalidTitle)}</h1><p>${h(t.invalidBody)}</p>`, config.siteUrl),
    );
  };

  app.get('/api/unsubscribe', async (req, reply) => {
    const lang = langOf(req);
    const t = T[lang];
    const token = String(req.query?.t ?? '');
    if (!userFromToken(token)) return invalidPage(req, reply);
    const action = `/api/unsubscribe?t=${encodeURIComponent(token)}${lang === 'mn' ? '&lang=mn' : ''}`;
    return reply.type('text/html; charset=utf-8').send(
      page(
        t, lang, t.confirmTitle,
        `<h1>${h(t.confirmHeading)}</h1><p>${h(t.confirmBody)}</p>
         <form method="post" action="${h(action)}"><button type="submit">${h(t.button)}</button></form>`,
        config.siteUrl,
      ),
    );
  });

  app.post('/api/unsubscribe', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    const lang = langOf(req);
    const t = T[lang];
    const userId = userFromToken(String(req.query?.t ?? ''));
    if (!userId) {
      if (wantsHtml(req)) return invalidPage(req, reply);
      return reply.code(400).send({ error: { code: 'validation_error', message: T.en.invalidJson } });
    }
    await db.query('update subscription_prefs set enabled = false, updated_at = now() where user_id = $1 and enabled', [userId]);
    if (wantsHtml(req)) {
      return reply.type('text/html; charset=utf-8').send(
        page(t, lang, t.doneTitle, `<h1>${h(t.doneHeading)}</h1><p>${h(t.doneBody)}</p>`, config.siteUrl),
      );
    }
    return { ok: true };
  });
}
