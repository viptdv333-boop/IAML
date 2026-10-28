/* ═══════════════════════════════════════════════════
   IAML — API client (same origin, /api).
   Shared by the public pages and the admin panel.
   Contract: docs/API.md.  Load BEFORE app.js / pages.js / admin.js.

   Exposes window.IAML.api, window.IAML.fmt.
   Static mode: if /api/health does not answer (GitHub Pages draft,
   file://, offline) api.available() resolves false and pages keep
   their static markup.

   Language (docs/I18N.md §3): public GET requests carry ?lang=<UI language>
   unless it is English; POST /auth/register carries lang; IAML.fmt shows
   Mongolian month labels. The admin panel does not load the i18n engine
   (IAML.i18n is undefined there) and therefore always behaves as English.
   ═══════════════════════════════════════════════════ */
(function () {
  "use strict";

  var IAML = (window.IAML = window.IAML || {});
  var cfg = window.IAML_CONFIG || {};
  var BASE = (cfg.apiBase || "") + "/api";

  function uiLang() { return (IAML.i18n && IAML.i18n.lang) || "en"; }
  /* not localised: admin, auth, me, health, discuss (their texts are user data or fixed English) */
  var NOT_LOCALISED = /^\/(admin|auth|me|health|discuss)(\/|\?|$)/;
  function withLang(path) {
    var lang = uiLang();
    if (lang === "en" || NOT_LOCALISED.test(path) || /[?&]lang=/.test(path)) return path;
    return path + (path.indexOf("?") === -1 ? "?" : "&") + "lang=" + encodeURIComponent(lang);
  }

  /* ── errors ── */
  function ApiError(status, code, message, fields, extra) {
    this.name = "ApiError";
    this.message = message || code || "Request failed";
    this.status = status;
    this.code = code || "error";
    this.fields = fields || null;
    this.extra = extra || null;
    if (Error.captureStackTrace) Error.captureStackTrace(this, ApiError);
    else this.stack = new Error(this.message).stack;
  }
  ApiError.prototype = Object.create(Error.prototype);
  ApiError.prototype.constructor = ApiError;

  /* ── core request ── */
  function request(method, path, body, opts) {
    opts = opts || {};
    var headers = { Accept: "application/json", "X-Requested-With": "IAML" };
    var init = { method: method, headers: headers, credentials: "same-origin", cache: "no-store" };
    if (method === "GET") path = withLang(path);
    /* the language of the confirmation e-mail */
    if (method === "POST" && path === "/auth/register" && body && typeof body === "object" && !(body instanceof FormData) && body.lang === undefined) {
      body = Object.assign({}, body, { lang: uiLang() });
    }
    if (body instanceof FormData) {
      init.body = body; // browser sets the multipart boundary
    } else if (body !== undefined && body !== null) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    if (opts.signal) init.signal = opts.signal;

    return fetch(BASE + path, init).then(
      function (res) {
        if (res.status === 204) return null;
        var ct = res.headers.get("content-type") || "";
        var isJson = ct.indexOf("application/json") !== -1;
        return (isJson ? res.json() : res.text()).then(function (data) {
          if (res.ok) return data;
          var er = (data && data.error) || {};
          var extra = {};
          if (er.email) extra.email = er.email;
          var ra = res.headers.get("retry-after");
          if (ra) extra.retryAfter = parseInt(ra, 10) || null;
          throw new ApiError(res.status, er.code || "http_error", er.message || ("HTTP " + res.status), er.fields, extra);
        });
      },
      function (err) {
        if (err && err.name === "AbortError") throw err;
        throw new ApiError(0, "network_error", "Network error — please check your connection.");
      }
    );
  }

  function qs(params) {
    if (!params) return "";
    var parts = [];
    Object.keys(params).forEach(function (k) {
      var v = params[k];
      if (v === undefined || v === null || v === "") return;
      parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(v));
    });
    return parts.length ? "?" + parts.join("&") : "";
  }

  /* ── backend detection ── */
  var availablePromise = null;
  var siteInfo = { timezone: "Etc/GMT-3", tz_label: "UTC+3" };

  function available() {
    if (availablePromise) return availablePromise;
    availablePromise = new Promise(function (resolve) {
      var done = false;
      function finish(v) { if (!done) { done = true; resolve(v); } }
      var timer = setTimeout(function () { finish(false); }, 4000);
      try {
        fetch(BASE + "/health", { headers: { Accept: "application/json" }, cache: "no-store", credentials: "same-origin" })
          .then(function (res) {
            var ct = res.headers.get("content-type") || "";
            if (!res.ok || ct.indexOf("application/json") === -1) return false;
            return res.json().then(function (j) {
              if (j && j.ok === true) { if (j.site) siteInfo = j.site; return true; }
              return false;
            });
          })
          .then(function (ok) { clearTimeout(timer); finish(!!ok); })
          .catch(function () { clearTimeout(timer); finish(false); });
      } catch (e) { clearTimeout(timer); finish(false); }
    });
    return availablePromise;
  }

  /* ── session ── */
  var currentUser = null;
  var meLoaded = false;
  var listeners = [];

  function setUser(u) {
    currentUser = u || null;
    meLoaded = true;
    listeners.slice().forEach(function (cb) { try { cb(currentUser); } catch (e) {} });
    return currentUser;
  }
  function me(force) {
    if (meLoaded && !force) return Promise.resolve(currentUser);
    return request("GET", "/auth/me").then(function (r) { return setUser(r && r.user); });
  }
  function logout() {
    return request("POST", "/auth/logout").then(function () { setUser(null); });
  }
  function onChange(cb) { listeners.push(cb); }

  var api = {
    base: BASE,
    ApiError: ApiError,
    qs: qs,
    available: available,
    get site() { return siteInfo; },
    get: function (p, params) { return request("GET", p + qs(params)); },
    post: function (p, b) { return request("POST", p, b === undefined ? {} : b); },
    put: function (p, b) { return request("PUT", p, b === undefined ? {} : b); },
    patch: function (p, b) { return request("PATCH", p, b === undefined ? {} : b); },
    del: function (p, b) { return request("DELETE", p, b); },
    upload: function (p, formData) { return request("POST", p, formData); },
    session: {
      get user() { return currentUser; },
      get loaded() { return meLoaded; },
      me: me,
      setUser: setUser,
      logout: logout,
      onChange: onChange
    }
  };
  IAML.api = api;

  /* ── formatting: the site shows UTC+3 (fixed offset, no DST) ── */
  var OFFSET_MS = 3 * 3600 * 1000;
  var MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  var MONTHS_LONG = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function p2(n) { return (n < 10 ? "0" : "") + n; }
  function parts(iso) {
    var t = new Date(iso).getTime();
    if (isNaN(t)) return null;
    var d = new Date(t + OFFSET_MS);
    return { y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes() };
  }
  IAML.fmt = {
    /* "2026-07-10 · 14:30 (UTC+3)" — same format as the static markup */
    dateTime: function (iso) { var p = parts(iso); return p ? p.y + "-" + p2(p.mo + 1) + "-" + p2(p.d) + " · " + p2(p.h) + ":" + p2(p.mi) + " (UTC+3)" : ""; },
    /* "2026-07-10 (UTC+3)" */
    date: function (iso) { var p = parts(iso); return p ? p.y + "-" + p2(p.mo + 1) + "-" + p2(p.d) + " (UTC+3)" : ""; },
    /* "15 Sep 2026, 09:00 (UTC+3)"  ·  Mongolian: "2026 оны 9-р сарын 15, 09:00 (UTC+3)" */
    long: function (iso) {
      var p = parts(iso);
      if (!p) return "";
      var clock = p2(p.h) + ":" + p2(p.mi) + " (UTC+3)";
      return uiLang() === "mn" ? p.y + " оны " + (p.mo + 1) + "-р сарын " + p.d + ", " + clock : p.d + " " + MONTHS_LONG[p.mo] + " " + p.y + ", " + clock;
    },
    time: function (iso) { var p = parts(iso); return p ? p2(p.h) + ":" + p2(p.mi) + " (UTC+3)" : ""; },
    /* event date chip: { month: "SEP", day: "15", year: "2026" }  ·  Mongolian month label: "9-р сар" */
    chip: function (iso) {
      var p = parts(iso);
      if (!p) return null;
      return { month: uiLang() === "mn" ? (p.mo + 1) + "-р сар" : MONTHS[p.mo], day: p2(p.d), year: String(p.y) };
    },
    /* <input type="datetime-local"> value (UTC+3 wall clock) ⇄ ISO UTC */
    toInput: function (iso) { var p = parts(iso); return p ? p.y + "-" + p2(p.mo + 1) + "-" + p2(p.d) + "T" + p2(p.h) + ":" + p2(p.mi) : ""; },
    fromInput: function (v) {
      var m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(String(v || ""));
      if (!m) return null;
      return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - OFFSET_MS).toISOString();
    },
    initials: function (name) {
      var w = String(name || "").split(/\s+/).filter(Boolean);
      return ((w[0] ? w[0].charAt(0) : "") + (w[1] ? w[1].charAt(0) : "")).toUpperCase() || "•";
    }
  };
})();
