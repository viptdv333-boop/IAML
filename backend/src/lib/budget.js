// In-memory sliding-window budgets for GLOBAL (all-client) limits on abusable operations such as "send a code
// e-mail": per-IP limits do not stop a botnet, but a global ceiling keeps the e-mail quota and the CPU bounded.
// One process serves the site, so a process-local counter is exact.
export function createBudget() {
  const hits = new Map();
  return {
    /** Count one use of `name`; false when more than `max` uses happened within `windowMs`. */
    take(name, max, windowMs) {
      const now = Date.now();
      const recent = (hits.get(name) ?? []).filter((t) => now - t < windowMs);
      const allowed = recent.length < max;
      if (allowed) recent.push(now);
      hits.set(name, recent);
      return allowed;
    },
    reset() { hits.clear(); },
  };
}
