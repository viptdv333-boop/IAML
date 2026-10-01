/* ═══════════════════════════════════════════════════
   IAML — log-in UI (all pages)
   · Auth modal: log in · sign up · confirm e-mail (6-digit code) ·
     forgot password · reset password   (docs/API.md §3)
   · Header: "Log in / Sign up" ⇄ avatar + first name menu
     (My account · Admin panel for admins · Log out); footer + guest-only CTAs
   · Static mode (no backend): the modal opens as before and every submit
     shows the "accounts are opening soon" notice.
   Load after api.js + app.js.
   ═══════════════════════════════════════════════════ */
(function () {
  "use strict";

  var IAML = window.IAML;
  if (!IAML || !IAML.el || !IAML.ui) return;
  var el = IAML.el, qsa = IAML.qsa, ui = IAML.ui;

  var GATED = "Accounts are opening soon — the member system is being connected.";
  var RESEND_SECONDS = 60;
  var VIEWS = { login: "authLogin", register: "authRegister", verify: "authVerify", forgot: "authForgot", reset: "authReset" };

  var modal = null;
  var state = { email: "", resendAt: 0, timer: null, view: "login", secret: "" };   /* secret: the password typed at sign-up / log-in, kept only until the e-mail is confirmed (the server sets it at /auth/verify) */

  function $(id) { return document.getElementById(id); }

  /* ═══ Auth modal markup (static strings only — no API data) ═══ */
  function pwField(id, name, label, autocomplete, hint) {
    return '<div class="field"><label for="' + id + '">' + label + '</label>' +
      '<div class="pw"><input id="' + id + '" type="password" name="' + name + '" autocomplete="' + autocomplete + '" maxlength="128" required' +
        (hint ? ' aria-describedby="' + id + 'Hint"' : '') + '/>' +
        '<button class="pw__toggle" type="button" data-pw-toggle aria-label="Show password" aria-pressed="false">Show</button></div>' +
      (hint ? '<p class="field-hint" id="' + id + 'Hint">' + hint + '</p>' : '') + '</div>';
  }
  function codeField(id) {
    return '<div class="field"><label for="' + id + '">6-digit code</label>' +
      '<input id="' + id + '" class="code-input" type="text" name="code" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="one-time-code" spellcheck="false" required/></div>';
  }

  var MODAL_HTML =
    '<div class="auth" id="authModal" hidden>' +
      '<div class="auth__backdrop" data-modal-close></div>' +
      '<div class="auth__dialog" role="dialog" aria-modal="true" aria-labelledby="authHeading" tabindex="-1">' +
        '<button class="auth__close" type="button" data-modal-close aria-label="Close">×</button>' +
        '<div class="auth__tabs" role="tablist" aria-label="Account">' +
          '<button class="auth__tab is-active" type="button" role="tab" id="authTabLogin" aria-selected="true" aria-controls="authLogin" data-auth-tab="login">Log in</button>' +
          '<button class="auth__tab" type="button" role="tab" id="authTabRegister" aria-selected="false" aria-controls="authRegister" tabindex="-1" data-auth-tab="register">Sign up</button>' +
        '</div>' +

        /* log in */
        '<form class="auth__form is-active" id="authLogin" role="tabpanel" aria-labelledby="authTabLogin" novalidate>' +
          '<h3 id="authHeading">Welcome back</h3>' +
          '<div class="field"><label for="authLoginEmail">Email</label><input id="authLoginEmail" type="email" name="email" autocomplete="email" required/></div>' +
          pwField("authLoginPw", "password", "Password", "current-password") +
          '<button class="btn btn--p" type="submit">Log in</button>' +
          '<p class="auth__msg" data-auth-msg aria-live="polite"></p>' +
          '<p class="auth__alt" data-live-only><button class="linkbtn" type="button" data-auth-go="forgot">Forgot your password?</button></p>' +
        '</form>' +

        /* sign up */
        '<form class="auth__form" id="authRegister" role="tabpanel" aria-labelledby="authTabRegister" novalidate>' +
          '<h3 id="authRegHeading">Create your account</h3>' +
          '<div class="auth__row">' +
            '<div class="field"><label for="authRegFirst">First name</label><input id="authRegFirst" type="text" name="first_name" autocomplete="given-name" maxlength="80" required/></div>' +
            '<div class="field"><label for="authRegLast">Last name</label><input id="authRegLast" type="text" name="last_name" autocomplete="family-name" maxlength="80" required/></div>' +
          '</div>' +
          '<div class="field"><label for="authRegWork">Place of work</label>' +
            '<input id="authRegWork" type="text" name="workplace" autocomplete="organization" maxlength="200" placeholder="University / institution" aria-describedby="authRegWorkHint" required/>' +
            '<p class="field-hint" id="authRegWorkHint">Visible to administrators only.</p></div>' +
          '<div class="field"><label for="authRegEmail">Email</label><input id="authRegEmail" type="email" name="email" autocomplete="email" required/></div>' +
          pwField("authRegPw", "password", "Password", "new-password", "At least 8 characters.") +
          '<div class="hp" aria-hidden="true"><label for="authRegWebsite">Website</label><input id="authRegWebsite" type="text" name="website" tabindex="-1" autocomplete="off"/></div>' +
          '<p class="auth__fineprint">Your name and avatar are shown publicly in Discuss. Place of work is visible only to admins. See our <a href="privacy.html">Privacy Policy</a>.</p>' +
          '<button class="btn btn--p" type="submit">Create account</button>' +
          '<p class="auth__msg" data-auth-msg aria-live="polite"></p>' +
        '</form>' +

        /* confirm e-mail */
        '<form class="auth__form" id="authVerify" novalidate>' +
          '<h3 id="authVerifyHeading">Confirm your email</h3>' +
          '<p class="auth__fineprint">We sent a 6-digit code to <strong data-auth-email></strong>. Enter it below to activate your account. The code is valid for 15 minutes.</p>' +
          codeField("authVerifyCode") +
          '<button class="btn btn--p" type="submit">Confirm</button>' +
          '<p class="auth__msg" data-auth-msg aria-live="polite"></p>' +
          '<p class="auth__alt"><button class="linkbtn" type="button" data-resend="verify_email">Resend code</button><span aria-hidden="true"> · </span><button class="linkbtn" type="button" data-auth-go="register">Use a different e-mail</button></p>' +
          '<p class="auth__alt">Already have an account? <button class="linkbtn" type="button" data-auth-go="login">Log in</button></p>' +
        '</form>' +

        /* forgot password */
        '<form class="auth__form" id="authForgot" novalidate>' +
          '<h3 id="authForgotHeading">Reset your password</h3>' +
          '<p class="auth__fineprint">Enter the e-mail address of your account. We will send you a 6-digit code to choose a new password.</p>' +
          '<div class="field"><label for="authForgotEmail">Email</label><input id="authForgotEmail" type="email" name="email" autocomplete="email" required/></div>' +
          '<button class="btn btn--p" type="submit">Send code</button>' +
          '<p class="auth__msg" data-auth-msg aria-live="polite"></p>' +
          '<p class="auth__alt"><button class="linkbtn" type="button" data-auth-go="login">Back to log in</button></p>' +
        '</form>' +

        /* new password */
        '<form class="auth__form" id="authReset" novalidate>' +
          '<h3 id="authResetHeading">Choose a new password</h3>' +
          '<p class="auth__fineprint">If an account exists for <strong data-auth-email></strong>, we have sent it a 6-digit code. Enter the code and your new password.</p>' +
          codeField("authResetCode") +
          pwField("authResetPw", "password", "New password", "new-password", "At least 8 characters.") +
          '<button class="btn btn--p" type="submit">Change password</button>' +
          '<p class="auth__msg" data-auth-msg aria-live="polite"></p>' +
          '<p class="auth__alt"><button class="linkbtn" type="button" data-resend="reset_password">Resend code</button><span aria-hidden="true"> · </span><button class="linkbtn" type="button" data-auth-go="login">Back to log in</button></p>' +
        '</form>' +
      '</div>' +
    '</div>';

  function ensureModal() {
    if (modal) return modal;
    modal = $("authModal");
    if (!modal) {
      var t = document.createElement("template");
      t.innerHTML = MODAL_HTML.trim();
      modal = t.content.firstChild;
      document.body.appendChild(modal);
    }
    wireModal();
    return modal;
  }

  /* ═══ Modal behaviour ═══ */
  function setMsg(form, text, kind) {
    ui.setStatus(form.querySelector("[data-auth-msg]"), text, kind);
  }

  function focusFirst(form) {
    var inputs = qsa(form, "input").filter(function (i) { return !i.closest(".hp") && i.type !== "hidden"; });
    var target = null;
    inputs.forEach(function (i) { if (!target && !i.value) target = i; });
    target = target || inputs[0];
    if (target) ui.focus(target);
  }

  function tick() {
    if (!modal) return;
    var left = Math.max(0, Math.ceil((state.resendAt - Date.now()) / 1000));
    qsa(modal, "[data-resend]").forEach(function (b) {
      b.disabled = left > 0;
      b.textContent = left > 0 ? "Resend code (" + left + " s)" : "Resend code";
    });
    if (left <= 0 && state.timer) { window.clearInterval(state.timer); state.timer = null; }
  }
  function startCountdown() {
    state.resendAt = Date.now() + RESEND_SECONDS * 1000;
    tick();
    if (!state.timer) state.timer = window.setInterval(tick, 1000);
  }

  function show(view, opts) {
    opts = opts || {};
    state.view = view;
    var activeId = VIEWS[view] || VIEWS.login;
    qsa(modal, ".auth__form").forEach(function (f) {
      var on = f.id === activeId;
      f.classList.toggle("is-active", on);
      if (on) {
        ui.clearErrors(f);
        if (!opts.keep) setMsg(f, "", "");
      }
    });
    var isTab = view === "login" || view === "register";
    modal.querySelector(".auth__tabs").hidden = !isTab;
    qsa(modal, "[data-auth-tab]").forEach(function (t) {
      var on = t.getAttribute("data-auth-tab") === view;
      t.classList.toggle("is-active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
    });
    var form = $(activeId);
    var heading = form.querySelector("h3");
    var dlg = modal.querySelector('[role="dialog"]');
    if (heading && heading.id) dlg.setAttribute("aria-labelledby", heading.id);
    qsa(modal, "[data-auth-email]").forEach(function (n) { n.textContent = state.email; });
    if (opts.message) setMsg(form, opts.message, opts.kind);
    tick();
    focusFirst(form);
  }

  function onModalClose() {
    if (state.timer) { window.clearInterval(state.timer); state.timer = null; }
    // never keep passwords / codes around in the DOM
    qsa(modal, 'input[type="password"], input[type="text"].code-input, .pw input').forEach(function (i) { i.value = ""; });
    qsa(modal, "[data-pw-toggle]").forEach(function (b) {
      var input = b.parentNode.querySelector("input");
      if (input) input.type = "password";
      b.textContent = "Show";
      b.setAttribute("aria-label", "Show password");
      b.setAttribute("aria-pressed", "false");
    });
    qsa(modal, ".auth__form").forEach(function (f) { ui.clearErrors(f); setMsg(f, "", ""); });
  }

  function open(tab) {
    ensureModal();
    var view = tab === "register" ? "register" : tab === "forgot" ? "forgot" : "login";
    var already = !modal.hidden;
    if (!already) IAML.modal.open(modal, { focus: false, onClose: onModalClose });
    show(view);
  }

  /* ── form helpers ── */
  function checkRequired(form) {
    ui.clearErrors(form);
    var first = null;
    qsa(form, "input[required]").forEach(function (c) {
      if (c.closest(".hp")) return;
      if (!String(c.value).trim()) {
        ui.fieldError(form, c, ui.fieldLabel(form, c) + " is required");
        if (!first) first = c;
      }
    });
    if (first) {
      setMsg(form, "Please fill in the highlighted fields.", "error");
      ui.focus(first);
      return false;
    }
    setMsg(form, "", "");
    return true;
  }
  function checkPassword(form, name) {
    var c = form.querySelector('[name="' + name + '"]');
    if (c && c.value.length < 8) {
      ui.fieldError(form, c, ui.fieldLabel(form, c) + " must be at least 8 characters");
      setMsg(form, "Please check the highlighted fields.", "error");
      ui.focus(c);
      return false;
    }
    return true;
  }
  function submitBtn(form) { return form.querySelector('button[type="submit"]'); }
  function busy(form, on) { ui.busy(submitBtn(form), on); }
  function value(form, name) { var c = form.querySelector('[name="' + name + '"]'); return c ? c.value : ""; }

  function fail(form, err) {
    if (err && (err.code === "invalid_code" || err.code === "code_expired")) {
      var code = form.querySelector('[name="code"]');
      if (code) {
        ui.clearErrors(form);
        ui.fieldError(form, code, err.message);
        setMsg(form, "", "");
        ui.focus(code);
        try { code.select(); } catch (e) {}
        return;
      }
    }
    ui.applyErrors(form, err);
  }

  /* After a successful log in / confirmation / reset: close, refresh header + gated pages, say hello */
  function success(user, message) {
    state.secret = "";
    IAML.api.session.setUser(user);   // fires onChange → header, footer and gated pages re-render
    IAML.closeModals();
    // the button that opened the modal was replaced by the user menu: hand the focus to it
    var btn = $("userMenuBtn"), a = document.activeElement;
    if (btn && (!a || a === document.body || modal.contains(a))) ui.focus(btn);
    IAML.toast(message, "ok");
  }

  function gotoVerify(email, notice) {
    state.email = email;
    startCountdown();
    show("verify", { message: notice || "", kind: notice ? "ok" : "" });
  }

  /* ── flows ── */
  function doLogin(form) {
    if (!checkRequired(form)) return;
    var email = value(form, "email").trim();
    busy(form, true);
    IAML.api.post("/auth/login", { email: email, password: value(form, "password") }).then(
      function (res) { success(res.user, "Welcome back, " + (res.user.first_name || "member") + "."); },
      function (err) {
        if (err && err.code === "email_not_verified") {
          state.secret = value(form, "password");
          gotoVerify((err.extra && err.extra.email) || email, err.message);
          return;
        }
        fail(form, err);
      }
    ).then(function () { busy(form, false); });
  }

  function doRegister(form) {
    if (!checkRequired(form) || !checkPassword(form, "password")) return;
    var body = {
      first_name: value(form, "first_name").trim(),
      last_name: value(form, "last_name").trim(),
      workplace: value(form, "workplace").trim(),
      email: value(form, "email").trim(),
      password: value(form, "password"),
      website: value(form, "website")   // honeypot — real users never fill it
    };
    busy(form, true);
    IAML.api.post("/auth/register", body).then(
      function (res) {
        state.secret = body.password;                           // sent again with the code (the server sets the password at /auth/verify)
        form.querySelector('[name="password"]').value = "";   // no longer needed — don't keep it in the DOM
        gotoVerify((res && res.email) || body.email, "");
      },
      function (err) { fail(form, err); }
    ).then(function () { busy(form, false); });
  }

  function doVerify(form) {
    if (!checkRequired(form)) return;
    var code = value(form, "code").replace(/\D/g, "");
    if (code.length !== 6) {
      ui.fieldError(form, form.querySelector('[name="code"]'), "Enter the 6-digit code from the e-mail");
      ui.focus(form.querySelector('[name="code"]'));
      return;
    }
    if (!state.secret) {   // e.g. the page was reloaded: log in again, which sends a fresh code and brings us back here
      show("login", { message: "Please log in with your password to finish confirming your e-mail.", kind: "" });
      return;
    }
    busy(form, true);
    IAML.api.post("/auth/verify", { email: state.email, code: code, password: state.secret }).then(
      function (res) { success(res.user, "Your e-mail is confirmed — welcome, " + (res.user.first_name || "member") + "."); },
      function (err) { fail(form, err); }
    ).then(function () { busy(form, false); });
  }

  function doForgot(form) {
    if (!checkRequired(form)) return;
    var email = value(form, "email").trim();
    busy(form, true);
    IAML.api.post("/auth/forgot", { email: email }).then(
      function () {
        state.email = email.toLowerCase();
        startCountdown();
        show("reset", { message: "If an account exists for this address, a code is on its way.", kind: "ok" });
      },
      function (err) { fail(form, err); }
    ).then(function () { busy(form, false); });
  }

  function doReset(form) {
    if (!checkRequired(form) || !checkPassword(form, "password")) return;
    var code = value(form, "code").replace(/\D/g, "");
    if (code.length !== 6) {
      ui.fieldError(form, form.querySelector('[name="code"]'), "Enter the 6-digit code from the e-mail");
      ui.focus(form.querySelector('[name="code"]'));
      return;
    }
    busy(form, true);
    IAML.api.post("/auth/reset", { email: state.email, code: code, password: value(form, "password") }).then(
      function (res) { success(res.user, "Your password has been changed — you are logged in."); },
      function (err) { fail(form, err); }
    ).then(function () { busy(form, false); });
  }

  function doResend(btn) {
    var form = btn.closest(".auth__form");
    var purpose = btn.getAttribute("data-resend");
    if (!state.email || Date.now() < state.resendAt) return;
    btn.disabled = true;
    IAML.api.post("/auth/resend", { email: state.email, purpose: purpose }).then(
      function () {
        startCountdown();
        setMsg(form, "A new code is on its way — it can take a minute to arrive.", "ok");
      },
      function (err) { tick(); setMsg(form, err.message, "error"); }
    );
  }

  var HANDLERS = { authLogin: doLogin, authRegister: doRegister, authVerify: doVerify, authForgot: doForgot, authReset: doReset };

  var wired = false;
  function wireModal() {
    if (wired) return;
    wired = true;

    modal.addEventListener("submit", function (e) {
      var form = e.target.closest(".auth__form");
      if (!form) return;
      e.preventDefault();
      IAML.live().then(function (ok) {
        if (!ok) { setMsg(form, GATED, "error"); return; }
        if (HANDLERS[form.id]) HANDLERS[form.id](form);
      });
    });

    modal.addEventListener("click", function (e) {
      var tab = e.target.closest("[data-auth-tab]");
      if (tab) { show(tab.getAttribute("data-auth-tab")); return; }
      var go = e.target.closest("[data-auth-go]");
      if (go) { show(go.getAttribute("data-auth-go")); return; }
      var rs = e.target.closest("[data-resend]");
      if (rs) { doResend(rs); }
    });

    // tabs: arrow keys move between "Log in" and "Sign up"
    modal.querySelector(".auth__tabs").addEventListener("keydown", function (e) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      var next = state.view === "login" ? "register" : "login";
      show(next);
      ui.focus(modal.querySelector('[data-auth-tab="' + next + '"]'));
    });

    // code inputs accept digits only
    modal.addEventListener("input", function (e) {
      if (e.target.classList && e.target.classList.contains("code-input")) {
        var v = e.target.value.replace(/\D/g, "").slice(0, 6);
        if (v !== e.target.value) e.target.value = v;
      }
    });
  }

  /* ═══ Header, footer and "guest only" bits ═══ */
  function guestButtons() {
    return [
      el("button", { "class": "nav__btn", type: "button", "data-auth": "login" }, "Log in"),
      el("button", { "class": "nav__link nav__link--cta", type: "button", "data-auth": "register" }, "Sign up")
    ];
  }

  function userMenu(user) {
    var fullName = ((user.first_name || "") + " " + (user.last_name || "")).trim() || user.email;
    var items = [el("a", { role: "menuitem", href: "account.html", "class": "umenu__item" }, "My account")];
    if (user.role === "admin") items.push(el("a", { role: "menuitem", href: "admin.html", "class": "umenu__item" }, "Admin panel"));
    items.push(el("button", { role: "menuitem", type: "button", "class": "umenu__item", "data-logout": "" }, "Log out"));
    return el("div", { "class": "umenu" },
      el("button", {
        "class": "umenu__btn", type: "button", id: "userMenuBtn",
        "aria-haspopup": "menu", "aria-expanded": "false", "aria-controls": "userMenuPanel",
        "aria-label": "Account menu — " + fullName
      }, ui.avatar(user, "sm"), el("span", { "class": "umenu__name" }, user.first_name || user.email), el("span", { "class": "umenu__caret", "aria-hidden": "true" }, "▾")),
      el("div", { "class": "umenu__panel", id: "userMenuPanel", role: "menu", "aria-labelledby": "userMenuBtn", hidden: "" }, items));
  }

  var rendered = false;
  function renderHeaderAuth(user) {
    var mount = $("navAuth");
    if (!mount) return;
    var hadFocus = mount.contains(document.activeElement);
    IAML.clear(mount);
    if (user) mount.appendChild(userMenu(user));
    else guestButtons().forEach(function (b) { mount.appendChild(b); });
    mount.classList.remove("nav__auth--pending");
    if (IAML.fitNav) IAML.fitNav();        // the user menu is wider than the two log-in buttons (and vice versa)
    if (hadFocus) {
      var target = $("userMenuBtn") || mount.querySelector("button");
      ui.focus(target);
    }
  }

  function renderFooterCommunity(user) {
    var ul = $("footerCommunity");
    if (!ul) return;
    IAML.clear(ul);
    function li(child) { var n = document.createElement("li"); n.appendChild(child); ul.appendChild(n); }
    if (!user) {
      li(el("button", { "class": "footer__linkbtn", type: "button", "data-auth": "register" }, "Sign up"));
      li(el("button", { "class": "footer__linkbtn", type: "button", "data-auth": "login" }, "Log in"));
      li(el("a", { href: "account.html" }, "My account"));
    } else {
      li(el("a", { href: "account.html" }, "My account"));
      if (user.role === "admin") li(el("a", { href: "admin.html" }, "Admin panel"));
      li(el("button", { "class": "footer__linkbtn", type: "button", "data-logout": "" }, "Log out"));
    }
  }

  function onUser(user) {
    rendered = true;
    renderHeaderAuth(user);
    renderFooterCommunity(user);
    qsa(document, "[data-guest-only]").forEach(function (n) { n.hidden = !!user; });
  }

  /* ── user menu (menu-button pattern) ── */
  function menuParts() { return { btn: $("userMenuBtn"), panel: $("userMenuPanel") }; }
  function menuItems(panel) { return qsa(panel, '[role="menuitem"]'); }
  function openMenu(focusFirstItem) {
    var m = menuParts();
    if (!m.btn || !m.panel) return;
    m.panel.hidden = false;
    m.btn.setAttribute("aria-expanded", "true");
    if (focusFirstItem) ui.focus(menuItems(m.panel)[0]);
  }
  function closeMenu(refocus) {
    var m = menuParts();
    if (!m.btn || !m.panel || m.panel.hidden) return;
    m.panel.hidden = true;
    m.btn.setAttribute("aria-expanded", "false");
    if (refocus) ui.focus(m.btn);
  }

  function doLogout() {
    IAML.api.session.logout().then(
      function () { IAML.toast("You have been logged out.", "ok"); },
      function (err) { IAML.toast(IAML.errorText(err), "error"); }
    );
  }

  function wireHeader() {
    document.addEventListener("click", function (e) {
      if (e.target.closest("#userMenuBtn")) {
        var m = menuParts();
        if (m.panel && m.panel.hidden) openMenu(false); else closeMenu(false);
        return;
      }
      var lo = e.target.closest("[data-logout]");
      if (lo) { e.preventDefault(); closeMenu(false); doLogout(); return; }
      if (!e.target.closest(".umenu")) closeMenu(false);
    });
    document.addEventListener("keydown", function (e) {
      var m = menuParts();
      if (!m.btn || !m.panel) return;
      if (e.target === m.btn && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        e.preventDefault(); openMenu(true); return;
      }
      if (m.panel.hidden) return;
      var items = menuItems(m.panel), i = items.indexOf(document.activeElement);
      if (e.key === "Escape") { closeMenu(true); }
      else if (e.key === "Tab") { closeMenu(false); }
      else if (e.key === "ArrowDown") { e.preventDefault(); ui.focus(items[(i + 1) % items.length]); }
      else if (e.key === "ArrowUp") { e.preventDefault(); ui.focus(items[(i - 1 + items.length) % items.length]); }
      else if (e.key === "Home") { e.preventDefault(); ui.focus(items[0]); }
      else if (e.key === "End") { e.preventDefault(); ui.focus(items[items.length - 1]); }
    });
  }

  IAML.auth = {
    open: open,
    logout: doLogout,
    user: function () { return IAML.api ? IAML.api.session.user : null; }
  };

  function init() {
    ensureModal();
    wireHeader();
    var ctrl = $("navAuth");
    // hide the log-in buttons until we know whether somebody is logged in (no flash of the wrong state)
    if (ctrl) ctrl.classList.add("nav__auth--pending");
    var reveal = function () { if (ctrl) ctrl.classList.remove("nav__auth--pending"); };
    window.setTimeout(reveal, 1500);

    IAML.live().then(function (ok) {
      if (!ok) { reveal(); return; }      // static mode: header, footer and modal stay as they are
      modal.classList.add("is-live");
      IAML.api.session.onChange(onUser);
      IAML.whenUser().then(function (u) { if (!rendered) onUser(u); });
    });
  }

  IAML.ready(init);
})();
