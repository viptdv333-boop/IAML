// Key/value site settings (JSONB), allow-listed keys only.
export const SETTING_KEYS = ['contact.email', 'contact.address'];

export async function getSettings(db, keys = SETTING_KEYS) {
  const rows = await db.many('select key, value from site_settings where key = any($1)', [keys]);
  const out = Object.fromEntries(keys.map((k) => [k, null]));
  for (const r of rows) out[r.key] = r.value;
  return out;
}

export async function setSettings(db, values) {
  for (const [key, value] of Object.entries(values)) {
    if (!SETTING_KEYS.includes(key)) continue;
    await db.query(
      `insert into site_settings (key, value, updated_at) values ($1, $2::jsonb, now())
       on conflict (key) do update set value = excluded.value, updated_at = now()`,
      [key, JSON.stringify(value)],
    );
  }
}
