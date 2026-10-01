// Time-zone helpers for the site's display zone (UTC+3 by default, no DST).
const cache = new Map();

function fmt(tz) {
  let f = cache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
    });
    cache.set(tz, f);
  }
  return f;
}

/** Wall-clock parts of an instant in zone `tz`: { y, mo, d, h, mi, s, wd (1=Mon..7=Sun) }. */
export function zonedParts(date, tz) {
  const o = {};
  for (const p of fmt(tz).formatToParts(date)) o[p.type] = p.value;
  const wdMap = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour, mi: +o.minute, s: +o.second, wd: wdMap[o.weekday] };
}

/** Offset (ms) of `tz` from UTC at the given instant (east positive). */
export function zoneOffsetMs(date, tz) {
  const p = zonedParts(date, tz);
  const asUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** "UTC+3" style label. */
export function tzLabel(tz, at = new Date()) {
  const off = Math.round(zoneOffsetMs(at, tz) / 60000);
  const sign = off < 0 ? '-' : '+';
  const h = Math.floor(Math.abs(off) / 60);
  const m = Math.abs(off) % 60;
  return `UTC${sign}${h}${m ? ':' + String(m).padStart(2, '0') : ''}`;
}

/** Format an instant like "2026-07-10 14:30 (UTC+3)". */
export function formatDateTime(date, tz) {
  const p = zonedParts(new Date(date), tz);
  const pad = (n) => String(n).padStart(2, '0');
  return `${p.y}-${pad(p.mo)}-${pad(p.d)} ${pad(p.h)}:${pad(p.mi)} (${tzLabel(tz, new Date(date))})`;
}

/**
 * Most recent scheduled slot at or before `now`: today (or the last matching weekday) at `hour`:00 in zone `tz`.
 * weekday: 1..7 (Mon..Sun) for weekly slots, or null for daily.
 */
export function lastSlot(now, tz, hour, weekday = null) {
  const off = zoneOffsetMs(now, tz);
  const local = new Date(now.getTime() + off); // shifted so UTC getters read local wall-clock
  let y = local.getUTCFullYear(), mo = local.getUTCMonth(), d = local.getUTCDate();
  let slotLocal = Date.UTC(y, mo, d, hour, 0, 0);
  if (slotLocal > local.getTime()) slotLocal -= 86_400_000; // today's slot is still in the future → yesterday's
  if (weekday !== null) {
    for (let i = 0; i < 7; i++) {
      const dt = new Date(slotLocal);
      const wd = ((dt.getUTCDay() + 6) % 7) + 1; // 1=Mon..7=Sun
      if (wd === weekday) break;
      slotLocal -= 86_400_000;
    }
  }
  return new Date(slotLocal - off);
}
