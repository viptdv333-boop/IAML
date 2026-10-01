// Contact form (Contacts + Participants pages): stored in the inbox and e-mailed to the configured recipients.
import { rateLimited } from '../errors.js';
import { contactMail } from '../mail/templates.js';
import { enqueueMail } from '../mail/outbox.js';
import { validate, v } from '../lib/validate.js';

const SPEC = {
  name: v.str({ max: 100 }),
  email: v.email(),
  subject: v.str({ max: 150 }).optional(),
  message: v.str({ min: 5, max: 4000, multiline: true }),
  source: v.enum(['contacts', 'participants']).optional('contacts'),
  website: v.str({ max: 200 }).optional(''),
};

/** E-mails of the people who should receive form messages (configured recipients, else every admin). */
export async function contactRecipients(db) {
  const configured = await db.many('select email from contact_recipients order by id');
  if (configured.length) return configured.map((r) => r.email);
  const admins = await db.many(`select email from users where role = 'admin' and disabled_at is null and email_verified_at is not null order by created_at`);
  return admins.map((r) => r.email);
}

export default async function contactRoutes(app) {
  const { db, config } = app;

  app.post('/api/contact', { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (req, reply) => {
    const body = validate(SPEC, req.body);
    if (body.website) return reply.code(202).send({ ok: true }); // honeypot: pretend success, store nothing

    const recent = await db.one(
      `select count(*)::int as n from contact_messages where email = $1 and created_at > now() - interval '1 hour'`,
      [body.email],
    );
    if (recent.n >= 3) throw rateLimited('You have sent several messages recently. Please try again later.', 3600);

    const msg = await db.tx(async (tx) => {
      const row = await tx.one(
        `insert into contact_messages (name, email, subject, message, source, ip, user_agent)
         values ($1, $2, $3, $4, $5, $6, $7) returning *`,
        [body.name, body.email, body.subject, body.message, body.source, req.ip || null, String(req.headers['user-agent'] || '').slice(0, 300) || null],
      );
      const recipients = await contactRecipients(tx);
      const mail = contactMail({ msg: row, siteUrl: config.siteUrl });
      for (const to of recipients) {
        await enqueueMail(tx, { to, ...mail, replyTo: row.email, purpose: 'contact', priority: 3 });
      }
      return row;
    });
    req.log.info({ id: msg.id, source: msg.source }, 'contact message stored');
    return reply.code(202).send({ ok: true });
  });
}
