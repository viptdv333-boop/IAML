// Serves the static site from an allow-list (never the whole repo), generated robots/sitemap/manifest,
// avatar uploads, and the JSON 404 for unknown API paths.
import fastifyStatic from '@fastify/static';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT_FILE = /^\/(?:[a-z0-9][a-z0-9-]*\.html|iaml-site\.css|favicon\.svg)$/;
const ASSET_PATH = /^\/(?:assets|site)\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+$/;
const AVATAR_PATH = /^\/uploads\/avatars\/[0-9a-f-]{36}\.webp$/;

const CORE_PAGES = ['index.html', 'news.html', 'events.html', 'publications.html', 'participants.html', 'mongolist.html', 'discuss.html', 'contacts.html', 'useful-links.html', 'privacy.html', 'terms.html'];

const isFile = async (p) => {
  try { return (await stat(p)).isFile(); } catch { return false; }
};

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif', '.ico', '.woff', '.woff2']);

function cacheControlFor(urlPath) {
  if (AVATAR_PATH.test(urlPath)) return 'public, max-age=31536000, immutable'; // random file names, never overwritten
  const ext = path.extname(urlPath).toLowerCase();
  if (IMAGE_EXT.has(ext)) return 'public, max-age=86400';
  return 'no-cache'; // html / css / js / json: always revalidate (ETag → cheap 304)
}

export default async function staticPlugin(app) {
  const { config, db } = app;
  let sitemapCache = null; // the sitemap hits the DB; one query a minute is plenty

  await app.register(fastifyStatic, {
    root: config.staticDir,
    serve: false,          // we route by hand through the allow-list below
    dotfiles: 'deny',
    cacheControl: false,   // set per path
    etag: true,
    lastModified: true,
  });

  // The 404 page uses relative links (it also lives on GitHub Pages); served for /a/b/c they would break,
  // so a <base href="/"> is injected here.
  const sendHtml404 = async (reply) => {
    let html;
    try { html = await readFile(path.join(config.staticDir, '404.html'), 'utf8'); } catch { html = null; }
    if (html === null) return reply.code(404).type('text/plain; charset=utf-8').send('Not found');
    if (!/<base\s/i.test(html)) html = html.replace(/<head([^>]*)>/i, '<head$1><base href="/">');
    return reply.code(404).type('text/html; charset=utf-8').header('Cache-Control', 'no-cache').send(html);
  };

  app.setNotFoundHandler({ preHandler: app.rateLimit() }, async (req, reply) => {
    const urlPath = req.url.split('?')[0];

    if (urlPath.startsWith('/api/') || urlPath === '/api') {
      return reply.code(404).send({ error: { code: 'not_found', message: 'Not found.' } });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return reply.code(404).type('text/plain').send('Not found');
    }

    let decoded;
    try { decoded = decodeURIComponent(urlPath); } catch { return sendHtml404(reply); }
    if (decoded.includes('\0') || decoded.includes('\\') || decoded.split('/').includes('..') || decoded.includes('//')) {
      return sendHtml404(reply);
    }

    // generated files (so they follow SITE_URL instead of the GitHub Pages draft URL)
    if (decoded === '/robots.txt') {
      return reply.type('text/plain; charset=utf-8').header('Cache-Control', 'public, max-age=3600').send(
        `User-agent: *\nAllow: /\nDisallow: /admin.html\nDisallow: /account.html\nDisallow: /api/\n\nSitemap: ${config.siteUrl}/sitemap.xml\n`,
      );
    }
    if (decoded === '/sitemap.xml') {
      if (!config.isTest && sitemapCache && Date.now() - sitemapCache.at < 60_000) {
        return reply.type('application/xml; charset=utf-8').header('Cache-Control', 'public, max-age=3600').send(sitemapCache.xml);
      }
      const pages = await db.many(`select slug, updated_at from pages where is_published and slug <> '' order by slug`);
      const urls = [
        ...CORE_PAGES.map((f) => ({ loc: f === 'index.html' ? `${config.siteUrl}/` : `${config.siteUrl}/${f}` })),
        ...pages.map((p) => ({ loc: `${config.siteUrl}/page.html?slug=${p.slug}`, lastmod: new Date(p.updated_at).toISOString().slice(0, 10) })),
      ];
      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
        .map((u) => `  <url><loc>${u.loc.replace(/&/g, '&amp;')}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`)
        .join('\n')}\n</urlset>\n`;
      sitemapCache = { at: Date.now(), xml };
      return reply.type('application/xml; charset=utf-8').header('Cache-Control', 'public, max-age=3600').send(xml);
    }
    if (decoded === '/site.webmanifest') {
      try {
        const manifest = JSON.parse(await readFile(path.join(config.staticDir, 'site.webmanifest'), 'utf8'));
        manifest.start_url = '/';
        manifest.scope = '/';
        return reply.type('application/manifest+json; charset=utf-8').header('Cache-Control', 'public, max-age=86400').send(manifest);
      } catch {
        return sendHtml404(reply);
      }
    }

    if (AVATAR_PATH.test(decoded)) {
      const file = decoded.slice('/uploads/avatars/'.length);
      if (!(await isFile(path.join(config.uploadsDir, 'avatars', file)))) return reply.code(404).type('text/plain; charset=utf-8').send('Not found');
      reply.header('Cache-Control', cacheControlFor(decoded));
      reply.header('Content-Security-Policy', "default-src 'none'; sandbox");
      reply.header('X-Content-Type-Options', 'nosniff');
      return reply.type('image/webp').sendFile(file, path.join(config.uploadsDir, 'avatars'));
    }

    let rel = decoded === '/' ? '/index.html' : decoded;
    if (!ROOT_FILE.test(rel) && !ASSET_PATH.test(rel)) return sendHtml404(reply);
    rel = rel.slice(1);
    if (!(await isFile(path.join(config.staticDir, rel)))) return sendHtml404(reply);

    reply.header('Cache-Control', cacheControlFor(`/${rel}`));
    return reply.sendFile(rel);
  });
}
