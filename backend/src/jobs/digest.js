// Mongolist digest engine. Each (user, topic) has a cursor `last_sent_at`; a run mails everything published in
// (cursor, now − 30 s] to users whose schedule slot has passed, then advances the cursors — all in ONE transaction
// together with the outbox inserts, so a crash can neither lose nor duplicate a digest.
import { unsubscribeToken } from '../lib/crypto.js';
import { formatDateTime, lastSlot } from '../lib/tz.js';
import { preview, snippet } from '../lib/text.js';
import { enqueueMail } from '../mail/outbox.js';
import { digestMail } from '../mail/templates.js';

const LOCK_KEY = 727274002;
const SAFETY_LAG_MS = 30_000; // rows committed slightly late still land in the next window
const MAX_ITEMS = 8;
// Member-written content is held back a little before it can be mailed to everybody, so moderators get a chance to
// remove abuse first (a brand-new account must not be able to broadcast through "instant" subscriptions).
const TOPIC_LAG_MS = { discuss: 10 * 60_000 };
const stripLinks = (text) => String(text ?? '').replace(/\b(?:https?:\/\/|www\.)\S+/gi, '[link removed]');

const TOPIC_PAGE = {
  news: 'news.html',
  events: 'events.html',
  publications: 'publications.html',
  participants: 'participants.html',
  discuss: 'discuss.html',
};

/**
 * Rows of `topic` created/published in (from, to]. `ts` is the timestamp the window is measured on.
 * Each item has the English text and, when the Mongolian version exists, `mn: { title, meta, snippet }`
 * (used for recipients whose language is Mongolian).
 */
async function fetchItems(tx, topic, from, to, tz) {
  const win = [from, to];
  const has = (v) => typeof v === 'string' && v.trim() !== '';
  switch (topic) {
    case 'news': {
      const rows = await tx.many(
        `select title, body, title_mn, body_mn, published_at as ts from news
          where is_published and published_at > $1 and published_at <= $2 order by published_at, id`, win);
      return rows.map((r) => ({
        ts: r.ts,
        title: r.title,
        meta: formatDateTime(r.ts, tz),
        snippet: preview(r.body, 40),
        mn: has(r.title_mn) && has(r.body_mn) ? { title: r.title_mn, meta: formatDateTime(r.ts, tz), snippet: preview(r.body_mn, 40) } : null,
      }));
    }
    case 'events': {
      const rows = await tx.many(
        `select title, location, starts_at, summary, body, title_mn, location_mn, summary_mn, body_mn, published_at as ts from events
          where is_published and published_at > $1 and published_at <= $2 order by published_at, id`, win);
      return rows.map((r) => {
        const place = (loc) => (loc ? ` · ${loc}` : '');
        return {
          ts: r.ts,
          title: r.title,
          meta: `${formatDateTime(r.starts_at, tz)}${place(r.location)}`,
          snippet: r.summary || preview(r.body, 30),
          mn: has(r.title_mn)
            ? {
                title: r.title_mn,
                meta: `${formatDateTime(r.starts_at, tz)}${place(r.location_mn || r.location)}`,
                snippet: r.summary_mn || r.summary || preview(r.body_mn || r.body, 30),
              }
            : null,
        };
      });
    }
    case 'publications': {
      const rows = await tx.many(
        `select title, authors, summary, title_mn, summary_mn, published_at as ts from publications
          where is_published and published_at > $1 and published_at <= $2 order by published_at, id`, win);
      return rows.map((r) => ({
        ts: r.ts,
        title: r.title,
        meta: r.authors,
        snippet: preview(r.summary, 35),
        mn: has(r.title_mn) && has(r.summary_mn) ? { title: r.title_mn, meta: r.authors, snippet: preview(r.summary_mn, 35) } : null,
      }));
    }
    case 'participants': {
      const rows = await tx.many(
        `select p.name, p.name_mn, pos.singular, pos.singular_mn, pos.name as position, pos.name_mn as position_mn, p.created_at as ts
           from participants p join positions pos on pos.id = p.position_id
          where p.is_visible and p.created_at > $1 and p.created_at <= $2 order by p.created_at, p.id`, win);
      return rows.map((r) => ({
        ts: r.ts,
        title: r.name,
        meta: r.singular || r.position,
        mn: has(r.name_mn) || has(r.singular_mn) || has(r.position_mn)
          ? { title: r.name_mn || r.name, meta: r.singular_mn || r.position_mn || r.singular || r.position }
          : null,
      }));
    }
    case 'discuss': {
      const rows = await tx.many(
        `select t.title, t.body, t.created_at as ts, u.first_name, u.last_name
           from discuss_threads t left join users u on u.id = t.author_id
          where t.status = 'visible' and t.created_at > $1 and t.created_at <= $2 order by t.created_at, t.id`, win);
      return rows.map((r) => ({
        ts: r.ts,
        title: stripLinks(r.title),
        meta: r.first_name ? `by ${r.first_name} ${r.last_name}` : 'by a former member',
        snippet: stripLinks(snippet(r.body, 160)),
        // user-written text is not translated; only the byline is
        mn: { title: stripLinks(r.title), meta: r.first_name ? `Нийтлэгч: ${r.first_name} ${r.last_name}` : 'Нийтлэгч: хуучин гишүүн', snippet: stripLinks(snippet(r.body, 160)) },
      }));
    }
    default:
      return [];
  }
}

