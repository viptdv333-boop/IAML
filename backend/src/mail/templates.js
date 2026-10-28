// E-mail templates (English + Mongolian, docs/I18N.md): every message has a plain-text body and a simple,
// inline-styled HTML body (no remote images). The language is the recipient's `users.lang`.
import { escapeHtml as h, oneLine } from '../lib/text.js';

const BRAND = '#003F87';

const S = {
  en: {
    name: 'International Association for Mongolic Linguistics',
    hello: 'Hello,',
    helloName: (n) => `Hello ${n},`,
    verify: {
      subject: 'Your IAML confirmation code', // the code stays out of the subject: subjects are not scrubbed
      heading: 'Confirm your e-mail',
      preheader: 'Your one-time confirmation code',
      intro: 'Use this one-time code to finish creating your IAML account:',
      note: 'It is valid for 15 minutes. If you did not register, you can safely ignore this message.',
      text: (code) => `Your IAML confirmation code is: ${code}\n\nIt is valid for 15 minutes. Enter it on the website to finish creating your account.\nIf you did not register, you can ignore this message.`,
    },
    reset: {
      subject: 'Your IAML password reset code',
      heading: 'Reset your password',
      preheader: 'Your one-time password reset code',
      intro: 'Use this one-time code to choose a new password:',
      note: 'It is valid for 15 minutes. If you did not ask for this, ignore the message — your password stays unchanged.',
      text: (code) => `Your IAML password reset code is: ${code}\n\nIt is valid for 15 minutes. If you did not ask to reset your password, ignore this message — your password stays unchanged.`,
    },
    exists: {
      subject: 'You already have an IAML account',
      heading: 'You already have an account',
      preheader: 'You already have an IAML account',
      intro: 'Someone (hopefully you) tried to register on the IAML website with this e-mail address, but an account already exists.',
      button: 'Go to the website',
      note: 'If you forgot your password, use <b>Forgot password</b> in the login window. If this was not you, no action is needed.',
      text: (siteUrl) => `Someone (hopefully you) tried to register on the IAML website with this e-mail address, but an account already exists.\n\nYou can log in here: ${siteUrl}/\nIf you forgot your password, use "Forgot password" in the login window.\n\nIf this wasn't you, no action is needed.`,
    },
    digest: {
      headingDigest: 'Your IAML digest',
      headingInstant: 'New on the IAML website',
      introDigest: 'Here is what happened on the IAML website since your last digest:',
      introInstant: 'Here is what is new on the IAML website:',
      topics: { news: 'News', events: 'Events', publications: 'Publications', participants: 'New participants', discuss: 'New discussions' },
      more: (n) => `…and ${n} more`,
      open: (title) => `Open ${title.toLowerCase()} →`,
      textFooter: (unsub, manage) => `---\nYou receive this because you subscribed to Mongolist on the IAML website.\nUnsubscribe: ${unsub}\nChange topics and frequency: ${manage}\n`,
      htmlFooter: (manage, unsub) => `You receive this because you subscribed to Mongolist. <a href="${h(manage)}" style="color:#64748b;">Change topics and frequency</a> · <a href="${h(unsub)}" style="color:#64748b;">Unsubscribe</a>`,
      preheader: (n) => `${n} update${n === 1 ? '' : 's'} from IAML`,
      subjectDigest: (n) => `IAML digest: ${n} update${n === 1 ? '' : 's'}`,
      subjectInstant: (first) => `IAML: ${first ?? 'new on the website'}`,
    },
  },
  mn: {
    name: 'Олон улсын монгол хэл судлалын нийгэмлэг',
    hello: 'Сайн байна уу,',
    helloName: (n) => `Сайн байна уу, ${n}!`,
    verify: {
      subject: 'Таны ОУМХСН баталгаажуулах код',
      heading: 'Имэйл хаягаа баталгаажуулна уу',
      preheader: 'Таны нэг удаагийн баталгаажуулах код',
      intro: 'ОУМХСН-д бүртгэлээ дуусгахын тулд нэг удаагийн кодыг оруулна уу:',
      note: 'Код 15 минутын дотор хүчинтэй. Хэрэв та бүртгүүлээгүй бол энэ захидлыг үл тоомсорлож болно.',
      text: (code) => `Таны ОУМХСН баталгаажуулах код: ${code}\n\nКод 15 минутын дотор хүчинтэй. Бүртгэлээ дуусгахын тулд кодыг вэбсайт дээр оруулна уу.\nХэрэв та бүртгүүлээгүй бол энэ захидлыг үл тоомсорлоно уу.`,
    },
    reset: {
      subject: 'Таны ОУМХСН нууц үг сэргээх код',
      heading: 'Нууц үгээ сэргээх',
      preheader: 'Таны нэг удаагийн нууц үг сэргээх код',
      intro: 'Шинэ нууц үг сонгохын тулд нэг удаагийн кодыг оруулна уу:',
      note: 'Код 15 минутын дотор хүчинтэй. Хэрэв та хүсэлт гаргаагүй бол энэ захидлыг үл тоомсорлоно уу — таны нууц үг өөрчлөгдөхгүй.',
      text: (code) => `Таны ОУМХСН нууц үг сэргээх код: ${code}\n\nКод 15 минутын дотор хүчинтэй. Хэрэв та нууц үг сэргээх хүсэлт гаргаагүй бол энэ захидлыг үл тоомсорлоно уу — таны нууц үг өөрчлөгдөхгүй.`,
    },
    exists: {
      subject: 'Та ОУМХСН-д аль хэдийн бүртгэлтэй байна',
      heading: 'Танд бүртгэл байна',
      preheader: 'Та ОУМХСН-д бүртгэлтэй байна',
      intro: 'Хэн нэгэн (магадгүй та өөрөө) энэ имэйл хаягаар ОУМХСН-ийн вэбсайтад бүртгүүлэхийг оролдсон боловч бүртгэл аль хэдийн байна.',
      button: 'Вэбсайт руу очих',
      note: 'Хэрэв нууц үгээ мартсан бол нэвтрэх цонхны <b>Нууц үгээ мартсан</b> гэснийг ашиглана уу. Хэрэв энэ та биш бол ямар нэгэн арга хэмжээ авах шаардлагагүй.',
      text: (siteUrl) => `Хэн нэгэн (магадгүй та өөрөө) энэ имэйл хаягаар ОУМХСН-ийн вэбсайтад бүртгүүлэхийг оролдсон боловч бүртгэл аль хэдийн байна.\n\nНэвтрэх: ${siteUrl}/\nХэрэв нууц үгээ мартсан бол нэвтрэх цонхны «Нууц үгээ мартсан» гэснийг ашиглана уу.\n\nХэрэв энэ та биш бол ямар нэгэн арга хэмжээ авах шаардлагагүй.`,
    },
    digest: {
      headingDigest: 'Таны ОУМХСН мэдээллийн хураангуй',
      headingInstant: 'ОУМХСН-ийн вэбсайтад шинэ зүйл нэмэгдлээ',
      introDigest: 'Сүүлийн хураангуйгаас хойш ОУМХСН-ийн вэбсайт дээр болсон зүйлс:',
      introInstant: 'ОУМХСН-ийн вэбсайт дээр шинээр нэмэгдсэн зүйлс:',
      topics: { news: 'Мэдээ', events: 'Арга хэмжээ', publications: 'Нийтлэлүүд', participants: 'Шинэ оролцогчид', discuss: 'Шинэ хэлэлцүүлгүүд' },
      more: (n) => `…мөн өөр ${n}`,
      open: (title) => `${title} хэсгийг нээх →`,
      textFooter: (unsub, manage) => `---\nТа Mongolist-д бүртгүүлсэн тул энэ захидлыг хүлээн авч байна.\nЗахиалгаа цуцлах: ${unsub}\nСэдэв, давтамжаа өөрчлөх: ${manage}\n`,
      htmlFooter: (manage, unsub) => `Та Mongolist-д бүртгүүлсэн тул энэ захидлыг хүлээн авч байна. <a href="${h(manage)}" style="color:#64748b;">Сэдэв, давтамжаа өөрчлөх</a> · <a href="${h(unsub)}" style="color:#64748b;">Захиалгаа цуцлах</a>`,
      preheader: (n) => `ОУМХСН-ээс ${n} шинэ мэдээлэл`,
      subjectDigest: (n) => `ОУМХСН: ${n} шинэ мэдээлэл`,
      subjectInstant: (first) => `ОУМХСН: ${first ?? 'вэбсайтад шинэ зүйл'}`,
    },
  },
};
const tr = (lang) => S[lang === 'mn' ? 'mn' : 'en'];

