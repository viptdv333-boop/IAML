import { tzLabel } from '../lib/tz.js';

export default async function healthRoutes(app) {
  const { config, db } = app;
  // logLevel 'warn': the container health check calls this every 30 s — keep it out of the info-level request log
  app.get('/api/health', { logLevel: 'warn', config: { rateLimit: false } }, async (req, reply) => {
    const up = await db.ping();
    if (!up) return reply.code(503).send({ ok: false });
    return {
      ok: true,
      version: config.version,
      time: new Date().toISOString(),
      site: { timezone: config.siteTz, tz_label: tzLabel(config.siteTz) },
    };
  });
}