/**
 * @param {{db, config, log}} ctx
 * @param {{now?: Date, force?: boolean}} opts  force = ignore the daily/weekly slot (admin "send now"); the window is still (cursor, now−30 s]
 * @returns {Promise<{emails_queued: number, users: number, skipped?: string}>}
 */
export async function runDigest({ db, config, log }, { now = new Date(), force = false } = {}) {
  const upper = new Date(now.getTime() - SAFETY_LAG_MS);
  const upperFor = (topic) => new Date(upper.getTime() - (TOPIC_LAG_MS[topic] ?? 0));
  const dailySlot = lastSlot(now, config.siteTz, config.digestHour, null);
  const weeklySlot = lastSlot(now, config.siteTz, config.digestHour, config.digestWeekday);

  return db.tx(async (tx) => {
    const lock = await tx.one('select pg_try_advisory_xact_lock($1) as ok', [LOCK_KEY]);
    if (!lock.ok) return { emails_queued: 0, users: 0, skipped: 'another run is in progress' };

    const subs = (await tx.many(
      `select sp.user_id, sp.topic, sp.frequency, sp.last_sent_at, u.email, u.first_name, u.last_name, u.lang
         from subscription_prefs sp join users u on u.id = sp.user_id
        where sp.enabled and u.disabled_at is null and u.email_verified_at is not null`,
    )).filter((s) => {
      const last = new Date(s.last_sent_at);
      if (last >= upperFor(s.topic)) return false;
      if (force || s.frequency === 'instant') return true;
      return s.frequency === 'daily' ? dailySlot > last : weeklySlot > last;
    });
    if (!subs.length) return { emails_queued: 0, users: 0 };

    // one query per topic, from the oldest cursor among its due subscribers
    const topics = [...new Set(subs.map((s) => s.topic))];
    const itemsByTopic = {};
    for (const topic of topics) {
      const from = new Date(Math.min(...subs.filter((s) => s.topic === topic).map((s) => new Date(s.last_sent_at).getTime())));
      itemsByTopic[topic] = await fetchItems(tx, topic, from, upperFor(topic), config.siteTz);
    }

    const byUser = new Map();
    for (const s of subs) {
      if (!byUser.has(s.user_id)) byUser.set(s.user_id, { user: s, subs: [] });
      byUser.get(s.user_id).subs.push(s);
    }

    let queued = 0;
    for (const { user, subs: userSubs } of byUser.values()) {
      const sections = [];
      for (const s of userSubs) {
        const cursor = new Date(s.last_sent_at);
        const items = itemsByTopic[s.topic].filter((i) => new Date(i.ts) > cursor);
        if (!items.length) continue;
        const mn = user.lang === 'mn';
        sections.push({
          topic: s.topic,
          items: items.slice(0, MAX_ITEMS).map((i) => (mn && i.mn ? { ...i, ...i.mn } : i)),
          more: Math.max(0, items.length - MAX_ITEMS),
          url: `${config.siteUrl}/${TOPIC_PAGE[s.topic]}`,
        });
      }
      if (sections.length) {
        const unsubscribeUrl = `${config.siteUrl}/api/unsubscribe?t=${unsubscribeToken(config.sessionSecret, user.user_id)}${user.lang === 'mn' ? '&lang=mn' : ''}`;
        const mail = digestMail({
          firstName: user.first_name,
          sections,
          siteUrl: config.siteUrl,
          unsubscribeUrl,
          lang: user.lang,
          instant: userSubs.every((s) => s.frequency === 'instant'),
        });
        await enqueueMail(tx, {
          to: user.email,
          toName: `${user.first_name} ${user.last_name}`,
          ...mail,
          headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
          purpose: 'digest',
          priority: 8,
        });
        queued++;
      }
      // advance every due cursor, also for topics that had nothing new
      for (const s of userSubs) {
        await tx.query('update subscription_prefs set last_sent_at = $3 where user_id = $1 and topic = $2', [user.user_id, s.topic, upperFor(s.topic)]);
      }
    }
    if (queued) log?.info({ queued, users: byUser.size }, 'digest queued');
    return { emails_queued: queued, users: byUser.size };
  });
}