function layout({ lang, preheader, heading, bodyHtml, footerHtml = '' }) {
  const t = tr(lang);
  return `<!doctype html>
<html lang="${lang === 'mn' ? 'mn' : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${h(heading)}</title></head>
<body style="margin:0;padding:0;background:#f4f6fa;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${h(preheader || '')}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
<tr><td style="background:${BRAND};padding:18px 28px;color:#ffffff;font:600 17px Georgia,'Times New Roman',serif;letter-spacing:.3px;">${lang === 'mn' ? 'ОУМХСН' : 'IAML'} <span style="font:400 12px Arial,Helvetica,sans-serif;opacity:.8;margin-left:8px;">${h(t.name)}</span></td></tr>
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
const siteFooter = (t, siteUrl) => `${h(t.name)} · <a href="${h(siteUrl)}" style="color:#64748b;">${h(siteUrl)}</a>`;

export function verifyEmailMail({ code, siteUrl, lang }) {
  const t = tr(lang);
  const text = `${t.hello}\n\n${t.verify.text(code)}\n\n— ${t.name}\n${siteUrl}`;
  const html = layout({
    lang,
    preheader: t.verify.preheader,
    heading: t.verify.heading,
    bodyHtml: p(h(t.hello)) + p(h(t.verify.intro)) + codeBox(code) + p(h(t.verify.note)),
    footerHtml: siteFooter(t, siteUrl),
  });
  return { subject: t.verify.subject, text, html };
}

export function resetPasswordMail({ code, siteUrl, lang }) {
  const t = tr(lang);
  const text = `${t.hello}\n\n${t.reset.text(code)}\n\n— ${t.name}\n${siteUrl}`;
  const html = layout({
    lang,
    preheader: t.reset.preheader,
    heading: t.reset.heading,
    bodyHtml: p(h(t.hello)) + p(h(t.reset.intro)) + codeBox(code) + p(h(t.reset.note)),
    footerHtml: siteFooter(t, siteUrl),
  });
  return { subject: t.reset.subject, text, html };
}

export function accountExistsMail({ siteUrl, lang }) {
  const t = tr(lang);
  const text = `${t.hello}\n\n${t.exists.text(siteUrl)}\n\n— ${t.name}`;
  const html = layout({
    lang,
    preheader: t.exists.preheader,
    heading: t.exists.heading,
    bodyHtml: p(h(t.hello)) + p(h(t.exists.intro)) + button(`${siteUrl}/`, t.exists.button) + p(t.exists.note),
    footerHtml: h(t.name),
  });
  return { subject: t.exists.subject, text, html };
}

/** Message from the Contacts / Participants form, sent to the configured recipients (reply-to = sender). English: it goes to administrators. */
export function contactMail({ msg, siteUrl }) {
  const where = msg.source === 'participants' ? 'Participants page' : 'Contacts page';
  const subject = oneLine(msg.subject) || `Message from ${oneLine(msg.name)}`;
  const text = `New message via the ${where}

From:    ${oneLine(msg.name)} <${msg.email}>
Subject: ${oneLine(msg.subject) || '—'}

${msg.message}

— Reply to this e-mail to answer the sender. The message is also stored in the admin panel (${siteUrl}/admin.html).`;
  const html = layout({
    lang: 'en',
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

/**
 * Mongolist digest. sections: [{ topic, items: [{ title, meta?, snippet? }], more, url }]
 * `instant` = true uses the "new on the site" wording instead of "your digest".
 */
export function digestMail({ firstName, sections, siteUrl, unsubscribeUrl, instant = false, lang }) {
  const t = tr(lang);
  const d = t.digest;
  const total = sections.reduce((n, s) => n + s.items.length + (s.more || 0), 0);
  const heading = instant ? d.headingInstant : d.headingDigest;
  const intro = instant ? d.introInstant : d.introDigest;
  const greeting = firstName ? t.helloName(oneLine(firstName)) : t.hello;
  const manageUrl = `${siteUrl}/mongolist.html`;

  let text = `${greeting}\n\n${intro}\n`;
  let body = p(h(greeting)) + p(h(intro));
  for (const s of sections) {
    const title = d.topics[s.topic] ?? s.topic;
    text += `\n== ${title} ==\n`;
    body += `<h2 style="margin:22px 0 8px;font:600 17px Georgia,'Times New Roman',serif;color:${BRAND};border-bottom:1px solid #e2e8f0;padding-bottom:4px;">${h(title)}</h2>`;
    for (const it of s.items) {
      text += `• ${it.title}${it.meta ? ` — ${it.meta}` : ''}\n`;
      if (it.snippet) text += `  ${it.snippet}\n`;
      body += `<p style="margin:0 0 10px;"><b>${h(it.title)}</b>${it.meta ? `<br><span style="color:#64748b;font-size:13px;">${h(it.meta)}</span>` : ''}${it.snippet ? `<br>${h(it.snippet)}` : ''}</p>`;
    }
    if (s.more) {
      text += `${d.more(s.more)}\n`;
      body += `<p style="margin:0 0 10px;color:#64748b;">${h(d.more(s.more))}</p>`;
    }
    text += `${s.url}\n`;
    body += `<p style="margin:0 0 6px;"><a href="${h(s.url)}" style="color:${BRAND};font-weight:600;">${h(d.open(title))}</a></p>`;
  }
  text += `\n— ${t.name}\n${siteUrl}\n\n${d.textFooter(unsubscribeUrl, manageUrl)}`;
  const html = layout({
    lang,
    preheader: d.preheader(total),
    heading,
    bodyHtml: body,
    footerHtml: d.htmlFooter(manageUrl, unsubscribeUrl),
  });
  const first = sections[0]?.items[0]?.title;
  const subject = instant ? d.subjectInstant(first) : d.subjectDigest(total);
  return { subject, text, html };
}
