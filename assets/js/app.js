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

  /* Academic Seal (IAML Brand Guidelines v1) - primary mark, two variants */
  var SEAL_BLUE =
    '<g id="sealBlue">' +
      '<circle cx="100" cy="100" r="90" fill="none" stroke="#003F87" stroke-width="2.5"/>' +
      '<circle cx="100" cy="100" r="82" fill="none" stroke="#2E7ABF" stroke-width="1"/>' +
      '<path id="sealBlueTop" d="M 100,100 m -76,0 a 76,76 0 1,1 152,0" fill="none"/>' +
      '<path id="sealBlueBot" d="M 24,100 a 76,76 0 0,0 152,0" fill="none"/>' +
      '<text font-family="Cormorant Garamond,serif" font-size="7" font-weight="600" fill="#003F87" letter-spacing="1.5"><textPath href="#sealBlueTop" startOffset="50%" text-anchor="middle">INTERNATIONAL ASSOCIATION FOR MONGOLIC LINGUISTICS</textPath></text>' +
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
      '<text font-family="Cormorant Garamond,serif" font-size="7" font-weight="600" fill="#F8FAFC" letter-spacing="1.5"><textPath href="#sealWhiteTop" startOffset="50%" text-anchor="middle">INTERNATIONAL ASSOCIATION FOR MONGOLIC LINGUISTICS</textPath></text>' +
      '<text font-family="DM Sans,sans-serif" font-size="7" fill="#5BA3D9" letter-spacing="0.5"><textPath href="#sealWhiteBot" startOffset="50%" text-anchor="middle">ОЛОН УЛСЫН МОНГОЛ ХЭЛ СУДЛАЛЫН НИЙГЭМЛЭГ</textPath></text>' +
      '<text x="100" y="94" text-anchor="middle" font-family="Cormorant Garamond,serif" font-size="30" font-weight="700" fill="#F8FAFC" letter-spacing="3">IAML</text>' +
      '<line x1="60" y1="108" x2="140" y2="108" stroke="#D4A843" stroke-width="1"/>' +
      '<circle cx="57" cy="108" r="1.5" fill="#D4A843"/><circle cx="143" cy="108" r="1.5" fill="#D4A843"/>' +
      '<text x="100" y="134" text-anchor="middle" font-family="Cormorant Garamond,serif" font-size="19" font-weight="700" fill="#F8FAFC" letter-spacing="2">ОУМХСН</text>' +
    '</g>';

  function h(html) { var t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
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
            '<span class="footer__seal"><svg viewBox="0 0 200 200" aria-hidden="true"><use href="#sealWhite"/></svg></span>' +
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
