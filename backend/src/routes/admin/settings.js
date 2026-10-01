import { audit } from '../../lib/audit.js';
import { SETTING_KEYS, getSettings, setSettings } from '../../lib/settings.js';
import { validate, v } from '../../lib/validate.js';

const SPEC = {
  'contact.email': v.email().optional(null),
  'contact.address': v.str({ max: 300, multiline: true }).optional(null),
};

export default async function settingsRoutes(app) {
  const { db } = app;

  app.get('/api/admin/settings', async () => ({ settings: await getSettings(db) }));

  app.put('/api/admin/settings', async (req) => {
    const body = req.body?.settings;
    const picked = {};
    for (const key of SETTING_KEYS) if (body && Object.prototype.hasOwnProperty.call(body, key)) picked[key] = body[key];
    const clean = validate(SPEC, picked, { partial: true });
    await db.tx(async (tx) => {
      await setSettings(tx, clean);
      await audit(tx, req.user.id, 'update', 'settings', null, { keys: Object.keys(clean) });
    });
    return { settings: await getSettings(db) };
  });
}
