/* ═══════════════════════════════════════════════════
   IAML — i18n engine (English ⇄ Mongolian).  Contract: docs/I18N.md

   Load as a plain (blocking) script in <head>, BEFORE every other script:
       <script src="assets/js/i18n.js?v=…"></script>
   and the dictionary as the FIRST deferred script:
       <script defer src="assets/js/i18n-mn.js?v=…"></script>

   English is the source language: the HTML and the JS carry English text, and the dictionary maps
   English strings → Mongolian. Whatever has no translation simply stays English.

   DOM markup (translated once, when the document is ready — or on demand with IAML.i18n.apply(node)):
     <h2 data-i18n>About Us</h2>                          text content (leaf elements only)
     <p data-i18n="html">Mail <a href="…">us</a>.</p>      innerHTML (dictionary is our own file, so it is trusted)
     <input data-i18n-attr="placeholder aria-label" …>    listed attributes (value = English key)
     <meta name="description" content="…" data-i18n-attr="content">
   JS strings:  IAML.t("Welcome back, {name}.", { name: first })
   ═══════════════════════════════════════════════════ */
(function () {
  "use strict";

  var IAML = (window.IAML = window.IAML || {});
  var KEY = "iaml-lang";
  var SUPPORTED = ["en", "mn"];
  var DEFAULT = "en";

  function fromUrl() {
    var m = /[?&]lang=([A-Za-z]{2})(?:&|#|$)/.exec(location.search);
    var l = m && m[1].toLowerCase();
    return l && SUPPORTED.indexOf(l) !== -1 ? l : null;
  }
  function stored() {
    try { var s = localStorage.getItem(KEY); return SUPPORTED.indexOf(s) !== -1 ? s : null; } catch (e) { return null; }
  }
  function store(l) { try { localStorage.setItem(KEY, l); } catch (e) { /* private mode: the choice just isn't remembered */ } }

  /* ?lang= wins (and is remembered) → remembered choice → browser language (mn*) → English */
  function detect() {
    var u = fromUrl();
    if (u) { store(u); return u; }
    var s = stored();
    if (s) return s;
    var nav = (navigator.languages && navigator.languages[0]) || navigator.language || "";
    return /^mn(-|_|$)/i.test(nav) ? "mn" : DEFAULT;
  }

  var lang = detect();
  var root = document.documentElement;
  root.setAttribute("lang", lang);
  /* hides the page until the translation is applied (CSS has a 1.2 s fail-safe), so no flash of English */
  if (lang !== DEFAULT) root.setAttribute("data-i18n-pending", "1");

  var dicts = {};
  var missing = [];

  function norm(s) { return String(s).replace(/\s+/g, " ").trim(); }
  function fill(str, params) {
    if (!params) return str;
    return str.replace(/\{(\w+)\}/g, function (m, k) { return params[k] !== undefined && params[k] !== null ? params[k] : m; });
  }
  function lookup(key) {
    var d = dicts[lang];
    if (!d) return null;
    var v = d[key];
    return typeof v === "string" && v !== "" ? v : null;
  }
  function note(key) {
    if (lang === DEFAULT || !key) return;
    if (missing.indexOf(key) === -1) missing.push(key);
  }

  /* IAML.t("English text {x}", { x: 1 }) → translated text (English when there is no translation) */
  function t(en, params) {
    var tr = lang === DEFAULT ? null : lookup(en);
    if (tr === null) note(en);
    return fill(tr === null ? en : tr, params);
  }

  function each(scope, selector, fn) {
    var list = scope.querySelectorAll(selector);
    for (var i = 0; i < list.length; i++) fn(list[i]);
    if (scope.nodeType === 1 && scope.matches && scope.matches(selector)) fn(scope);
  }

  /* Translate the [data-i18n] / [data-i18n-attr] elements inside `scope` (default: the whole document). */
  function apply(scope) {
    if (lang === DEFAULT) return;
    scope = scope || document;
    each(scope, "[data-i18n]", function (node) {
      if (node.getAttribute("data-i18n-done") === lang) return;
      var html = node.getAttribute("data-i18n") === "html";
      var key = norm(html ? node.innerHTML : node.textContent);
      var tr = lookup(key);
      if (tr === null) note(key);
      else if (html) node.innerHTML = tr;
      else node.textContent = tr;
      node.setAttribute("data-i18n-done", lang);
    });
    each(scope, "[data-i18n-attr]", function (node) {
      var names = (node.getAttribute("data-i18n-attr") || "").split(/\s+/);
      var done = node.getAttribute("data-i18n-attr-done") === lang;
      if (done) return;
      for (var i = 0; i < names.length; i++) {
        if (!names[i] || !node.hasAttribute(names[i])) continue;
        var key = norm(node.getAttribute(names[i]));
        var tr = lookup(key);
        if (tr === null) note(key);
        else node.setAttribute(names[i], tr);
      }
      node.setAttribute("data-i18n-attr-done", lang);
    });
  }

  function reveal() { root.removeAttribute("data-i18n-pending"); }

  /* the page is revealed even if translating throws (a broken dictionary must never leave the page blank) */
  function ready() { try { apply(document); } finally { reveal(); } }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready);
  else ready();

  /* switch language: remember it, drop ?lang= from the address and reload (dynamic content is re-fetched in the new language) */
  function setLang(next) {
    if (SUPPORTED.indexOf(next) === -1) return;
    store(next);
    var search = location.search.replace(/([?&])lang=[^&#]*&?/, "$1").replace(/[?&]$/, "");
    /* storage blocked (private mode): the choice can only travel in the address */
    if (stored() !== next) search += (search ? "&" : "?") + "lang=" + next;
    var target = location.pathname + search + location.hash;
    /* assigning the very same address (it ends in a #fragment, e.g. discuss.html#thread-5) is only a scroll, not a reload */
    if (target === location.pathname + location.search + location.hash) location.reload();
    else location.href = target;
  }

  IAML.i18n = {
    lang: lang,
    supported: SUPPORTED.slice(),
    defaultLang: DEFAULT,
    /* i18n-mn.js: IAML.i18n.add("mn", { "English": "Монгол", … }) */
    add: function (code, entries) {
      var d = dicts[code] || (dicts[code] = {});
      for (var k in entries) if (Object.prototype.hasOwnProperty.call(entries, k)) d[k] = entries[k];
    },
    has: function (en) { return lang === DEFAULT || lookup(en) !== null; },
    t: t,
    apply: apply,
    setLang: setLang,
    missing: missing,           /* strings that were asked for but have no translation (debugging / completeness check) */
    dictionary: function (code) { return dicts[code || lang] || {}; }
  };
  IAML.t = t;
})();
