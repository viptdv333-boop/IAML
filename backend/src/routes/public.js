// Public, read-only content endpoints (docs/API.md §2).
import { notFound } from '../errors.js';
import { getSettings } from '../lib/settings.js';
import { preview } from '../lib/text.js';
import { paging } from '../lib/validate.js';

export default async function publicRoutes(app) {
  const { db } = app;

  app.get('/api/menu', async () => {
    const rows = await db.many(
      `select m.key, m.title, m.href
         from menu_items m left join pages p on p.id = m.page_id
        where m.is_visible and (m.page_id is null or p.is_published)
        order by m.sort_order, m.id`,
    );
    return { items: rows };
  });

  app.get('/api/pages/:slug', async (req) => {
    const slug = String(req.params.slug).toLowerCase();
    const row = /^[a-z0-9-]{1,60}$/.test(slug)
      ? await db.one('select slug, title, body, updated_at from pages where slug = $1 and is_published', [slug])
      : null;
    if (!row) throw notFound('Page not found.');
    return row;
  });

  app.get('/api/news', async (req) => {
    const { limit, offset } = paging(req.query, { max: 200, def: 60 });
    const [rows, total] = await Promise.all([
      db.many(
        `select id, title, body, published_at from news
          where is_published and published_at <= now()
          order by published_at desc, id desc limit $1 offset $2`,
        [limit, offset],
      ),
      db.one('select count(*)::int as n from news where is_published and published_at <= now()'),
    ]);
    return { items: rows.map((r) => ({ ...r, preview: preview(r.body, 150) })), total: total.n };
  });

  app.get('/api/events', async () => {
    const rows = await db.many(
      `select id, title, location, starts_at, ends_at, summary, body,
              (coalesce(ends_at, starts_at + interval '3 hours') < now()) as is_past
         from events
        where is_published and published_at <= now()
        order by starts_at desc, id desc limit 500`,
    );
    const upcoming = rows.filter((r) => !r.is_past).reverse(); // nearest first
    const past = rows.filter((r) => r.is_past);                // most recent first
    return { items: [...upcoming, ...past] };
  });

  app.get('/api/publications', async (req) => {
    const { limit, offset } = paging(req.query, { max: 200, def: 60 });
    const [rows, total] = await Promise.all([
      db.many(
        `select id, title, authors, topic, summary, published_at from publications
          where is_published and published_at <= now()
          order by published_at desc, id desc limit $1 offset $2`,
        [limit, offset],
      ),
      db.one('select count(*)::int as n from publications where is_published and published_at <= now()'),
    ]);
    return { items: rows.map((r) => ({ ...r, preview: preview(r.summary, 150) })), total: total.n };
  });

  app.get('/api/participants', async () => {
    const rows = await db.many(
      `select p.id, p.name, p.org, pos.id as position_id, pos.name as position_name, pos.singular
         from participants p join positions pos on pos.id = p.position_id
        where p.is_visible
        order by pos.sort_order, pos.id, p.sort_order, p.id`,
    );
    const positions = [];
    const byId = new Map();
    for (const r of rows) {
      let pos = byId.get(r.position_id);
      if (!pos) {
        pos = { id: r.position_id, name: r.position_name, singular: r.singular, participants: [] };
        byId.set(r.position_id, pos);
        positions.push(pos);
      }
      pos.participants.push({ id: r.id, name: r.name, org: r.org });
    }
    return { positions };
  });

  app.get('/api/links', async () => {
    const rows = await db.many(
      `select c.id as cat_id, c.slug, c.title as cat_title, c.blurb,
              l.id, l.title, l.description, l.url
         from link_categories c join useful_links l on l.category_id = c.id and l.is_visible
        order by c.sort_order, c.id, l.sort_order, l.id`,
    );
    const categories = [];
    const byId = new Map();
    for (const r of rows) {
      let cat = byId.get(r.cat_id);
      if (!cat) {
        cat = { id: r.cat_id, slug: r.slug, title: r.cat_title, blurb: r.blurb, links: [] };
        byId.set(r.cat_id, cat);
        categories.push(cat);
      }
      cat.links.push({ id: r.id, title: r.title, description: r.description, url: r.url });
    }
    return { categories };
  });

  app.get('/api/contacts', async () => {
    const [people, settings] = await Promise.all([
      db.many('select id, position, name, email from contact_people where is_visible order by sort_order, id'),
      getSettings(db),
    ]);
    return { people, email: settings['contact.email'] || null, address: settings['contact.address'] || null };
  });
}
