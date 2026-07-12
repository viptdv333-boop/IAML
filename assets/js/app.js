/* ═══════════════════════════════════════════════════
   IAML — shared site chrome + interactions
   Injects: SVG logo defs, top nav (from MENU), footer,
   auth modal, content modal. Wires: burger, active link,
   reveal-on-scroll, modals, auth flow (gated until backend).

   MENU is a static config now; in Phase B it will be
   fetched from Supabase (backend-managed menu) with the
   same shape, so pages don't change.
   ═══════════════════════════════════════════════════ */
(function () {
  "use strict";

  /* ── Backend-managed menu (Phase B: fetched from DB) ── */
  var MENU = [
    { key: "about",        label: "About",        href: "index.html" },
    { key: "news",         label: "News",         href: "news.html" },
    { key: "events",       label: "Events",       href: "events.html" },
    { key: "publications", label: "Publications", href: "publications.html" },
    { key: "participants", label: "Participants", href: "participants.html" },
    { key: "mongolist",    label: "Mongolist",    href: "mongolist.html" },
    { key: "discuss",      label: "Discuss",      href: "discuss.html" },
    { key: "contacts",     label: "Contacts",     href: "contacts.html" }
  ];

  var prefersReduced = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var LOGO_PATH = "M 62,4 L 64,6 L 66,9 L 68,12 L 69,15 L 71,18 L 73,21 L 74,24 L 76,27 L 77,30 L 78,33 L 78,36 L 79,39 L 78,42 L 78,45 L 77,48 L 74,51 L 71,52 L 68,53 L 65,53 L 62,53 L 59,53 L 58,56 L 58,59 L 58,62 L 58,65 L 58,68 L 58,71 L 58,74 L 58,77 L 58,80 L 58,83 L 58,86 L 58,89 L 58,92 L 58,95 L 58,98 L 58,101 L 58,104 L 58,107 L 58,110 L 58,113 L 58,116 L 58,119 L 58,122 L 58,125 L 58,128 L 58,131 L 58,134 L 58,137 L 58,140 L 58,143 L 58,146 L 58,149 L 58,152 L 58,155 L 58,158 L 58,161 L 58,164 L 58,167 L 58,170 L 58,173 L 58,176 L 58,179 L 58,182 L 60,184 L 63,183 L 66,182 L 69,181 L 72,181 L 75,180 L 78,179 L 81,178 L 83,180 L 84,183 L 84,186 L 84,189 L 84,192 L 84,195 L 84,198 L 85,201 L 85,204 L 87,207 L 90,210 L 93,211 L 92,214 L 89,216 L 86,216 L 83,216 L 80,214 L 77,211 L 75,208 L 75,205 L 74,202 L 74,199 L 73,196 L 73,193 L 73,190 L 72,188 L 69,188 L 66,189 L 63,189 L 60,190 L 58,192 L 58,195 L 58,198 L 58,201 L 58,204 L 58,207 L 58,210 L 58,213 L 58,216 L 58,219 L 57,222 L 57,225 L 57,228 L 57,231 L 57,234 L 57,237 L 57,240 L 54,240 L 51,240 L 48,240 L 45,240 L 42,242 L 39,244 L 36,246 L 33,249 L 30,251 L 28,254 L 26,257 L 29,258 L 32,258 L 35,258 L 38,258 L 41,258 L 44,258 L 47,258 L 50,259 L 53,260 L 56,261 L 59,262 L 62,263 L 65,265 L 68,267 L 71,269 L 74,271 L 77,274 L 78,271 L 78,268 L 78,265 L 78,262 L 78,259 L 79,256 L 79,253 L 80,250 L 81,247 L 82,244 L 84,241 L 87,238 L 90,237 L 93,235 L 96,234 L 99,234 L 102,233 L 102,236 L 99,239 L 96,242 L 95,245 L 94,248 L 94,251 L 93,254 L 93,257 L 92,260 L 92,263 L 92,266 L 92,269 L 92,272 L 92,275 L 92,278 L 92,281 L 92,284 L 92,287 L 91,290 L 90,293 L 88,295 L 85,294 L 82,292 L 79,289 L 76,287 L 73,284 L 70,281 L 67,279 L 64,277 L 61,275 L 58,273 L 55,271 L 52,270 L 49,269 L 46,269 L 43,269 L 40,269 L 37,269 L 34,269 L 31,269 L 28,270 L 25,270 L 22,271 L 19,272 L 16,273 L 13,274 L 10,275 L 10,272 L 11,269 L 12,266 L 13,263 L 14,260 L 15,257 L 17,254 L 19,251 L 21,248 L 23,245 L 25,242 L 28,239 L 31,237 L 34,234 L 37,232 L 40,231 L 43,230 L 43,227 L 43,224 L 43,221 L 43,218 L 44,215 L 44,212 L 44,209 L 44,206 L 44,203 L 44,200 L 41,199 L 38,198 L 35,197 L 32,197 L 29,196 L 26,195 L 23,194 L 20,193 L 19,190 L 19,187 L 22,186 L 25,184 L 28,182 L 31,181 L 34,180 L 37,179 L 40,178 L 43,177 L 44,174 L 44,171 L 44,168 L 44,165 L 44,162 L 44,159 L 42,157 L 39,156 L 36,155 L 33,155 L 30,154 L 27,153 L 24,153 L 21,152 L 19,149 L 19,146 L 21,144 L 24,142 L 27,141 L 30,139 L 33,138 L 36,137 L 39,136 L 42,136 L 44,133 L 44,130 L 44,127 L 44,124 L 44,121 L 44,118 L 44,115 L 44,112 L 44,109 L 44,106 L 44,103 L 44,100 L 44,97 L 44,94 L 44,91 L 44,88 L 42,87 L 40,90 L 38,93 L 35,96 L 33,99 L 30,102 L 28,105 L 26,107 L 24,110 L 22,113 L 19,115 L 16,114 L 13,112 L 10,111 L 7,110 L 4,109 L 2,106 L 4,103 L 7,102 L 10,99 L 13,97 L 16,95 L 19,93 L 22,91 L 25,89 L 28,87 L 31,84 L 34,83 L 37,80 L 40,78 L 43,76 L 44,73 L 44,70 L 44,67 L 44,64 L 44,61 L 43,58 L 40,58 L 37,57 L 34,56 L 31,56 L 28,55 L 25,54 L 22,53 L 20,52 L 19,49 L 20,46 L 23,44 L 26,43 L 29,42 L 32,40 L 35,39 L 38,38 L 41,38 L 44,37 L 47,37 L 50,37 L 53,37 L 56,37 L 59,37 L 62,36 L 65,34 L 66,31 L 66,28 L 65,25 L 65,22 L 64,19 L 63,16 L 61,13 L 60,10 L 60,7 Z";

  function h(html) { var t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* Small reusable IAML brand lockup (mark + IAML letters) */
  function brandLockup(cls) {
    return '' +
      '<span class="brand-mark">' +
        '<svg class="brand-mark__m" viewBox="0 0 105 300" aria-hidden="true"><use href="#mongolM"/></svg>' +
        '<span class="brand-mark__bar"></span>' +
        '<span class="brand-mark__letters"><span class="brand-mark__dot"></span><span>I</span><span>A</span><span>M</span><span>L</span></span>' +
      '</span>';
  }

  /* ── Inject shared SVG defs (logo symbol) once ── */
  function injectDefs() {
    if (document.getElementById("iaml-defs")) return;
    var svg = h('<svg id="iaml-defs" xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true">' +
      '<defs><symbol id="mongolM" viewBox="0 0 105 300"><path d="' + LOGO_PATH + '"/></symbol></defs></svg>');
    document.body.insertBefore(svg, document.body.firstChild);
  }

  /* ── Render top nav ── */
  function renderHeader() {
    var mount = document.getElementById("site-header");
    if (!mount) return;
    var active = document.body.getAttribute("data-page") || "";
    var links = MENU.map(function (m) {
      var is = m.key === active ? " is-active" : "";
      var cur = m.key === active ? ' aria-current="page"' : "";
      return '<a href="' + m.href + '" class="nav__link' + is + '"' + cur + '>' + esc(m.label) + '</a>';
    }).join("");

    mount.innerHTML =
      '<nav class="nav"><div class="nav__in">' +
        '<a href="index.html" class="nav__brand" aria-label="IAML — home">' +
          brandLockup() +
          '<span class="nav__brand-sep"></span>' +
          '<span class="nav__brand-text"><span>The International Association</span><span>for Mongolic Linguistics</span></span>' +
        '</a>' +
        '<div class="nav__links" id="navLinks">' + links + '</div>' +
        '<div class="nav__ctrls">' +
          '<button class="nav__btn" type="button" data-auth="login">Log in</button>' +
          '<button class="nav__link nav__link--cta" type="button" data-auth="register">Sign up</button>' +
          '<button class="burger" id="burger" aria-label="Menu" aria-expanded="false"><span></span><span></span><span></span></button>' +
        '</div>' +
      '</div></nav>';
  }

  /* ── Render footer ── */
  function renderFooter() {
    var mount = document.getElementById("site-footer");
    if (!mount) return;
    var navCol = MENU.map(function (m) {
      return '<li><a href="' + m.href + '">' + esc(m.label) + '</a></li>';
    }).join("");
    mount.innerHTML =
      '<footer class="footer">' +
      '<div class="footer__in">' +
        '<div class="footer__brand">' +
          '<div class="footer__brand-row">' +
            '<span class="footer__mark"><svg viewBox="0 0 105 300" aria-hidden="true"><use href="#mongolM"/></svg>' +
            '<span class="footer__mark-bar"></span>' +
            '<span class="footer__mark-letters"><span class="footer__mark-dot"></span><span>I</span><span>A</span><span>M</span><span>L</span></span></span>' +
            '<div class="footer__brand-text"><span>The International Association</span><span>for Mongolic Linguistics</span></div>' +
          '</div>' +
          '<p>The International Association for Mongolic Linguistics. Uniting scholars worldwide.</p>' +
        '</div>' +
        '<div class="footer__col"><h4>Navigate</h4><ul>' + navCol + '</ul></div>' +
        '<div class="footer__col"><h4>Community</h4><ul>' +
          '<li><button class="footer__linkbtn" type="button" data-auth="register">Sign up</button></li>' +
          '<li><button class="footer__linkbtn" type="button" data-auth="login">Log in</button></li>' +
          '<li><a href="account.html">My account</a></li>' +
        '</ul></div>' +
        '<div class="footer__col"><h4>Contact</h4><ul>' +
          '<li><a href="mailto:info@iaml.org">info@iaml.org</a></li>' +
          '<li>Ulaanbaatar, Mongolia</li>' +
        '</ul></div>' +
      '</div>' +
      '<div class="footer__bot"><span>© 2026 IAML</span><span><a href="privacy.html">Privacy</a> · <a href="terms.html">Terms</a></span></div>' +
      '</footer>';
  }

  /* ── Auth modal (login / register / verify-code) ── */
  function injectAuthModal() {
    if (document.getElementById("authModal")) return;
    var m = h(
      '<div class="auth" id="authModal" hidden>' +
        '<div class="auth__backdrop" data-modal-close></div>' +
        '<div class="auth__dialog" role="dialog" aria-modal="true" aria-labelledby="authHeading">' +
          '<button class="auth__close" type="button" data-modal-close aria-label="Close">×</button>' +
          '<div class="auth__tabs">' +
            '<button class="auth__tab is-active" type="button" data-auth-tab="login">Log in</button>' +
            '<button class="auth__tab" type="button" data-auth-tab="register">Sign up</button>' +
          '</div>' +
          '<form class="auth__form is-active" id="authLogin" novalidate>' +
            '<h3 id="authHeading">Welcome back</h3>' +
            '<label>Email<input type="email" name="email" autocomplete="email" required/></label>' +
            '<label>Password<input type="password" name="password" autocomplete="current-password" required/></label>' +
            '<button class="btn btn--p" type="submit">Log in</button>' +
            '<p class="auth__msg" data-auth-msg></p>' +
          '</form>' +
          '<form class="auth__form" id="authRegister" novalidate>' +
            '<h3>Create your account</h3>' +
            '<div class="auth__row">' +
              '<label>First name<input type="text" name="first_name" autocomplete="given-name" required/></label>' +
              '<label>Last name<input type="text" name="last_name" autocomplete="family-name" required/></label>' +
            '</div>' +
            '<label>Place of work<input type="text" name="workplace" placeholder="University / institution" required/></label>' +
            '<label>Email<input type="email" name="email" autocomplete="email" required/></label>' +
            '<label>Password<input type="password" name="password" autocomplete="new-password" minlength="8" required/></label>' +
            '<p class="auth__fineprint">Your name and avatar are shown publicly in Discuss. Place of work is visible only to admins. See our <a href="privacy.html">Privacy Policy</a>.</p>' +
            '<button class="btn btn--p" type="submit">Create account</button>' +
            '<p class="auth__msg" data-auth-msg></p>' +
          '</form>' +
          '<form class="auth__form" id="authVerify" novalidate>' +
            '<h3>Confirm your email</h3>' +
            '<p class="auth__fineprint">We sent a 6-digit code to your email. Enter it below to activate your account.</p>' +
            '<label>Confirmation code<input type="text" name="code" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="one-time-code" required/></label>' +
            '<button class="btn btn--p" type="submit">Confirm</button>' +
            '<p class="auth__msg" data-auth-msg></p>' +
          '</form>' +
        '</div>' +
      '</div>');
    document.body.appendChild(m);
  }

  /* ── Generic content modal (news/events/publications/thread) ── */
  function injectContentModal() {
    if (document.getElementById("contentModal")) return;
    var m = h(
      '<div class="cmodal" id="contentModal" hidden>' +
        '<div class="cmodal__backdrop" data-modal-close></div>' +
        '<div class="cmodal__dialog" role="dialog" aria-modal="true">' +
          '<button class="cmodal__close" type="button" data-modal-close aria-label="Close">×</button>' +
          '<div class="cmodal__body" id="contentModalBody"></div>' +
        '</div>' +
      '</div>');
    document.body.appendChild(m);
  }

  var lastFocus = null;
  function openModal(el, prep) {
    lastFocus = document.activeElement;
    if (prep) prep();
    el.hidden = false;
    document.body.classList.add("modal-open");
  }
  function closeModals() {
    ["authModal", "contentModal"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && !el.hidden) el.hidden = true;
    });
    document.body.classList.remove("modal-open");
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
  }

  function openContentModal(html) {
    var el = document.getElementById("contentModal");
    var body = document.getElementById("contentModalBody");
    if (!el || !body) return;
    body.innerHTML = html;
    openModal(el);
    el.querySelector(".cmodal__dialog").scrollTop = 0;
  }

  /* ── Auth modal controls ── */
  function setAuthTab(name) {
    var modal = document.getElementById("authModal");
    modal.querySelectorAll("[data-auth-tab]").forEach(function (t) {
      t.classList.toggle("is-active", t.getAttribute("data-auth-tab") === name);
    });
    modal.querySelectorAll(".auth__form").forEach(function (f) { f.classList.remove("is-active"); });
    var id = name === "register" ? "authRegister" : name === "verify" ? "authVerify" : "authLogin";
    var form = document.getElementById(id);
    if (form) { form.classList.add("is-active"); var i = form.querySelector("input"); if (i) { try { i.focus(); } catch (e) {} } }
    // hide tab bar on the verify step
    modal.querySelector(".auth__tabs").style.display = (name === "verify") ? "none" : "";
  }
  function openAuth(tab) {
    var modal = document.getElementById("authModal");
    modal.querySelectorAll("[data-auth-msg]").forEach(function (m) { m.textContent = ""; m.className = "auth__msg"; });
    openModal(modal, function () { setAuthTab(tab || "login"); });
  }

  function gatedMessage(form) {
    var msg = form.querySelector("[data-auth-msg]");
    if (msg) { msg.textContent = "Accounts are opening soon — the member system is being connected."; msg.className = "auth__msg is-error"; }
  }

  function wireAuth() {
    var reg = document.getElementById("authRegister");
    var login = document.getElementById("authLogin");
    var verify = document.getElementById("authVerify");
    if (login) login.addEventListener("submit", function (e) { e.preventDefault(); if (!window.iamlBackendReady) return gatedMessage(login); /* Phase C: signInWithPassword */ });
    if (reg) reg.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!window.iamlBackendReady) return gatedMessage(reg);
      /* Phase C: signUp then move to verify step */ setAuthTab("verify");
    });
    if (verify) verify.addEventListener("submit", function (e) { e.preventDefault(); if (!window.iamlBackendReady) return gatedMessage(verify); /* Phase C: verify code */ });
  }

  /* ── Global interactions ── */
  function wireGlobal() {
    document.addEventListener("click", function (e) {
      var authT = e.target.closest("[data-auth]");
      if (authT) { e.preventDefault(); openAuth(authT.getAttribute("data-auth")); return; }
      if (e.target.closest("[data-modal-close]")) { e.preventDefault(); closeModals(); return; }
      var tab = e.target.closest("[data-auth-tab]");
      if (tab) { setAuthTab(tab.getAttribute("data-auth-tab")); return; }
      var burger = e.target.closest("#burger");
      if (burger) {
        var links = document.getElementById("navLinks");
        var open = links.classList.toggle("open");
        burger.setAttribute("aria-expanded", open ? "true" : "false");
        return;
      }
      // close mobile menu when a nav link is tapped
      if (e.target.closest("#navLinks a")) {
        var l = document.getElementById("navLinks"); if (l) l.classList.remove("open");
      }
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModals(); });
  }

  function initReveal() {
    var els = document.querySelectorAll(".reveal, .obj-tiles, .act-tiles");
    if (prefersReduced || !("IntersectionObserver" in window)) {
      els.forEach(function (el) { el.classList.add("visible"); }); return;
    }
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("visible"); obs.unobserve(en.target); } });
    }, { threshold: 0.12 });
    els.forEach(function (el) { obs.observe(el); });
  }

  /* Expose helpers for page modules */
  window.IAML = {
    esc: esc,
    openContentModal: openContentModal,
    closeModals: closeModals,
    openAuth: openAuth,
    menu: MENU
  };

  function init() {
    try { injectDefs(); } catch (e) {}
    try { renderHeader(); } catch (e) {}
    try { renderFooter(); } catch (e) {}
    try { injectAuthModal(); } catch (e) {}
    try { injectContentModal(); } catch (e) {}
    try { wireAuth(); } catch (e) {}
    try { wireGlobal(); } catch (e) {}
    try { initReveal(); } catch (e) {}
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
