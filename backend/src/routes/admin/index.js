// Everything under /api/admin requires an administrator session.
import resources from './resources.js';
import settings from './settings.js';
import moderation from './moderation.js';
import users from './users.js';
import ops from './ops.js';

export default async function adminRoutes(app) {
  await app.register(async (admin) => {
    admin.addHook('preHandler', app.requireAdmin);
    await admin.register(resources);
    await admin.register(settings);
    await admin.register(moderation);
    await admin.register(users);
    await admin.register(ops);
  });
}
