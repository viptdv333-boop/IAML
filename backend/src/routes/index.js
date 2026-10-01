import health from './health.js';
import publicRoutes from './public.js';
import contact from './contact.js';
import auth from './auth.js';
import me from './me.js';
import discuss from './discuss.js';
import unsubscribe from './unsubscribe.js';
import admin from './admin/index.js';

export default async function routes(app) {
  await app.register(health);
  await app.register(publicRoutes);
  await app.register(contact);
  await app.register(auth);
  await app.register(me);
  await app.register(discuss);
  await app.register(unsubscribe);
  await app.register(admin);
}
