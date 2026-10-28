// Public, read-only content endpoints (docs/API.md §2). Every endpoint takes ?lang=en|mn (docs/I18N.md §3).
import { notFound } from '../errors.js';
import { langOf, pick, translated } from '../lib/lang.js';
import { getSettings } from '../lib/settings.js';
import { preview } from '../lib/text.js';
import { paging } from '../lib/validate.js';

export default async function publicRoutes(app) {
  const { db } = app;

  app.get('/api/menu', async (req) => {
    const lang = langOf(req);
    const rows = await db.many(
      `select m.key, m.title, m.title_mn, m.href
         from menu_items m left join pages p on p.id = m.page_id
        where m.is_visible and (m.page_id is null or p.is_published)
        order by m.sort_order, m.id`,
    );
    return { items: rows.map((r) => ({ key: r.key, title: pick(lang, r.title, r.title_mn), href: r.href })) };
  });

  app.get('/api/pages/:slug', async (req) => {
    const lang = langOf(req);
    const slug = String(req.params.slug).toLowerCase();
    const row = /^[a-z0-9-]{1,60}$/.test(slug)
      ? await db.one('select slug, title, body, title_mn, body_mn, updated_at from pages where slug = $1 and is_published', [slug])
      : null;
    if (!row) throw notFound('Page not found.');
    const mn = translated(lang, row.title_mn, row.body_mn);
    return { slug: row.slug, title: mn ? row.title_mn : row.title, body: mn ? row.body_mn : row.body, updated_at: row.updated_at, lang: mn ? 'mn' : 'en' };
  });

  app.get('/api/news', async (req) => {
    const lang = langOf(req);
    const { limit, offset } = paging(req.query, { max: 200, def: 60 });
    const [rows, total] = await Promise.all([
      db.many(
        `select id, title, body, title_mn, body_mn, published_at from news
          where is_published and published_at <= now()
          order by published_at desc, id desc limit $1 offset $2`,
        [limit, offset],
      ),
      db.one('select count(*)::int as n from news where is_published and published_at <= now()'),
    ]);
    return {
      items: rows.map((r) => {
        const mn = translated(lang, r.title_mn, r.body_mn);
        const body = mn ? r.body_mn : r.body;
        return { id: r.id, title: mn ? r.title_mn : r.title, body, preview: preview(body, 150), published_at: r.published_at, lang: mn ? 'mn' : 'en' };
      }),
      total: total.n,
    };
  });

  app.get('/api/events', async (req) => {
    const lang = langOf(req);
    const rows = await db.many(
      `select id, title, location, starts_at, ends_at, summary, body, title_mn, location_mn, summary_mn, body_mn,
              (coalesce(ends_at, starts_at + interval '3 hours') < now()) as is_past
         from events
        where is_published and published_at <= now()
        order by starts_at desc, id desc limit 500`,
    );
    const items = rows.map((r) => {
      const mn = translated(lang, r.title_mn); // an event is "translated" once its title is; the other fields fall back one by one
      return {
        id: r.id,
        title: mn ? r.title_mn : r.title,
        location: mn ? pick(lang, r.location, r.location_mn) : r.location,
        starts_at: r.starts_at,
        ends_at: r.ends_at,
        summary: mn ? pick(lang, r.summary, r.summary_mn) : r.summary,
        body: mn ? pick(lang, r.body, r.body_mn) : r.body,
        is_past: r.is_past,
        lang: mn ? 'mn' : 'en',
      };
    });
    const upcoming = items.filter((r) => !r.is_past).reverse(); // nearest first
    const past = items.filter((r) => r.is_past);                // most recent first
    return { items: [...upcoming, ...past] };
  });

  app.get('/api/publications', async (req) => {
    const lang = langOf(req);
    const { limit, offset } = paging(req.query, { max: 200, def: 60 });
    const [rows, total] = await Promise.all([
      db.many(
        `select id, title, authors, topic, summary, title_mn, topic_mn, summary_mn, published_at from publications
          where is_published and published_at <= now()
          order by published_at desc, id desc limit $1 offset $2`,
        [limit, offset],
      ),
      db.one('select count(*)::int as n from publications where is_published and published_at <= now()'),
    ]);
    return {
      items: rows.map((r) => {
        const mn = translated(lang, r.title_mn, r.summary_mn);
        const summary = mn ? r.summary_mn : r.summary;
        return {
          id: r.id,
          title: mn ? r.title_mn : r.title,
          authors: r.authors,
          topic: mn ? pick(lang, r.topic, r.topic_mn) : r.topic,
          summary,
          preview: preview(summary, 150),
          published_at: r.published_at,
          lang: mn ? 'mn' : 'en',
        };
      }),
      total: total.n,
    };
  });

  app.get('/api/participants', async (req) => {
    const lang = langOf(req);
    const rows = await db.many(
      `select p.id, p.name, p.name_mn, p.org, p.org_mn,
              pos.id as position_id, pos.name as position_name, pos.name_mn as position_name_mn,
              pos.singular, pos.singular_mn
         from participants p join positions pos on pos.id = p.position_id
        where p.is_visible
        order by pos.sort_order, pos.id, p.sort_order, p.id`,
    );
    const positions = [];
    const byId = new Map();
    for (const r of rows) {
      let pos = byId.get(r.position_id);
      if (!pos) {
        pos = {
          id: r.position_id,
          name: pick(lang, r.position_name, r.position_name_mn),
          singular: pick(lang, r.singular, r.singular_mn),
          participants: [],
        };
        byId.set(r.position_id, pos);
        positions.push(pos);
      }
      pos.participants.push({ id: r.id, name: pick(lang, r.name, r.name_mn), org: pick(lang, r.org, r.org_mn) });
    }
    return { positions };
  });

  app.get('/api/links', async (req) => {
    const lang = langOf(req);
    const rows = await db.many(
      `select c.id as cat_id, c.slug, c.title as cat_title, c.title_mn as cat_title_mn, c.blurb, c.blurb_mn,
              l.id, l.title, l.title_mn, l.description, l.description_mn, l.url
         from link_categories c join useful_links l on l.category_id = c.id and l.is_visible
        order by c.sort_order, c.id, l.sort_order, l.id`,
    );
    const categories = [];
    const byId = new Map();
    for (const r of rows) {
      let cat = byId.get(r.cat_id);
      if (!cat) {
        cat = { id: r.cat_id, slug: r.slug, title: pick(lang, r.cat_title, r.cat_title_mn), blurb: pick(lang, r.blurb, r.blurb_mn), links: [] };
        byId.set(r.cat_id, cat);
        categories.push(cat);
      }
      cat.links.push({ id: r.id, title: pick(lang, r.title, r.title_mn), description: pick(lang, r.description, r.description_mn), url: r.url });
    }
    return { categories };
  });

  app.get('/api/contacts', async (req) => {
    const lang = langOf(req);
    const [people, settings] = await Promise.all([
      db.many('select id, position, position_mn, name, name_mn, email from contact_people where is_visible order by sort_order, id'),
      getSettings(db),
    ]);
    return {
      people: people.map((p) => ({ id: p.id, position: pick(lang, p.position, p.position_mn), name: pick(lang, p.name, p.name_mn), email: p.email })),
      email: settings['contact.email'] || null,
      address: pick(lang, settings['contact.address'] || null, settings['contact.address_mn']) || null,
    };
  });
}
