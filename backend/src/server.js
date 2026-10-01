// Process entry point: config → migrations → HTTP server → mail worker + scheduler → graceful shutdown.
import { ConfigError, loadConfig } from './config.js';
import { buildApp } from './app.js';
import { startScheduler } from './jobs/scheduler.js';
import { migrate } from './migrate.js';

let config;
try {
  config = loadConfig();
} catch (err) {
  if (err instanceof ConfigError) {
    console.error(err.message);
    process.exit(78); // EX_CONFIG
  }
  throw err;
}

const app = await buildApp(config);
for (const w of config.warnings) app.log.warn(w);
let scheduler = null;

try {
  if (config.migrateOnStart) {
    const applied = await migrate(app.db, { log: (m) => app.log.info(m) });
    if (applied?.length) app.log.info({ applied }, 'migrations applied');
  }
  await app.listen({ port: config.port, host: config.host });
  if (config.jobsEnabled) {
    app.mail.worker.start();
    scheduler = startScheduler({ db: app.db, config, log: app.log });
    app.log.info({ transport: app.mail.transport.name }, 'mail worker and scheduler started');
  }
} catch (err) {
  app.log.error({ err }, 'failed to start');
  process.exit(1);
}

let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  app.log.info({ signal }, 'shutting down');
  const killer = setTimeout(() => process.exit(1), 15_000);
  killer.unref();
  try {
    await scheduler?.stop();
    await app.mail.worker.stop();
    await app.close();
    process.exit(0);
  } catch (err) {
    app.log.error({ err }, 'error during shutdown');
    process.exit(1);
  }
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (err) => { app.log.error({ err }, 'unhandled rejection'); });
