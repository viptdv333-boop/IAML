// E-mail templates: every message has a plain-text body and a simple, inline-styled HTML body (no remote images).
import { escapeHtml as h, oneLine } from '../lib/text.js';

const BRAND = '#003F87';
const NAME = 'International Association for Mongolic Linguistics';

function layout({ preheader, heading, bodyHtml, footerHtml = '' }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${h(heading)}</title></head>
<body style="margin:0;padding:0;background:#f4f6fa;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${h(preheader || '')}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
<tr><td style="background:${BRAND};padding:18px 28px;color:#ffffff;font:600 17px Georgia,'Times New Roman',serif;letter-spacing:.3px;">IAML <span style="font:400 12px Arial,Helvetica,sans-serif;opacity:.8;margin-left:8px;">${h(NAME)}</span></td></tr>
<tr><td style="padding:28px;font:15px/1.6 Arial,Helvetica,sans-serif;color:#0f172a;">
<h1 style="margin:0 0 16px;font:600 22px Georgia,'Times New Roman',serif;color:${BRAND};">${h(heading)}</h1>
${bodyHtml}
</td></tr>
<tr><td style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font:12px/1.5 Arial,Helvetica,sans-serif;color:#64748b;">${footerHtml}</td></tr>
</table></td></tr></table></body></html>`;
}

const p = (html) => `<p style="margin:0 0 14px;">${html}</p>`;
const codeBox = (code) =>
  `<p style="margin:18px 0;text-align:center;"><span style="display:inline-block;padding:12px 22px;border:1px solid #cbd5e1;border-radius:6px;background:#f1f5f9;font:700 28px 'Courier New',monospace;letter-spacing:6px;color:${BRAND};">${h(code)}</span></p>`;
const button = (href, label) =>
  `<p style="margin:20px 0;"><a href="${h(href)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:600;">${h(label)}</a></p>`;

const greet = (firstName) => `Hello${firstName ? ` ${oneLine(firstName)}` : ''},`;
const SIGNOFF = `— ${NAME}`;

export function verifyEmailMail({ code, siteUrl }) {
  const text = `${greet()}

Your IAML confirmation code is: ${code}

It is valid for 15 minutes. Enter it on the website to finish creating your account.
If you did not register, you can ignore this message.

${SIGNOFF}
${siteUrl}`;
  const html = layout({
    preheader: 'Your one-time confirmation code',
    heading: 'Confirm your e-mail',
    bodyHtml:
      p(h(greet())) +
      p('Use this one-time code to finish creating your IAML account:') +
      codeBox(code) +
      p('It is valid for 15 minutes. If you did not register, you can safely ignore this message.'),
    footerHtml: `${h(NAME)} · <a href="${h(siteUrl)}" style="color:#64748b;">${h(siteUrl)}</a>`,
  });
  return { subject: 'Your IAML confirmation code', text, html }; // the code stays out of the subject: subjects are not scrubbed
}

export function resetPasswordMail({ code, siteUrl }) {
  const text = `${greet()}

Your IAML password reset code is: ${code}

It is valid for 15 minutes. If you did not ask to reset your password, ignore this message — your password stays unchanged.

${SIGNOFF}
${siteUrl}`;
  const html = layout({
    preheader: 'Your one-time password reset code',
    heading: 'Reset your password',
    bodyHtml:
      p(h(greet())) +
      p('Use this one-time code to choose a new password:') +
      codeBox(code) +
      p('It is valid for 15 minutes. If you did not ask for this, ignore the message — your password stays unchanged.'),
    footerHtml: `${h(NAME)} · <a href="${h(siteUrl)}" style="color:#64748b;">${h(siteUrl)}</a>`,
  });
  return { subject: 'Your IAML password reset code', text, html };
}

export function accountExistsMail({ siteUrl }) {
  const text = `${greet()}

Someone (hopefully you) tried to register on the IAML website with this e-mail address, but an account already exists.

You can log in here: ${siteUrl}/
If you forgot your password, use "Forgot password" in the login window.

If this wasn't you, no action is needed.

${SIGNOFF}`;
  const html = layout({
    preheader: 'You already have an IAML account',
    heading: 'You already have an account',
    bodyHtml:
      p(h(greet())) +
      p('Someone (hopefully you) tried to register on the IAML website with this e-mail address, but an account already exists.') +
      button(`${siteUrl}/`, 'Go to the website') +
      p('If you forgot your password, use <b>Forgot password</b> in the login window. If this was not you, no action is needed.'),
    footerHtml: h(NAME),
  });
  return { subject: 'You already have an IAML account', text, html };
}

/** Message from the Contacts / Participants form, sent to the configured recipients (reply-to = sender). */
export function contactMail({ msg, siteUrl }) {
  const where = msg.source === 'participants' ? 'Participants page' : 'Contacts page';
  const subject = oneLine(msg.subject) || `Message from ${oneLine(msg.name)}`;
  const text = `New message via the ${where}

From:    ${oneLine(msg.name)} <${msg.email}>
Subject: ${oneLine(msg.subject) || '—'}

${msg.message}

— Reply to this e-mail to answer the sender. The message is also stored in the admin panel (${siteUrl}/admin.html).`;
  const html = layout({
    preheader: `Message from ${oneLine(msg.name)}`,
    heading: 'New message from the website',
    bodyHtml:
      p(`<b>Page:</b> ${h(where)}<br><b>From:</b> ${h(oneLine(msg.name))} &lt;${h(msg.email)}&gt;<br><b>Subject:</b> ${h(oneLine(msg.subject) || '—')}`) +
      `<div style="margin:0 0 14px;padding:12px 14px;background:#f8fafc;border-left:3px solid ${BRAND};white-space:pre-wrap;">${h(msg.message)}</div>` +
      p('Reply to this e-mail to answer the sender.'),
    footerHtml: `Stored in the <a href="${h(siteUrl)}/admin.html" style="color:#64748b;">admin panel</a>.`,
  });
  return { subject: `[IAML ${where}] ${subject}`.slice(0, 200), text, html };
}

const TOPIC_TITLES = {
  news: 'News',
  events: 'Events',
  publications: 'Publications',
  participants: 'New participants',
  discuss: 'New discussions',
};

/**
 * Mongolist digest. sections: [{ topic, items: [{ title, meta?, snippet? }], more, url }]
 * `instant` = true uses the "new on the site" wording instead of "your digest".
 */
export function digestMail({ firstName, sections, siteUrl, unsubscribeUrl, instant = false }) {
  const total = sections.reduce((n, s) => n + s.items.length + (s.more || 0), 0);
  const heading = instant ? 'New on the IAML website' : 'Your IAML digest';

  let text = `${greet(firstName)}\n\n${instant ? 'Here is what is new on the IAML website:' : 'Here is what happened on the IAML website since your last digest:'}\n`;
  let body = p(h(greet(firstName))) + p(instant ? 'Here is what is new on the IAML website:' : 'Here is what happened on the IAML website since your last digest:');
  for (const s of sections) {
    const title = TOPIC_TITLES[s.topic] ?? s.topic;
    text += `\n== ${title} ==\n`;
    body += `<h2 style="margin:22px 0 8px;font:600 17px Georgia,'Times New Roman',serif;color:${BRAND};border-bottom:1px solid #e2e8f0;padding-bottom:4px;">${h(title)}</h2>`;
    for (const it of s.items) {
      text += `• ${it.title}${it.meta ? ` — ${it.meta}` : ''}\n`;
      if (it.snippet) text += `  ${it.snippet}\n`;
      body += `<p style="margin:0 0 10px;"><b>${h(it.title)}</b>${it.meta ? `<br><span style="color:#64748b;font-size:13px;">${h(it.meta)}</span>` : ''}${it.snippet ? `<br>${h(it.snippet)}` : ''}</p>`;
    }
    if (s.more) {
      text += `…and ${s.more} more\n`;
      body += `<p style="margin:0 0 10px;color:#64748b;">…and ${s.more} more</p>`;
    }
    text += `${s.url}\n`;
    body += `<p style="margin:0 0 6px;"><a href="${h(s.url)}" style="color:${BRAND};font-weight:600;">Open ${h(title.toLowerCase())} →</a></p>`;
  }
  text += `\n${SIGNOFF}\n${siteUrl}\n\n---\nYou receive this because you subscribed to Mongolist on the IAML website.\nUnsubscribe: ${unsubscribeUrl}\nChange topics and frequency: ${siteUrl}/mongolist.html\n`;
  const html = layout({
    preheader: `${total} update${total === 1 ? '' : 's'} from IAML`,
    heading,
    bodyHtml: body,
    footerHtml: `You receive this because you subscribed to Mongolist. <a href="${h(`${siteUrl}/mongolist.html`)}" style="color:#64748b;">Change topics and frequency</a> · <a href="${h(unsubscribeUrl)}" style="color:#64748b;">Unsubscribe</a>`,
  });
  const first = sections[0]?.items[0]?.title;
  const subject = instant
    ? `IAML: ${first ?? 'new on the website'}`
    : `IAML digest: ${total} update${total === 1 ? '' : 's'}`;
  return { subject, text, html };
}
