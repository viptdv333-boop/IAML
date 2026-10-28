/* ═══════════════════════════════════════════════════
   IAML — shared site chrome + helpers
   Injects: SVG logo defs, top nav + footer (menu from GET /api/menu,
   cached in localStorage "iaml-menu"), content modal. Wires: burger,
   active link, reveal-on-scroll, modals (focus trap, Esc, focus restore).

   Shared helpers for the other scripts (auth.js, pages.js, discuss.js,
   account.js): IAML.el / esc / paragraphs / ui / modal / dialog / toast /
   live() / whenUser().  The log-in UI itself lives in auth.js.

   Static mode: when /api/health does not answer (GitHub Pages draft) the
   static menu and markup stay exactly as they are.

   Language (docs/I18N.md): every visible string goes through t() = IAML.t
   (assets/js/i18n.js); server messages through IAML.tServer(); the header
   carries the EN | МН switcher.
   ═══════════════════════════════════════════════════ */
(function () {
  "use strict";

  /* The i18n engine is a blocking <head> script. Should it be missing (stale cached page), the site just stays English. */
  var IAML0 = (window.IAML = window.IAML || {});
  if (typeof IAML0.t !== "function") {
    IAML0.t = function (en, params) {
      return params ? String(en).replace(/\{(\w+)\}/g, function (m, k) { return params[k] !== undefined && params[k] !== null ? params[k] : m; }) : en;
    };
  }
  var t = IAML0.t;
  var LANG = (IAML0.i18n && IAML0.i18n.lang) || "en";

  /* ── Menu: static default, replaced by the backend-managed menu (GET /api/menu) ── */
  var STATIC_MENU = [
    { key: "about",        label: t("About"),        href: "index.html" },
    { key: "news",         label: t("News"),         href: "news.html" },
    { key: "events",       label: t("Events"),       href: "events.html" },
    { key: "publications", label: t("Publications"), href: "publications.html" },
    { key: "participants", label: t("Participants"), href: "participants.html" },
    { key: "mongolist",    label: t("Mongolist"),    href: "mongolist.html" },
    { key: "discuss",      label: t("Discuss"),      href: "discuss.html" },
    { key: "contacts",     label: t("Contacts"),     href: "contacts.html" },
    { key: "links",        label: t("Useful Links"), href: "useful-links.html" }
  ];
  var MENU = STATIC_MENU.slice(); // mutated in place, so IAML.menu always shows the current items
  /* the cached answer is per language, so a language switch never flashes the other language's labels */
  var MENU_KEY = "iaml-menu" + (LANG === "en" ? "" : "-" + LANG);
  var menuFromCache = false;

  var prefersReduced = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Academic Seal (IAML Brand Guidelines v1) - primary mark, two variants */
  var SEAL_BLUE =
    '<g id="sealBlue">' +
      '<circle cx="100" cy="100" r="90" fill="none" stroke="#003F87" stroke-width="2.5"/>' +
      '<circle cx="100" cy="100" r="82" fill="none" stroke="#2E7ABF" stroke-width="1"/>' +
      '<path id="sealBlueTop" d="M 100,100 m -76,0 a 76,76 0 1,1 152,0" fill="none"/>' +
      '<path id="sealBlueBot" d="M 24,100 a 76,76 0 0,0 152,0" fill="none"/>' +
      '<text font-family="Cormorant Garamond,serif" font-size="6" font-weight="600" fill="#003F87" letter-spacing="1"><textPath href="#sealBlueTop" startOffset="50%" text-anchor="middle">INTERNATIONAL ASSOCIATION FOR MONGOLIC LINGUISTICS</textPath></text>' +
      '<text font-family="DM Sans,sans-serif" font-size="7" fill="#2E7ABF" letter-spacing="0.5"><textPath href="#sealBlueBot" startOffset="50%" text-anchor="middle">ОЛОН УЛСЫН МОНГОЛ ХЭЛ СУДЛАЛЫН НИЙГЭМЛЭГ</textPath></text>' +
      '<text x="100" y="94" text-anchor="middle" font-family="Cormorant Garamond,serif" font-size="30" font-weight="700" fill="#003F87" letter-spacing="3">IAML</text>' +
      '<line x1="60" y1="108" x2="140" y2="108" stroke="#D4A843" stroke-width="1"/>' +
      '<circle cx="57" cy="108" r="1.5" fill="#D4A843"/><circle cx="143" cy="108" r="1.5" fill="#D4A843"/>' +
      '<text x="100" y="134" text-anchor="middle" font-family="Cormorant Garamond,serif" font-size="19" font-weight="700" fill="#003F87" letter-spacing="2">ОУМХСН</text>' +
    '</g>';

  var SEAL_WHITE =
    '<g id="sealWhite">' +
      '<circle cx="100" cy="100" r="90" fill="none" stroke="#F8FAFC" stroke-width="2.5"/>' +
      '<circle cx="100" cy="100" r="82" fill="none" stroke="#5BA3D9" stroke-width="1"/>' +
      '<path id="sealWhiteTop" d="M 100,100 m -76,0 a 76,76 0 1,1 152,0" fill="none"/>' +
      '<path id="sealWhiteBot" d="M 24,100 a 76,76 0 0,0 152,0" fill="none"/>' +
      '<text font-family="Cormorant Garamond,serif" font-size="6" font-weight="600" fill="#F8FAFC" letter-spacing="1"><textPath href="#sealWhiteTop" startOffset="50%" text-anchor="middle">INTERNATIONAL ASSOCIATION FOR MONGOLIC LINGUISTICS</textPath></text>' +
      '<text font-family="DM Sans,sans-serif" font-size="7" fill="#5BA3D9" letter-spacing="0.5"><textPath href="#sealWhiteBot" startOffset="50%" text-anchor="middle">ОЛОН УЛСЫН МОНГОЛ ХЭЛ СУДЛАЛЫН НИЙГЭМЛЭГ</textPath></text>' +
      '<text x="100" y="94" text-anchor="middle" font-family="Cormorant Garamond,serif" font-size="30" font-weight="700" fill="#F8FAFC" letter-spacing="3">IAML</text>' +
      '<line x1="60" y1="108" x2="140" y2="108" stroke="#D4A843" stroke-width="1"/>' +
      '<circle cx="57" cy="108" r="1.5" fill="#D4A843"/><circle cx="143" cy="108" r="1.5" fill="#D4A843"/>' +
      '<text x="100" y="134" text-anchor="middle" font-family="Cormorant Garamond,serif" font-size="19" font-weight="700" fill="#F8FAFC" letter-spacing="2">ОУМХСН</text>' +
    '</g>';

  /* ── Tiny helpers ── */
  function h(html) { var tpl = document.createElement("template"); tpl.innerHTML = html.trim(); return tpl.content.firstChild; }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function $(id) { return document.getElementById(id); }
  function qsa(root, sel) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function ready(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }
  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); return node; }
  function focusEl(n) { if (n && n.focus) { try { n.focus(); } catch (e) {} } }

  /* DOM builder — never uses innerHTML, so API data is always inserted as text.
     el("div", { class: "x", "data-a": "1", on: { click: fn } }, child, [children], "text") */
  function appendChildren(parent, list) {
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c === null || c === undefined || c === false) continue;
      if (Array.isArray(c)) appendChildren(parent, c);
      else if (c.nodeType) parent.appendChild(c);
      else parent.appendChild(document.createTextNode(String(c)));
    }
  }
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === "class") node.className = v;
        else if (k === "text") node.textContent = v;
        else if (k === "on") Object.keys(v).forEach(function (ev) { node.addEventListener(ev, v[ev]); });
        else if (k === "value") node.value = v;
        else node.setAttribute(k, v === true ? "" : String(v));
      });
    }
    appendChildren(node, Array.prototype.slice.call(arguments, 2));
    return node;
  }

  /* Plain text from the API → paragraphs (blank line = new paragraph, single newline kept by CSS) */
  function paragraphs(text, cls) {
    var frag = document.createDocumentFragment();
    String(text == null ? "" : text).replace(/\r\n?/g, "\n").split(/\n{2,}/).forEach(function (block) {
      block = block.replace(/^\n+|\n+$/g, "");
      if (!block.trim()) return;
      frag.appendChild(el("p", { "class": "pre-line" + (cls ? " " + cls : "") }, block));
    });
    return frag;
  }

  /* Only http(s) links from API data are ever rendered as links */
  function safeUrl(u) {
    if (typeof u !== "string") return null;
    u = u.trim();
    if (!/^https?:\/\//i.test(u)) return null;
    try { return new URL(u).href; } catch (e) { return null; }
  }

  /* ── Backend detection (cached) and session ── */
  var livePromise = null;
  function live() {
    if (livePromise) return livePromise;
    var api = window.IAML && window.IAML.api;
    livePromise = (api && api.available ? api.available() : Promise.resolve(false)).then(
      function (ok) { window.IAML.isLive = !!ok; return !!ok; },
      function () { window.IAML.isLive = false; return false; }
    );
    return livePromise;
  }

  var mePromise = null;
  function whenUser() {
    var api = window.IAML && window.IAML.api;
    if (!api) return Promise.resolve(null);
    if (api.session.loaded) return Promise.resolve(api.session.user);
    if (!mePromise) {
      mePromise = api.session.me().then(
        function (u) { mePromise = null; return u; },
        function () { mePromise = null; return null; }
      );
    }
    return mePromise;
  }

  function isApiError(e) { return !!e && e.name === "ApiError"; }

  /* ── Menu (header + footer) ── */
  function safeHref(href) {
    href = String(href == null ? "" : href).trim();
    if (!href || href.indexOf("//") === 0) return null;
    if (/^[a-z][a-z0-9+.\-]*:/i.test(href)) return /^https?:/i.test(href) ? href : null;
    return href;
  }
  function normalizeMenu(items) {
    if (!Array.isArray(items)) return null;
    var out = [];
    items.forEach(function (it) {
      if (!it || typeof it.title !== "string" || !it.title.trim()) return;
      var href = safeHref(it.href);
      if (!href) return;
      out.push({ key: String(it.key == null ? "" : it.key), label: it.title.trim(), href: href });
    });
    return out.length ? out : null;
  }
  function readMenuCache() {
    try {
      var raw = window.localStorage.getItem(MENU_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      return normalizeMenu(Array.isArray(data) ? data : data && data.items);
    } catch (e) { return null; }
  }
  function writeMenuCache(answer) {
    try { window.localStorage.setItem(MENU_KEY, JSON.stringify(answer)); } catch (e) {}
  }
  function clearMenuCache() {
    try { window.localStorage.removeItem(MENU_KEY); } catch (e) {}
  }
  function currentSlug() {
    try { return new URLSearchParams(location.search).get("slug") || ""; } catch (e) { return ""; }
  }
  function isActive(item, page) {
    if (page === "custom") {
      var slug = currentSlug().toLowerCase();
      var m = /[?&]slug=([^&#]+)/.exec(item.href);
      var s = "";
      try { s = m ? decodeURIComponent(m[1]).toLowerCase() : ""; } catch (e) { s = m ? m[1].toLowerCase() : ""; }
      return !!slug && s === slug;
    }
    return !!item.key && item.key === page;
  }
  function setMenu(items) {
    MENU.length = 0;
    items.forEach(function (it) { MENU.push(it); });
    renderNavLinks();
    renderFooterNav();
  }
  function refreshMenu() {
    live().then(function (ok) {
      if (!ok) {
        if (menuFromCache) { menuFromCache = false; setMenu(STATIC_MENU); clearMenuCache(); }
        return null;
      }
      return window.IAML.api.get("/menu").then(function (answer) {
        var items = normalizeMenu(answer && answer.items);
        if (!items) return;
        writeMenuCache({ items: answer.items });
        if (JSON.stringify(items) !== JSON.stringify(MENU)) setMenu(items);
      });
    }).then(null, function () { /* keep the menu that is already shown */ });
  }

  /* Academic Seal lockup for the nav (deep-blue variant on light nav) */
  function brandLockup() {
    return '<span class="brand-seal"><svg viewBox="0 0 200 200" aria-hidden="true"><use href="#sealBlue"/></svg></span>';
  }

  /* ── Inject shared SVG defs (logo symbol) once ── */
  function injectDefs() {
    if (document.getElementById("iaml-defs")) return;
    var svg = h('<svg id="iaml-defs" xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true">' +
      '<defs>' + SEAL_BLUE + SEAL_WHITE + '</defs></svg>');
    document.body.insertBefore(svg, document.body.firstChild);
  }

  /* EN | МН — the language names stay in their own language (never translated). Two copies: one in the bar, one as the first
     item of the burger menu (shown instead of the bar copy when the bar has no room: body.nav-lang-menu, see fitNav). */
  function langSwitch(extraClass) {
    var i18n = window.IAML.i18n;
    if (!i18n || typeof i18n.setLang !== "function") return null;
    function btn(code, label, name) {
      var cur = i18n.lang === code;
      return el("button", {
        "class": "langsw__btn" + (cur ? " is-current" : ""), type: "button", "data-lang": code, lang: code,
        "aria-label": name, title: name, "aria-current": cur ? "true" : null
      }, label);
    }
    return el("div", { "class": "langsw " + extraClass, role: "group", "aria-label": t("Language") },
      btn("en", "EN", "English"), el("span", { "class": "langsw__sep", "aria-hidden": "true" }), btn("mn", "МН", "Монгол хэл"));
  }

  /* ── Render top nav ── */
  function renderNavLinks() {
    var mount = $("navLinks");
    if (!mount) return;
    var page = document.body.getAttribute("data-page") || "";
    clear(mount);
    var menuSwitch = langSwitch("langsw--menu");
    if (menuSwitch) mount.appendChild(menuSwitch);
    MENU.forEach(function (m) {
      var on = isActive(m, page);
      mount.appendChild(el("a", {
        href: m.href,
        "class": "nav__link" + (on ? " is-active" : ""),
        "aria-current": on ? "page" : null
      }, m.label));
    });
    fitNav();
  }

  /* Many entries (custom pages) or a wide user menu: when the bar would overflow, first the association name next to the
     seal is hidden (body.nav-compact), and if that is still not enough the burger menu takes over (body.nav-collapsed)
     — instead of pushing items off-screen. Re-measured on resize / font load / menu change / log-in. */
  function fitNav() {
    var inner = document.querySelector(".nav__in");
    if (!inner) return;
    var cl = document.body.classList;
    cl.remove("nav-compact", "nav-collapsed", "nav-lang-menu");
    function over() { return inner.scrollWidth > inner.clientWidth + 1; }
    if (window.innerWidth <= 1000) {             // the stylesheet shows the burger menu there; on phones the EN | МН switcher
      if (over()) cl.add("nav-lang-menu");       // moves from the bar into the burger menu when the bar has no room for it
      return;
    }
    if (!over()) return;
    cl.add("nav-compact");
    if (over()) cl.add("nav-collapsed");
  }
  var fitTimer = null;
  function fitNavSoon() {
    if (fitTimer) window.clearTimeout(fitTimer);
    fitTimer = window.setTimeout(fitNav, 80);
  }

  function renderHeader() {
    var mount = $("site-header");
    if (!mount) return;
    mount.innerHTML =
      '<nav class="nav" aria-label="' + esc(t("Main")) + '"><div class="nav__in">' +
        '<a href="index.html" class="nav__brand" aria-label="' + esc(t("IAML — home")) + '">' +
          brandLockup() +
          '<span class="nav__brand-sep"></span>' +
          '<span class="nav__brand-text"><span>' + esc(t("The International Association")) + '</span><span>' + esc(t("for Mongolic Linguistics")) + '</span></span>' +
        '</a>' +
        '<div class="nav__links" id="navLinks"></div>' +
        '<div class="nav__ctrls">' +
          '<span class="nav__auth" id="navAuth">' +
            '<button class="nav__btn" type="button" data-auth="login">' + esc(t("Log in")) + '</button>' +
            '<button class="nav__link nav__link--cta" type="button" data-auth="register">' + esc(t("Sign up")) + '</button>' +
          '</span>' +
          '<button class="burger" id="burger" type="button" aria-label="' + esc(t("Menu")) + '" aria-expanded="false" aria-controls="navLinks"><span></span><span></span><span></span></button>' +
        '</div>' +
      '</div></nav>';
    var ctrls = mount.querySelector(".nav__ctrls"), barSwitch = langSwitch("langsw--bar");
    if (ctrls && barSwitch) ctrls.insertBefore(barSwitch, ctrls.firstChild);
    renderNavLinks();
  }

  /* ── Render footer ── */
  function renderFooterNav() {
    var ul = $("footerNav");
    if (!ul) return;
    clear(ul);
    MENU.forEach(function (m) {
      ul.appendChild(el("li", null, el("a", { href: m.href }, m.label)));
    });
  }

  function renderFooter() {
    var mount = $("site-footer");
    if (!mount) return;
    mount.innerHTML =
      '<footer class="footer">' +
      '<div class="footer__in">' +
        '<div class="footer__brand">' +
          '<div class="footer__brand-row">' +
            '<span class="footer__seal"><svg viewBox="0 0 200 200" aria-hidden="true"><use href="#sealWhite"/></svg></span>' +
            '<div class="footer__brand-text"><span>' + esc(t("The International Association")) + '</span><span>' + esc(t("for Mongolic Linguistics")) + '</span></div>' +
          '</div>' +
          '<p>' + esc(t("The International Association for Mongolic Linguistics. Uniting scholars worldwide.")) + '</p>' +
        '</div>' +
        '<div class="footer__col"><h4>' + esc(t("Navigate")) + '</h4><ul id="footerNav"></ul></div>' +
        '<div class="footer__col"><h4>' + esc(t("Community")) + '</h4><ul id="footerCommunity">' +
          '<li><button class="footer__linkbtn" type="button" data-auth="register">' + esc(t("Sign up")) + '</button></li>' +
          '<li><button class="footer__linkbtn" type="button" data-auth="login">' + esc(t("Log in")) + '</button></li>' +
          '<li><a href="account.html">' + esc(t("My account")) + '</a></li>' +
        '</ul></div>' +
        '<div class="footer__col"><h4>' + esc(t("Contact")) + '</h4><ul>' +
          '<li><a href="mailto:info@iaml.org">info@iaml.org</a></li>' +
          '<li>' + esc(t("Ulaanbaatar, Mongolia")) + '</li>' +
        '</ul></div>' +
      '</div>' +
      '<div class="footer__bot"><span>' + esc(t("© 2026 IAML")) + '</span><span><a href="privacy.html">' + esc(t("Privacy")) + '</a> · <a href="terms.html">' + esc(t("Terms")) + '</a></span></div>' +
      '</footer>';
    renderFooterNav();
  }

  /* ═══ Modals: stack, focus trap, Esc, focus restore ═══ */
  var FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]';
  var modalStack = [];

  /* elements a Tab press can land on (visible, enabled, tabindex >= 0 — so the honeypot input is skipped) */
  function focusables(root) {
    return qsa(root, FOCUSABLE).filter(function (n) {
      return !n.disabled && n.type !== "hidden" && n.tabIndex >= 0 && n.getClientRects().length > 0 && !n.closest("[hidden]");
    });
  }

  /* opts: { onClose: fn, focus: element | selector | false } — focus goes to the dialog itself by default */
  function openModal(node, opts) {
    opts = opts || {};
    for (var i = 0; i < modalStack.length; i++) if (modalStack[i].el === node) return;
    modalStack.push({ el: node, opener: document.activeElement, onClose: opts.onClose || null });
    node.hidden = false;
    document.body.classList.add("modal-open");
    if (opts.focus !== false) {
      var dlg = node.querySelector('[role="dialog"]') || node;
      var target = typeof opts.focus === "string" ? dlg.querySelector(opts.focus) : opts.focus;
      focusEl(target || dlg);
    }
  }
  function closeModal(node) {
    for (var i = modalStack.length - 1; i >= 0; i--) {
      if (modalStack[i].el !== node) continue;
      var entry = modalStack.splice(i, 1)[0];
      node.hidden = true;
      if (!modalStack.length) document.body.classList.remove("modal-open");
      if (entry.onClose) { try { entry.onClose(); } catch (e) {} }
      var op = entry.opener;
      if (op && op !== document.body && document.contains(op)) focusEl(op);
      return;
    }
  }
  function closeModals() {
    while (modalStack.length) closeModal(modalStack[modalStack.length - 1].el);
  }
  function trapTab(e) {
    var top = modalStack[modalStack.length - 1];
    var dlg = top.el.querySelector('[role="dialog"]') || top.el;
    var items = focusables(dlg);
    if (!items.length) { e.preventDefault(); focusEl(dlg); return; }
    var first = items[0], last = items[items.length - 1], active = document.activeElement;
    if (!dlg.contains(active) || (e.shiftKey && (active === first || active === dlg))) {
      e.preventDefault(); focusEl(e.shiftKey ? last : first);
    } else if (!e.shiftKey && active === last) {
      e.preventDefault(); focusEl(first);
    }
  }

  /* ── Generic content modal (news/events/publications/static thread templates) ── */
  function injectContentModal() {
    if ($("contentModal")) return;
    var m = h(
      '<div class="cmodal" id="contentModal" hidden>' +
        '<div class="cmodal__backdrop" data-modal-close></div>' +
        '<div class="cmodal__dialog" role="dialog" aria-modal="true" tabindex="-1">' +
          '<button class="cmodal__close" type="button" data-modal-close aria-label="' + esc(t("Close")) + '">×</button>' +
          '<div class="cmodal__body" id="contentModalBody"></div>' +
        '</div>' +
      '</div>');
    document.body.appendChild(m);
  }

  /* content: an HTML string (trusted static markup only) or a DOM node / fragment (API data) */
  function openContentModal(content) {
    var node = $("contentModal"), body = $("contentModalBody");
    if (!node || !body) return;
    clear(body);
    if (typeof content === "string") {
      body.innerHTML = content;
      if (IAML0.i18n && IAML0.i18n.apply) IAML0.i18n.apply(body);   // static <template> content carries data-i18n markup
    } else if (content) body.appendChild(content);
    var dlg = node.querySelector(".cmodal__dialog");
    var heading = body.querySelector("h1, h2, h3");
    if (heading) {
      if (!heading.id) heading.id = "contentModalTitle";
      dlg.setAttribute("aria-labelledby", heading.id);
    } else {
      dlg.removeAttribute("aria-labelledby");
    }
    openModal(node);
    dlg.scrollTop = 0;
  }

  /* ═══ UI helpers: avatars, form errors, status lines ═══ */
  function avatarSrc(url) {
    if (typeof url !== "string" || !url) return null;
    var base = (window.IAML_CONFIG && window.IAML_CONFIG.apiBase) || "";
    if (/^\/uploads\/avatars\/[0-9a-f-]{36}\.webp$/i.test(url)) return base + url;
    return null;
  }
  function initialsOf(p) {
    if (!p || p.id === null) return "•";
    var f = String(p.first_name || "").trim(), l = String(p.last_name || "").trim();
    if (f || l) return ((f.charAt(0) || "") + (l.charAt(0) || "")).toUpperCase();
    var fmt = window.IAML && window.IAML.fmt;
    return fmt ? fmt.initials(p.name || p.email || "") : "•";
  }
  /* size: "xs" | "sm" | "lg" — image when the person has one, initials otherwise */
  function avatar(p, size) {
    var span = el("span", { "class": "avatar avatar--" + (size || "sm"), "aria-hidden": "true" });
    var src = p && avatarSrc(p.avatar_url);
    if (src) span.appendChild(el("img", { src: src, alt: "", loading: "lazy" }));
    else span.textContent = initialsOf(p);
    return span;
  }

  /* ═══ Server messages ═══
     The API answers in English (docs/API.md). tServer() translates the messages it knows — the exact texts of
     backend/src (errors.js, lib/validate.js, routes/**) and the parameterised ones — and leaves any other text as it is.
     Every text is a literal passed to t(), so the dictionary tooling sees it. */
  function serverExact(msg) {
    switch (msg) {
      /* generic */
      case "Please check the highlighted fields.": return t("Please check the highlighted fields.");
      case "Please log in.": return t("Please log in.");
      case "You do not have access to this.": return t("You do not have access to this.");
      case "Not found.": return t("Not found.");
      case "Page not found.": return t("Page not found.");
      case "Thread not found.": return t("Thread not found.");
      case "That post no longer exists.": return t("That post no longer exists.");
      case "Too many requests. Please try again later.": return t("Too many requests. Please try again later.");
      case "The server is busy. Please try again in a moment.": return t("The server is busy. Please try again in a moment.");
      case "Something went wrong on our side. Please try again.": return t("Something went wrong on our side. Please try again.");
      case "Network error — please check your connection.": return t("Network error — please check your connection.");
      case "The request body is not valid JSON.": return t("The request body is not valid JSON.");
      case "The request body is invalid.": return t("The request body is invalid.");
      case "The request is too large.": return t("The request is too large.");
      case "The upload is too large.": return t("The upload is too large.");
      case "Unsupported content type.": return t("Unsupported content type.");
      case "Bad request.": return t("Bad request.");
      case "Missing X-Requested-With header.": return t("Missing X-Requested-With header.");
      case "Cross-origin request blocked.": return t("Cross-origin request blocked.");
      case "Cross-site request blocked.": return t("Cross-site request blocked.");
      case "That value is already in use.": return t("That value is already in use.");
      case "This item is still in use and cannot be deleted.": return t("This item is still in use and cannot be deleted.");
      case "A value is too long.": return t("A value is too long.");
      case "A value has an invalid format.": return t("A value has an invalid format.");
      case "A JSON object is required.": return t("A JSON object is required.");
      case "Nothing to update.": return t("Nothing to update.");
      /* accounts */
      case "Please confirm your e-mail first.": return t("Please confirm your e-mail first.");
      case "Please confirm your e-mail first — we sent you a new code.": return t("Please confirm your e-mail first — we sent you a new code.");
      case "That code is not correct or has expired. Please request a new one.": return t("That code is not correct or has expired. Please request a new one.");
      case "E-mail or password is not correct.": return t("E-mail or password is not correct.");
      case "This account has been disabled.": return t("This account has been disabled.");
      case "The service is busy right now. Please try again later.": return t("The service is busy right now. Please try again later.");
      case "Too many wrong codes. Please wait 15 minutes or request a new code.": return t("Too many wrong codes. Please wait 15 minutes or request a new code.");
      case "Too many failed log-in attempts. Please try again in 15 minutes.": return t("Too many failed log-in attempts. Please try again in 15 minutes.");
      case "Too many failed log-in attempts. Please try again in a minute.": return t("Too many failed log-in attempts. Please try again in a minute.");
      case "Please upload a JPEG, PNG or WebP image.": return t("Please upload a JPEG, PNG or WebP image.");
      case "That file could not be read as an image.": return t("That file could not be read as an image.");
      case "You are the only administrator. Promote someone else before deleting this account.": return t("You are the only administrator. Promote someone else before deleting this account.");
      case "You have sent several messages recently. Please try again later.": return t("You have sent several messages recently. Please try again later.");
      case "The comment you are replying to no longer exists.": return t("The comment you are replying to no longer exists.");
      /* field messages (read after the field name: "Password is too common …") */
      case "is required": return t("is required");
      case "contains invalid characters": return t("contains invalid characters");
      case "must be a single line": return t("must be a single line");
      case "must be text": return t("must be text");
      case "must be a valid e-mail address": return t("must be a valid e-mail address");
      case "must be an e-mail address": return t("must be an e-mail address");
      case "may contain only letters, spaces, hyphens, apostrophes and dots": return t("may contain only letters, spaces, hyphens, apostrophes and dots");
      case "must be a whole number": return t("must be a whole number");
      case "must be true or false": return t("must be true or false");
      case "is already in use": return t("is already in use");
      case "is not correct": return t("is not correct");
      case "is too common — please choose another one": return t("is too common — please choose another one");
      case "must not be your e-mail address": return t("must not be your e-mail address");
      case "refers to something that does not exist": return t("refers to something that does not exist");
      case "is outside the allowed range or format": return t("is outside the allowed range or format");
    }
    return null;
  }
  var SERVER_PATTERNS = [
    [/^must be at least (\d+) characters$/, function (m) { return t("must be at least {n} characters", { n: m[1] }); }],
    [/^must be at most (\d+) characters$/, function (m) { return t("must be at most {n} characters", { n: m[1] }); }],
    [/^must be between (-?\d+) and (-?\d+)$/, function (m) { return t("must be between {min} and {max}", { min: m[1], max: m[2] }); }],
    [/^Replies can be nested at most (\d+) levels deep\.$/, function (m) { return t("Replies can be nested at most {n} levels deep.", { n: m[1] }); }],
    [/^You are posting too fast — at most (\d+) new questions per hour\. Please try again later\.$/, function (m) { return t("You are posting too fast — at most {n} new questions per hour. Please try again later.", { n: m[1] }); }],
    [/^You are posting too fast — at most (\d+) comments per hour\. Please try again later\.$/, function (m) { return t("You are posting too fast — at most {n} comments per hour. Please try again later.", { n: m[1] }); }],
    [/^HTTP (\d{3})$/, function (m) { return t("HTTP {status}", { status: m[1] }); }]
  ];
  function tServer(message) {
    var msg = String(message == null ? "" : message);
    if (!msg || LANG === "en") return msg;
    var exact = serverExact(msg);
    if (exact !== null) return exact;
    for (var i = 0; i < SERVER_PATTERNS.length; i++) {
      var m = SERVER_PATTERNS[i][0].exec(msg);
      if (m) return SERVER_PATTERNS[i][1](m);
    }
    return IAML0.i18n && IAML0.i18n.has(msg) ? t(msg) : msg;   // a message nobody foresaw: translated only if the dictionary has it
  }

  /* The small "EN" tag for texts that are not translated yet: the UI is Mongolian and the API delivered the English text
     (items carry lang "mn" | "en" — docs/I18N.md §3). A fresh node every call (a node can only live in one place). */
  function langBadge(item) {
    if (LANG !== "mn" || !item || item.lang !== "en") return null;
    var msg = t("This text is not translated yet");
    return el("span", { "class": "lang-badge", role: "img", "aria-label": msg, title: msg }, "EN");
  }

  var errSeq = 0;
  /* the label text without its control and without badges ("Place of work" of <label>Place of work <span class=badge>admin-only</span><input></label>) */
  function labelText(lab) {
    var copy = lab.cloneNode(true);
    qsa(copy, "input, select, textarea, button, .profile-form__badge").forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
    return copy.textContent;
  }
  function fieldLabel(form, ctrl) {
    var text = ctrl.getAttribute("aria-label");
    if (!text && ctrl.id) {
      var lab = form.querySelector('label[for="' + ctrl.id + '"]');
      if (lab) text = labelText(lab);
    }
    if (!text) {
      var wrap = ctrl.closest("label");
      if (wrap) text = labelText(wrap);
    }
    return String(text || ctrl.name || t("This field")).replace(/\s+/g, " ").trim();
  }
  function humanize(name) {
    var s = String(name || "").replace(/[_-]+/g, " ").trim();
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : t("This field");
  }
  /* Server field messages read "is required", "must be at most 80 characters" … → put the field name in front; complete sentences stand alone */
  function composeMessage(label, msg) {
    msg = String(msg == null ? "" : msg).trim();
    if (!msg) return t("{field} is invalid", { field: label });
    var text = tServer(msg);
    return /^(is|are|must|may|contains|needs|should|cannot)\b/i.test(msg) ? t("{field} {message}", { field: label, message: text }) : text;
  }
  function errorHost(ctrl) {
    var wrap = ctrl.closest(".field") || ctrl.closest("label") || ctrl;
    var parent = wrap.parentNode;
    if (parent && parent.classList && parent.classList.contains("auth__row")) wrap = parent;
    return wrap;
  }
  function clearErrors(form) {
    qsa(form, "[data-err-for]").forEach(function (p) { if (p.parentNode) p.parentNode.removeChild(p); });
    qsa(form, "[aria-invalid]").forEach(function (c) {
      c.removeAttribute("aria-invalid");
      var orig = c.getAttribute("data-desc");
      if (orig) c.setAttribute("aria-describedby", orig); else c.removeAttribute("aria-describedby");
      c.removeAttribute("data-desc");
    });
  }
  function fieldError(form, ctrl, message) {
    var key = ctrl.name || ctrl.id || "field";
    var p = form.querySelector('[data-err-for="' + key + '"]');
    if (!p) {
      p = el("p", { "class": "field-err", id: (ctrl.id || "f" + (++errSeq)) + "-err", "data-err-for": key });
      var host = errorHost(ctrl);
      host.parentNode.insertBefore(p, host.nextSibling);
    }
    p.textContent = message;
    if (!ctrl.hasAttribute("data-desc")) ctrl.setAttribute("data-desc", ctrl.getAttribute("aria-describedby") || "");
    ctrl.setAttribute("aria-invalid", "true");
    ctrl.setAttribute("aria-describedby", (ctrl.getAttribute("data-desc") + " " + p.id).trim());
  }
  function setStatus(node, text, kind) {
    if (!node) return;
    node.textContent = text || "";
    node.classList.remove("is-ok", "is-error");
    if (kind) node.classList.add(kind === "error" ? "is-error" : "is-ok");
  }
  function busy(btn, on) {
    if (!btn) return;
    btn.disabled = !!on;
    if (on) btn.setAttribute("aria-busy", "true"); else btn.removeAttribute("aria-busy");
  }
  /* Map ApiError.fields onto the matching inputs; everything else goes to the status line. Returns the message. */
  function applyErrors(form, err, opts) {
    opts = opts || {};
    clearErrors(form);
    var statusEl = opts.status || form.querySelector("[data-status], [data-auth-msg], [data-form-msg], .cform__msg, .auth__msg");
    var first = null, extra = [];
    var fields = err && err.fields;
    if (fields) {
      Object.keys(fields).forEach(function (name) {
        var ctrl = form.querySelector('[name="' + name + '"]');
        var msg = composeMessage(ctrl ? fieldLabel(form, ctrl) : humanize(name), fields[name]);
        if (ctrl && ctrl.type !== "hidden" && !ctrl.closest(".hp")) {
          fieldError(form, ctrl, msg);
          if (!first) first = ctrl;
        } else {
          extra.push(msg);
        }
      });
    }
    var text = extra.length ? extra.join(" ") : (err && err.message ? tServer(err.message) : t("Something went wrong. Please try again."));
    if (statusEl) setStatus(statusEl, text, "error");
    if (first) focusEl(first);
    return text;
  }
  function errorText(err) {
    return isApiError(err) ? tServer(err.message) : t("Something went wrong. Please try again.");
  }

  /* ── Toasts (polite live region) ── */
  function toast(message, kind) {
    var host = $("toastHost");
    if (!host) {
      host = el("div", { "class": "toasts", id: "toastHost", role: "status", "aria-live": "polite" });
      document.body.appendChild(host);
    }
    var note = el("div", { "class": "toast" + (kind === "error" ? " toast--error" : "") }, message);
    host.appendChild(note);
    window.setTimeout(function () { if (note.parentNode) note.parentNode.removeChild(note); }, kind === "error" ? 7000 : 4500);
  }

  /* ═══ Small dialogs (confirm / report / password prompt) built on the modal stack ═══ */
  var dlgSeq = 0;
  function pwToggle() {
    return el("button", { "class": "pw__toggle", type: "button", "data-pw-toggle": "", "aria-label": t("Show password"), "aria-pressed": "false" }, t("Show"));
  }
  /* cfg: { title, intro, fields: [{ name, label, type, required, maxlength, rows, autocomplete, help, placeholder }],
            submitLabel, cancelLabel, danger, onSubmit(values) → Promise (reject with ApiError to show it inline) }
     Resolves with the onSubmit result (or the values) — or null when cancelled. */
  function dialogForm(cfg) {
    cfg = cfg || {};
    return new Promise(function (resolve) {
      var uid = "dlg" + (++dlgSeq);
      var form = el("form", { "class": "dlg__form", novalidate: "" });
      var status = el("p", { "class": "cform__msg", "aria-live": "polite" });
      var controls = [];
      (cfg.fields || []).forEach(function (f) {
        var id = uid + "-" + f.name;
        var control = f.type === "textarea"
          ? el("textarea", { id: id, name: f.name, rows: f.rows || 4, maxlength: f.maxlength, placeholder: f.placeholder })
          : el("input", { id: id, name: f.name, type: f.type || "text", maxlength: f.maxlength, autocomplete: f.autocomplete || "off" });
        control.required = !!f.required;
        controls.push(control);
        form.appendChild(el("div", { "class": "field" },
          el("label", { "for": id }, f.label),
          f.type === "password" ? el("div", { "class": "pw" }, control, pwToggle()) : control,
          f.help ? el("p", { "class": "field-hint" }, f.help) : null));
      });
      var cancel = el("button", { type: "button", "class": "btn btn--o btn--sm" }, cfg.cancelLabel || t("Cancel"));
      var submit = el("button", { type: "submit", "class": "btn btn--sm " + (cfg.danger ? "btn--red" : "btn--p") }, cfg.submitLabel || t("OK"));
      form.appendChild(el("div", { "class": "dlg__actions" }, submit, cancel));
      form.appendChild(status);

      var dialog = el("div", { "class": "cmodal__dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": uid + "-t", tabindex: "-1" },
        el("button", { "class": "cmodal__close", type: "button", "data-modal-close": "", "aria-label": t("Close") }, "×"),
        el("h2", { id: uid + "-t", "class": "dlg__title" }, cfg.title || ""),
        cfg.intro ? el("p", { "class": "dlg__intro", id: uid + "-d" }, cfg.intro) : null,
        form);
      if (cfg.intro) dialog.setAttribute("aria-describedby", uid + "-d");
      var root = el("div", { "class": "cmodal cmodal--sm", hidden: "" },
        el("div", { "class": "cmodal__backdrop", "data-modal-close": "" }), dialog);
      document.body.appendChild(root);

      var done = false;
      function finish(value) { if (!done) { done = true; resolve(value); } }
      openModal(root, {
        focus: controls[0] || (cfg.danger ? cancel : submit),
        onClose: function () { if (root.parentNode) root.parentNode.removeChild(root); finish(null); }
      });

      cancel.addEventListener("click", function () { closeModal(root); });
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        clearErrors(form);
        setStatus(status, "");
        var values = {}, missing = null;
        controls.forEach(function (c) {
          values[c.name] = c.type === "password" ? c.value : c.value.trim();
          if (c.required && !values[c.name] && !missing) missing = c;
        });
        if (missing) {
          fieldError(form, missing, t("{field} is required", { field: fieldLabel(form, missing) }));
          focusEl(missing);
          return;
        }
        busy(submit, true); busy(cancel, true);
        var pending = cfg.onSubmit ? Promise.resolve().then(function () { return cfg.onSubmit(values); }) : Promise.resolve(values);
        pending.then(function (result) {
          finish(result === undefined || result === null ? values : result);
          closeModal(root);
        }, function (err) {
          busy(submit, false); busy(cancel, false);
          applyErrors(form, err, { status: status });
        });
      });
    });
  }
  /* Resolves true when confirmed. cfg.onSubmit (optional) runs the action inside the dialog. */
  function dialogConfirm(cfg) {
    cfg = cfg || {};
    return dialogForm({
      title: cfg.title, intro: cfg.intro, fields: [], danger: cfg.danger,
      submitLabel: cfg.submitLabel || t("Confirm"), cancelLabel: cfg.cancelLabel,
      onSubmit: cfg.onSubmit ? function () { return Promise.resolve(cfg.onSubmit()).then(function () { return true; }); } : function () { return true; }
    }).then(function (r) { return !!r; });
  }

  /* ── Auth modal hook (the modal itself lives in auth.js) ── */
  function openAuth(tab) {
    var auth = window.IAML && window.IAML.auth;
    if (auth && auth.open) auth.open(tab);
  }

  /* ── Global interactions ── */
  function closeMobileMenu(refocus) {
    var links = $("navLinks"), burger = $("burger");
    if (!links || !links.classList.contains("open")) return false;
    links.classList.remove("open");
    if (burger) { burger.setAttribute("aria-expanded", "false"); if (refocus) focusEl(burger); }
    return true;
  }

  function wireGlobal() {
    document.addEventListener("click", function (e) {
      var langT = e.target.closest("[data-lang]");
      if (langT) {
        e.preventDefault();
        var want = langT.getAttribute("data-lang");
        if (want !== LANG && IAML0.i18n && IAML0.i18n.setLang) IAML0.i18n.setLang(want);
        return;
      }
      var authT = e.target.closest("[data-auth]");
      if (authT) { e.preventDefault(); openAuth(authT.getAttribute("data-auth")); return; }
      var closeT = e.target.closest("[data-modal-close]");
      if (closeT) {
        e.preventDefault();
        var m = closeT.closest(".auth, .cmodal");
        if (m) closeModal(m);
        return;
      }
      var pw = e.target.closest("[data-pw-toggle]");
      if (pw) {
        var input = pw.parentNode.querySelector("input");
        if (input) {
          var show = input.type === "password";
          input.type = show ? "text" : "password";
          pw.textContent = show ? t("Hide") : t("Show");
          pw.setAttribute("aria-label", show ? t("Hide password") : t("Show password"));
          pw.setAttribute("aria-pressed", show ? "true" : "false");
        }
        return;
      }
      var burger = e.target.closest("#burger");
      if (burger) {
        var links = $("navLinks");
        var open = links.classList.toggle("open");
        burger.setAttribute("aria-expanded", open ? "true" : "false");
        return;
      }
      // close mobile menu when a nav link is tapped
      if (e.target.closest("#navLinks a")) closeMobileMenu(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        if (modalStack.length) { e.preventDefault(); closeModal(modalStack[modalStack.length - 1].el); return; }
        if (closeMobileMenu(true)) return;
      }
      if (e.key === "Tab" && modalStack.length) trapTab(e);
    });
  }

  function initReveal() {
    var els = document.querySelectorAll(".reveal, .obj-tiles, .act-tiles");
    if (prefersReduced || !("IntersectionObserver" in window)) {
      els.forEach(function (n) { n.classList.add("visible"); }); return;
    }
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("visible"); obs.unobserve(en.target); } });
    }, { threshold: 0.12 });
    els.forEach(function (n) { obs.observe(n); });
  }

  /* ── Coin spin: build the milled gold edge (64 facets) between the two faces ── */
  function initCoins() {
    document.querySelectorAll(".coin__body").forEach(function (body) {
      var wall = document.createElement("span");
      wall.className = "coin__wall";
      for (var k = 0; k < 64; k++) {
        var seg = document.createElement("span");
        seg.className = "coin__seg";
        seg.style.setProperty("--k", k);
        wall.appendChild(seg);
      }
      body.insertBefore(wall, body.querySelector(".coin__face--back"));
      // save battery: spin only while the coin is on screen
      if ("IntersectionObserver" in window) {
        var shadow = body.parentNode.querySelector(".coin__shadow");
        new IntersectionObserver(function (entries) {
          var st = entries[0].isIntersecting ? "running" : "paused";
          body.style.animationPlayState = st;
          if (shadow) shadow.style.animationPlayState = st;
        }).observe(body);
      }
    });
  }

  /* Expose helpers for page modules (merge: api.js has already put IAML.api / IAML.fmt there) */
  window.IAML = Object.assign(window.IAML || {}, {
    esc: esc,
    el: el,
    qsa: qsa,
    clear: clear,
    ready: ready,
    paragraphs: paragraphs,
    safeUrl: safeUrl,
    isApiError: isApiError,
    errorText: errorText,
    tServer: tServer,
    langBadge: langBadge,
    live: live,
    whenUser: whenUser,
    openContentModal: openContentModal,
    closeModals: closeModals,
    openAuth: openAuth,
    toast: toast,
    fitNav: fitNav,
    modal: { open: openModal, close: closeModal, closeAll: closeModals, focusables: focusables },
    dialog: { form: dialogForm, confirm: dialogConfirm },
    ui: {
      avatar: avatar,
      initials: initialsOf,
      applyErrors: applyErrors,
      clearErrors: clearErrors,
      fieldError: fieldError,
      fieldLabel: fieldLabel,
      setStatus: setStatus,
      busy: busy,
      focus: focusEl,
      pwToggle: pwToggle
    },
    menu: MENU
  });

  function init() {
    try {
      var cached = readMenuCache();
      if (cached) { MENU.length = 0; cached.forEach(function (it) { MENU.push(it); }); menuFromCache = true; }
    } catch (e) {}
    try { injectDefs(); } catch (e) {}
    try { renderHeader(); } catch (e) {}
    try { renderFooter(); } catch (e) {}
    try { injectContentModal(); } catch (e) {}
    try { wireGlobal(); } catch (e) {}
    try { initReveal(); } catch (e) {}
    try { initCoins(); } catch (e) {}
    try { refreshMenu(); } catch (e) {}
    try {
      window.addEventListener("resize", fitNavSoon);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitNav);
    } catch (e) {}
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
