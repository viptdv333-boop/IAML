/* ═══════════════════════════════════════════════════
   IAML — Supabase client bootstrap
   ───────────────────────────────────────────────────
   Phase 1: this is a stub. The site works without a
   backend; auth/dynamic content show graceful
   "coming soon" states.

   Phase 2 (once a Supabase project exists):
     1. Add the SDK before this file in index.html:
        <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
     2. Fill in IAML_CONFIG below with the project URL
        and the public anon key (safe to expose).
   The anon key is PUBLIC by design — never put the
   service_role key here.
   ═══════════════════════════════════════════════════ */
(function () {
  "use strict";

  window.IAML_CONFIG = {
    supabaseUrl: "",      // e.g. "https://xxxx.supabase.co"
    supabaseAnonKey: ""   // public anon key
  };

  var cfg = window.IAML_CONFIG;
  var hasLib = typeof window.supabase !== "undefined" && typeof window.supabase.createClient === "function";
  var hasCfg = !!(cfg.supabaseUrl && cfg.supabaseAnonKey);

  // Single shared client instance (null until configured in Phase 2).
  window.iamlSupabase = (hasLib && hasCfg)
    ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey)
    : null;

  // Feature flag the rest of the app checks before calling the backend.
  window.iamlBackendReady = !!window.iamlSupabase;
})();
