// Table-driven CRUD for the content the administrator manages (docs/API.md §5).
// Table / column names come only from the definitions below — never from the request.
import { ValidationError, conflict, notFound } from '../../errors.js';
import { audit } from '../../lib/audit.js';
import { idParam, likePattern, paging, validate, v, words } from '../../lib/validate.js';

const sortOrder = () => v.int({ min: 0, max: 1_000_000 }).optional(null);
const isoOrNull = () => v.iso().optional(null);

const DEFS = [
  {
    name: 'news', table: 'news', from: 'news t', select: 't.*',
    search: ['t.title', 't.body'], order: 't.published_at desc, t.id desc',
    createdBy: true,
    fields: {
      title: v.str({ max: 200 }),
      body: words({ maxWords: 500, maxChars: 8000 }),
      published_at: v.iso(),
      is_published: v.bool().optional(true),
    },
  },
  {
    name: 'events', table: 'events', from: 'events t', select: 't.*',
    search: ['t.title', 't.location', 't.summary'], order: 't.starts_at desc, t.id desc',
    createdBy: true,
    nullable: ['location', 'ends_at'],
    fields: {
      title: v.str({ max: 200 }),
      location: v.str({ max: 200 }).optional(null),
      starts_at: v.iso(),
      ends_at: isoOrNull(),
      summary: v.str({ max: 400, multiline: true }).optional(''),
      body: words({ min: 0, maxWords: 500, maxChars: 8000 }).optional(''),
      published_at: isoOrNull(),
      is_published: v.bool().optional(true),
    },
    check(data, before) {
      const starts = data.starts_at ?? before?.starts_at;
      const ends = data.ends_at === undefined ? before?.ends_at : data.ends_at;
      if (starts && ends && new Date(ends) < new Date(starts)) throw new ValidationError({ ends_at: 'must not be before the start' });
    },
  },
  {
    name: 'publications', table: 'publications', from: 'publications t', select: 't.*',
    search: ['t.title', 't.authors', 't.topic', 't.summary'], order: 't.published_at desc, t.id desc',
    createdBy: true,
    nullable: ['topic'],
    fields: {
      title: v.str({ max: 300 }),
      authors: v.str({ max: 300 }),
      topic: v.str({ max: 80 }).optional(null),
      summary: words({ maxWords: 500, maxChars: 8000 }),
      published_at: v.iso(),
      is_published: v.bool().optional(true),
    },
  },
  {
    name: 'positions', table: 'positions', from: 'positions t', select: 't.*',
    search: ['t.name'], order: 't.sort_order, t.id', sortable: true,
    nullable: ['singular'],
    fields: { name: v.str({ max: 80 }), singular: v.str({ max: 80 }).optional(null), sort_order: sortOrder() },
    async beforeDelete(tx, row) {
      const n = (await tx.one('select count(*)::int as n from participants where position_id = $1', [row.id])).n;
      if (n) throw conflict(`This position still has ${n} participant${n === 1 ? '' : 's'}. Move or delete them first.`);
    },
  },
  {
    name: 'participants', table: 'participants', from: 'participants t join positions pos on pos.id = t.position_id',
    select: 't.*, pos.name as position', search: ['t.name', 't.org', 'pos.name'],
    order: 'pos.sort_order, pos.id, t.sort_order, t.id', sortable: true,
    filters: { position_id: 't.position_id' }, nullable: ['org'],
    fields: {
      name: v.str({ max: 120 }),
      position_id: v.int({ min: 1 }),
      org: v.str({ max: 300 }).optional(null),
      sort_order: sortOrder(),
      is_visible: v.bool().optional(true),
    },
  },
  {
    name: 'pages', table: 'pages', from: 'pages t',
    select: 't.*, exists(select 1 from menu_items m where m.page_id = t.id) as show_in_menu',
    search: ['t.title', 't.slug'], order: 't.title, t.id',
    virtual: ['show_in_menu'],
    fields: {
      slug: v.slug(),
      title: v.str({ max: 120 }),
      body: v.str({ min: 0, max: 50_000, multiline: true }).optional(''),
      is_published: v.bool().optional(true),
      show_in_menu: v.bool().optional(true),
    },
    async afterInsert(tx, row, data) {
      if (data.show_in_menu !== false) await addMenuEntry(tx, row);
    },
    async afterUpdate(tx, before, data) {
      const after = await tx.one('select id, slug, title from pages where id = $1', [before.id]);
      const entry = await tx.one('select id, title from menu_items where page_id = $1', [before.id]);
      const want = data.show_in_menu === undefined ? !!entry : data.show_in_menu;
      if (want && !entry) await addMenuEntry(tx, after);
      else if (!want && entry) await tx.query('delete from menu_items where id = $1', [entry.id]);
      else if (entry) {
        await tx.query('update menu_items set key = $2, href = $3 where id = $1', [entry.id, `page:${after.slug}`, `page.html?slug=${after.slug}`]);
        if (entry.title === before.title.slice(0, 40)) await tx.query('update menu_items set title = $2 where id = $1', [entry.id, after.title.slice(0, 40)]);
      }
    },
  },
  {
    // Menu entries are core sections or created through `pages` — so: list / update / reorder only.
    name: 'menu', table: 'menu_items', from: 'menu_items t', select: 't.*',
    search: ['t.title', 't.key'], order: 't.sort_order, t.id', sortable: true,
    noCreate: true, noDelete: true,
    fields: { title: v.str({ max: 40 }), sort_order: sortOrder(), is_visible: v.bool().optional(true) },
  },
  {
    name: 'link-categories', table: 'link_categories', from: 'link_categories t', select: 't.*',
    search: ['t.title', 't.slug'], order: 't.sort_order, t.id', sortable: true, nullable: ['blurb'],
    fields: {
      slug: v.slug(),
      title: v.str({ max: 80 }),
      blurb: v.str({ max: 200 }).optional(null),
      sort_order: sortOrder(),
    },
  },
  {
    name: 'links', table: 'useful_links', from: 'useful_links t join link_categories c on c.id = t.category_id',
    select: 't.*, c.title as category', search: ['t.title', 't.description', 't.url', 'c.title'],
    order: 'c.sort_order, c.id, t.sort_order, t.id', sortable: true,
    filters: { category_id: 't.category_id' }, nullable: ['description', 'url'],
    fields: {
      category_id: v.int({ min: 1 }),
      title: v.str({ max: 200 }),
      description: v.str({ max: 400, multiline: true }).optional(null),
      url: v.url().optional(null),
      sort_order: sortOrder(),
      is_visible: v.bool().optional(true),
    },
  },
  {
    name: 'contact-people', table: 'contact_people', from: 'contact_people t', select: 't.*',
    search: ['t.name', 't.position', 't.email'], order: 't.sort_order, t.id', sortable: true, nullable: ['email'],
    fields: {
      position: v.str({ max: 80 }),
      name: v.str({ max: 120 }),
      email: v.email().optional(null),
      sort_order: sortOrder(),
      is_visible: v.bool().optional(true),
    },
  },
  {
    name: 'contact-recipients', table: 'contact_recipients', from: 'contact_recipients t', select: 't.*',
    search: ['t.email', 't.label'], order: 't.id', nullable: ['label'],
    fields: { email: v.email(), label: v.str({ max: 80 }).optional(null) },
  },
];

async function addMenuEntry(tx, page) {
  await tx.query(
    `insert into menu_items (key, title, href, sort_order, is_core, page_id)
     values ($1, $2, $3, (select coalesce(max(sort_order), 0) + 1 from menu_items), false, $4)`,
    [`page:${page.slug}`, page.title.slice(0, 40), `page.html?slug=${page.slug}`, page.id],
  );
}

const labelOf = (row) => row.title ?? row.name ?? row.email ?? row.slug ?? null;

function register(app, def) {
  const { db } = app;
  const base = `/api/admin/${def.name}`;
  const nullable = new Set(def.nullable ?? []);
  const virtual = new Set(def.virtual ?? []);
  const columns = new Set(Object.keys(def.fields).filter((k) => !virtual.has(k)));
  const selectOne = (runner, id) => runner.one(`select ${def.select} from ${def.from} where t.id = $1`, [id]);

  /** null means "use the default / leave alone" unless the column is meaningfully nullable. */
  const normalize = (data) => {
    for (const k of Object.keys(data)) if (data[k] === null && !nullable.has(k)) delete data[k];
    return data;
  };

  app.get(base, async (req) => {
    const { limit, offset } = paging(req.query, { max: 200, def: 50 });
    const where = [];
    const params = [];
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q) {
      params.push(likePattern(q));
      where.push(`(${def.search.map((c) => `${c} ilike $${params.length}`).join(' or ')})`);
    }
    for (const [name, col] of Object.entries(def.filters ?? {})) {
      const raw = req.query[name];
      if (raw === undefined || raw === '') continue;
      const n = Number(raw);
      if (!Number.isInteger(n)) throw new ValidationError({ [name]: 'must be a whole number' });
      params.push(n);
      where.push(`${col} = $${params.length}`);
    }
    const w = where.length ? `where ${where.join(' and ')}` : '';
    const [total, rows] = await Promise.all([
      db.one(`select count(*)::int as n from ${def.from} ${w}`, params),
      db.many(`select ${def.select} from ${def.from} ${w} order by ${def.order} limit $${params.length + 1} offset $${params.length + 2}`, [...params, limit, offset]),
    ]);
    return { items: rows, total: total.n };
  });

  app.get(`${base}/:id`, async (req) => {
    const item = await selectOne(db, idParam(req.params.id));
    if (!item) throw notFound();
    return { item };
  });

  if (!def.noCreate) {
    app.post(base, async (req, reply) => {
      const data = normalize(validate(def.fields, req.body));
      def.check?.(data, null);
      const item = await db.tx(async (tx) => {
        const cols = { ...Object.fromEntries(Object.entries(data).filter(([k]) => columns.has(k))) };
        if (def.createdBy) cols.created_by = req.user.id;
        if (def.sortable && cols.sort_order == null) {
          cols.sort_order = (await tx.one(`select coalesce(max(sort_order), 0) + 1 as n from ${def.table}`)).n;
        }
        const keys = Object.keys(cols);
        const created = await tx.one(
          `insert into ${def.table} (${keys.join(', ')}) values (${keys.map((_, i) => `$${i + 1}`).join(', ')}) returning *`,
          keys.map((k) => cols[k]),
        );
        await def.afterInsert?.(tx, created, data, req);
        await audit(tx, req.user.id, 'create', def.name, created.id, { label: labelOf(created) });
        return selectOne(tx, created.id);
      });
      return reply.code(201).send({ item });
    });
  }

  app.put(`${base}/:id`, async (req) => {
    const id = idParam(req.params.id);
    const data = normalize(validate(def.fields, req.body, { partial: true }));
    const item = await db.tx(async (tx) => {
      const before = await tx.one(`select * from ${def.table} where id = $1 for update`, [id]);
      if (!before) throw notFound();
      def.check?.(data, before);
      const cols = Object.keys(data).filter((k) => columns.has(k));
      if (cols.length) {
        await tx.query(`update ${def.table} set ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')} where id = $1`, [id, ...cols.map((c) => data[c])]);
      }
      await def.afterUpdate?.(tx, before, data, req);
      await audit(tx, req.user.id, 'update', def.name, id, { label: labelOf({ ...before, ...data }), fields: Object.keys(data) });
      return selectOne(tx, id);
    });
    return { item };
  });

  if (!def.noDelete) {
    app.delete(`${base}/:id`, async (req, reply) => {
      const id = idParam(req.params.id);
      await db.tx(async (tx) => {
        const row = await tx.one(`select * from ${def.table} where id = $1 for update`, [id]);
        if (!row) throw notFound();
        await def.beforeDelete?.(tx, row, req);
        await tx.query(`delete from ${def.table} where id = $1`, [id]);
        await audit(tx, req.user.id, 'delete', def.name, id, { label: labelOf(row) });
      });
      return reply.code(204).send();
    });
  }

  if (def.sortable) {
    app.post(`${base}/reorder`, async (req, reply) => {
      const { ids } = validate({ ids: v.array(v.int({ min: 1 }), { min: 1, max: 1000 }) }, req.body);
      await db.query(
        `update ${def.table} t set sort_order = x.ord::int from unnest($1::int[]) with ordinality as x(id, ord) where t.id = x.id`,
        [ids],
      );
      await audit(db, req.user.id, 'reorder', def.name, null, { count: ids.length });
      return reply.code(204).send();
    });
  }
}

export default async function resourceRoutes(app) {
  for (const def of DEFS) register(app, def);
}
